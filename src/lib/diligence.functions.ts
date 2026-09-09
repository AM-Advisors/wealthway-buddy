import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import {
  ALL_CATEGORY_VALUES,
  categoriesFor,
  normalizeEntityType,
  type DiligenceEntityType,
} from "@/lib/diligence-templates";

export {
  ALL_CATEGORY_VALUES,
  CATEGORY_SETS,
  DILIGENCE_CATEGORIES,
  ENTITY_TYPES,
  categoriesFor,
  categoryLabel,
  entityTypeLabel,
  normalizeEntityType,
  sectionsFor,
} from "@/lib/diligence-templates";
export type { DiligenceEntityType, DiligenceCategory } from "@/lib/diligence-templates";

const categoryValues = ALL_CATEGORY_VALUES;

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

function readiness(
  documents: DiligenceDocument[],
  entityType: DiligenceEntityType = "fund",
  extraCovered: string[] = [],
): DiligenceReadiness {
  const present = new Set([...documents.map((d) => d.category), ...extraCovered]);
  const required = categoriesFor(entityType).filter((c) => c.required);
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
      .select("id, intro, box_folder_id, created_at, entity_type")
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

    const entityType = normalizeEntityType((room as any)?.entity_type);

    // A cap table kept in the platform counts as covering the capitalization
    // section, so nobody has to upload a spreadsheet to satisfy readiness.
    const { count: capTableRows } = await supabase
      .from("diligence_cap_table")
      .select("id", { count: "exact", head: true })
      .eq("offering_id", data.offering_id);

    return {
      offering: { id: offering.id, name: offering.name, reg_type: offering.reg_type, summary: offering.summary },
      room: room
        ? { id: room.id, intro: room.intro, created_at: room.created_at, entity_type: entityType }
        : null,
      entityType,
      categories: categoriesFor(entityType),
      documents,
      capTableRows: capTableRows ?? 0,
      readiness: readiness(documents, entityType, (capTableRows ?? 0) > 0 ? ["cap_table"] : []),
      canManage: await canManage(supabase, data.offering_id),
    };
  });

export const listDiligenceRooms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: rooms, error } = await supabase
      .from("diligence_rooms")
      .select("id, offering_id, intro, created_at, entity_type, offerings(name, reg_type)")
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
        const entityType = normalizeEntityType(r.entity_type);
        return {
          id: r.id,
          offering_id: r.offering_id,
          name: r.offerings?.name ?? "Fund",
          reg_type: r.offerings?.reg_type ?? null,
          entity_type: entityType,
          document_count: mine.length,
          readiness: readiness(mine, entityType),
        };
      }),
    };
  });

export const ensureDiligenceRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        offering_id: z.string().uuid(),
        intro: z.string().max(2000).optional().nullable(),
        entity_type: z.enum(["fund", "startup"]).optional(),
      })
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
      const patch: { intro?: string | null; entity_type?: string } = {};
      if (data.intro !== undefined) patch.intro = data.intro;
      if (data.entity_type !== undefined) patch.entity_type = data.entity_type;
      if (Object.keys(patch).length) {
        const { error } = await supabase.from("diligence_rooms").update(patch).eq("id", existing.id);
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

    const entityType = normalizeEntityType(data.entity_type);
    const { data: created, error } = await supabase
      .from("diligence_rooms")
      .insert({
        offering_id: data.offering_id,
        box_folder_id: folderId,
        intro: data.intro ?? null,
        entity_type: entityType,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await logActivity(
      supabase,
      userId,
      data.offering_id,
      created.id,
      "room_created",
      `Opened a ${entityType === "startup" ? "company" : "fund"} diligence room`,
      { entity_type: entityType },
    );
    return { id: created.id, created: true };
  });

/** Switches a room between the fund and startup diligence structures. */
export const setDiligenceEntityType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ offering_id: z.string().uuid(), entity_type: z.enum(["fund", "startup"]) })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await canManage(supabase, data.offering_id))) {
      throw new Error("You do not have permission to manage this diligence room.");
    }
    const { data: room } = await supabase
      .from("diligence_rooms")
      .select("id, entity_type")
      .eq("offering_id", data.offering_id)
      .maybeSingle();
    if (!room) throw new Error("Create the diligence room first.");
    if (room.entity_type === data.entity_type) return { ok: true, changed: false };

    const { error } = await supabase
      .from("diligence_rooms")
      .update({ entity_type: data.entity_type })
      .eq("id", room.id);
    if (error) throw new Error(error.message);

    await logActivity(
      supabase,
      userId,
      data.offering_id,
      room.id,
      "room_updated",
      `Set the diligence structure to ${data.entity_type === "startup" ? "startup / operating company" : "fund / investment manager"}`,
      { entity_type: data.entity_type },
    );
    return { ok: true, changed: true };
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
      .select("id, box_file_id, file_name, title, offering_id, room_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!doc) throw new Error("That document is not available.");

    const { temporaryDownloadUrl } = await import("@/lib/box.server");
    const url = await temporaryDownloadUrl(doc.box_file_id);
    await logActivity(
      supabase,
      context.userId,
      doc.offering_id,
      doc.room_id,
      "document_downloaded",
      `Opened “${doc.title}”`,
      { document_id: doc.id },
    );
    return { url, file_name: doc.file_name };
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

/* =========================================================================
   NDA gate, checklist, Q&A, activity trail and document versions
   ========================================================================= */

async function actorIdentity(supabase: any, userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("legal_name, email")
    .eq("user_id", userId)
    .maybeSingle();
  return { name: data?.legal_name ?? null, email: data?.email ?? null };
}

async function logActivity(
  supabase: any,
  userId: string,
  offeringId: string,
  roomId: string | null,
  eventType: string,
  summary: string,
  metadata: Record<string, unknown> = {},
) {
  const who = await actorIdentity(supabase, userId);
  await supabase.from("diligence_activity").insert({
    room_id: roomId,
    offering_id: offeringId,
    actor_id: userId,
    actor_name: who.name,
    actor_email: who.email,
    event_type: eventType,
    summary,
    metadata,
  });
}

const DEFAULT_NDA = `CONFIDENTIALITY ACKNOWLEDGEMENT

The materials in this diligence room are confidential and are provided solely so that you can evaluate a possible investment. By continuing you agree that you will:

1. Keep these materials, and the fact that they were provided to you, confidential.
2. Use them only to evaluate this opportunity, and for no other purpose.
3. Not copy, forward, publish or otherwise share them with anyone outside your own professional advisers, who must agree to the same terms.
4. Destroy or return the materials on request.

This acknowledgement is recorded with your name, the date and time, and your network address.`;

function ndaHash(text: string, version: number) {
  let h = 0;
  const src = `${version}::${text}`;
  for (let i = 0; i < src.length; i += 1) h = (h * 31 + src.charCodeAt(i)) | 0;
  return `nda_${version}_${(h >>> 0).toString(16)}`;
}

/** Room-level NDA status for the signed-in person. */
export const getDiligenceAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(offeringInput)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: room } = await supabase
      .from("diligence_rooms")
      .select("id, nda_required, nda_text, nda_version")
      .eq("offering_id", data.offering_id)
      .maybeSingle();
    if (!room) {
      return {
        room: null,
        ndaRequired: false,
        accepted: false,
        ndaText: null,
        ndaVersion: 1,
        canManage: await canManage(supabase, data.offering_id),
      };
    }

    const { data: acceptance } = await supabase
      .from("diligence_nda_acceptances")
      .select("accepted_at, signer_name")
      .eq("room_id", room.id)
      .eq("user_id", userId)
      .eq("nda_version", room.nda_version)
      .maybeSingle();

    return {
      room: { id: room.id },
      ndaRequired: room.nda_required,
      ndaVersion: room.nda_version,
      ndaText: room.nda_text ?? DEFAULT_NDA,
      accepted: Boolean(acceptance),
      acceptedAt: acceptance?.accepted_at ?? null,
      canManage: await canManage(supabase, data.offering_id),
    };
  });

export const acceptDiligenceNda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ offering_id: z.string().uuid(), signer_name: z.string().min(2).max(160) })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: room } = await supabase
      .from("diligence_rooms")
      .select("id, nda_text, nda_version")
      .eq("offering_id", data.offering_id)
      .maybeSingle();
    if (!room) throw new Error("That diligence room is not available.");

    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const ip =
      getRequestHeader("cf-connecting-ip") ??
      getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ??
      null;

    const { error } = await supabase.from("diligence_nda_acceptances").insert({
      room_id: room.id,
      offering_id: data.offering_id,
      user_id: userId,
      nda_version: room.nda_version,
      signer_name: data.signer_name.trim(),
      nda_hash: ndaHash(room.nda_text ?? DEFAULT_NDA, room.nda_version),
      ip_address: ip,
      user_agent: getRequestHeader("user-agent") ?? null,
    });
    if (error && !error.message.includes("duplicate")) throw new Error(error.message);

    await logActivity(
      supabase,
      userId,
      data.offering_id,
      room.id,
      "nda_accepted",
      `${data.signer_name.trim()} accepted the confidentiality agreement`,
      { nda_version: room.nda_version },
    );
    return { ok: true };
  });

export const updateDiligenceNda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        offering_id: z.string().uuid(),
        nda_required: z.boolean(),
        nda_text: z.string().max(20000).optional().nullable(),
        bump_version: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await canManage(supabase, data.offering_id))) {
      throw new Error("You do not have permission to change this agreement.");
    }
    const { data: room } = await supabase
      .from("diligence_rooms")
      .select("id, nda_version")
      .eq("offering_id", data.offering_id)
      .maybeSingle();
    if (!room) throw new Error("Create the diligence room first.");

    const nextVersion = data.bump_version ? room.nda_version + 1 : room.nda_version;
    const { error } = await supabase
      .from("diligence_rooms")
      .update({
        nda_required: data.nda_required,
        nda_text: data.nda_text?.trim() ? data.nda_text.trim() : null,
        nda_version: nextVersion,
      })
      .eq("id", room.id);
    if (error) throw new Error(error.message);

    await logActivity(
      supabase,
      userId,
      data.offering_id,
      room.id,
      "nda_updated",
      data.bump_version
        ? `Confidentiality agreement updated — investors must accept again (v${nextVersion})`
        : "Confidentiality agreement settings updated",
      { nda_required: data.nda_required, nda_version: nextVersion },
    );
    return { ok: true, nda_version: nextVersion };
  });

/* ----------------------------- Checklist ----------------------------- */

export const listDiligenceChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(offeringInput)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: items, error } = await supabase
      .from("diligence_checklist_items")
      .select(
        "id, category, label, description, is_required, sort_order, status, document_id, completed_at",
      )
      .eq("offering_id", data.offering_id)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    const rows = items ?? [];
    const required = rows.filter((i: any) => i.is_required);
    const done = required.filter((i: any) => i.status === "complete" || i.status === "waived");
    return {
      items: rows,
      progress: required.length === 0 ? 0 : Math.round((done.length / required.length) * 100),
    };
  });

export const saveChecklistItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        offering_id: z.string().uuid(),
        category: z.enum(categoryValues).default("other"),
        label: z.string().min(2).max(200),
        description: z.string().max(1000).optional().nullable(),
        is_required: z.boolean().default(true),
        status: z.enum(["pending", "in_progress", "complete", "waived"]).default("pending"),
        document_id: z.string().uuid().optional().nullable(),
        sort_order: z.number().int().min(0).max(999).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await canManage(supabase, data.offering_id))) {
      throw new Error("You do not have permission to change this checklist.");
    }
    const { data: room } = await supabase
      .from("diligence_rooms")
      .select("id")
      .eq("offering_id", data.offering_id)
      .maybeSingle();
    if (!room) throw new Error("Create the diligence room first.");

    const complete = data.status === "complete" || data.status === "waived";
    const payload: any = {
      room_id: room.id,
      offering_id: data.offering_id,
      category: data.category,
      label: data.label.trim(),
      description: data.description?.trim() ? data.description.trim() : null,
      is_required: data.is_required,
      status: data.status,
      document_id: data.document_id ?? null,
      completed_at: complete ? new Date().toISOString() : null,
      completed_by: complete ? userId : null,
    };

    if (data.id) {
      const { error } = await supabase
        .from("diligence_checklist_items")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { count } = await supabase
        .from("diligence_checklist_items")
        .select("id", { count: "exact", head: true })
        .eq("room_id", room.id);
      payload["created_by"] = userId;
      payload["sort_order"] = data.sort_order ?? (count ?? 0);
      const { error } = await supabase.from("diligence_checklist_items").insert(payload);
      if (error) throw new Error(error.message);
    }

    await logActivity(
      supabase,
      userId,
      data.offering_id,
      room.id,
      data.id ? "checklist_updated" : "checklist_added",
      `${data.id ? "Updated" : "Added"} checklist item “${data.label.trim()}”`,
      { status: data.status },
    );
    return { ok: true };
  });

export const removeChecklistItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: item } = await supabase
      .from("diligence_checklist_items")
      .select("id, offering_id, room_id, label")
      .eq("id", data.id)
      .maybeSingle();
    if (!item) throw new Error("That checklist item is not available.");
    if (!(await canManage(supabase, item.offering_id))) {
      throw new Error("You do not have permission to change this checklist.");
    }
    const { error } = await supabase.from("diligence_checklist_items").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logActivity(
      supabase,
      userId,
      item.offering_id,
      item.room_id,
      "checklist_removed",
      `Removed checklist item “${item.label}”`,
    );
    return { ok: true };
  });

/** Creates a starter checklist covering the core diligence categories. */
export const seedDiligenceChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(offeringInput)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await canManage(supabase, data.offering_id))) {
      throw new Error("You do not have permission to change this checklist.");
    }
    const { data: room } = await supabase
      .from("diligence_rooms")
      .select("id, entity_type")
      .eq("offering_id", data.offering_id)
      .maybeSingle();
    if (!room) throw new Error("Create the diligence room first.");

    const { data: existing } = await supabase
      .from("diligence_checklist_items")
      .select("label")
      .eq("room_id", room.id);
    const seen = new Set((existing ?? []).map((e: any) => e.label));

    const rows = categoriesFor(room.entity_type)
      .filter((c) => c.value !== "other")
      .map((c, i) => ({
        room_id: room.id,
        offering_id: data.offering_id,
        category: c.value,
        label: c.label,
        description: c.hint ?? null,
        is_required: c.required,
        sort_order: i,
        created_by: userId,
      }))
      .filter((r) => !seen.has(r.label));

    if (rows.length) {
      const { error } = await supabase.from("diligence_checklist_items").insert(rows);
      if (error) throw new Error(error.message);
      await logActivity(
        supabase,
        userId,
        data.offering_id,
        room.id,
        "checklist_added",
        `Added ${rows.length} starter checklist items`,
      );
    }
    return { added: rows.length };
  });

/* ------------------------------ Q & A ------------------------------- */

export const listDiligenceQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(offeringInput)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: questions, error } = await supabase
      .from("diligence_questions")
      .select("id, subject, body, status, is_published, asker_name, asked_by, created_at")
      .eq("offering_id", data.offering_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const ids = (questions ?? []).map((q: any) => q.id);
    const { data: messages } = ids.length
      ? await supabase
          .from("diligence_question_messages")
          .select("id, question_id, author_name, from_reviewer, body, created_at")
          .in("question_id", ids)
          .order("created_at", { ascending: true })
      : { data: [] as any[] };

    return {
      questions: (questions ?? []).map((q: any) => ({
        ...q,
        messages: (messages ?? []).filter((m: any) => m.question_id === q.id),
      })),
      canManage: await canManage(supabase, data.offering_id),
    };
  });

export const askDiligenceQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        offering_id: z.string().uuid(),
        subject: z.string().min(3).max(200),
        body: z.string().min(3).max(5000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: room } = await supabase
      .from("diligence_rooms")
      .select("id")
      .eq("offering_id", data.offering_id)
      .maybeSingle();
    if (!room) throw new Error("That diligence room is not available.");

    const who = await actorIdentity(supabase, userId);
    const { data: created, error } = await supabase
      .from("diligence_questions")
      .insert({
        room_id: room.id,
        offering_id: data.offering_id,
        asked_by: userId,
        asker_name: who.name,
        subject: data.subject.trim(),
        body: data.body.trim(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await logActivity(
      supabase,
      userId,
      data.offering_id,
      room.id,
      "question_asked",
      `Asked “${data.subject.trim()}”`,
      { question_id: created.id },
    );
    return { id: created.id };
  });

export const replyToDiligenceQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ question_id: z.string().uuid(), body: z.string().min(1).max(5000) })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: question } = await supabase
      .from("diligence_questions")
      .select("id, offering_id, room_id, subject, asked_by")
      .eq("id", data.question_id)
      .maybeSingle();
    if (!question) throw new Error("That question is not available.");

    const reviewer = await canManage(supabase, question.offering_id);
    if (!reviewer && question.asked_by !== userId) {
      throw new Error("You cannot reply to this question.");
    }

    const who = await actorIdentity(supabase, userId);
    const { error } = await supabase.from("diligence_question_messages").insert({
      question_id: question.id,
      offering_id: question.offering_id,
      author_id: userId,
      author_name: who.name,
      from_reviewer: reviewer,
      body: data.body.trim(),
    });
    if (error) throw new Error(error.message);

    if (reviewer) {
      await supabase
        .from("diligence_questions")
        .update({ status: "answered" })
        .eq("id", question.id);
    }

    await logActivity(
      supabase,
      userId,
      question.offering_id,
      question.room_id,
      reviewer ? "question_answered" : "question_replied",
      `${reviewer ? "Answered" : "Replied on"} “${question.subject}”`,
      { question_id: question.id },
    );
    return { ok: true };
  });

export const updateDiligenceQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        question_id: z.string().uuid(),
        status: z.enum(["open", "answered", "closed"]).optional(),
        is_published: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: question } = await supabase
      .from("diligence_questions")
      .select("id, offering_id, room_id, subject")
      .eq("id", data.question_id)
      .maybeSingle();
    if (!question) throw new Error("That question is not available.");
    if (!(await canManage(supabase, question.offering_id))) {
      throw new Error("You do not have permission to change this question.");
    }

    const patch: any = {};
    if (data.status) patch["status"] = data.status;
    if (data.is_published !== undefined) patch["is_published"] = data.is_published;
    if (Object.keys(patch).length === 0) return { ok: true };

    const { error } = await supabase
      .from("diligence_questions")
      .update(patch)
      .eq("id", question.id);
    if (error) throw new Error(error.message);

    await logActivity(
      supabase,
      userId,
      question.offering_id,
      question.room_id,
      "question_updated",
      `Updated “${question.subject}”${data.is_published === true ? " — shared with all investors" : ""}`,
      patch,
    );
    return { ok: true };
  });

/* --------------------------- Activity trail -------------------------- */

export const listDiligenceActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ offering_id: z.string().uuid(), limit: z.number().int().min(1).max(200).default(50) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: events, error } = await supabase
      .from("diligence_activity")
      .select("id, event_type, summary, actor_name, actor_email, metadata, created_at")
      .eq("offering_id", data.offering_id)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { events: events ?? [], canManage: await canManage(supabase, data.offering_id) };
  });

/* ---------------------- Room open / view tracking --------------------- */

/** Records that the signed-in person opened the room. Throttled to one entry per 30 minutes. */
export const recordRoomVisit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(offeringInput)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: room } = await supabase
      .from("diligence_rooms")
      .select("id")
      .eq("offering_id", data.offering_id)
      .maybeSingle();
    if (!room) return { recorded: false };

    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from("diligence_activity")
      .select("id")
      .eq("offering_id", data.offering_id)
      .eq("actor_id", userId)
      .eq("event_type", "room_viewed")
      .gte("created_at", since)
      .limit(1);
    if (recent && recent.length > 0) return { recorded: false };

    await logActivity(supabase, userId, data.offering_id, room.id, "room_viewed", "Opened the diligence room");
    return { recorded: true };
  });

/** Manager/admin view: who has actually opened the room and which documents they read. */
export const getDiligenceEngagement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(offeringInput)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (!(await canManage(supabase, data.offering_id))) {
      throw new Error("You do not have permission to view engagement for this fund.");
    }

    const { data: events, error } = await supabase
      .from("diligence_activity")
      .select("actor_id, actor_name, actor_email, event_type, metadata, created_at")
      .eq("offering_id", data.offering_id)
      .in("event_type", ["room_viewed", "document_downloaded", "nda_accepted", "question_asked"])
      .order("created_at", { ascending: true })
      .limit(5000);
    if (error) throw new Error(error.message);

    const { data: docs } = await supabase
      .from("diligence_documents")
      .select("id, title")
      .eq("offering_id", data.offering_id);
    const titles = new Map<string, string>((docs ?? []).map((d: any) => [d.id, d.title]));

    type Row = {
      actor_id: string;
      name: string | null;
      email: string | null;
      visits: number;
      firstSeen: string | null;
      lastSeen: string | null;
      ndaAcceptedAt: string | null;
      questionsAsked: number;
      documents: { id: string; title: string; opens: number; lastOpened: string }[];
    };
    const byActor = new Map<string, Row>();

    for (const e of (events ?? []) as any[]) {
      let row = byActor.get(e.actor_id);
      if (!row) {
        row = {
          actor_id: e.actor_id,
          name: e.actor_name ?? null,
          email: e.actor_email ?? null,
          visits: 0,
          firstSeen: null,
          lastSeen: null,
          ndaAcceptedAt: null,
          questionsAsked: 0,
          documents: [],
        };
        byActor.set(e.actor_id, row);
      }
      row.name = row.name ?? e.actor_name ?? null;
      row.email = row.email ?? e.actor_email ?? null;
      row.firstSeen = row.firstSeen ?? e.created_at;
      row.lastSeen = e.created_at;

      if (e.event_type === "room_viewed") row.visits += 1;
      if (e.event_type === "nda_accepted") row.ndaAcceptedAt = e.created_at;
      if (e.event_type === "question_asked") row.questionsAsked += 1;
      if (e.event_type === "document_downloaded") {
        const docId = (e.metadata as any)?.document_id as string | undefined;
        if (docId) {
          const existing = row.documents.find((d) => d.id === docId);
          if (existing) {
            existing.opens += 1;
            existing.lastOpened = e.created_at;
          } else {
            row.documents.push({
              id: docId,
              title: titles.get(docId) ?? "A document",
              opens: 1,
              lastOpened: e.created_at,
            });
          }
        }
      }
    }

    const viewers = [...byActor.values()].sort((a, b) =>
      (b.lastSeen ?? "").localeCompare(a.lastSeen ?? ""),
    );

    // People with access who have never opened anything.
    const { data: invited } = await supabase
      .from("investor_fund_access")
      .select("user_id")
      .eq("offering_id", data.offering_id);
    const { data: applicants } = await supabase
      .from("investor_applications")
      .select("user_id")
      .eq("offering_id", data.offering_id);
    const withAccess = new Set<string>([
      ...((invited ?? []) as any[]).map((r) => r.user_id),
      ...((applicants ?? []) as any[]).map((r) => r.user_id),
    ]);
    const silentIds = [...withAccess].filter((id) => !byActor.has(id));
    let neverOpened: { user_id: string; name: string | null; email: string | null }[] = [];
    if (silentIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, legal_name, email")
        .in("user_id", silentIds);
      neverOpened = silentIds.map((id) => {
        const p = ((profs ?? []) as any[]).find((x) => x.user_id === id);
        return { user_id: id, name: p?.legal_name ?? null, email: p?.email ?? null };
      });
    }

    return {
      viewers,
      neverOpened,
      totalDocuments: (docs ?? []).length,
    };
  });

/* ------------------------- Document versions ------------------------- */

export const listDocumentVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ document_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: versions, error } = await supabase
      .from("diligence_document_versions")
      .select("id, version, file_name, size_bytes, note, uploaded_at")
      .eq("document_id", data.document_id)
      .order("version", { ascending: false });
    if (error) throw new Error(error.message);
    return { versions: versions ?? [] };
  });

/** Uploads a replacement file for a document and keeps the previous version. */
export const addDocumentVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        document_id: z.string().uuid(),
        file_name: z.string().min(1).max(255),
        content_type: z.string().max(120).optional(),
        content_base64: z.string().min(1).max(28_000_000),
        note: z.string().max(500).optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: doc } = await supabase
      .from("diligence_documents")
      .select("id, offering_id, room_id, title, version, box_file_id, file_name, size_bytes")
      .eq("id", data.document_id)
      .maybeSingle();
    if (!doc) throw new Error("That document is not available.");
    if (!(await canManage(supabase, doc.offering_id))) {
      throw new Error("You do not have permission to update this document.");
    }

    const { data: room } = await supabase
      .from("diligence_rooms")
      .select("box_folder_id")
      .eq("id", doc.room_id)
      .maybeSingle();
    if (!room) throw new Error("That diligence room is not available.");

    const binary = Buffer.from(data.content_base64, "base64");
    if (binary.length === 0) throw new Error("That file appears to be empty.");
    if (binary.length > 20 * 1024 * 1024) throw new Error("Files must be 20 MB or smaller.");

    // Keep a record of the version being replaced.
    const { error: histErr } = await supabase.from("diligence_document_versions").insert({
      document_id: doc.id,
      offering_id: doc.offering_id,
      version: doc.version,
      box_file_id: doc.box_file_id,
      file_name: doc.file_name,
      size_bytes: doc.size_bytes,
      note: "Previous version",
      uploaded_by: userId,
    });
    if (histErr && !histErr.message.includes("duplicate")) throw new Error(histErr.message);

    const { uploadFileTo } = await import("@/lib/box.server");
    const nextVersion = doc.version + 1;
    const base = data.file_name.replace(/[\\/:*?"<>|]/g, "_");
    const dot = base.lastIndexOf(".");
    const versioned =
      dot > 0 ? `${base.slice(0, dot)} (v${nextVersion})${base.slice(dot)}` : `${base} (v${nextVersion})`;

    const uploaded = await uploadFileTo(
      room.box_folder_id,
      versioned,
      new Uint8Array(binary),
      data.content_type || "application/octet-stream",
    );

    const { error } = await supabase
      .from("diligence_documents")
      .update({
        box_file_id: uploaded.id,
        file_name: versioned,
        size_bytes: uploaded.size,
        version: nextVersion,
        uploaded_by: userId,
        uploaded_at: new Date().toISOString(),
      })
      .eq("id", doc.id);
    if (error) throw new Error(error.message);

    const { error: newErr } = await supabase.from("diligence_document_versions").insert({
      document_id: doc.id,
      offering_id: doc.offering_id,
      version: nextVersion,
      box_file_id: uploaded.id,
      file_name: versioned,
      size_bytes: uploaded.size,
      note: data.note?.trim() ? data.note.trim() : null,
      uploaded_by: userId,
    });
    if (newErr) throw new Error(newErr.message);

    await logActivity(
      supabase,
      userId,
      doc.offering_id,
      doc.room_id,
      "document_version_added",
      `Uploaded version ${nextVersion} of “${doc.title}”`,
      { document_id: doc.id, version: nextVersion },
    );
    return { version: nextVersion };
  });

export const getVersionDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: version } = await supabase
      .from("diligence_document_versions")
      .select("id, box_file_id, file_name, version, offering_id, document_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!version) throw new Error("That version is not available.");

    const { temporaryDownloadUrl } = await import("@/lib/box.server");
    const url = await temporaryDownloadUrl(version.box_file_id);
    await logActivity(
      supabase,
      userId,
      version.offering_id,
      null,
      "document_downloaded",
      `Downloaded ${version.file_name} (version ${version.version})`,
      { document_id: version.document_id, version: version.version },
    );
    return { url, file_name: version.file_name };
  });

/* --------------------- Diligence → onboarding handoff --------------------- */

export type OnboardingRailStep = {
  key: "nda" | "kyc" | "aml" | "accreditation" | "documents" | "funding";
  label: string;
  state: "done" | "current" | "todo" | "review";
};

const STEP_ORDER = ["kyc", "aml", "accreditation", "documents", "funding"] as const;

/**
 * Where this person stands on the path from reading the room to being funded:
 * confidentiality agreement first, then the five onboarding steps for this fund.
 */
export const getDiligenceOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(offeringInput)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const [{ data: room }, { data: application }, { data: access }] = await Promise.all([
      supabase
        .from("diligence_rooms")
        .select("id, nda_required, nda_version")
        .eq("offering_id", data.offering_id)
        .maybeSingle(),
      supabase
        .from("investor_applications")
        .select(
          "id, offering_id, current_step, kyc_status, aml_status, accreditation_status, documents_status, funding_status",
        )
        .eq("user_id", userId)
        .eq("offering_id", data.offering_id)
        .maybeSingle(),
      supabase
        .from("investor_fund_access")
        .select("offering_id")
        .eq("user_id", userId)
        .eq("offering_id", data.offering_id)
        .maybeSingle(),
    ]);

    let ndaAccepted = true;
    if (room?.nda_required) {
      const { data: acceptance } = await supabase
        .from("diligence_nda_acceptances")
        .select("accepted_at")
        .eq("room_id", room.id)
        .eq("user_id", userId)
        .eq("nda_version", room.nda_version)
        .maybeSingle();
      ndaAccepted = Boolean(acceptance);
    }

    // An application for a different fund means this person is already onboarding
    // elsewhere; we point them at their dashboard rather than starting a second one.
    const { data: otherApplication } = application
      ? { data: null }
      : await supabase
          .from("investor_applications")
          .select("id, offering_id")
          .eq("user_id", userId)
          .limit(1)
          .maybeSingle();

    const statusOf = (value: string | null | undefined) =>
      value === "approved" || value === "settled"
        ? "done"
        : value === "review" || value === "submitted" || value === "pending_review"
          ? "review"
          : null;

    const labels: Record<(typeof STEP_ORDER)[number], string> = {
      kyc: "Identity (KYC)",
      aml: "Screening (AML)",
      accreditation: "Accreditation",
      documents: "Fund documents",
      funding: "Wire or ACH funding",
    };

    const columns: Record<(typeof STEP_ORDER)[number], string | null> = {
      kyc: application?.kyc_status ?? null,
      aml: application?.aml_status ?? null,
      accreditation: application?.accreditation_status ?? null,
      documents: application?.documents_status ?? null,
      funding: application?.funding_status ?? null,
    };

    const steps: OnboardingRailStep[] = [
      {
        key: "nda",
        label: "Confidentiality agreement",
        state: ndaAccepted ? "done" : "current",
      },
      ...STEP_ORDER.map((key) => {
        const settled = statusOf(columns[key]);
        const state: OnboardingRailStep["state"] = !application
          ? "todo"
          : settled === "done"
            ? "done"
            : application.current_step === key
              ? settled === "review"
                ? "review"
                : "current"
              : (settled ?? "todo");
        return { key, label: labels[key], state } as OnboardingRailStep;
      }),
    ];

    const complete = steps.every((s) => s.state === "done");
    const nextStep =
      (application?.current_step as string | null) ??
      STEP_ORDER.find((k) => statusOf(columns[k]) !== "done") ??
      "kyc";

    return {
      ndaRequired: Boolean(room?.nda_required),
      ndaAccepted,
      hasApplication: Boolean(application),
      invited: Boolean(access) || Boolean(application),
      otherOfferingId: (otherApplication?.offering_id as string | undefined) ?? null,
      canManage: await canManage(supabase, data.offering_id),
      steps,
      complete,
      nextStep,
    };
  });

/**
 * Turn diligence interest into a real application for this fund. Requires the
 * confidentiality agreement first, and an invitation to the fund.
 */
export const startOnboardingFromRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(offeringInput)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: existing } = await supabase
      .from("investor_applications")
      .select("id, offering_id")
      .eq("user_id", userId)
      .eq("offering_id", data.offering_id)
      .maybeSingle();
    if (existing) return { application_id: existing.id, created: false };

    const { data: access } = await supabase
      .from("investor_fund_access")
      .select("offering_id")
      .eq("user_id", userId)
      .eq("offering_id", data.offering_id)
      .maybeSingle();
    if (!access) {
      throw new Error("You need an invitation to this fund before you can start onboarding.");
    }

    const { data: room } = await supabase
      .from("diligence_rooms")
      .select("id, nda_required, nda_version")
      .eq("offering_id", data.offering_id)
      .maybeSingle();
    if (room?.nda_required) {
      const { data: acceptance } = await supabase
        .from("diligence_nda_acceptances")
        .select("id")
        .eq("room_id", room.id)
        .eq("user_id", userId)
        .eq("nda_version", room.nda_version)
        .maybeSingle();
      if (!acceptance) {
        throw new Error("Please accept the confidentiality agreement before starting onboarding.");
      }
    }

    const created = await supabase
      .from("investor_applications")
      .insert({ user_id: userId, offering_id: data.offering_id, current_step: "kyc" })
      .select("id")
      .single();
    if (created.error) throw new Error(created.error.message);

    await logActivity(
      supabase,
      userId,
      data.offering_id,
      room?.id ?? null,
      "onboarding_started",
      "Started investor onboarding from the diligence room",
      { application_id: created.data.id },
    );

    return { application_id: created.data.id, created: true };
  });

/* ------------------------------------------------------------------ */
/* Cap table — kept live in the platform, no spreadsheet upload needed */
/* ------------------------------------------------------------------ */

export type CapTableRow = {
  id: string;
  holder_name: string;
  holder_type: string;
  security_type: string;
  shares: number | null;
  ownership_pct: number | null;
  fully_diluted_pct: number | null;
  notes: string | null;
  sort_order: number;
  updated_at: string;
};

export const listCapTable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(offeringInput)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("diligence_cap_table")
      .select(
        "id, holder_name, holder_type, security_type, shares, ownership_pct, fully_diluted_pct, notes, sort_order, updated_at",
      )
      .eq("offering_id", data.offering_id)
      .order("sort_order", { ascending: true })
      .order("holder_name", { ascending: true });
    if (error) throw new Error(error.message);

    const list = (rows ?? []) as CapTableRow[];
    const totals = list.reduce(
      (acc, r) => ({
        shares: acc.shares + Number(r.shares ?? 0),
        ownership: acc.ownership + Number(r.ownership_pct ?? 0),
        fully_diluted: acc.fully_diluted + Number(r.fully_diluted_pct ?? 0),
      }),
      { shares: 0, ownership: 0, fully_diluted: 0 },
    );

    return {
      rows: list,
      totals,
      canManage: await canManage(supabase, data.offering_id),
      updated_at: list.reduce<string | null>(
        (latest, r) => (!latest || r.updated_at > latest ? r.updated_at : latest),
        null,
      ),
    };
  });

const capRowSchema = z.object({
  offering_id: z.string().uuid(),
  id: z.string().uuid().optional(),
  holder_name: z.string().trim().min(1).max(200),
  holder_type: z.enum(["founder", "investor", "employee_pool", "lp", "gp", "other"]),
  security_type: z.string().trim().min(1).max(80),
  shares: z.number().nonnegative().nullable().optional(),
  ownership_pct: z.number().min(0).max(100).nullable().optional(),
  fully_diluted_pct: z.number().min(0).max(100).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
});

export const saveCapTableRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => capRowSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await canManage(supabase, data.offering_id))) {
      throw new Error("You do not have permission to edit this cap table.");
    }

    const patch = {
      offering_id: data.offering_id,
      holder_name: data.holder_name,
      holder_type: data.holder_type,
      security_type: data.security_type,
      shares: data.shares ?? null,
      ownership_pct: data.ownership_pct ?? null,
      fully_diluted_pct: data.fully_diluted_pct ?? null,
      notes: data.notes ?? null,
      sort_order: data.sort_order ?? 0,
      created_by: userId,
    };

    if (data.id) {
      const { error } = await supabase
        .from("diligence_cap_table")
        .update(patch)
        .eq("id", data.id)
        .eq("offering_id", data.offering_id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("diligence_cap_table").insert(patch);
      if (error) throw new Error(error.message);
    }

    const { data: room } = await supabase
      .from("diligence_rooms")
      .select("id")
      .eq("offering_id", data.offering_id)
      .maybeSingle();

    await logActivity(
      supabase,
      userId,
      data.offering_id,
      room?.id ?? null,
      "cap_table_updated",
      `${data.id ? "Updated" : "Added"} cap table holder ${data.holder_name}`,
      { holder: data.holder_name },
    );

    return { ok: true };
  });

export const removeCapTableRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ offering_id: z.string().uuid(), id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await canManage(supabase, data.offering_id))) {
      throw new Error("You do not have permission to edit this cap table.");
    }
    const { data: existing } = await supabase
      .from("diligence_cap_table")
      .select("holder_name")
      .eq("id", data.id)
      .maybeSingle();

    const { error } = await supabase
      .from("diligence_cap_table")
      .delete()
      .eq("id", data.id)
      .eq("offering_id", data.offering_id);
    if (error) throw new Error(error.message);

    const { data: room } = await supabase
      .from("diligence_rooms")
      .select("id")
      .eq("offering_id", data.offering_id)
      .maybeSingle();

    await logActivity(
      supabase,
      userId,
      data.offering_id,
      room?.id ?? null,
      "cap_table_updated",
      `Removed cap table holder ${existing?.holder_name ?? ""}`.trim(),
      {},
    );
    return { ok: true };
  });
