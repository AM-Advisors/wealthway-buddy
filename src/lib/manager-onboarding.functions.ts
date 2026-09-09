import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const MANAGER_DOC_TYPES = [
  { value: "identification", label: "Government ID" },
  { value: "management_agreement", label: "Management agreement" },
  { value: "form_adv", label: "Form ADV / registration" },
  { value: "entity_formation", label: "Entity formation documents" },
  { value: "tax_form", label: "Tax form (W-9 / W-8)" },
  { value: "background_check", label: "Background check consent" },
  { value: "bank_letter", label: "Bank letter or voided check" },
  { value: "other", label: "Other onboarding document" },
] as const;

const typeValues = MANAGER_DOC_TYPES.map((t) => t.value) as [string, ...string[]];

export const MANAGER_DOC_STATUS_LABELS: Record<string, string> = {
  submitted: "Awaiting review",
  approved: "Approved",
  rejected: "Sent back",
};

export type ManagerDocRow = {
  id: string;
  doc_type: string;
  file_name: string;
  note: string | null;
  status: string;
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  offering_id: string | null;
  offeringName: string | null;
  submittedBy: string | null;
  box_file_id: string | null;
  box_uploaded_at: string | null;
  box_error: string | null;
};

async function roles(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const list = (data ?? []).map((r: any) => r.role as string);
  return { isAdmin: list.includes("admin"), isManager: list.includes("fund_manager") };
}

export const listManagerOnboardingDocs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { isAdmin, isManager } = await roles(supabase, userId);
    if (!isAdmin && !isManager) throw new Error("Forbidden: fund manager access required.");

    // Row visibility is enforced by the database: managers see their own rows, admins see all.
    const { data, error } = await supabase
      .from("manager_onboarding_documents")
      .select(
        "id, user_id, offering_id, doc_type, file_name, note, status, review_notes, reviewed_at, created_at, box_file_id, box_uploaded_at, box_error",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const [{ data: offerings }, { data: profiles }, { data: myFunds }] = await Promise.all([
      supabase.from("offerings").select("id, name"),
      supabase.from("profiles").select("user_id, email, legal_name"),
      supabase.from("fund_managers").select("offering_id").eq("user_id", userId),
    ]);

    const offeringName = new Map<string, string>();
    for (const o of offerings ?? []) offeringName.set(o.id, o.name);
    const person = new Map<string, string>();
    for (const p of profiles ?? []) person.set(p.user_id, p.legal_name || p.email || "Fund manager");

    const rows: ManagerDocRow[] = (data ?? []).map((r: any) => ({
      id: r.id,
      doc_type: r.doc_type,
      file_name: r.file_name,
      note: r.note,
      status: r.status,
      review_notes: r.review_notes,
      reviewed_at: r.reviewed_at,
      box_file_id: r.box_file_id ?? null,
      box_uploaded_at: r.box_uploaded_at ?? null,
      box_error: r.box_error ?? null,
      created_at: r.created_at,
      offering_id: r.offering_id,
      offeringName: r.offering_id ? (offeringName.get(r.offering_id) ?? null) : null,
      submittedBy: person.get(r.user_id) ?? null,
    }));

    const fundIds = new Set((myFunds ?? []).map((f: any) => f.offering_id as string));
    const funds = (offerings ?? [])
      .filter((o: any) => isAdmin || fundIds.has(o.id))
      .map((o: any) => ({ id: o.id as string, name: o.name as string }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name));

    return { documents: rows, funds, isAdmin };
  });

export const submitManagerOnboardingDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        storage_path: z.string().min(1).max(500),
        file_name: z.string().min(1).max(255),
        doc_type: z.enum(typeValues),
        offering_id: z.string().uuid().nullable().optional(),
        note: z.string().max(500).nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { isAdmin, isManager } = await roles(supabase, userId);
    if (!isAdmin && !isManager) throw new Error("Forbidden: fund manager access required.");
    if (!data.storage_path.startsWith(`${userId}/`)) throw new Error("Invalid upload path.");

    const { error } = await supabase.from("manager_onboarding_documents").insert({
      user_id: userId,
      offering_id: data.offering_id ?? null,
      doc_type: data.doc_type,
      file_name: data.file_name,
      storage_path: data.storage_path,
      note: data.note?.trim() ? data.note.trim() : null,
      status: "submitted",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const openManagerOnboardingDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row } = await supabase
      .from("manager_onboarding_documents")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("That file is not available.");

    const { data: signed, error } = await supabase.storage
      .from("manager-uploads")
      .createSignedUrl(row.storage_path, 300);
    if (error || !signed) throw new Error(error?.message ?? "Could not open that file.");
    return { url: signed.signedUrl };
  });

export const withdrawManagerOnboardingDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("manager_onboarding_documents")
      .select("id, storage_path, user_id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (!row || row.user_id !== userId) throw new Error("That file is not available.");
    if (row.status !== "submitted") throw new Error("Reviewed documents cannot be removed.");

    await supabase.storage.from("manager-uploads").remove([row.storage_path]);
    const { error } = await supabase.from("manager_onboarding_documents").delete().eq("id", row.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reviewManagerOnboardingDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        notes: z.string().max(1000).nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { isAdmin } = await roles(supabase, userId);
    if (!isAdmin) throw new Error("Forbidden: administrator access required.");
    if (data.decision === "rejected" && !data.notes?.trim()) {
      throw new Error("Add a note explaining what is needed before sending a document back.");
    }

    const { error } = await supabase
      .from("manager_onboarding_documents")
      .update({
        status: data.decision,
        review_notes: data.notes?.trim() ? data.notes.trim() : null,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    let filing: { ok: boolean; filedAt?: string; error?: string; skipped?: string } = { ok: false };
    if (data.decision === "approved") {
      try {
        const { archiveManagerDocToBox } = await import("@/lib/manager-onboarding-box.server");
        filing = await archiveManagerDocToBox(data.id);
      } catch (e: any) {
        filing = { ok: false, error: String(e?.message ?? e).slice(0, 300) };
      }
    }
    return { ok: true, filing };
  });

/** Retries filing an approved document into the shared folder. */
export const refileManagerOnboardingDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { isAdmin } = await roles(supabase, userId);
    if (!isAdmin) throw new Error("Forbidden: administrator access required.");

    const { archiveManagerDocToBox } = await import("@/lib/manager-onboarding-box.server");
    const result = await archiveManagerDocToBox(data.id);
    if (!result.ok) {
      throw new Error(
        result.skipped === "box_not_configured"
          ? "The shared folder is not connected yet."
          : result.skipped === "not_approved"
            ? "Only approved documents are filed."
            : (result.error ?? "Could not file that document."),
      );
    }
    return { ok: true, filedAt: result.filedAt ?? null };
  });
