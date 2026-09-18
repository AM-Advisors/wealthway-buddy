/**
 * Server-only investor allocation engine and capital accounts.
 *
 * Fund NAV → allocations → capital accounts → statements. The fund-level
 * figures always come from a published NAV's capital handoff; this layer never
 * recomputes fund accounting. Controls preserved here:
 *  - nothing trusts a fund, run, position or statement id sent by the browser;
 *  - Harmonious prepares and approves; fund managers read, acknowledge and
 *    challenge, and can never change a finalized figure;
 *  - preparer ≠ reviewer ≠ approver, and no automated actor approves;
 *  - investor totals must reconcile to the fund exactly or nothing finalizes;
 *  - finalized capital accounts and published statements are immutable, and
 *    corrections are new versions.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { reviewerScope, assertScopeAllows, type ReviewerScope } from "@/lib/reviewer-authz.server";
import { registerReport } from "@/lib/accounting.server";
import {
  adjustmentApprovalError,
  adjustmentError,
  allocateRun,
  allocationSegregationError,
  allocationWeights,
  asOfRecord,
  canTransitionRun,
  canTransitionStatement,
  carryConsumptionError,
  commitmentAsOf,
  distributeAmount,
  finalizationBlockers,
  fundTotalsFromHandoff,
  managementFee,
  managerMayAllocation,
  missingStatementProvenance,
  reconcileAllocations,
  statementSnapshot,
  transferError,
  type AllocationBasis,
  type AllocationManagerWorkflow,
  type CommitmentEvent,
  type FeeTerm,
  type PositionInput,
  type RunStatus,
  type StatementStatus,
  type WaterfallTerms,
} from "@/lib/allocation-model";
import type { CapitalHandoff } from "@/lib/nav-model";

const db = () => supabaseAdmin as any;

function fail(message: string): never {
  throw new Error(message);
}

const nowIso = () => new Date().toISOString();

const EXCLUDED_APPLICATION_STATUSES = ["withdrawn", "declined", "rejected", "cancelled"];

async function assertHarmonious(userId: string): Promise<ReviewerScope> {
  const scope = await reviewerScope(userId);
  if (!scope.isAdmin) fail("Forbidden: Harmonious prepares and approves investor allocations.");
  return scope;
}

async function recordEvent(entry: {
  offeringId?: string | null;
  runId?: string | null;
  positionId?: string | null;
  statementId?: string | null;
  actorUserId: string | null;
  actorRole?: string;
  action: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  reason?: string | null;
  payload?: Record<string, unknown>;
}) {
  await db().from("allocation_events").insert({
    offering_id: entry.offeringId ?? null,
    run_id: entry.runId ?? null,
    position_id: entry.positionId ?? null,
    statement_id: entry.statementId ?? null,
    actor_user_id: entry.actorUserId,
    actor_role: entry.actorRole ?? "harmonious",
    action: entry.action,
    from_status: entry.fromStatus ?? null,
    to_status: entry.toStatus ?? null,
    reason: entry.reason ?? null,
    payload: entry.payload ?? {},
  });
}

/** Resolve a run server-side and authorize the caller against the fund it really belongs to. */
async function authorizeRun(userId: string, runId: string) {
  const scope = await reviewerScope(userId);
  const { data: run } = await db().from("allocation_runs").select("*").eq("id", runId).maybeSingle();
  if (!run) fail("Allocation run not found.");
  assertScopeAllows(scope, run.offering_id);
  return { scope, run };
}

async function authorizePosition(userId: string, positionId: string) {
  const scope = await reviewerScope(userId);
  const { data: position } = await db()
    .from("investor_positions")
    .select("*")
    .eq("id", positionId)
    .maybeSingle();
  if (!position) fail("Investor position not found.");
  assertScopeAllows(scope, position.offering_id);
  return { scope, position };
}

// ------------------------------------------------------------------ policy

export type StoredPolicy = {
  id: string | null;
  basis: AllocationBasis;
  methodology: string;
  timeWeighted: boolean;
  spvSimple: boolean;
  managerWorkflow: AllocationManagerWorkflow;
  toleranceCents: number;
  settings: Record<string, unknown>;
};

export const DEFAULT_ALLOCATION_POLICY: StoredPolicy = {
  id: null,
  basis: "ownership_percentage",
  methodology: "allocation-v1",
  timeWeighted: false,
  spvSimple: false,
  managerWorkflow: "acknowledge",
  toleranceCents: 0,
  settings: {},
};

export async function allocationPolicyFor(offeringId: string): Promise<StoredPolicy> {
  const { data } = await db()
    .from("allocation_policies")
    .select("*")
    .eq("offering_id", offeringId)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return DEFAULT_ALLOCATION_POLICY;
  return {
    id: data.id,
    basis: data.basis as AllocationBasis,
    methodology: data.methodology,
    timeWeighted: Boolean(data.time_weighted),
    spvSimple: Boolean(data.spv_simple),
    managerWorkflow: (data.manager_workflow ?? "acknowledge") as AllocationManagerWorkflow,
    toleranceCents: Number(data.tolerance_cents ?? 0),
    settings: data.settings ?? {},
  };
}

export async function saveAllocationPolicy(
  userId: string,
  input: {
    offeringId: string;
    basis: AllocationBasis;
    methodology?: string;
    methodologyNote?: string;
    timeWeighted?: boolean;
    spvSimple?: boolean;
    managerWorkflow?: AllocationManagerWorkflow;
    toleranceCents?: number;
    effectiveFrom: string;
  },
) {
  await assertHarmonious(userId);
  const { data: prior } = await db()
    .from("allocation_policies")
    .select("id, version")
    .eq("offering_id", input.offeringId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  // A policy that has priced a period is never edited; a new version supersedes it.
  if (prior) {
    await db()
      .from("allocation_policies")
      .update({ is_active: false, effective_to: input.effectiveFrom, updated_at: nowIso() })
      .eq("id", prior.id);
  }

  const { data, error } = await db()
    .from("allocation_policies")
    .insert({
      offering_id: input.offeringId,
      version: prior ? Number(prior.version) + 1 : 1,
      basis: input.basis,
      methodology: input.methodology ?? "allocation-v1",
      methodology_note: input.methodologyNote ?? null,
      time_weighted: input.timeWeighted ?? false,
      spv_simple: input.spvSimple ?? false,
      manager_workflow: input.managerWorkflow ?? "acknowledge",
      tolerance_cents: input.toleranceCents ?? 0,
      effective_from: input.effectiveFrom,
      is_active: true,
      documented_by: userId,
    })
    .select("*")
    .single();
  if (error) fail(error.message);

  await recordEvent({
    offeringId: input.offeringId,
    actorUserId: userId,
    action: "allocation_policy_saved",
    payload: { basis: input.basis, version: data.version },
  });
  return data;
}

// --------------------------------------------------------------- positions

/**
 * One position per investment profile per fund. A person investing personally,
 * through an LLC and through a trust holds three positions that are never
 * merged just because they share a beneficial owner.
 */
export async function ensurePositions(userId: string, offeringId: string) {
  const scope = await reviewerScope(userId);
  assertScopeAllows(scope, offeringId);
  if (!scope.isAdmin) return listPositions(userId, offeringId);

  const { data: applications } = await db()
    .from("investor_applications")
    .select("id, user_id, offering_id, status, commitment_cents, persona_id, created_at")
    .eq("offering_id", offeringId);
  const live = ((applications ?? []) as any[]).filter(
    (a) => !EXCLUDED_APPLICATION_STATUSES.includes(String(a.status)),
  );
  if (live.length === 0) return listPositions(userId, offeringId);

  const userIds = [...new Set(live.map((a) => a.user_id))];
  const personaIds = [...new Set(live.map((a) => a.persona_id).filter(Boolean))];

  const [{ data: profiles }, { data: personas }, { data: peopleProfiles }, { data: closings }, { data: existing }] =
    await Promise.all([
      db()
        .from("investment_profiles")
        .select("id, owner_user_id, person_id, profile_type, display_label, legal_name, legacy_persona_id")
        .in("owner_user_id", userIds),
      personaIds.length
        ? db().from("investor_personas").select("id, kind, label, legal_name, entity_name").in("id", personaIds)
        : Promise.resolve({ data: [] }),
      db().from("profiles").select("user_id, legal_name, email").in("user_id", userIds),
      db()
        .from("application_closings")
        .select("application_id, closing_date")
        .in("application_id", live.map((a) => a.id)),
      db().from("investor_positions").select("id, application_id").eq("offering_id", offeringId),
    ]);

  const profileByPersona = new Map(
    ((profiles ?? []) as any[])
      .filter((p) => p.legacy_persona_id)
      .map((p) => [String(p.legacy_persona_id), p]),
  );
  const firstProfileByUser = new Map<string, any>();
  for (const profile of (profiles ?? []) as any[]) {
    if (!firstProfileByUser.has(String(profile.owner_user_id))) {
      firstProfileByUser.set(String(profile.owner_user_id), profile);
    }
  }
  const personaById = new Map(((personas ?? []) as any[]).map((p) => [String(p.id), p]));
  const nameByUser = new Map(
    ((peopleProfiles ?? []) as any[]).map((p) => [
      String(p.user_id),
      String(p.legal_name ?? p.email ?? "Investor"),
    ]),
  );
  const closingByApp = new Map(
    ((closings ?? []) as any[]).map((c) => [String(c.application_id), c.closing_date]),
  );
  const existingByApp = new Set(
    ((existing ?? []) as any[]).map((p) => String(p.application_id)),
  );

  for (const application of live) {
    if (existingByApp.has(String(application.id))) continue;
    const persona = application.persona_id ? personaById.get(String(application.persona_id)) : null;
    const profile =
      (application.persona_id ? profileByPersona.get(String(application.persona_id)) : null) ??
      firstProfileByUser.get(String(application.user_id)) ??
      null;
    const displayName =
      profile?.legal_name ??
      profile?.display_label ??
      persona?.entity_name ??
      persona?.legal_name ??
      persona?.label ??
      nameByUser.get(String(application.user_id)) ??
      "Investor";

    const { data: created } = await db()
      .from("investor_positions")
      .insert({
        offering_id: offeringId,
        investor_user_id: application.user_id,
        person_id: profile?.person_id ?? null,
        investment_profile_id: profile?.id ?? null,
        application_id: application.id,
        display_name: displayName,
        capacity: profile?.profile_type ?? persona?.kind ?? "individual",
        status: closingByApp.get(String(application.id)) ? "active" : "pending",
        admitted_on: closingByApp.get(String(application.id)) ?? null,
        created_by: userId,
      })
      .select("id")
      .single();

    if (created) {
      await db().from("commitment_events").insert({
        position_id: created.id,
        offering_id: offeringId,
        event_type: "original_commitment",
        amount_cents: Number(application.commitment_cents ?? 0),
        effective_date: String(application.created_at ?? nowIso()).slice(0, 10),
        source: "subscription",
        source_ref: application.id,
        dedupe_key: `application:${application.id}:original`,
        recorded_by: userId,
      });
      await recordEvent({
        offeringId,
        positionId: created.id,
        actorUserId: userId,
        action: "position_created",
        payload: { applicationId: application.id },
      });
    }
  }

  await syncContributions(userId, offeringId);
  return listPositions(userId, offeringId);
}

/** Settled payments become contributions exactly once — the dedupe key sees to it. */
async function syncContributions(userId: string, offeringId: string) {
  const { data: positions } = await db()
    .from("investor_positions")
    .select("id, application_id")
    .eq("offering_id", offeringId);
  const rows = (positions ?? []) as any[];
  const applicationIds = rows.map((p) => p.application_id).filter(Boolean);
  if (applicationIds.length === 0) return;

  const { data: payments } = await db()
    .from("payments")
    .select("id, application_id, amount_cents, status, confirmed_at, created_at")
    .in("application_id", applicationIds);
  const positionByApp = new Map(rows.map((p) => [String(p.application_id), p.id]));

  for (const payment of (payments ?? []) as any[]) {
    const positionId = positionByApp.get(String(payment.application_id));
    if (!positionId) continue;
    const settled = String(payment.status) === "settled";
    await db()
      .from("commitment_events")
      .insert({
        position_id: positionId,
        offering_id: offeringId,
        event_type: settled ? "contribution" : "pending_contribution",
        amount_cents: Number(payment.amount_cents ?? 0),
        effective_date: String(payment.confirmed_at ?? payment.created_at ?? nowIso()).slice(0, 10),
        source: "payment",
        source_ref: payment.id,
        payment_id: payment.id,
        dedupe_key: `payment:${payment.id}:${settled ? "settled" : "pending"}`,
        recorded_by: userId,
      })
      // A contribution already recorded must never be allocated twice.
      .then((result: any) => result, () => null);
  }
}

export async function listPositions(userId: string, offeringId: string) {
  const scope = await reviewerScope(userId);
  assertScopeAllows(scope, offeringId);
  const { data } = await db()
    .from("investor_positions")
    .select("*")
    .eq("offering_id", offeringId)
    .order("display_name");
  return (data ?? []) as any[];
}

export async function recordCommitmentEvent(
  userId: string,
  input: {
    positionId: string;
    eventType: CommitmentEvent["eventType"];
    amountCents: number;
    effectiveDate: string;
    source: string;
    reason?: string;
    evidencePath?: string;
  },
) {
  await assertHarmonious(userId);
  const { position } = await authorizePosition(userId, input.positionId);

  const { data, error } = await db()
    .from("commitment_events")
    .insert({
      position_id: position.id,
      offering_id: position.offering_id,
      event_type: input.eventType,
      amount_cents: input.amountCents,
      effective_date: input.effectiveDate,
      source: input.source,
      reason: input.reason ?? null,
      evidence_path: input.evidencePath ?? null,
      recorded_by: userId,
    })
    .select("*")
    .single();
  if (error) fail(error.message);

  await recordEvent({
    offeringId: position.offering_id,
    positionId: position.id,
    actorUserId: userId,
    action: `commitment_${input.eventType}`,
    payload: { amountCents: input.amountCents, effectiveDate: input.effectiveDate },
  });
  return data;
}

async function commitmentEventsFor(positionIds: string[]) {
  if (positionIds.length === 0) return new Map<string, CommitmentEvent[]>();
  const { data } = await db()
    .from("commitment_events")
    .select("position_id, event_type, amount_cents, effective_date")
    .in("position_id", positionIds);
  const map = new Map<string, CommitmentEvent[]>();
  for (const row of (data ?? []) as any[]) {
    const key = String(row.position_id);
    map.set(key, [
      ...(map.get(key) ?? []),
      {
        eventType: row.event_type,
        amountCents: Number(row.amount_cents),
        effectiveDate: String(row.effective_date),
      },
    ]);
  }
  return map;
}

export async function commitmentLedger(userId: string, positionId: string, asOf?: string) {
  const { position } = await authorizePosition(userId, positionId);
  const { data: events } = await db()
    .from("commitment_events")
    .select("*")
    .eq("position_id", positionId)
    .order("effective_date");
  const history = ((events ?? []) as any[]).map((e) => ({
    eventType: e.event_type,
    amountCents: Number(e.amount_cents),
    effectiveDate: String(e.effective_date),
  }));
  return {
    position,
    events: (events ?? []) as any[],
    state: commitmentAsOf(history, asOf),
  };
}

// ---------------------------------------------------------------- fee terms

async function feeTermsFor(offeringId: string) {
  const { data } = await db()
    .from("management_fee_terms")
    .select("*")
    .eq("offering_id", offeringId)
    .order("version", { ascending: false });
  return (data ?? []) as any[];
}

function toFeeTerm(row: any): FeeTerm {
  return {
    basis: row.basis,
    rateBps: Number(row.rate_bps ?? 0),
    flatAmountCents: Number(row.flat_amount_cents ?? 0),
    frequency: row.frequency,
    startsOn: row.starts_on,
    endsOn: row.ends_on ?? null,
    stepDowns: Array.isArray(row.step_downs) ? row.step_downs : [],
    waiverBps: Number(row.waiver_bps ?? 0),
    offsetPct: Number(row.offset_pct ?? 0),
  };
}

export async function saveFeeTerm(
  userId: string,
  input: {
    offeringId: string;
    classId?: string | null;
    positionId?: string | null;
    basis: FeeTerm["basis"];
    rateBps?: number;
    flatAmountCents?: number;
    frequency: FeeTerm["frequency"];
    startsOn: string;
    endsOn?: string | null;
    stepDowns?: { from: string; rateBps: number }[];
    waiverBps?: number;
    offsetPct?: number;
    note?: string;
  },
) {
  await assertHarmonious(userId);
  const scope = await reviewerScope(userId);
  assertScopeAllows(scope, input.offeringId);

  const { data: prior } = await db()
    .from("management_fee_terms")
    .select("version")
    .eq("offering_id", input.offeringId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await db()
    .from("management_fee_terms")
    .insert({
      offering_id: input.offeringId,
      class_id: input.classId ?? null,
      position_id: input.positionId ?? null,
      version: prior ? Number(prior.version) + 1 : 1,
      basis: input.basis,
      rate_bps: input.rateBps ?? 0,
      flat_amount_cents: input.flatAmountCents ?? 0,
      frequency: input.frequency,
      starts_on: input.startsOn,
      ends_on: input.endsOn ?? null,
      step_downs: input.stepDowns ?? [],
      waiver_bps: input.waiverBps ?? 0,
      offset_pct: input.offsetPct ?? 0,
      note: input.note ?? null,
      created_by: userId,
    })
    .select("*")
    .single();
  if (error) fail(error.message);
  await recordEvent({
    offeringId: input.offeringId,
    actorUserId: userId,
    action: "fee_term_saved",
    payload: { basis: input.basis, rateBps: input.rateBps ?? 0 },
  });
  return data;
}

async function waterfallTermsFor(offeringId: string): Promise<WaterfallTerms | null> {
  const { data } = await db()
    .from("waterfall_terms")
    .select("*")
    .eq("offering_id", offeringId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    structure: data.structure,
    preferredReturnBps: Number(data.preferred_return_bps ?? 0),
    compounding: data.compounding,
    catchUpPct: Number(data.catch_up_pct ?? 0),
    carryPct: Number(data.carry_pct ?? 0),
    returnOfCapitalFirst: Boolean(data.return_of_capital_first),
    clawbackTracked: Boolean(data.clawback_tracked),
    tiers: Array.isArray(data.tiers) ? data.tiers : [],
  };
}

export async function saveWaterfallTerms(
  userId: string,
  input: {
    offeringId: string;
    structure: WaterfallTerms["structure"];
    preferredReturnBps?: number;
    compounding?: WaterfallTerms["compounding"];
    catchUpPct?: number;
    carryPct?: number;
    returnOfCapitalFirst?: boolean;
    clawbackTracked?: boolean;
    tiers?: { name: string; thresholdBps?: number; splitPct: number }[];
    effectiveFrom: string;
  },
) {
  await assertHarmonious(userId);
  const scope = await reviewerScope(userId);
  assertScopeAllows(scope, input.offeringId);
  const { data: prior } = await db()
    .from("waterfall_terms")
    .select("version")
    .eq("offering_id", input.offeringId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await db()
    .from("waterfall_terms")
    .insert({
      offering_id: input.offeringId,
      version: prior ? Number(prior.version) + 1 : 1,
      structure: input.structure,
      preferred_return_bps: input.preferredReturnBps ?? 0,
      compounding: input.compounding ?? "annual",
      catch_up_pct: input.catchUpPct ?? 0,
      carry_pct: input.carryPct ?? 0,
      return_of_capital_first: input.returnOfCapitalFirst ?? true,
      clawback_tracked: input.clawbackTracked ?? true,
      tiers: input.tiers ?? [],
      effective_from: input.effectiveFrom,
      documented_by: userId,
    })
    .select("*")
    .single();
  if (error) fail(error.message);
  return data;
}

// ------------------------------------------------------------- calculation

async function navForAllocation(scope: ReviewerScope, navId: string) {
  const { data: nav } = await db().from("nav_versions").select("*").eq("id", navId).maybeSingle();
  if (!nav) fail("NAV version not found.");
  const { data: book } = await db()
    .from("ledger_books")
    .select("id, offering_id")
    .eq("id", nav.book_id)
    .maybeSingle();
  const offeringId = nav.offering_id ?? book?.offering_id ?? null;
  if (!offeringId) fail("That NAV is not attached to a fund.");
  assertScopeAllows(scope, offeringId);
  if (nav.status !== "published") {
    fail("Allocations can only be produced from a published NAV.");
  }
  const handoff = (nav.capital_handoff ?? null) as CapitalHandoff | null;
  if (!handoff) fail("That NAV has no capital handoff to allocate.");
  return { nav, offeringId: String(offeringId), bookId: book?.id ?? nav.book_id, handoff };
}

/**
 * Produce (or refresh) the draft allocation run for one period. Every figure is
 * traced to the NAV handoff, the commitment ledger and the versioned policy in
 * force for the period.
 */
export async function calculateAllocations(
  userId: string,
  input: { navId: string; policyId?: string | null },
) {
  const scope = await assertHarmonious(userId);
  const { nav, offeringId, bookId, handoff } = await navForAllocation(scope, input.navId);
  const period = { start: handoff.periodStart, end: handoff.periodEnd };

  await ensurePositions(userId, offeringId);
  const policy = await allocationPolicyFor(offeringId);

  const { data: positionRows } = await db()
    .from("investor_positions")
    .select("*")
    .eq("offering_id", offeringId)
    .in("status", ["active", "pending", "withdrawn", "transferred"]);
  const positions = (positionRows ?? []) as any[];
  if (positions.length === 0) fail("This fund has no investor positions to allocate to.");

  const positionIds = positions.map((p) => String(p.id));
  const eventsByPosition = await commitmentEventsFor(positionIds);

  // Prior finalized capital accounts provide beginning capital — never today's numbers.
  const { data: priorAccounts } = await db()
    .from("capital_accounts")
    .select("position_id, period_end, ending_capital_cents, finalized_at")
    .in("position_id", positionIds)
    .not("finalized_at", "is", null);
  const priorByPosition = new Map<string, any[]>();
  for (const row of (priorAccounts ?? []) as any[]) {
    const key = String(row.position_id);
    priorByPosition.set(key, [...(priorByPosition.get(key) ?? []), row]);
  }

  const dayBefore = new Date(Date.parse(`${period.start}T00:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);

  const inputs: PositionInput[] = positions.map((position) => {
    const events = eventsByPosition.get(String(position.id)) ?? [];
    const toEnd = commitmentAsOf(events, period.end);
    const toStart = commitmentAsOf(events, dayBefore);
    const prior = asOfRecord(priorByPosition.get(String(position.id)) ?? [], dayBefore);
    const contributionsInPeriod = toEnd.contributedCents - toStart.contributedCents;

    return {
      positionId: String(position.id),
      classId: position.class_id ?? null,
      isGp: Boolean(position.is_gp),
      admittedOn: position.admitted_on ?? null,
      withdrawnOn: position.withdrawn_on ?? null,
      beginningCapitalCents: prior ? Number(prior.ending_capital_cents) : 0,
      commitmentCents: toEnd.currentCommitmentCents,
      contributedToDateCents: toEnd.contributedCents,
      contributionsCents: contributionsInPeriod,
      distributionsCents: 0,
      units: position.units ?? null,
      ownershipPct: null,
      cashFlows: events
        .filter((e) => e.effectiveDate >= period.start && e.effectiveDate <= period.end)
        .map((e) => ({
          date: e.effectiveDate,
          amountCents:
            e.eventType === "distribution" || e.eventType === "return_of_capital"
              ? -e.amountCents
              : e.eventType === "contribution" || e.eventType === "contribution_settled"
                ? e.amountCents
                : 0,
        })),
    };
  });

  // Distributions are a fund figure shared out on the same basis as everything else.
  const weights = allocationWeights(inputs, policy.basis, period, policy.timeWeighted);
  const distributionShare = distributeAmount(handoff.distributionsCents, weights);
  for (const position of inputs) {
    position.distributionsCents = distributionShare.get(position.positionId) ?? 0;
  }

  // ---- management fees from versioned terms, traced per investor
  const termRows = await feeTermsFor(offeringId);
  const perPositionFees: Record<string, number> = {};
  const feeRecords: any[] = [];
  if (termRows.length > 0) {
    for (const position of inputs) {
      const row =
        termRows.find((t) => t.position_id === position.positionId) ??
        termRows.find((t) => t.class_id && t.class_id === position.classId) ??
        termRows.find((t) => !t.position_id && !t.class_id) ??
        null;
      if (!row) {
        perPositionFees[position.positionId] = 0;
        continue;
      }
      const term = toFeeTerm(row);
      const basisAmount =
        term.basis === "committed_capital"
          ? position.commitmentCents
          : term.basis === "invested_capital"
            ? position.contributedToDateCents
            : term.basis === "net_asset_value"
              ? position.beginningCapitalCents
              : term.basis === "cost_basis"
                ? position.contributedToDateCents
                : 0;
      const fee = managementFee(term, basisAmount, period);
      perPositionFees[position.positionId] = fee.netFeeCents;
      feeRecords.push({
        offering_id: offeringId,
        position_id: position.positionId,
        term_id: row.id,
        period_start: period.start,
        period_end: period.end,
        basis: fee.basis,
        basis_amount_cents: fee.basisAmountCents,
        rate_bps: fee.rateBps,
        gross_fee_cents: fee.grossFeeCents,
        waiver_cents: fee.waiverCents,
        offset_cents: fee.offsetCents,
        net_fee_cents: fee.netFeeCents,
        ledger_fee_cents: handoff.managementFeesCents,
        inputs: { frequency: term.frequency, startsOn: term.startsOn, stepDowns: term.stepDowns },
      });
    }
  }

  // ---- carried interest: consumed from approved waterfall output only
  const waterfall = await waterfallTermsFor(offeringId);
  const { data: carryRows } = await db()
    .from("carry_allocations")
    .select("*")
    .eq("offering_id", offeringId)
    .is("run_id", null);
  const carryForPeriod = ((carryRows ?? []) as any[]).filter(
    (c) => String(c.inputs?.periodEnd ?? "") === period.end,
  );
  const carryOutputs = carryForPeriod.map((c) => ({
    positionId: c.position_id ?? null,
    amountCents: Number(c.amount_cents ?? 0),
    tier: c.tier ?? null,
  }));
  const carryProblem = carryConsumptionError(waterfall, carryOutputs);
  if (carryProblem) fail(carryProblem);
  const perPositionCarry: Record<string, number> = {};
  for (const output of carryOutputs) {
    if (!output.positionId) continue;
    perPositionCarry[output.positionId] =
      (perPositionCarry[output.positionId] ?? 0) + output.amountCents;
  }
  const carryTotal = carryOutputs.reduce((sum, c) => sum + c.amountCents, 0);

  // ---- approved manual adjustments effective in this period
  const { data: adjustmentRows } = await db()
    .from("capital_account_adjustments")
    .select("*")
    .eq("offering_id", offeringId)
    .eq("status", "approved")
    .gte("effective_date", period.start)
    .lte("effective_date", period.end);
  const perPositionAdjustments: Record<string, number> = {};
  for (const adjustment of (adjustmentRows ?? []) as any[]) {
    perPositionAdjustments[String(adjustment.position_id)] =
      (perPositionAdjustments[String(adjustment.position_id)] ?? 0) +
      Number(adjustment.amount_cents ?? 0);
  }

  const fundTotals = fundTotalsFromHandoff(handoff, carryTotal);
  const result = allocateRun({
    positions: inputs,
    fundTotals,
    basis: policy.basis,
    period,
    timeWeighted: policy.timeWeighted,
    ...(termRows.length > 0 ? { perPositionFees } : {}),
    ...(carryTotal !== 0 ? { perPositionCarry } : {}),
    perPositionAdjustments,
  });

  const reconciliation = reconcileAllocations(
    fundTotals,
    result.allocatedTotals,
    policy.toleranceCents,
  );
  const exceptions = finalizationBlockers(reconciliation);

  // ---- persist as the period's draft run
  const { data: existing } = await db()
    .from("allocation_runs")
    .select("id, status, version")
    .eq("offering_id", offeringId)
    .eq("period_end", period.end)
    .order("version", { ascending: false });
  const open = ((existing ?? []) as any[]).find((r) =>
    ["draft", "calculating"].includes(String(r.status)),
  );
  const latestVersion = ((existing ?? []) as any[])[0]?.version ?? 0;

  if (open) {
    await db().from("allocation_lines").delete().eq("run_id", open.id);
    await db().from("fee_calculations").delete().eq("run_id", open.id);
  }

  const payload = {
    offering_id: offeringId,
    book_id: bookId,
    period_id: nav.period_id ?? null,
    nav_version_id: nav.id,
    policy_id: policy.id,
    policy_snapshot: { ...policy },
    period_start: period.start,
    period_end: period.end,
    source_cutoff_at: nowIso(),
    status: "draft",
    fund_totals: fundTotals,
    allocated_totals: result.allocatedTotals,
    reconciliation,
    difference_cents: reconciliation.differenceCents,
    inputs_snapshot: {
      handoff,
      positions: inputs,
      weights: result.weights,
      feeTermCount: termRows.length,
      carryOutputs,
      adjustments: perPositionAdjustments,
    },
    exceptions,
    prepared_by: userId,
    prepared_at: nowIso(),
    updated_at: nowIso(),
  };

  let run: any;
  if (open) {
    const { data, error } = await db()
      .from("allocation_runs")
      .update(payload)
      .eq("id", open.id)
      .select("*")
      .single();
    if (error) fail(error.message);
    run = data;
  } else {
    const { data, error } = await db()
      .from("allocation_runs")
      .insert({ ...payload, version: Number(latestVersion) + 1 })
      .select("*")
      .single();
    if (error) fail(error.message);
    run = data;
  }

  const positionById = new Map(positions.map((p) => [String(p.id), p]));
  const { error: linesError } = await db()
    .from("allocation_lines")
    .insert(
      result.lines.map((line) => ({
        run_id: run.id,
        offering_id: offeringId,
        position_id: line.positionId,
        class_id: positionById.get(line.positionId)?.class_id ?? null,
        basis: line.basis,
        basis_amount_cents: line.basisAmountCents,
        weight: line.weight,
        ownership_pct: line.ownershipPct,
        days_in_period: line.daysInPeriod,
        beginning_capital_cents: line.beginningCapitalCents,
        contributions_cents: line.contributionsCents,
        allocated_income_cents: line.allocatedIncomeCents,
        realized_gain_cents: line.realizedGainCents,
        unrealized_gain_cents: line.unrealizedGainCents,
        allocated_loss_cents: line.allocatedLossCents,
        fund_expenses_cents: line.fundExpensesCents,
        management_fees_cents: line.managementFeesCents,
        carried_interest_cents: line.carriedInterestCents,
        distributions_cents: line.distributionsCents,
        other_adjustments_cents: line.otherAdjustmentsCents,
        ending_capital_cents: line.endingCapitalCents,
        commitment_cents: line.commitmentCents,
        contributed_to_date_cents: line.contributedToDateCents,
        unfunded_commitment_cents: line.unfundedCommitmentCents,
        units: line.units,
        inputs: { weight: line.weight, daysInPeriod: line.daysInPeriod },
      })),
    );
  if (linesError) fail(linesError.message);

  if (feeRecords.length > 0) {
    await db()
      .from("fee_calculations")
      .insert(
        feeRecords.map((f) => ({
          ...f,
          run_id: run.id,
          reconciled:
            Object.values(perPositionFees).reduce((s, v) => s + v, 0) ===
            handoff.managementFeesCents,
        })),
      );
  }
  if (carryForPeriod.length > 0) {
    await db()
      .from("carry_allocations")
      .update({ run_id: run.id })
      .in("id", carryForPeriod.map((c) => c.id));
  }

  await recordEvent({
    offeringId,
    runId: run.id,
    actorUserId: userId,
    action: "allocations_calculated",
    toStatus: "draft",
    payload: { differenceCents: reconciliation.differenceCents, positions: result.lines.length },
  });

  return { run, lines: result.lines, reconciliation, exceptions };
}

// ------------------------------------------------------------- run workflow

async function moveRun(
  userId: string,
  runId: string,
  to: RunStatus,
  patch: Record<string, unknown>,
  reason?: string,
) {
  const { run } = await authorizeRun(userId, runId);
  const from = run.status as RunStatus;
  if (!canTransitionRun(from, to)) fail(`A ${from} allocation run cannot move to ${to}.`);
  const { data, error } = await db()
    .from("allocation_runs")
    .update({ status: to, updated_at: nowIso(), ...patch })
    .eq("id", runId)
    .eq("status", from)
    .select("*")
    .single();
  if (error) fail(error.message);
  await recordEvent({
    offeringId: run.offering_id,
    runId,
    actorUserId: userId,
    action: `allocation_${to}`,
    fromStatus: from,
    toStatus: to,
    reason: reason ?? null,
  });
  return data;
}

export async function submitAllocationRun(userId: string, runId: string) {
  await assertHarmonious(userId);
  return moveRun(userId, runId, "review", {});
}

export async function decideAllocationRun(
  userId: string,
  runId: string,
  action: "review" | "manager_review" | "approve" | "return" | "finalize" | "revise",
  reason?: string,
) {
  await assertHarmonious(userId);
  const { run } = await authorizeRun(userId, runId);
  const people = {
    preparedBy: run.prepared_by,
    reviewedBy: run.reviewed_by,
    approvedBy: run.approved_by,
    finalizedBy: run.finalized_by,
  };

  if (action === "review") {
    const problem = allocationSegregationError(people, userId, "review");
    if (problem) fail(problem);
    return moveRun(userId, runId, "manager_review", {
      reviewed_by: userId,
      reviewed_at: nowIso(),
    });
  }
  if (action === "manager_review") {
    return moveRun(userId, runId, "manager_review", {});
  }
  if (action === "approve") {
    const problem = allocationSegregationError(people, userId, "approve");
    if (problem) fail(problem);
    return moveRun(userId, runId, "approved", { approved_by: userId, approved_at: nowIso() });
  }
  if (action === "return") {
    return moveRun(userId, runId, run.status === "manager_review" ? "review" : "draft", {}, reason);
  }
  if (action === "finalize") return finalizeAllocationRun(userId, runId);
  return reviseAllocationRun(userId, runId, reason ?? "");
}

/** Managers acknowledge or challenge; they never change a figure. */
export async function managerRespondToAllocations(
  userId: string,
  runId: string,
  response: "acknowledge" | "challenge" | "approve",
  note?: string,
) {
  const { run } = await authorizeRun(userId, runId);
  const policy = (run.policy_snapshot ?? {}) as { managerWorkflow?: AllocationManagerWorkflow };
  const workflow = policy.managerWorkflow ?? "acknowledge";
  if (!managerMayAllocation(response, workflow)) {
    fail("Your fund's allocation workflow does not allow that response.");
  }
  if (response === "challenge" && !(note ?? "").trim()) {
    fail("Tell us what looks wrong so it can be looked into.");
  }

  const patch: Record<string, unknown> = {
    manager_response: response,
    manager_note: note ?? null,
    manager_responded_by: userId,
    manager_responded_at: nowIso(),
    updated_at: nowIso(),
  };
  if (response === "challenge" && run.status === "manager_review") patch['status'] = "review";

  const { data, error } = await db()
    .from("allocation_runs")
    .update(patch)
    .eq("id", runId)
    .select("*")
    .single();
  if (error) fail(error.message);
  await recordEvent({
    offeringId: run.offering_id,
    runId,
    actorUserId: userId,
    actorRole: "fund_manager",
    action: `manager_${response}`,
    reason: note ?? null,
  });
  return data;
}

/** Finalizing writes the capital accounts. Nothing finalizes while it does not reconcile. */
export async function finalizeAllocationRun(userId: string, runId: string) {
  await assertHarmonious(userId);
  const { run } = await authorizeRun(userId, runId);
  if (run.status !== "approved") fail("Only an approved allocation run can be finalized.");

  const problem = allocationSegregationError(
    {
      preparedBy: run.prepared_by,
      reviewedBy: run.reviewed_by,
      approvedBy: run.approved_by,
    },
    userId,
    "finalize",
  );
  if (problem) fail(problem);

  const reconciliation = run.reconciliation ?? {};
  const blockers = finalizationBlockers(reconciliation as any);
  if (blockers.length > 0) {
    fail(`Allocations do not reconcile to the fund: ${blockers.join(" ")}`);
  }

  const { data: lines } = await db().from("allocation_lines").select("*").eq("run_id", runId);
  const { data: positions } = await db()
    .from("investor_positions")
    .select("id, investor_user_id, investment_profile_id, application_id, class_id")
    .eq("offering_id", run.offering_id);
  const positionById = new Map(((positions ?? []) as any[]).map((p) => [String(p.id), p]));

  for (const line of (lines ?? []) as any[]) {
    const position = positionById.get(String(line.position_id));
    const { data: prior } = await db()
      .from("capital_accounts")
      .select("id, version")
      .eq("position_id", line.position_id)
      .eq("period_end", run.period_end)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    await db().from("capital_accounts").insert({
      book_id: run.book_id,
      offering_id: run.offering_id,
      period_id: run.period_id,
      nav_version_id: run.nav_version_id,
      allocation_run_id: runId,
      position_id: line.position_id,
      class_id: line.class_id ?? position?.class_id ?? null,
      investor_user_id: position?.investor_user_id ?? null,
      investment_profile_id: position?.investment_profile_id ?? null,
      application_id: position?.application_id ?? null,
      period_start: run.period_start,
      period_end: run.period_end,
      beginning_capital_cents: line.beginning_capital_cents,
      contributions_cents: line.contributions_cents,
      allocated_income_cents: line.allocated_income_cents,
      allocated_loss_cents: line.allocated_loss_cents,
      realized_gain_cents: line.realized_gain_cents,
      unrealized_gain_cents: line.unrealized_gain_cents,
      management_fees_cents: line.management_fees_cents,
      fund_expenses_cents: line.fund_expenses_cents,
      carried_interest_cents: line.carried_interest_cents,
      distributions_cents: line.distributions_cents,
      other_adjustments_cents: line.other_adjustments_cents,
      ending_capital_cents: line.ending_capital_cents,
      commitment_cents: line.commitment_cents,
      contributed_to_date_cents: line.contributed_to_date_cents,
      distributions_to_date_cents: line.distributions_cents,
      unfunded_commitment_cents: line.unfunded_commitment_cents,
      ownership_pct: line.ownership_pct,
      units: line.units,
      allocation_method: line.basis,
      allocation_inputs: line.inputs ?? {},
      status: "approved",
      version: prior ? Number(prior.version) + 1 : 1,
      supersedes_id: prior?.id ?? null,
      generated_by: run.prepared_by,
      reviewed_by: run.reviewed_by,
      approved_by: run.approved_by,
      finalized_by: userId,
      finalized_at: nowIso(),
    });
  }

  // Applied adjustments are closed out so the same correction cannot repeat.
  await db()
    .from("capital_account_adjustments")
    .update({ status: "applied", run_id: runId, updated_at: nowIso() })
    .eq("offering_id", run.offering_id)
    .eq("status", "approved")
    .gte("effective_date", run.period_start)
    .lte("effective_date", run.period_end);

  const finalized = await moveRun(userId, runId, "finalized", {
    finalized_by: userId,
    finalized_at: nowIso(),
  });

  if (run.supersedes_id) {
    await db()
      .from("allocation_runs")
      .update({ status: "superseded", updated_at: nowIso() })
      .eq("id", run.supersedes_id)
      .eq("status", "finalized");
  }
  return finalized;
}

export async function reviseAllocationRun(userId: string, runId: string, reason: string) {
  await assertHarmonious(userId);
  const { run } = await authorizeRun(userId, runId);
  if (run.status !== "finalized") fail("Only a finalized run is revised; earlier runs are edited.");
  if (reason.trim().length < 20) fail("Explain the revision in at least 20 characters.");

  const { data, error } = await db()
    .from("allocation_runs")
    .insert({
      offering_id: run.offering_id,
      book_id: run.book_id,
      period_id: run.period_id,
      nav_version_id: run.nav_version_id,
      policy_id: run.policy_id,
      policy_snapshot: run.policy_snapshot,
      period_start: run.period_start,
      period_end: run.period_end,
      status: "draft",
      version: Number(run.version) + 1,
      supersedes_id: run.id,
      prepared_by: userId,
    })
    .select("*")
    .single();
  if (error) fail(error.message);

  await recordEvent({
    offeringId: run.offering_id,
    runId: data.id,
    actorUserId: userId,
    action: "allocation_revision_opened",
    reason,
    payload: { supersedes: run.id },
  });
  return data;
}

// -------------------------------------------------------------- adjustments

export async function requestCapitalAdjustment(
  userId: string,
  input: {
    positionId: string;
    classification: string;
    amountCents: number;
    effectiveDate: string;
    reason: string;
    evidencePath: string;
  },
) {
  await assertHarmonious(userId);
  const { position } = await authorizePosition(userId, input.positionId);
  const problem = adjustmentError(input);
  if (problem) fail(problem);

  const { data, error } = await db()
    .from("capital_account_adjustments")
    .insert({
      offering_id: position.offering_id,
      position_id: position.id,
      classification: input.classification,
      amount_cents: input.amountCents,
      effective_date: input.effectiveDate,
      reason: input.reason,
      evidence_path: input.evidencePath,
      status: "pending",
      requested_by: userId,
    })
    .select("*")
    .single();
  if (error) fail(error.message);
  await recordEvent({
    offeringId: position.offering_id,
    positionId: position.id,
    actorUserId: userId,
    action: "adjustment_requested",
    payload: { amountCents: input.amountCents, classification: input.classification },
  });
  return data;
}

export async function decideCapitalAdjustment(
  userId: string,
  adjustmentId: string,
  decision: "approve" | "reject",
  note?: string,
) {
  await assertHarmonious(userId);
  const scope = await reviewerScope(userId);
  const { data: adjustment } = await db()
    .from("capital_account_adjustments")
    .select("*")
    .eq("id", adjustmentId)
    .maybeSingle();
  if (!adjustment) fail("Adjustment not found.");
  assertScopeAllows(scope, adjustment.offering_id);

  const problem = adjustmentApprovalError(adjustment, userId);
  if (problem) fail(problem);

  const { data, error } = await db()
    .from("capital_account_adjustments")
    .update({
      status: decision === "approve" ? "approved" : "rejected",
      approved_by: userId,
      approved_at: nowIso(),
      decision_note: note ?? null,
      updated_at: nowIso(),
    })
    .eq("id", adjustmentId)
    .eq("status", "pending")
    .select("*")
    .single();
  if (error) fail(error.message);
  await recordEvent({
    offeringId: adjustment.offering_id,
    positionId: adjustment.position_id,
    actorUserId: userId,
    action: `adjustment_${decision}d`,
    reason: note ?? null,
  });
  return data;
}

// ---------------------------------------------------------------- transfers

export async function recordTransfer(
  userId: string,
  input: {
    fromPositionId: string;
    toPositionId: string;
    effectiveDate: string;
    capitalCents: number;
    commitmentCents: number;
    units?: number | null;
    taxBasisReference?: string | null;
    authorizationReference: string;
    authorizationDocumentPath?: string | null;
  },
) {
  await assertHarmonious(userId);
  const problem = transferError(input);
  if (problem) fail(problem);

  const { position: from } = await authorizePosition(userId, input.fromPositionId);
  const { position: to } = await authorizePosition(userId, input.toPositionId);
  if (from.offering_id !== to.offering_id) fail("A transfer stays inside one fund.");

  const { data, error } = await db()
    .from("position_transfers")
    .insert({
      offering_id: from.offering_id,
      from_position_id: from.id,
      to_position_id: to.id,
      effective_date: input.effectiveDate,
      capital_cents: input.capitalCents,
      commitment_cents: input.commitmentCents,
      units: input.units ?? null,
      tax_basis_reference: input.taxBasisReference ?? null,
      authorization_reference: input.authorizationReference,
      authorization_document_path: input.authorizationDocumentPath ?? null,
      recorded_by: userId,
    })
    .select("*")
    .single();
  if (error) fail(error.message);

  // History stays with the transferor; only future economics move.
  await db().from("commitment_events").insert([
    {
      position_id: from.id,
      offering_id: from.offering_id,
      event_type: "transfer_out",
      amount_cents: input.commitmentCents,
      effective_date: input.effectiveDate,
      source: "transfer",
      source_ref: data.id,
      reason: input.authorizationReference,
      recorded_by: userId,
    },
    {
      position_id: to.id,
      offering_id: to.offering_id,
      event_type: "transfer_in",
      amount_cents: input.commitmentCents,
      effective_date: input.effectiveDate,
      source: "transfer",
      source_ref: data.id,
      reason: input.authorizationReference,
      recorded_by: userId,
    },
  ]);

  await recordEvent({
    offeringId: from.offering_id,
    positionId: from.id,
    actorUserId: userId,
    action: "transfer_recorded",
    payload: { to: to.id, capitalCents: input.capitalCents },
  });
  return data;
}

// --------------------------------------------------------------- statements

export async function generateStatements(userId: string, runId: string) {
  await assertHarmonious(userId);
  const { run } = await authorizeRun(userId, runId);
  if (run.status !== "finalized") {
    fail("Statements come from finalized capital accounts only.");
  }

  const [{ data: accounts }, { data: offering }, { data: positions }] = await Promise.all([
    db().from("capital_accounts").select("*").eq("allocation_run_id", runId),
    db().from("offerings").select("name, legal_entity_name").eq("id", run.offering_id).maybeSingle(),
    db().from("investor_positions").select("*").eq("offering_id", run.offering_id),
  ]);
  const positionById = new Map(((positions ?? []) as any[]).map((p) => [String(p.id), p]));

  const created: any[] = [];
  for (const account of (accounts ?? []) as any[]) {
    const position = positionById.get(String(account.position_id));
    if (!position) continue;

    const { data: prior } = await db()
      .from("investor_statements")
      .select("id, version")
      .eq("position_id", account.position_id)
      .eq("period_end", run.period_end)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const snapshot = statementSnapshot(account, {
      fundName: offering?.name ?? "Fund",
      legalEntityName: offering?.legal_entity_name ?? null,
      investorName: position.display_name,
      profileLabel: position.capacity ?? null,
    });
    const provenance = {
      navVersionId: run.nav_version_id,
      allocationRunId: run.id,
      allocationRunVersion: run.version,
      capitalAccountId: account.id,
      capitalAccountVersion: account.version,
      sourceCutoffAt: run.source_cutoff_at,
      methodology: (run.policy_snapshot ?? {}).methodology ?? "allocation-v1",
      basis: account.allocation_method,
      approvers: {
        preparedBy: run.prepared_by,
        reviewedBy: run.reviewed_by,
        approvedBy: run.approved_by,
        finalizedBy: run.finalized_by,
      },
    };
    const missing = missingStatementProvenance(provenance);
    if (missing.length > 0) fail(`Statement provenance incomplete: ${missing.join(", ")}.`);

    const { data, error } = await db()
      .from("investor_statements")
      .insert({
        offering_id: run.offering_id,
        position_id: account.position_id,
        run_id: run.id,
        capital_account_id: account.id,
        investor_user_id: position.investor_user_id,
        investment_profile_id: position.investment_profile_id,
        period_start: run.period_start,
        period_end: run.period_end,
        status: "draft",
        version: prior ? Number(prior.version) + 1 : 1,
        supersedes_id: prior?.id ?? null,
        snapshot,
        provenance,
        prepared_by: userId,
      })
      .select("*")
      .single();
    if (error) fail(error.message);
    created.push(data);
  }

  await recordEvent({
    offeringId: run.offering_id,
    runId,
    actorUserId: userId,
    action: "statements_generated",
    payload: { count: created.length },
  });
  return created;
}

async function authorizeStatement(userId: string, statementId: string) {
  const scope = await reviewerScope(userId);
  const { data: statement } = await db()
    .from("investor_statements")
    .select("*")
    .eq("id", statementId)
    .maybeSingle();
  if (!statement) fail("Statement not found.");
  assertScopeAllows(scope, statement.offering_id);
  return { scope, statement };
}

export async function decideStatement(
  userId: string,
  statementId: string,
  action: "review" | "approve" | "publish" | "return",
  reason?: string,
) {
  await assertHarmonious(userId);
  const { statement } = await authorizeStatement(userId, statementId);
  const from = statement.status as StatementStatus;

  const to: StatementStatus =
    action === "review"
      ? "review"
      : action === "approve"
        ? "approved"
        : action === "publish"
          ? "published"
          : from === "approved"
            ? "review"
            : "draft";
  if (!canTransitionStatement(from, to)) fail(`A ${from} statement cannot move to ${to}.`);

  if (action === "approve" && statement.prepared_by === userId) {
    fail("A statement must be approved by someone other than the person who prepared it.");
  }
  if (action === "publish" && !statement.approved_by) {
    fail("A statement must be approved before it is published.");
  }

  const patch: Record<string, unknown> = { status: to, updated_at: nowIso() };
  if (to === "review") Object.assign(patch, { reviewed_by: userId, reviewed_at: nowIso() });
  if (to === "approved") Object.assign(patch, { approved_by: userId, approved_at: nowIso() });
  if (to === "published") Object.assign(patch, { published_by: userId, published_at: nowIso() });

  const { data, error } = await db()
    .from("investor_statements")
    .update(patch)
    .eq("id", statementId)
    .eq("status", from)
    .select("*")
    .single();
  if (error) fail(error.message);

  if (to === "published") {
    // A revision replaces its predecessor without altering it.
    if (statement.supersedes_id) {
      await db()
        .from("investor_statements")
        .update({ status: "superseded", updated_at: nowIso() })
        .eq("id", statement.supersedes_id)
        .eq("status", "published");
    }
    if (statement.book_id || statement.offering_id) {
      const { data: book } = await db()
        .from("ledger_books")
        .select("id")
        .eq("offering_id", statement.offering_id)
        .maybeSingle();
      if (book) {
        await registerReport(userId, {
          bookId: book.id,
          reportType: "capital_account_statement",
          periodStart: statement.period_start,
          periodEnd: statement.period_end,
          subjectUserId: statement.investor_user_id,
          subjectProfileId: statement.investment_profile_id,
          navVersionId: statement.provenance?.navVersionId ?? null,
          methodologyVersion: statement.provenance?.methodology ?? "allocation-v1",
          accountingSnapshot: statement.provenance ?? {},
          payload: statement.snapshot ?? {},
        }).catch(() => null);
      }
    }
  }

  await recordEvent({
    offeringId: statement.offering_id,
    statementId,
    positionId: statement.position_id,
    actorUserId: userId,
    action: `statement_${to}`,
    fromStatus: from,
    toStatus: to,
    reason: reason ?? null,
  });
  return data;
}

/** A published statement is never rewritten; a correction is a new version. */
export async function reviseStatement(userId: string, statementId: string, reason: string) {
  await assertHarmonious(userId);
  const { statement } = await authorizeStatement(userId, statementId);
  if (statement.status !== "published") fail("Only a published statement is revised.");
  if (reason.trim().length < 20) fail("Explain the correction in at least 20 characters.");

  const { data, error } = await db()
    .from("investor_statements")
    .insert({
      offering_id: statement.offering_id,
      position_id: statement.position_id,
      run_id: statement.run_id,
      capital_account_id: statement.capital_account_id,
      investor_user_id: statement.investor_user_id,
      investment_profile_id: statement.investment_profile_id,
      period_start: statement.period_start,
      period_end: statement.period_end,
      status: "draft",
      version: Number(statement.version) + 1,
      supersedes_id: statement.id,
      snapshot: statement.snapshot,
      provenance: { ...(statement.provenance ?? {}), revisionReason: reason },
      prepared_by: userId,
    })
    .select("*")
    .single();
  if (error) fail(error.message);
  await recordEvent({
    offeringId: statement.offering_id,
    statementId: data.id,
    actorUserId: userId,
    action: "statement_revision_opened",
    reason,
  });
  return data;
}

// -------------------------------------------------------------------- reads

export async function allocationQueue(userId: string, offeringId?: string) {
  const scope = await reviewerScope(userId);
  if (offeringId) assertScopeAllows(scope, offeringId);

  let fundQuery = db().from("offerings").select("id, name, legal_entity_name, reg_type");
  if (!scope.isAdmin) fundQuery = fundQuery.in("id", scope.offeringIds);
  if (offeringId) fundQuery = fundQuery.eq("id", offeringId);
  const { data: funds } = await fundQuery.order("name");

  let runQuery = db().from("allocation_runs").select("*");
  if (!scope.isAdmin) runQuery = runQuery.in("offering_id", scope.offeringIds);
  if (offeringId) runQuery = runQuery.eq("offering_id", offeringId);
  const { data: runs } = await runQuery.order("period_end", { ascending: false }).limit(50);

  let statementQuery = db()
    .from("investor_statements")
    .select("id, offering_id, position_id, period_end, status, version");
  if (!scope.isAdmin) statementQuery = statementQuery.in("offering_id", scope.offeringIds);
  if (offeringId) statementQuery = statementQuery.eq("offering_id", offeringId);
  const { data: statements } = await statementQuery
    .order("period_end", { ascending: false })
    .limit(500);

  let adjustmentQuery = db().from("capital_account_adjustments").select("*").eq("status", "pending");
  if (!scope.isAdmin) adjustmentQuery = adjustmentQuery.in("offering_id", scope.offeringIds);
  if (offeringId) adjustmentQuery = adjustmentQuery.eq("offering_id", offeringId);
  const { data: adjustments } = await adjustmentQuery.limit(100);

  return {
    isStaff: scope.isAdmin,
    funds: (funds ?? []) as any[],
    runs: (runs ?? []) as any[],
    statements: (statements ?? []) as any[],
    adjustments: (adjustments ?? []) as any[],
  };
}

export async function allocationDetail(userId: string, runId: string) {
  const { run } = await authorizeRun(userId, runId);
  const [{ data: lines }, { data: positions }, { data: fees }, { data: carry }, { data: statements }] =
    await Promise.all([
      db().from("allocation_lines").select("*").eq("run_id", runId),
      db().from("investor_positions").select("*").eq("offering_id", run.offering_id),
      db().from("fee_calculations").select("*").eq("run_id", runId),
      db().from("carry_allocations").select("*").eq("run_id", runId),
      db().from("investor_statements").select("*").eq("run_id", runId),
    ]);
  const positionById = new Map(((positions ?? []) as any[]).map((p) => [String(p.id), p]));
  return {
    run,
    lines: ((lines ?? []) as any[]).map((l) => ({
      ...l,
      position: positionById.get(String(l.position_id)) ?? null,
    })),
    fees: (fees ?? []) as any[],
    carry: (carry ?? []) as any[],
    statements: (statements ?? []) as any[],
  };
}

/** Fund-manager view: fund NAV against investor capital, and what is outstanding. */
export async function investorCapitalOverview(userId: string, offeringId: string) {
  const scope = await reviewerScope(userId);
  assertScopeAllows(scope, offeringId);

  const [{ data: runs }, { data: positions }, { data: statements }] = await Promise.all([
    db()
      .from("allocation_runs")
      .select("*")
      .eq("offering_id", offeringId)
      .order("period_end", { ascending: false })
      .limit(12),
    db().from("investor_positions").select("*").eq("offering_id", offeringId),
    db()
      .from("investor_statements")
      .select("id, position_id, period_end, status, version")
      .eq("offering_id", offeringId),
  ]);

  const latest = ((runs ?? []) as any[]).find((r) => r.status === "finalized") ?? (runs ?? [])[0] ?? null;
  const { data: accounts } = latest
    ? await db().from("capital_accounts").select("*").eq("allocation_run_id", latest.id)
    : { data: [] };

  const positionIds = ((positions ?? []) as any[]).map((p) => String(p.id));
  const eventsByPosition = await commitmentEventsFor(positionIds);
  const commitments = ((positions ?? []) as any[]).map((position) => ({
    position,
    state: commitmentAsOf(eventsByPosition.get(String(position.id)) ?? []),
  }));

  const investorCapitalCents = ((accounts ?? []) as any[]).reduce(
    (sum, a) => sum + Number(a.ending_capital_cents ?? 0),
    0,
  );
  const fundNavCents = Number((latest?.fund_totals ?? {}).endingNetAssetsCents ?? 0);

  return {
    runs: (runs ?? []) as any[],
    latestRun: latest,
    accounts: (accounts ?? []) as any[],
    statements: (statements ?? []) as any[],
    commitments,
    totals: {
      fundNavCents,
      investorCapitalCents,
      differenceCents: investorCapitalCents - fundNavCents,
      commitmentCents: commitments.reduce((s, c) => s + c.state.currentCommitmentCents, 0),
      contributedCents: commitments.reduce((s, c) => s + c.state.contributedCents, 0),
      unfundedCents: commitments.reduce((s, c) => s + c.state.unfundedCommitmentCents, 0),
      distributionsCents: commitments.reduce((s, c) => s + c.state.distributionsCents, 0),
    },
  };
}

// ----------------------------------------------------------- investor reads

/** Only the signed-in investor's own profiles, kept separate from one another. */
export async function myCapitalStatements(userId: string) {
  const { data: positions } = await db()
    .from("investor_positions")
    .select("id, offering_id, display_name, capacity, investment_profile_id")
    .eq("investor_user_id", userId);
  const rows = (positions ?? []) as any[];
  if (rows.length === 0) return { positions: [], statements: [], funds: [] };

  const [{ data: statements }, { data: funds }] = await Promise.all([
    db()
      .from("investor_statements")
      .select("*")
      .in("position_id", rows.map((p) => p.id))
      .in("status", ["published", "superseded"])
      .order("period_end", { ascending: false }),
    db()
      .from("offerings")
      .select("id, name, legal_entity_name")
      .in("id", [...new Set(rows.map((p) => p.offering_id))]),
  ]);

  return {
    positions: rows,
    statements: (statements ?? []) as any[],
    funds: (funds ?? []) as any[],
  };
}

export async function myStatementDetail(userId: string, statementId: string) {
  const { data: statement } = await db()
    .from("investor_statements")
    .select("*")
    .eq("id", statementId)
    .maybeSingle();
  if (!statement) fail("Statement not found.");
  const { data: position } = await db()
    .from("investor_positions")
    .select("investor_user_id")
    .eq("id", statement.position_id)
    .maybeSingle();
  if (!position || position.investor_user_id !== userId) fail("Statement not found.");
  if (!["published", "superseded"].includes(String(statement.status))) fail("Statement not found.");
  return statement;
}

// ------------------------------------------------------------- as-of reads

export async function capitalAccountAsOf(userId: string, positionId: string, asOf: string) {
  const { position } = await authorizePosition(userId, positionId);
  const { data } = await db()
    .from("capital_accounts")
    .select("*")
    .eq("position_id", position.id)
    .not("finalized_at", "is", null)
    .order("period_end", { ascending: false });
  return asOfRecord((data ?? []) as any[], asOf);
}

export async function ownershipAsOfDate(userId: string, positionId: string, asOf: string) {
  const account = await capitalAccountAsOf(userId, positionId, asOf);
  return account?.ownership_pct === null || account?.ownership_pct === undefined
    ? null
    : Number(account.ownership_pct);
}

export async function commitmentAsOfDate(userId: string, positionId: string, asOf: string) {
  const { state } = await commitmentLedger(userId, positionId, asOf);
  return state;
}

export async function allocationForPeriod(userId: string, positionId: string, periodEnd: string) {
  const { position } = await authorizePosition(userId, positionId);
  const { data: runs } = await db()
    .from("allocation_runs")
    .select("id, status, period_end, version")
    .eq("offering_id", position.offering_id)
    .eq("period_end", periodEnd)
    .eq("status", "finalized")
    .limit(1);
  const run = ((runs ?? []) as any[])[0] ?? null;
  if (!run) return null;
  const { data: line } = await db()
    .from("allocation_lines")
    .select("*")
    .eq("run_id", run.id)
    .eq("position_id", position.id)
    .maybeSingle();
  return line ?? null;
}
