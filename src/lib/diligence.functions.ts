import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const DILIGENCE_CATEGORIES = [
  { value: "formation", label: "Formation & legal", required: true },
  { value: "offering_terms", label: "Offering terms", required: true },
  { value: "financials", label: "Financial statements", required: true },
  { value: "track_record", label: "Track record & performance", required: true },
  { value: "team", label: "Team & bios", required: true },
  { value: "strategy", label: "Strategy & market", required: false },
  { value: "compliance", label: "Compliance & policies", required: false },
  { value: "tax", label: "Tax & K-1 samples", required: false },
  { value: "other", label: "Other materials", required: false },
] as const;

const categoryValues = DILIGENCE_CATEGORIES.map((c) => c.value) as [string, ...string[]];

export type DiligenceDocument = {
  id: string;
  category: string;
  title: string;
  description: string | null;
  file_name: string;
  size_bytes: number | null;
  uploaded_at: string;
};

export type DiligenceReadiness = {
  score: number;
  covered: string[];
  missing: { value: string; label: string }[];
};

function readiness(documents: DiligenceDocument[]): DiligenceReadiness {
  const present = new Set(documents.map((d) => d.category));
  const required = DILIGENCE_CATEGORIES.filter((c) => c.required);
  const covered = required.filter((c) => present.has(c.value));
  const missing = required
    .filter((c) => !present.has(c.value))
    .map((c) => ({ value: c.value, label: c.label }));
  return {
    score: required.length === 0 ? 0 : Math.round((covered.length / required.length) * 100),
    covered: covered.map((c) => c.value),
    missing,
  };
}

async function canManage(supabase: any, offeringId: string) {
  const { data } = await supabase.rpc("can_manage_diligence", { _offering_id: offeringId });
  return Boolean(data);
}

const offeringInput = (data: unknown) => z.object({ offering_id: z.string().uuid() }).parse(data);

export const getDiligenceRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(offeringInput)
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: offering } = await supabase
      .from("offerings")
      .select("id, name, reg_type, summary")
      .eq("id", data.offering_id)
      .maybeSingle();
    if (!offering) throw new Error("That fund is not available.");

    const { data: room } = await supabase
      .from("diligence_rooms")
      .select("id, intro, box_folder_id, created_at")
      .eq("offering_id", data.offering_id)
      .maybeSingle();

    let documents: DiligenceDocument[] = [];
    if (room) {
      const { data: docs, error } = await supabase
        .from("diligence_documents")
        .select("id, category, title, description, file_name, size_bytes, uploaded_at")
        .eq("room_id", room.id)
        .order("uploaded_at", { ascending: false });
      if (error) throw new Error(error.message);
      documents = (docs ?? []) as DiligenceDocument[];
    }

    return {
      offering: { id: offering.id, name: offering.name, reg_type: offering.reg_type, summary: offering.summary },
      room: room ? { id: room.id, intro: room.intro, created_at: room.created_at } : null,
      documents,
      readiness: readiness(documents),
      canManage: await canManage(supabase, data.offering_id),
    };
  });

export const listDiligenceRooms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: rooms, error } = await supabase
      .from("diligence_rooms")
      .select("id, offering_id, intro, created_at, offerings(name, reg_type)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const ids = (rooms ?? []).map((r: any) => r.id);
    const { data: docs } = ids.length
      ? await supabase
          .from("diligence_documents")
          .select("id, room_id, category, title, description, file_name, size_bytes, uploaded_at")
          .in("room_id", ids)
      : { data: [] as any[] };

    return {
      rooms: (rooms ?? []).map((r: any) => {
        const mine = (docs ?? []).filter((d: any) => d.room_id === r.id) as DiligenceDocument[];
        return {
          id: r.id,
          offering_id: r.offering_id,
          name: r.offerings?.name ?? "Fund",
          reg_type: r.offerings?.reg_type ?? null,
          document_count: mine.length,
          readiness: readiness(mine),
        };
      }),
    };
  });

export const ensureDiligenceRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ offering_id: z.string().uuid(), intro: z.string().max(2000).optional().nullable() })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await canManage(supabase, data.offering_id))) {
      throw new Error("You do not have permission to manage this fund's diligence room.");
    }

    const { data: existing } = await supabase
      .from("diligence_rooms")
      .select("id")
      .eq("offering_id", data.offering_id)
      .maybeSingle();

    if (existing) {
      if (data.intro !== undefined) {
        const { error } = await supabase
          .from("diligence_rooms")
          .update({ intro: data.intro })
          .eq("id", existing.id);
        if (error) throw new Error(error.message);
      }
      return { id: existing.id, created: false };
    }

    const { data: offering } = await supabase
      .from("offerings")
      .select("name")
      .eq("id", data.offering_id)
      .maybeSingle();

    const { ensureSubfolder, isBoxConfigured } = await import("@/lib/box.server");
    if (!isBoxConfigured()) throw new Error("Box is not connected yet.");
    const folderId = await ensureSubfolder(
      `Diligence — ${offering?.name ?? data.offering_id}`.slice(0, 240),
    );

    const { data: created, error } = await supabase
      .from("diligence_rooms")
      .insert({
        offering_id: data.offering_id,
        box_folder_id: folderId,
        intro: data.intro ?? null,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id, created: true };
  });

export const addDiligenceDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        offering_id: z.string().uuid(),
        category: z.enum(categoryValues),
        title: z.string().min(1).max(200),
        description: z.string().max(1000).optional().nullable(),
        file_name: z.string().min(1).max(255),
        content_type: z.string().max(120).optional(),
        content_base64: z.string().min(1).max(28_000_000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await canManage(supabase, data.offering_id))) {
      throw new Error("You do not have permission to add documents to this fund.");
    }

    const { data: room } = await supabase
      .from("diligence_rooms")
      .select("id, box_folder_id")
      .eq("offering_id", data.offering_id)
      .maybeSingle();
    if (!room) throw new Error("Create the diligence room first.");

    const binary = Buffer.from(data.content_base64, "base64");
    if (binary.length === 0) throw new Error("That file appears to be empty.");
    if (binary.length > 20 * 1024 * 1024) throw new Error("Files must be 20 MB or smaller.");

    const { uploadFileTo } = await import("@/lib/box.server");
    const safeName = data.file_name.replace(/[\\/:*?"<>|]/g, "_");
    const uploaded = await uploadFileTo(
      room.box_folder_id,
      safeName,
      new Uint8Array(binary),
      data.content_type || "application/octet-stream",
    );

    const { error } = await supabase.from("diligence_documents").insert({
      room_id: room.id,
      offering_id: data.offering_id,
      category: data.category,
      title: data.title,
      description: data.description?.trim() ? data.description.trim() : null,
      box_file_id: uploaded.id,
      file_name: safeName,
      size_bytes: uploaded.size,
      uploaded_by: userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeDiligenceDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: doc } = await supabase
      .from("diligence_documents")
      .select("id, offering_id, box_file_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!doc) throw new Error("That document is not available.");
    if (!(await canManage(supabase, doc.offering_id))) {
      throw new Error("You do not have permission to remove this document.");
    }

    const { deleteBoxFile } = await import("@/lib/box.server");
    await deleteBoxFile(doc.box_file_id);

    const { error } = await supabase.from("diligence_documents").delete().eq("id", doc.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getDiligenceDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // RLS only returns rows the caller is allowed to see.
    const { data: doc } = await supabase
      .from("diligence_documents")
      .select("id, box_file_id, file_name")
      .eq("id", data.id)
      .maybeSingle();
    if (!doc) throw new Error("That document is not available.");

    const { temporaryDownloadUrl } = await import("@/lib/box.server");
    return { url: await temporaryDownloadUrl(doc.box_file_id), file_name: doc.file_name };
  });

/** Pulls in any files added straight into the fund's Box folder outside the app. */
export const syncDiligenceFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(offeringInput)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await canManage(supabase, data.offering_id))) {
      throw new Error("You do not have permission to manage this fund's diligence room.");
    }

    const { data: room } = await supabase
      .from("diligence_rooms")
      .select("id, box_folder_id")
      .eq("offering_id", data.offering_id)
      .maybeSingle();
    if (!room) throw new Error("Create the diligence room first.");

    const { listFolderFiles } = await import("@/lib/box.server");
    const files = await listFolderFiles(room.box_folder_id);

    const { data: known } = await supabase
      .from("diligence_documents")
      .select("box_file_id")
      .eq("room_id", room.id);
    const seen = new Set((known ?? []).map((k: any) => k.box_file_id));

    const rows = files
      .filter((f) => !seen.has(f.id))
      .map((f) => ({
        room_id: room.id,
        offering_id: data.offering_id,
        category: "other",
        title: f.name.replace(/\.[^.]+$/, ""),
        description: "Added directly in Box",
        box_file_id: f.id,
        file_name: f.name,
        size_bytes: f.size,
        uploaded_by: userId,
      }));

    if (rows.length) {
      const { error } = await supabase.from("diligence_documents").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { added: rows.length, checked: files.length };
  });
