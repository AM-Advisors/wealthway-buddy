/**
 * Fund Setup extras: service providers, formation evidence uploads, Form D / Blue Sky
 * filing records, and auto-completion of setup tasks from recorded data.
 * Record-only: nothing here files with the SEC, NASAA or any state.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { setupActor, forbid } from "@/lib/fund-setup.server";

const db = () => supabaseAdmin as any;

export type Providers = {
  bankName?: string | undefined; custodianName?: string | undefined; counsel?: string | undefined; auditor?: string | undefined;
  taxPreparer?: string | undefined; taxPreparerIsHarmonious?: boolean | undefined;
};
export type EvidenceKind = "formation" | "certificate" | "ein_letter";
const EVIDENCE: Record<EvidenceKind, { docType: string; title: string; col: string }> = {
  formation: { docType: "formation_document", title: "Formation Document", col: "formation_document_id" },
  certificate: { docType: "certificate_of_formation", title: "Certificate of Formation", col: "certificate_document_id" },
  ein_letter: { docType: "ein_letter", title: "IRS EIN Letter", col: "ein_letter_document_id" },
};

async function assertRead(userId: string, offeringId: string) {
  const a = await setupActor(userId);
  if (!a.isStaff && !a.offeringIds.includes(offeringId)) forbid("you do not manage that fund.");
  return a;
}
async function assertStaff(userId: string, offeringId: string) {
  const a = await assertRead(userId, offeringId);
  if (!a.isStaff) forbid("only Harmonious can change Fund Setup.");
  return a;
}
async function setupFor(offeringId: string) {
  const { data } = await db().from("fund_setups").select("id, service_providers").eq("offering_id", offeringId).maybeSingle();
  if (!data) throw new Error("Save the Fund Details first so a setup record exists.");
  return data as { id: string; service_providers: Providers };
}
async function event(setupIdV: string, offeringId: string, userId: string | null, ev: string, summary: string) {
  await db().from("fund_setup_events").insert({ setup_id: setupIdV, subject_table: "offerings", subject_id: offeringId, event: ev, actor_user_id: userId, detail: { summary } }).then(() => null, () => null);
}

export function providersComplete(p: Providers) {
  const has = (v?: string) => !!v?.trim();
  return (has(p.bankName) || has(p.custodianName)) && has(p.counsel) && has(p.auditor) && (p.taxPreparerIsHarmonious || has(p.taxPreparer));
}

export async function getExtras(userId: string, offeringId: string) {
  const a = await assertRead(userId, offeringId);
  const { data: s } = await db().from("fund_setups").select("id, service_providers").eq("offering_id", offeringId).maybeSingle();
  const evidence: Record<EvidenceKind, { present: boolean; version: number | null; uploadedAt: string | null }> = {
    formation: { present: false, version: null, uploadedAt: null },
    certificate: { present: false, version: null, uploadedAt: null },
    ein_letter: { present: false, version: null, uploadedAt: null },
  };
  if (s) {
    const { data: ef } = await db().from("fund_entity_formation").select("formation_document_id, certificate_document_id, ein_letter_document_id").eq("setup_id", s.id).maybeSingle();
    const { data: docs } = await db().from("fund_setup_documents").select("doc_type, version, created_at, is_current").eq("setup_id", s.id).eq("is_current", true);
    for (const k of Object.keys(EVIDENCE) as EvidenceKind[]) {
      const d = (docs ?? []).find((x: any) => x.doc_type === EVIDENCE[k].docType);
      evidence[k] = { present: !!(ef?.[EVIDENCE[k].col] || d), version: d?.version ?? null, uploadedAt: d?.created_at ?? null };
    }
  }
  const { data: filings } = await db().from("fund_regulatory_filings").select("*").eq("offering_id", offeringId).is("removed_at", null).order("filing_date", { ascending: false, nullsFirst: false });
  return {
    canEdit: a.isStaff,
    hasSetup: !!s,
    providers: (s?.service_providers ?? {}) as Providers,
    evidence,
    filings: ((filings ?? []) as any[]).map((f) => ({
      id: f.id as string, type: f.filing_type as "form_d" | "blue_sky", kind: f.filing_kind as string, state: f.state as string | null,
      accessionNumber: f.accession_number as string | null, efdId: f.efd_id as string | null, filingDate: f.filing_date as string | null, notes: a.isStaff ? (f.notes as string | null) : null,
    })),
  };
}

export async function saveProviders(userId: string, input: { offeringId: string; providers: Providers }) {
  await assertStaff(userId, input.offeringId);
  const s = await setupFor(input.offeringId);
  const p = { ...input.providers };
  if (p.taxPreparerIsHarmonious) p.taxPreparer = "Harmonious";
  await db().from("fund_setups").update({ service_providers: p, updated_at: new Date().toISOString() }).eq("id", s.id);
  await event(s.id, input.offeringId, userId, "service_providers_saved", "Service providers updated");
  await autoCompleteTasks(input.offeringId);
  return { ok: true };
}

export async function uploadEvidence(userId: string, input: { offeringId: string; kind: EvidenceKind; path: string }) {
  await assertStaff(userId, input.offeringId);
  if (!input.path.startsWith(`fund-setup-restricted/${input.offeringId}/`)) throw new Error("That file does not belong to this fund.");
  const s = await setupFor(input.offeringId);
  await linkEvidence(userId, s.id, input.kind, input.path);
  await event(s.id, input.offeringId, userId, "formation_evidence_uploaded", `${EVIDENCE[input.kind].title} uploaded`);
  await autoCompleteTasks(input.offeringId);
  return { ok: true };
}

/** Appends a new version (older ones kept) and points the entity formation record at it. */
export async function linkEvidence(userId: string, setupIdV: string, kind: EvidenceKind, path: string | null, existingDocId?: string) {
  const spec = EVIDENCE[kind];
  let docId = existingDocId;
  if (!docId) {
    const { data: existing } = await db().from("fund_setup_documents").select("id, version, is_current").eq("setup_id", setupIdV).eq("doc_type", spec.docType).order("version", { ascending: false });
    const current = (existing ?? []).find((d: any) => d.is_current);
    if (current) await db().from("fund_setup_documents").update({ is_current: false }).eq("id", current.id);
    const { data, error } = await db().from("fund_setup_documents").insert({
      setup_id: setupIdV, doc_type: spec.docType, title: spec.title, storage_path: path, version: ((existing ?? [])[0]?.version ?? 0) + 1,
      is_current: true, status: "uploaded", investor_facing: false, uploaded_by: userId, uploaded_role: "harmonious", supersedes_id: current?.id ?? null,
    }).select("id").single();
    if (error) throw new Error(error.message);
    docId = data.id;
  }
  const { data: ef } = await db().from("fund_entity_formation").select("id").eq("setup_id", setupIdV).maybeSingle();
  if (ef) await db().from("fund_entity_formation").update({ [spec.col]: docId, updated_by: userId, updated_at: new Date().toISOString() }).eq("id", ef.id);
  else await db().from("fund_entity_formation").insert({ setup_id: setupIdV, step: "name_selected", [spec.col]: docId, updated_by: userId });
}

export async function addFiling(userId: string, input: { offeringId: string; type: "form_d" | "blue_sky"; kind: "initial" | "amendment" | "renewal"; state?: string | null | undefined; accessionNumber?: string | null | undefined; efdId?: string | null | undefined; filingDate?: string | null | undefined; notes?: string | null | undefined }) {
  await assertStaff(userId, input.offeringId);
  if (input.type === "blue_sky" && !input.state) throw new Error("Choose the state for a Blue Sky filing.");
  if (input.type === "form_d" && !input.accessionNumber) throw new Error("Enter the SEC accession number for the Form D.");
  const s = await setupFor(input.offeringId);
  const { error } = await db().from("fund_regulatory_filings").insert({
    offering_id: input.offeringId, filing_type: input.type, filing_kind: input.kind, state: input.type === "blue_sky" ? input.state : null,
    accession_number: input.accessionNumber || null, efd_id: input.efdId || null, filing_date: input.filingDate || null, notes: input.notes || null, recorded_by: userId,
  });
  if (error) throw new Error(error.message);
  await event(s.id, input.offeringId, userId, "regulatory_filing_recorded", input.type === "form_d" ? "Form D filing recorded" : `Blue Sky filing recorded (${input.state})`);
  return { ok: true };
}

export async function removeFiling(userId: string, input: { offeringId: string; id: string }) {
  await assertStaff(userId, input.offeringId);
  await db().from("fund_regulatory_filings").update({ removed_at: new Date().toISOString(), removed_by: userId }).eq("id", input.id).eq("offering_id", input.offeringId);
  return { ok: true };
}

/**
 * Marks setup tasks complete once the data behind them is recorded. Only ever moves a
 * task forward, respects task dependencies, and leaves completed_by empty so an
 * automatic completion never counts as a person preparing the Fund.
 */
export async function autoCompleteTasks(offeringId: string) {
  try {
    const { data: s } = await db().from("fund_setups").select("id, service_providers, display_name").eq("offering_id", offeringId).maybeSingle();
    if (!s) return;
    const { data: o } = await db().from("offerings").select("name, legal_entity_name, fund_type, registered_agent, reg_type, target_raise_cents, min_investment_cents").eq("id", offeringId).maybeSingle();
    const { data: ef } = await db().from("fund_entity_formation").select("formation_document_id, certificate_document_id, ein_letter_document_id, registered_agent").eq("setup_id", s.id).maybeSingle();
    const done: Record<string, boolean> = {
      client_service_providers: providersComplete(s.service_providers ?? {}),
      fund_information: !!(o?.legal_entity_name && o?.fund_type),
      entity_registered_agent: !!(o?.registered_agent || ef?.registered_agent),
      entity_formation: !!(ef?.formation_document_id && ef?.certificate_document_id),
      entity_ein: !!ef?.ein_letter_document_id,
      offering_config: !!(o?.reg_type && o?.min_investment_cents != null),
      investment_target: !!o?.target_raise_cents,
    };
    const { data: tasks } = await db().from("fund_setup_tasks").select("id, task_key, status, dependencies").eq("setup_id", s.id);
    const status = new Map<string, string>(((tasks ?? []) as any[]).map((t) => [t.task_key, t.status]));
    let changed = true;
    while (changed) {
      changed = false;
      for (const t of (tasks ?? []) as any[]) {
        if (status.get(t.task_key) === "complete" || !done[t.task_key]) continue;
        if ((t.dependencies ?? []).some((dep: string) => status.get(dep) !== "complete")) continue;
        const { error } = await db().from("fund_setup_tasks").update({ status: "complete", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", t.id);
        if (!error) {
          status.set(t.task_key, "complete");
          changed = true;
          await event(s.id, offeringId, null, "task_auto_completed", `${t.task_key.replaceAll("_", " ")} completed automatically from recorded data`);
        }
      }
    }
  } catch {
    // Auto-completion is a convenience; it must never fail the save that triggered it.
  }
}
