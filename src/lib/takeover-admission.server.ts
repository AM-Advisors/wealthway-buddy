import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { commitmentAsOf, type CommitmentEvent } from "@/lib/allocation-model";
import { assertStaff } from "@/lib/investor-onboarding.server";
import {
  capitalCallEligibility,
  decisionError,
  economicDiscrepancies,
  normalizeCompliance,
  preparationErrors,
  remediationFor,
  statusAfterPreparation,
  type AdmissionInput,
  type AdmissionStatus,
  type EligibilityRow,
  type EvidenceItem,
  type InvestorOrigin,
  type TakeoverOrigin,
} from "@/lib/takeover-admission-model";

const db = () => supabaseAdmin as any;
const fail = (m: string): never => {
  throw new Error(m);
};

async function event(admissionId: string, offeringId: string, action: string, actor: string, snapshot: unknown, reason: string | null = null) {
  const { error } = await db().from("investor_takeover_admission_events").insert({ admission_id: admissionId, offering_id: offeringId, action, actor_user_id: actor, snapshot, reason });
  if (error) fail(error.message);
}

async function recordedEconomics(positionId: string) {
  const { data } = await db().from("commitment_events").select("event_type, amount_cents, effective_date").eq("position_id", positionId);
  const s = commitmentAsOf(((data ?? []) as any[]).map((r) => ({ eventType: r.event_type, amountCents: Number(r.amount_cents), effectiveDate: String(r.effective_date) })) as CommitmentEvent[]);
  return { commitmentCents: s.currentCommitmentCents, calledCents: s.calledCents, contributedCents: s.contributedCents };
}

export type PrepareInput = AdmissionInput & { offeringId: string; positionId: string; batchRef: string; origin: TakeoverOrigin; notes: string | null };

/** Prepare (idempotent per position + batch). Never activates anything. */
export async function prepareTakeoverAdmission(userId: string, i: PrepareInput) {
  await assertStaff(userId);
  const errs = preparationErrors(i);
  if (errs.length) fail(errs[0]!);
  const { data: pos } = await db().from("investor_positions").select("id, offering_id, origin").eq("id", i.positionId).maybeSingle();
  if (!pos || pos.offering_id !== i.offeringId) fail("That investor relationship does not belong to this fund.");
  if (pos.origin === "harmonious_onboarded") {
    const { data: closed } = await db().from("investor_onboardings").select("id").eq("position_id", i.positionId).eq("stage", "closed").limit(1);
    if (closed?.length) fail("This investor was closed through Harmonious onboarding; a takeover admission isn't needed.");
  }
  const { data: same } = await db().from("investor_takeover_admissions").select("id, status").eq("position_id", i.positionId).eq("batch_ref", i.batchRef).maybeSingle();
  if (same) return { id: same.id as string, status: same.status as AdmissionStatus, reused: true };
  const { data: live } = await db().from("investor_takeover_admissions").select("id").eq("position_id", i.positionId).not("status", "in", "(rejected,superseded)").limit(1);
  if (live?.length) fail("This investor already has a takeover admission in progress or admitted.");

  const compliance = normalizeCompliance(i.compliance);
  const status = statusAfterPreparation(i.evidence);
  const row = {
    offering_id: i.offeringId, position_id: i.positionId, batch_ref: i.batchRef, origin: i.origin, source_system: i.sourceSystem,
    as_of_date: i.asOfDate, relationship_effective_date: i.relationshipEffectiveDate, investor_name: i.investorName, investor_type: i.investorType,
    class_label: i.classLabel, commitment_cents: i.commitmentCents, called_cents: i.calledCents, contributed_cents: i.contributedCents,
    opening_capital_cents: i.openingCapitalCents, evidence: i.evidence, compliance, remediation: remediationFor(compliance, i.evidence),
    status, notes: i.notes, prepared_by: userId,
  };
  const { data, error } = await db().from("investor_takeover_admissions").insert(row).select("id").single();
  if (error) fail(error.message);
  await event(data.id, i.offeringId, "prepared", userId, row);
  return { id: data.id as string, status, reused: false };
}

/** Bulk preparation: one individual admission + audit record per investor. Never activates. */
export async function prepareTakeoverBatch(userId: string, rows: PrepareInput[]) {
  const results: { positionId: string; name: string; ok: boolean; id?: string; status?: string; error?: string }[] = [];
  for (const r of rows) {
    try {
      const x = await prepareTakeoverAdmission(userId, r);
      results.push({ positionId: r.positionId, name: r.investorName, ok: true, id: x.id, status: x.status });
    } catch (e: any) {
      results.push({ positionId: r.positionId, name: r.investorName, ok: false, error: e?.message ?? String(e) });
    }
  }
  return results;
}

export async function decideTakeoverAdmission(userId: string, i: { admissionId: string; approve: boolean; reason: string | null }) {
  await assertStaff(userId);
  const { data: a } = await db().from("investor_takeover_admissions").select("*").eq("id", i.admissionId).maybeSingle();
  if (!a) fail("Admission not found.");
  const err = decisionError({ status: a.status, preparedBy: a.prepared_by, evidence: a.evidence as EvidenceItem[] }, userId, i.approve, i.reason);
  if (err) fail(err);
  const now = new Date().toISOString();
  if (!i.approve) {
    await db().from("investor_takeover_admissions").update({ status: "rejected", decided_by: userId, decided_at: now, decision_reason: i.reason }).eq("id", a.id);
    await event(a.id, a.offering_id, "rejected", userId, {}, i.reason);
    return { status: "rejected" };
  }
  const recorded = await recordedEconomics(a.position_id);
  const diffs = economicDiscrepancies({ commitmentCents: Number(a.commitment_cents), calledCents: Number(a.called_cents), contributedCents: Number(a.contributed_cents) }, recorded);
  if (diffs.length) fail(`Ownership discrepancy - resolve before admitting: ${diffs.join(" ")}`);

  const { error } = await db().from("investor_takeover_admissions").update({ status: "admitted", decided_by: userId, decided_at: now, decision_reason: i.reason }).eq("id", a.id).eq("status", "approval_required");
  if (error) fail(error.message);
  const { error: pe } = await db().from("investor_positions").update({ status: "active", origin: a.origin, admitted_on: a.relationship_effective_date ?? a.as_of_date }).eq("id", a.position_id);
  if (pe) fail(pe.message);
  await event(a.id, a.offering_id, "admitted", userId, {
    investor: a.investor_name, origin: a.origin, batch: a.batch_ref, preparedBy: a.prepared_by, preparedAt: a.prepared_at, approvedBy: userId, approvedAt: now,
    evidence: a.evidence, relationshipEffectiveDate: a.relationship_effective_date, asOfDate: a.as_of_date, commitmentCents: a.commitment_cents,
    calledCents: a.called_cents, contributedCents: a.contributed_cents, openingCapitalCents: a.opening_capital_cents, class: a.class_label, remediation: a.remediation,
  }, i.reason);
  return { status: "admitted" };
}

/** Read-only: admissions, per-investor eligibility for a capital call, and fund totals from records. */
export async function takeoverOverview(userId: string, offeringId: string) {
  await assertStaff(userId);
  const [{ data: positions }, { data: admissions }, { data: events }] = await Promise.all([
    db().from("investor_positions").select("id, display_name, status, origin").eq("offering_id", offeringId).order("display_name"),
    db().from("investor_takeover_admissions").select("*").eq("offering_id", offeringId).order("prepared_at"),
    db().from("commitment_events").select("position_id, event_type, amount_cents, effective_date").eq("offering_id", offeringId),
  ]);
  const evBy = new Map<string, CommitmentEvent[]>();
  for (const e of (events ?? []) as any[]) evBy.set(e.position_id, [...(evBy.get(e.position_id) ?? []), { eventType: e.event_type, amountCents: Number(e.amount_cents), effectiveDate: String(e.effective_date) } as CommitmentEvent]);
  const live = ((admissions ?? []) as any[]).filter((a) => !["rejected", "superseded"].includes(a.status));
  const rows: EligibilityRow[] = ((positions ?? []) as any[]).map((p) => {
    const s = commitmentAsOf(evBy.get(p.id) ?? []);
    const a = live.find((x) => x.position_id === p.id);
    const flags = a ? ((a.remediation ?? []) as { label: string }[]).map((r) => r.label) : [];
    return capitalCallEligibility({
      positionId: p.id, name: p.display_name, origin: p.origin as InvestorOrigin, positionStatus: p.status,
      admissionStatus: a ? a.status : p.origin === "harmonious_onboarded" ? "harmonious_onboarding" : "none",
      commitmentCents: s.currentCommitmentCents, calledCents: s.calledCents, contributedCents: s.contributedCents, flags,
    });
  });
  const sum = (k: "commitmentCents" | "calledCents" | "contributedCents" | "remainingCents") => rows.reduce((t, r) => t + r[k], 0);
  return {
    admissions: (admissions ?? []) as any[],
    eligibility: rows,
    totals: { investors: rows.length, eligible: rows.filter((r) => r.eligible).length, commitmentCents: sum("commitmentCents"), calledCents: sum("calledCents"), contributedCents: sum("contributedCents"), remainingCents: sum("remainingCents") },
  };
}
