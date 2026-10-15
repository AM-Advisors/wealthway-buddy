/** Source Reconciliation - server. Staff only, read-only over sources; writes only append-only review decisions. */
import {
  countDidit, maskRef, sourceCard, stageDidit,
  type DiditEvent, type DiditLink, type ReviewDecision, type SourceId,
} from "@/lib/source-reconciliation";

const db = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
const staff = async (userId: string) => (await import("@/lib/investor-onboarding.server")).assertStaff(userId);

async function didit() {
  const a = await db();
  const [{ data: evs, error }, { data: kyc }, { data: aic }, { data: apps }, { data: decs }] = await Promise.all([
    a.from("didit_webhook_events").select("event_id, webhook_type, session_id, status, application_id, received_at, vendor:payload->>vendor_data").limit(20000),
    a.from("kyc_verifications").select("id, session_id, vendor_data, verification_ref, application_id, person_id").limit(20000),
    a.from("account_identity_checks").select("id, session_id, vendor_data, person_id").limit(20000),
    a.from("investor_applications").select("id").limit(20000),
    a.from("source_reconciliation_decisions").select("id, source_ref, decision, proposed_person_id").eq("source", "didit").order("created_at").limit(20000),
  ]);
  if (error) throw new Error(error.message);
  const k = (kyc ?? []) as any[]; const ac = (aic ?? []) as any[];
  const appIds = new Set(((apps ?? []) as any[]).map((r) => r.id));
  // Staff-confirmed person links (append-only; the latest decision per session wins).
  const staffLinks = new Map<string, { id: string; personId: string | null }>();
  for (const d of (decs ?? []) as any[]) {
    if (d.decision === "confirm_match" && d.proposed_person_id) staffLinks.set(d.source_ref, { id: d.id, personId: d.proposed_person_id });
    else if (d.decision === "reject_match") staffLinks.delete(d.source_ref);
  }
  const links = (e: DiditEvent): DiditLink[] => {
    const out: DiditLink[] = [];
    const staffLink = e.sessionId ? staffLinks.get(`session:${e.sessionId}`) : undefined;
    if (staffLink) out.push({ via: "session", personId: staffLink.personId, verificationId: staffLink.id });
    if (e.sessionId) {
      for (const r of k) if (r.session_id === e.sessionId) out.push({ via: "session", personId: r.person_id, verificationId: r.id });
      for (const r of ac) if (r.session_id === e.sessionId) out.push({ via: "session", personId: r.person_id, verificationId: r.id });
    }
    if (!out.length && e.vendorData) {
      for (const r of k) if (r.vendor_data === e.vendorData || String(r.verification_ref ?? "") === e.vendorData) out.push({ via: "vendor_data", personId: r.person_id, verificationId: r.id });
      for (const r of ac) if (r.vendor_data === e.vendorData) out.push({ via: "vendor_data", personId: r.person_id, verificationId: r.id });
    }
    if (!out.length && e.applicationId && appIds.has(e.applicationId)) {
      for (const r of k) if (r.application_id === e.applicationId) out.push({ via: "application", personId: r.person_id, verificationId: r.id });
    }
    return out;
  };
  const events: DiditEvent[] = ((evs ?? []) as any[]).map((r) => ({
    eventId: r.event_id, type: r.webhook_type, sessionId: r.session_id, status: r.status, vendorData: r.vendor ?? null, applicationId: r.application_id, receivedAt: r.received_at,
  }));
  const rows = stageDidit(events, links);
  const decided = new Set(((decs ?? []) as any[]).map((d) => d.source_ref));
  const last = events.reduce((m, e) => (e.receivedAt > m ? e.receivedAt : m), "");
  return { rows, events: events.length, counts: countDidit(rows, decided), last: last || null };
}

async function harmonious() {
  const a = await db();
  const [{ count: people }, { data: onb }, { count: funds }, { data: mgrs }] = await Promise.all([
    a.from("persons").select("id", { count: "exact", head: true }),
    a.from("investor_onboardings").select("person_id, investor_user_id, offering_id").is("removed_at", null).limit(20000),
    a.from("offerings").select("id", { count: "exact", head: true }),
    a.from("fund_team_members").select("offering_id").is("removed_at", null).limit(20000),
  ]);
  const o = (onb ?? []) as any[];
  const withInv = new Set(o.map((r) => r.person_id).filter(Boolean));
  const managed = new Set(((mgrs ?? []) as any[]).map((r) => r.offering_id));
  return {
    people: people ?? 0, peopleWithoutInvestment: (people ?? 0) - withInv.size, investments: o.length,
    noPortal: o.filter((r) => !r.investor_user_id).length, funds: funds ?? 0, fundsWithoutManager: (funds ?? 0) - managed.size,
  };
}

export async function overview(userId: string) {
  await staff(userId);
  const [d, h] = await Promise.all([didit(), harmonious()]);
  const now = new Date().toISOString();
  const cards = [
    sourceCard("harmonious", "connected", `${h.people} people, ${h.investments} investments, ${h.funds} funds. ${h.peopleWithoutInvestment} people have no investment; ${h.fundsWithoutManager} funds have no manager; ${h.noPortal} investments have no portal login.`,
      { records: h.people, confirmed: h.people - h.peopleWithoutInvestment, probable: 0, unmatched: h.peopleWithoutInvestment, conflicting: 0, missingEvidence: h.noPortal, errors: 0, reviewRequired: h.peopleWithoutInvestment }, now),
    sourceCard("didit", "partial", `${d.events} stored events grouped into ${d.rows.length} sessions/records. Read from Harmonious only; no provider calls and no new sessions.`, d.counts, d.last),
    sourceCard("simplici", "blocked", "Exports sit in Google Drive, and the only Drive connections have full read/write access. Not used for scans until a metadata-only connection exists."),
    (process.env["WIX_API_KEY"] ? sourceCard("wix", "connected", "Read-only Wix connection (members and contacts). Use People & Access → Wix members → Test connection.") : sourceCard("wix", "not_connected", "No Wix connection. Needs a read-only API key for Contacts, Members, Forms and Media metadata.")),
    sourceCard("google_drive", "blocked", "Linked Drive connections have full access, not metadata-only. A separate identity with drive.metadata.readonly is required."),
    sourceCard("box", "not_connected", "No Box connection. Needs a dedicated least-privilege app, separate from Box Sign."),
  ];
  return {
    cards,
    didit: d.rows.map((r) => ({ ...r, sessionId: maskRef(r.sessionId), ref: r.ref })),
  };
}

export async function decide(userId: string, input: { source: SourceId; sourceRef: string; decision: ReviewDecision; reason: string; personId?: string | null | undefined; registryKey?: string | null | undefined }) {
  await staff(userId);
  if (input.source !== "didit") throw new Error("Only identity-verification records are available for review until other sources are connected.");
  const { rows } = await didit();
  const row = rows.find((r) => r.ref === input.sourceRef);
  if (!row) throw new Error("That source record was not found.");
  if (input.decision === "confirm_match" && (row.personIds.length !== 1 || (input.personId && input.personId !== row.personIds[0])))
    throw new Error("Confirm match needs exactly one person found by the server.");
  if (input.decision === "stage_for_import") throw new Error("Staging for import is not available for verification history.");
  const { error } = await (await db()).from("source_reconciliation_decisions").insert({
    source: input.source, source_ref: input.sourceRef, decision: input.decision,
    proposed_person_id: input.decision === "confirm_match" ? row.personIds[0] : null,
    proposed_registry_key: input.registryKey ?? null, reason: input.reason.trim(), actor_user_id: userId,
  });
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function history(userId: string, source: SourceId, sourceRef: string) {
  await staff(userId);
  const { data } = await (await db()).from("source_reconciliation_decisions").select("decision, reason, actor_user_id, created_at")
    .eq("source", source).eq("source_ref", sourceRef).order("created_at", { ascending: false });
  return data ?? [];
}
