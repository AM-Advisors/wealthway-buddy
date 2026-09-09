import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DocumentEventKind =
  | "fund_document_added"
  | "fund_document_updated"
  | "fund_document_removed"
  | "signed"
  | "investor_upload"
  | "accreditation_upload"
  | "diligence_upload"
  | "review_approved"
  | "review_rejected";

export type DocumentEvent = {
  id: string;
  kind: DocumentEventKind;
  at: string;
  document: string;
  actor: string;
  actorRole: "reviewer" | "investor" | "system";
  offeringId: string | null;
  offeringName: string | null;
  applicationId: string | null;
  detail: string | null;
};

export const EVENT_KIND_LABELS: Record<DocumentEventKind, string> = {
  fund_document_added: "Document added",
  fund_document_updated: "Document edited",
  fund_document_removed: "Document removed",
  signed: "Signed",
  investor_upload: "Investor upload",
  accreditation_upload: "Accreditation upload",
  diligence_upload: "Diligence upload",
  review_approved: "Documents approved",
  review_rejected: "Documents rejected",
};

async function reviewerScope(supabase: any, userId: string) {
  const { data: roles, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const list = (roles ?? []).map((r: any) => r.role as string);
  const isAdmin = list.includes("admin");
  const isManager = list.includes("fund_manager");
  if (!isAdmin && !isManager) throw new Error("Forbidden: reviewer access required.");

  let offeringIds: string[] | null = null;
  if (!isAdmin) {
    const { data } = await supabase
      .from("fund_managers")
      .select("offering_id")
      .eq("user_id", userId);
    offeringIds = (data ?? []).map((r: any) => r.offering_id as string);
  }
  return { isAdmin, offeringIds };
}

function scoped<T extends { offeringId: string | null }>(rows: T[], ids: string[] | null) {
  if (!ids) return rows;
  const set = new Set(ids);
  return rows.filter((r) => r.offeringId && set.has(r.offeringId));
}

export const listDocumentEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        offeringId: z.string().uuid().nullable().optional(),
        kind: z.string().nullable().optional(),
        limit: z.number().int().min(10).max(500).optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { offeringIds } = await reviewerScope(supabase, userId);
    const cap = data.limit ?? 200;

    const [offeringsRes, applicationsRes, profilesRes, offeringDocsRes] = await Promise.all([
      supabase.from("offerings").select("id, name"),
      supabase.from("investor_applications").select("id, user_id, offering_id"),
      supabase.from("profiles").select("user_id, email, legal_name"),
      supabase.from("offering_documents").select("id, title, offering_id"),
    ]);

    const offeringName = new Map<string, string>();
    for (const o of offeringsRes.data ?? []) offeringName.set(o.id, o.name);

    const application = new Map<string, { userId: string; offeringId: string }>();
    for (const a of applicationsRes.data ?? [])
      application.set(a.id, { userId: a.user_id, offeringId: a.offering_id });

    const person = new Map<string, string>();
    for (const p of profilesRes.data ?? [])
      person.set(p.user_id, p.legal_name || p.email || "Unknown person");

    const offeringDoc = new Map<string, { title: string; offeringId: string }>();
    for (const d of offeringDocsRes.data ?? [])
      offeringDoc.set(d.id, { title: d.title, offeringId: d.offering_id });

    const events: DocumentEvent[] = [];

    // 1. Fund paperwork changes made by admins and fund managers.
    const { data: auditRows } = await supabase
      .from("offering_audit_events")
      .select("id, offering_id, event_type, summary, actor_name, actor_email, created_at, changes")
      .in("event_type", ["document_created", "document_updated", "document_deleted"])
      .order("created_at", { ascending: false })
      .limit(cap);
    for (const row of auditRows ?? []) {
      const kind: DocumentEventKind =
        row.event_type === "document_created"
          ? "fund_document_added"
          : row.event_type === "document_updated"
            ? "fund_document_updated"
            : "fund_document_removed";
      const changes = Array.isArray(row.changes) ? row.changes : [];
      events.push({
        id: `audit-${row.id}`,
        kind,
        at: row.created_at,
        document: row.summary?.replace(/^.*?[“"]?/, "") || "Fund document",
        actor: row.actor_name || row.actor_email || "Reviewer",
        actorRole: "reviewer",
        offeringId: row.offering_id,
        offeringName: offeringName.get(row.offering_id) ?? null,
        applicationId: null,
        detail:
          changes.length > 0
            ? `${changes.length} field${changes.length === 1 ? "" : "s"} changed`
            : row.summary || null,
      });
    }

    // 2. Signatures on fund paperwork.
    const { data: signatures } = await supabase
      .from("document_signatures")
      .select(
        "id, application_id, offering_document_id, signer_name, signer_email, signed_at, provider, provider_status",
      )
      .order("signed_at", { ascending: false })
      .limit(cap);
    for (const row of signatures ?? []) {
      const app = application.get(row.application_id);
      const doc = offeringDoc.get(row.offering_document_id);
      events.push({
        id: `sig-${row.id}`,
        kind: "signed",
        at: row.signed_at,
        document: doc?.title ?? "Fund document",
        actor: row.signer_name || row.signer_email || "Investor",
        actorRole: "investor",
        offeringId: app?.offeringId ?? doc?.offeringId ?? null,
        offeringName: offeringName.get(app?.offeringId ?? doc?.offeringId ?? "") ?? null,
        applicationId: row.application_id,
        detail: row.provider ? `via ${row.provider}${row.provider_status ? ` · ${row.provider_status}` : ""}` : null,
      });
    }

    // 3. Investor uploads.
    const { data: investorDocs } = await supabase
      .from("investor_documents")
      .select("id, application_id, user_id, offering_id, file_name, doc_kind, uploaded_at")
      .order("uploaded_at", { ascending: false })
      .limit(cap);
    for (const row of investorDocs ?? []) {
      events.push({
        id: `inv-${row.id}`,
        kind: "investor_upload",
        at: row.uploaded_at,
        document: row.file_name,
        actor: person.get(row.user_id) ?? "Investor",
        actorRole: "investor",
        offeringId: row.offering_id,
        offeringName: offeringName.get(row.offering_id) ?? null,
        applicationId: row.application_id,
        detail: row.doc_kind || null,
      });
    }

    // 4. Accreditation evidence uploads.
    const { data: accDocs } = await supabase
      .from("accreditation_documents")
      .select("id, application_id, file_name, doc_kind, uploaded_at")
      .order("uploaded_at", { ascending: false })
      .limit(cap);
    for (const row of accDocs ?? []) {
      const app = application.get(row.application_id);
      events.push({
        id: `acc-${row.id}`,
        kind: "accreditation_upload",
        at: row.uploaded_at,
        document: row.file_name,
        actor: app ? (person.get(app.userId) ?? "Investor") : "Investor",
        actorRole: "investor",
        offeringId: app?.offeringId ?? null,
        offeringName: app ? (offeringName.get(app.offeringId) ?? null) : null,
        applicationId: row.application_id,
        detail: row.doc_kind || null,
      });
    }

    // 5. Diligence room uploads (each stored version counts as an upload).
    const { data: versions } = await supabase
      .from("diligence_document_versions")
      .select("id, offering_id, file_name, version, note, uploaded_by, uploaded_at")
      .order("uploaded_at", { ascending: false })
      .limit(cap);
    for (const row of versions ?? []) {
      events.push({
        id: `dvz-${row.id}`,
        kind: "diligence_upload",
        at: row.uploaded_at,
        document: row.file_name,
        actor: person.get(row.uploaded_by) ?? "Reviewer",
        actorRole: "reviewer",
        offeringId: row.offering_id,
        offeringName: offeringName.get(row.offering_id) ?? null,
        applicationId: null,
        detail: row.version ? `version ${row.version}${row.note ? ` · ${row.note}` : ""}` : row.note || null,
      });
    }

    // 6. Reviewer decisions on an investor's documents (approved / rejected).
    const { data: notes } = await supabase
      .from("admin_notes")
      .select("id, application_id, author_id, body, created_at")
      .ilike("body", "[documents %")
      .order("created_at", { ascending: false })
      .limit(cap);
    for (const row of notes ?? []) {
      const decision = /→\s*(\w+)/.exec(row.body)?.[1] ?? "";
      if (decision !== "approved" && decision !== "declined") continue;
      const app = application.get(row.application_id);
      events.push({
        id: `note-${row.id}`,
        kind: decision === "approved" ? "review_approved" : "review_rejected",
        at: row.created_at,
        document: app ? `Documents for ${person.get(app.userId) ?? "investor"}` : "Investor documents",
        actor: person.get(row.author_id) ?? "Reviewer",
        actorRole: "reviewer",
        offeringId: app?.offeringId ?? null,
        offeringName: app ? (offeringName.get(app.offeringId) ?? null) : null,
        applicationId: row.application_id,
        detail: row.body.replace(/^\[[^\]]*\]\s*/, "") || null,
      });
    }

    let result = scoped(events, offeringIds);
    if (data.offeringId) result = result.filter((e) => e.offeringId === data.offeringId);
    if (data.kind) result = result.filter((e) => e.kind === data.kind);
    result.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

    const fundOptions = (offeringsRes.data ?? [])
      .filter((o: any) => !offeringIds || offeringIds.includes(o.id))
      .map((o: any) => ({ id: o.id as string, name: o.name as string }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name));

    return { events: result.slice(0, cap), funds: fundOptions, total: result.length };
  });
