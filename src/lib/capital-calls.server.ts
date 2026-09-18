/**
 * Fund Administration Phase C — server-only capital call, funding instruction
 * and cash-receipt engine.
 *
 * This layer owns NO money truth of its own. It reads and writes through the
 * authoritative systems already built:
 *
 *   commitment_events / investor_positions  commitment, called, contributed
 *   bank_transactions                       cash actually seen at the bank
 *   bank_reconciliations                    classification, review, approval
 *   journal_entries / journal_lines         posted general ledger
 *   capital_accounts                        investor capital
 *   fund_banking_setups                     the fund's real bank relationship
 *
 * The rule the whole phase turns on: an investment is FUNDED only when posted
 * accounting says so. Not when a screen says so, not when an investor says
 * they sent a wire, and not when a fund manager clicks a button.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { onboardingActor, type OnboardingActor } from "@/lib/investor-onboarding.server";
import { commitmentAsOf, type CommitmentEvent } from "@/lib/allocation-model";
import {
  advanceReconciliationJournal,
  prepareReconciliationJournal,
} from "@/lib/reconciliation.server";
import { ledgerBookForOffering } from "@/lib/accounting.server";
import {
  callLineStatus,
  callLineSummary,
  canActOnCapitalCall,
  capitalCallTransitionError,
  closingBucket,
  computeCallLines,
  deriveLifecycleStage,
  expectedFundingStatus,
  instructionChangeInvalidatesRelease,
  instructionFingerprint,
  instructionTransitionError,
  isAuthoritativelyFunded,
  managerBucket,
  managerSafeFunding,
  proposeFundingMatch,
  selfReportEffect,
  type CallActorRole,
  type CallBasis,
  type CallType,
  type CapitalCallStatus,
  type CommitmentSnapshotLine,
  type FundingCandidate,
  type InstructionStatus,
} from "@/lib/capital-calls-model";

const db = () => supabaseAdmin as any;
const nowIso = () => new Date().toISOString();
const today = () => nowIso().slice(0, 10);

function forbid(message: string): never {
  throw new Error(`Forbidden: ${message}`);
}
function fail(message: string): never {
  throw new Error(message);
}

// ------------------------------------------------------------- authority

async function actorFor(userId: string): Promise<OnboardingActor> {
  return onboardingActor(userId);
}

async function assertStaff(userId: string) {
  const actor = await actorFor(userId);
  if (!actor.isStaff) forbid("Harmonious fund operations authority is required.");
  return actor;
}

/** Role in relation to one exact fund, re-resolved from authoritative records. */
async function roleForOffering(userId: string, offeringId: string): Promise<{
  actor: OnboardingActor;
  role: CallActorRole;
}> {
  const actor = await actorFor(userId);
  if (actor.isStaff) return { actor, role: "harmonious" };
  if (actor.managedOfferingIds.includes(offeringId)) return { actor, role: "manager" };
  return { actor, role: "unknown" };
}

async function recordEvent(entry: {
  offeringId?: string | null;
  capitalCallId?: string | null;
  capitalCallLineId?: string | null;
  expectedFundingId?: string | null;
  fundingMatchId?: string | null;
  fundingInstructionVersionId?: string | null;
  bankTransactionId?: string | null;
  reconciliationId?: string | null;
  journalEntryId?: string | null;
  event: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  reason?: string | null;
  detail?: Record<string, unknown>;
  actorUserId: string;
  actorRole: string;
}) {
  await db().from("capital_call_events").insert({
    offering_id: entry.offeringId ?? null,
    capital_call_id: entry.capitalCallId ?? null,
    capital_call_line_id: entry.capitalCallLineId ?? null,
    expected_funding_id: entry.expectedFundingId ?? null,
    funding_match_id: entry.fundingMatchId ?? null,
    funding_instruction_version_id: entry.fundingInstructionVersionId ?? null,
    bank_transaction_id: entry.bankTransactionId ?? null,
    reconciliation_id: entry.reconciliationId ?? null,
    journal_entry_id: entry.journalEntryId ?? null,
    event: entry.event,
    from_status: entry.fromStatus ?? null,
    to_status: entry.toStatus ?? null,
    reason: entry.reason ?? null,
    detail: entry.detail ?? {},
    actor_user_id: entry.actorUserId,
    actor_role: entry.actorRole,
  });
}

// ---------------------------------------------------- authoritative reads

/** Commitment truth: rebuilt from commitment_events, never stored twice. */
async function commitmentStateFor(positionIds: string[]) {
  const map = new Map<string, ReturnType<typeof commitmentAsOf>>();
  if (positionIds.length === 0) return map;
  const { data } = await db()
    .from("commitment_events")
    .select("position_id, event_type, amount_cents, effective_date")
    .in("position_id", positionIds);
  const grouped = new Map<string, CommitmentEvent[]>();
  for (const row of (data ?? []) as any[]) {
    const key = String(row.position_id);
    grouped.set(key, [
      ...(grouped.get(key) ?? []),
      {
        eventType: row.event_type,
        amountCents: Number(row.amount_cents),
        effectiveDate: String(row.effective_date),
      },
    ]);
  }
  for (const id of positionIds) map.set(id, commitmentAsOf(grouped.get(id) ?? []));
  return map;
}

/**
 * Cash that actually reached the general ledger for one investor position.
 * Read from POSTED journal lines only — this is what "funded" means.
 */
async function postedContributionsFor(offeringId: string) {
  const { data: book } = await db()
    .from("ledger_books")
    .select("id")
    .eq("offering_id", offeringId)
    .eq("domain", "fund_accounting")
    .maybeSingle();
  const totals = new Map<string, number>();
  if (!book?.id) return totals;

  const { data: accounts } = await db()
    .from("chart_of_accounts")
    .select("id, code")
    .eq("book_id", book.id)
    .in("code", ["3000", "3100"]);
  const accountIds = ((accounts ?? []) as any[]).map((a) => a.id);
  if (accountIds.length === 0) return totals;

  const { data: lines } = await db()
    .from("journal_lines")
    .select("credit_cents, debit_cents, investor_user_id, investment_profile_id, entry_id, journal_entries!inner(status)")
    .in("account_id", accountIds)
    .eq("journal_entries.status", "posted");

  for (const line of (lines ?? []) as any[]) {
    const key = `${line.investor_user_id ?? ""}:${line.investment_profile_id ?? ""}`;
    const net = Number(line.credit_cents ?? 0) - Number(line.debit_cents ?? 0);
    totals.set(key, (totals.get(key) ?? 0) + net);
  }
  return totals;
}

function postedKey(investorUserId: string | null, profileId: string | null) {
  return `${investorUserId ?? ""}:${profileId ?? ""}`;
}

/**
 * The commitment snapshot for a fund at this instant: every admitted position
 * plus every accepted investor not yet given a position.
 */
export async function commitmentSnapshot(offeringId: string): Promise<CommitmentSnapshotLine[]> {
  const [{ data: positions }, { data: onboardings }] = await Promise.all([
    db().from("investor_positions").select("*").eq("offering_id", offeringId).eq("status", "active"),
    db()
      .from("investor_onboardings")
      .select("*")
      .eq("offering_id", offeringId)
      .in("stage", ["accepted", "closed", "approved_to_fund", "awaiting_funds", "funded"]),
  ]);
  const positionRows = (positions ?? []) as any[];
  const states = await commitmentStateFor(positionRows.map((p) => String(p.id)));
  const posted = await postedContributionsFor(offeringId);

  const lines: CommitmentSnapshotLine[] = positionRows.map((p) => {
    const state = states.get(String(p.id));
    const contributed =
      posted.get(postedKey(p.investor_user_id, p.investment_profile_id)) ??
      state?.contributedCents ??
      0;
    const commitment = state?.currentCommitmentCents ?? 0;
    return {
      positionId: String(p.id),
      onboardingId: null,
      investorUserId: p.investor_user_id ? String(p.investor_user_id) : null,
      investmentProfileId: p.investment_profile_id ? String(p.investment_profile_id) : null,
      displayName: String(p.display_name ?? "Investor"),
      commitmentCents: commitment,
      contributedCents: contributed,
      unfundedCommitmentCents: Math.max(0, commitment - contributed),
    };
  });

  const covered = new Set(lines.map((l) => `${l.investorUserId}:${l.investmentProfileId}`));
  for (const row of (onboardings ?? []) as any[]) {
    const key = `${row.investor_user_id}:${row.investment_profile_id}`;
    if (covered.has(key)) continue;
    const commitment = Number(row.accepted_amount_cents ?? row.requested_amount_cents ?? 0);
    if (commitment <= 0) continue;
    const contributed = posted.get(postedKey(row.investor_user_id, row.investment_profile_id)) ?? 0;
    lines.push({
      positionId: row.position_id ? String(row.position_id) : null,
      onboardingId: String(row.id),
      investorUserId: String(row.investor_user_id),
      investmentProfileId: row.investment_profile_id ? String(row.investment_profile_id) : null,
      displayName: "Investor",
      commitmentCents: commitment,
      contributedCents: contributed,
      unfundedCommitmentCents: Math.max(0, commitment - contributed),
    });
  }
  return lines;
}

// ----------------------------------------------------------- capital calls

export async function prepareCapitalCall(
  userId: string,
  input: {
    offeringId: string;
    callType: CallType;
    basis: CallBasis;
    percentageBps?: number | null;
    fixedAmountCents?: number | null;
    noticeDate?: string | null;
    dueDate?: string | null;
    purpose?: string | null;
    title?: string | null;
    includeOnly?: string[] | null;
  },
) {
  const { actor, role } = await roleForOffering(userId, input.offeringId);
  const gate = canActOnCapitalCall(role, "prepare");
  if (!gate.allowed) forbid(gate.reason ?? "you cannot prepare capital calls for this fund.");

  const snapshot = await commitmentSnapshot(input.offeringId);
  const computed = computeCallLines({
    basis: input.basis,
    callType: input.callType,
    percentageBps: input.percentageBps ?? null,
    fixedAmountCents: input.fixedAmountCents ?? null,
    snapshot,
    includeOnly: input.includeOnly ?? null,
  });
  if (computed.problems.length > 0) fail(computed.problems[0]!);

  const { data: latest } = await db()
    .from("capital_calls")
    .select("call_number")
    .eq("offering_id", input.offeringId)
    .order("call_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const callNumber = Number(latest?.call_number ?? 0) + 1;

  const { data: call, error } = await db()
    .from("capital_calls")
    .insert({
      offering_id: input.offeringId,
      call_number: callNumber,
      version: 1,
      title: input.title ?? `Capital call ${callNumber}`,
      purpose: input.purpose ?? null,
      call_type: input.callType,
      basis: input.basis,
      percentage_bps: input.percentageBps ?? null,
      fixed_amount_cents: input.fixedAmountCents ?? null,
      notice_date: input.noticeDate ?? today(),
      due_date: input.dueDate ?? null,
      status: "draft",
      commitment_snapshot: { takenAt: nowIso(), lines: snapshot },
      total_called_cents: computed.totalCalledCents,
      prepared_by: actor.userId,
    })
    .select("*")
    .single();
  if (error) fail(error.message);

  const lineRows = computed.lines.map((line) => ({
    capital_call_id: call.id,
    offering_id: input.offeringId,
    position_id: line.positionId,
    onboarding_id: line.onboardingId,
    investment_profile_id: line.investmentProfileId,
    investor_user_id: line.investorUserId,
    display_name: line.displayName,
    commitment_cents: line.commitmentCents,
    previously_contributed_cents: line.contributedCents,
    called_cents: line.calledCents,
    due_date: input.dueDate ?? null,
  }));
  const { error: lineError } = await db().from("capital_call_lines").insert(lineRows);
  if (lineError) fail(lineError.message);

  await recordEvent({
    offeringId: input.offeringId,
    capitalCallId: call.id,
    event: "capital_call_prepared",
    toStatus: "draft",
    detail: { totalCalledCents: computed.totalCalledCents, investors: lineRows.length },
    actorUserId: actor.userId,
    actorRole: role,
  });
  return { callId: call.id as string, totalCalledCents: computed.totalCalledCents, lines: lineRows.length };
}

async function callRow(callId: string) {
  const { data } = await db().from("capital_calls").select("*").eq("id", callId).maybeSingle();
  if (!data) fail("That capital call was not found.");
  return data;
}

async function moveCall(
  userId: string,
  callId: string,
  to: CapitalCallStatus,
  action: "request" | "review" | "publish" | "cancel",
  extra: Record<string, unknown> = {},
  reason?: string,
) {
  const call = await callRow(callId);
  const { actor, role } = await roleForOffering(userId, call.offering_id);
  const gate = canActOnCapitalCall(role, action);
  if (!gate.allowed) forbid(gate.reason ?? "you cannot act on this capital call.");
  const problem = capitalCallTransitionError(String(call.status), to);
  if (problem) fail(problem);

  const { error } = await db()
    .from("capital_calls")
    .update({ status: to, ...extra })
    .eq("id", callId);
  if (error) fail(error.message);

  await recordEvent({
    offeringId: call.offering_id,
    capitalCallId: callId,
    event: `capital_call_${action}`,
    fromStatus: call.status,
    toStatus: to,
    reason: reason ?? null,
    actorUserId: actor.userId,
    actorRole: role,
  });
  return call;
}

export async function requestCapitalCall(userId: string, callId: string) {
  await moveCall(userId, callId, "requested", "request", {
    requested_by: userId,
    requested_at: nowIso(),
  });
  return { requested: true };
}

export async function reviewCapitalCall(userId: string, callId: string) {
  await assertStaff(userId);
  await moveCall(userId, callId, "in_review", "review", {
    reviewed_by: userId,
    reviewed_at: nowIso(),
  });
  return { inReview: true };
}

/**
 * Publication is the material act: Harmonious only, never the preparer, and it
 * writes the call into the authoritative commitment ledger.
 */
export async function publishCapitalCall(userId: string, callId: string) {
  const actor = await assertStaff(userId);
  const call = await callRow(callId);
  if (String(call.prepared_by ?? "") === actor.userId) {
    fail("Maker/checker: the person who prepared a capital call cannot publish it.");
  }
  if (!call.due_date) fail("A published capital call needs a due date.");

  const released = await currentReleasedInstruction(call.offering_id);
  if (!released) fail("Release the fund's approved funding instructions before publishing a call.");

  await moveCall(userId, callId, "published", "publish", {
    published_by: actor.userId,
    published_at: nowIso(),
  });

  const { data: lines } = await db().from("capital_call_lines").select("*").eq("capital_call_id", callId);
  for (const line of (lines ?? []) as any[]) {
    // Authoritative called amount lives in the commitment ledger.
    if (line.position_id) {
      await db().from("commitment_events").insert({
        position_id: line.position_id,
        offering_id: call.offering_id,
        event_type: "capital_call",
        amount_cents: line.called_cents,
        effective_date: call.due_date ?? today(),
        source: "capital_call",
        source_ref: String(callId),
        dedupe_key: `capital_call:${callId}:${line.id}`,
        recorded_by: actor.userId,
      });
    }
    const reference = `${String(call.offering_id).slice(0, 4)}-C${call.call_number}-${String(line.id)
      .slice(0, 6)
      .toUpperCase()}`;
    await db().from("expected_fundings").insert({
      offering_id: call.offering_id,
      capital_call_line_id: line.id,
      onboarding_id: line.onboarding_id,
      position_id: line.position_id,
      investment_profile_id: line.investment_profile_id,
      investor_user_id: line.investor_user_id,
      expected_amount_cents: line.called_cents,
      reference_code: reference,
      funding_instruction_version_id: released.id,
      expected_by: call.due_date,
      created_by: actor.userId,
    });
  }
  await recordEvent({
    offeringId: call.offering_id,
    capitalCallId: callId,
    event: "capital_call_published",
    toStatus: "published",
    detail: { lines: (lines ?? []).length, instructionVersionId: released.id },
    actorUserId: actor.userId,
    actorRole: "harmonious",
  });
  return { published: true };
}

/** Corrections never edit a published call; they supersede it. */
export async function superseteCapitalCall(userId: string, callId: string, reason: string) {
  const actor = await assertStaff(userId);
  if (reason.trim().length < 4) fail("Say why this capital call is being corrected.");
  const call = await callRow(callId);
  if (String(call.status) !== "published") fail("Only a published capital call can be superseded.");

  const snapshot = await commitmentSnapshot(call.offering_id);
  const { data: next, error } = await db()
    .from("capital_calls")
    .insert({
      offering_id: call.offering_id,
      call_number: call.call_number,
      version: Number(call.version) + 1,
      supersedes_id: call.id,
      title: call.title,
      purpose: call.purpose,
      call_type: call.call_type,
      basis: call.basis,
      percentage_bps: call.percentage_bps,
      fixed_amount_cents: call.fixed_amount_cents,
      notice_date: call.notice_date,
      due_date: call.due_date,
      status: "draft",
      commitment_snapshot: { takenAt: nowIso(), lines: snapshot, correctionOf: call.id, reason },
      prepared_by: actor.userId,
    })
    .select("*")
    .single();
  if (error) fail(error.message);

  await db()
    .from("capital_calls")
    .update({ status: "superseded", superseded_at: nowIso() })
    .eq("id", call.id);
  await recordEvent({
    offeringId: call.offering_id,
    capitalCallId: call.id,
    event: "capital_call_superseded",
    fromStatus: "published",
    toStatus: "superseded",
    reason,
    detail: { replacementId: next.id },
    actorUserId: actor.userId,
    actorRole: "harmonious",
  });
  return { replacementCallId: next.id as string };
}

export async function cancelCapitalCall(userId: string, callId: string, reason: string) {
  if (reason.trim().length < 4) fail("Say why this capital call is being cancelled.");
  await moveCall(userId, callId, "cancelled", "cancel", { cancel_reason: reason }, reason);
  return { cancelled: true };
}

// ---------------------------------------------------- funding instructions

async function currentReleasedInstruction(offeringId: string) {
  const { data } = await db()
    .from("funding_instruction_versions")
    .select("*")
    .eq("offering_id", offeringId)
    .eq("release_status", "released")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/**
 * Drafting new wire details is a material financial event: the new version
 * starts unreleased and any existing release is invalidated on approval of the
 * replacement, never silently carried over.
 */
export async function draftFundingInstructions(
  userId: string,
  input: {
    offeringId: string;
    details: Record<string, unknown>;
    bankName?: string | null;
    effectiveDate?: string | null;
    changeReason?: string | null;
  },
) {
  const actor = await assertStaff(userId);
  const { data: setup } = await db()
    .from("fund_setups")
    .select("id")
    .eq("offering_id", input.offeringId)
    .maybeSingle();
  const { data: banking } = setup?.id
    ? await db().from("fund_banking_setups").select("*").eq("setup_id", setup.id).maybeSingle()
    : { data: null };

  const previous = await currentReleasedInstruction(input.offeringId);
  const changed = instructionChangeInvalidatesRelease(previous?.details ?? null, input.details);
  if (previous && !changed) fail("These funding instructions are identical to the released version.");

  const { data: latest } = await db()
    .from("funding_instruction_versions")
    .select("version")
    .eq("offering_id", input.offeringId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: version, error } = await db()
    .from("funding_instruction_versions")
    .insert({
      offering_id: input.offeringId,
      version: Number(latest?.version ?? 0) + 1,
      banking_setup_id: banking?.id ?? null,
      bank_name: input.bankName ?? banking?.bank_name ?? null,
      details: input.details,
      fingerprint: instructionFingerprint(input.details),
      effective_date: input.effectiveDate ?? today(),
      release_status: "pending_review",
      supersedes_id: previous?.id ?? null,
      change_reason: input.changeReason ?? null,
      created_by: actor.userId,
      submitted_by: actor.userId,
      submitted_at: nowIso(),
    })
    .select("*")
    .single();
  if (error) fail(error.message);

  await recordEvent({
    offeringId: input.offeringId,
    fundingInstructionVersionId: version.id,
    event: "funding_instructions_drafted",
    toStatus: "pending_review",
    reason: input.changeReason ?? null,
    detail: { supersedes: previous?.id ?? null, invalidatesRelease: Boolean(previous) },
    actorUserId: actor.userId,
    actorRole: "harmonious",
  });
  return { versionId: version.id as string, version: version.version as number, releaseStatus: "pending_review" };
}

/** Second pair of eyes: the person who drafted instructions cannot release them. */
export async function releaseFundingInstructions(userId: string, versionId: string) {
  const actor = await assertStaff(userId);
  const { data: version } = await db()
    .from("funding_instruction_versions")
    .select("*")
    .eq("id", versionId)
    .maybeSingle();
  if (!version) fail("Those funding instructions were not found.");
  if (String(version.created_by ?? "") === actor.userId) {
    fail("Maker/checker: the person who entered bank details cannot approve their release.");
  }
  const problem = instructionTransitionError(String(version.release_status), "released");
  if (problem) fail(problem);

  const previous = await currentReleasedInstruction(version.offering_id);
  if (previous && previous.id !== version.id) {
    await db()
      .from("funding_instruction_versions")
      .update({ release_status: "superseded", superseded_at: nowIso() })
      .eq("id", previous.id);
  }
  const { error } = await db()
    .from("funding_instruction_versions")
    .update({ release_status: "released", approved_by: actor.userId, approved_at: nowIso() })
    .eq("id", versionId);
  if (error) fail(error.message);

  await recordEvent({
    offeringId: version.offering_id,
    fundingInstructionVersionId: versionId,
    event: "funding_instructions_released",
    fromStatus: version.release_status,
    toStatus: "released",
    detail: { supersededVersionId: previous?.id ?? null },
    actorUserId: actor.userId,
    actorRole: "harmonious",
  });
  return { released: true };
}

export async function revokeFundingInstructions(userId: string, versionId: string, reason: string) {
  const actor = await assertStaff(userId);
  if (reason.trim().length < 4) fail("Say why these instructions are being withdrawn.");
  const { data: version } = await db()
    .from("funding_instruction_versions")
    .select("*")
    .eq("id", versionId)
    .maybeSingle();
  if (!version) fail("Those funding instructions were not found.");
  const problem = instructionTransitionError(String(version.release_status), "revoked");
  if (problem) fail(problem);
  await db()
    .from("funding_instruction_versions")
    .update({ release_status: "revoked", revoked_by: actor.userId, revoked_at: nowIso() })
    .eq("id", versionId);
  await recordEvent({
    offeringId: version.offering_id,
    fundingInstructionVersionId: versionId,
    event: "funding_instructions_revoked",
    fromStatus: version.release_status,
    toStatus: "revoked",
    reason,
    actorUserId: actor.userId,
    actorRole: "harmonious",
  });
  return { revoked: true };
}

export async function listFundingInstructionVersions(userId: string, offeringId: string) {
  await assertStaff(userId);
  const { data } = await db()
    .from("funding_instruction_versions")
    .select("*")
    .eq("offering_id", offeringId)
    .order("version", { ascending: false });
  return ((data ?? []) as any[]).map((v) => ({
    id: v.id,
    version: v.version,
    releaseStatus: v.release_status as InstructionStatus,
    bankName: v.bank_name,
    effectiveDate: v.effective_date,
    approvedBy: v.approved_by,
    approvedAt: v.approved_at,
    supersedesId: v.supersedes_id,
    changeReason: v.change_reason,
    createdAt: v.created_at,
  }));
}

// ---------------------------------------------------------- investor views

async function assertInvestorLine(userId: string, lineId: string) {
  const actor = await actorFor(userId);
  const { data: line } = await db().from("capital_call_lines").select("*").eq("id", lineId).maybeSingle();
  if (!line) fail("That capital call was not found.");
  if (actor.isStaff) return { actor, line, role: "harmonious" as const };
  if (String(line.investor_user_id) === actor.userId) return { actor, line, role: "investor" as const };
  if (actor.managedOfferingIds.includes(line.offering_id)) return { actor, line, role: "manager" as const };
  forbid("this capital call is not yours.");
}

async function postedForLine(line: any) {
  const posted = await postedContributionsFor(line.offering_id);
  const all = posted.get(postedKey(line.investor_user_id, line.investment_profile_id)) ?? 0;
  const { data: siblings } = await db()
    .from("capital_call_lines")
    .select("id, called_cents, created_at")
    .eq("offering_id", line.offering_id)
    .eq("investor_user_id", line.investor_user_id)
    .eq("investment_profile_id", line.investment_profile_id)
    .order("created_at");
  // Posted cash satisfies earlier calls first.
  let remaining = all;
  let mine = 0;
  for (const s of (siblings ?? []) as any[]) {
    const take = Math.min(remaining, Number(s.called_cents));
    if (String(s.id) === String(line.id)) mine = take;
    remaining -= take;
    if (remaining <= 0) break;
  }
  return { postedForThisCall: mine, postedTotal: all };
}

export async function myCapitalCalls(userId: string) {
  const actor = await actorFor(userId);
  const { data } = await db()
    .from("capital_call_lines")
    .select("*, capital_calls!inner(id, status, call_number, title, due_date, notice_date, offering_id)")
    .eq("investor_user_id", actor.userId)
    .in("capital_calls.status", ["published", "closed"])
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as any[];
  const out = [] as any[];
  for (const line of rows) {
    const { postedForThisCall } = await postedForLine(line);
    const summary = callLineSummary({
      commitmentCents: Number(line.commitment_cents),
      previouslyContributedCents: Number(line.previously_contributed_cents),
      calledCents: Number(line.called_cents),
      postedCents: postedForThisCall,
    });
    out.push({
      lineId: line.id,
      callId: line.capital_call_id,
      offeringId: line.offering_id,
      callNumber: line.capital_calls?.call_number,
      title: line.capital_calls?.title,
      dueDate: line.due_date ?? line.capital_calls?.due_date,
      noticeDate: line.capital_calls?.notice_date,
      ...summary,
    });
  }
  return out;
}

/** The investor's capital call page: every figure derived, none self-reported. */
export async function capitalCallForInvestor(userId: string, lineId: string) {
  const { line, role } = await assertInvestorLine(userId, lineId);
  const call = await callRow(line.capital_call_id);
  if (role === "investor" && !["published", "closed"].includes(String(call.status))) {
    fail("This capital call has not been issued yet.");
  }

  const [{ data: offering }, { data: profile }] = await Promise.all([
    db().from("offerings").select("id, name, slug").eq("id", line.offering_id).maybeSingle(),
    line.investment_profile_id
      ? db().from("investment_profiles").select("id, display_label, profile_type").eq("id", line.investment_profile_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const { postedForThisCall, postedTotal } = await postedForLine(line);
  const summary = callLineSummary({
    commitmentCents: Number(line.commitment_cents),
    previouslyContributedCents: Number(line.previously_contributed_cents),
    calledCents: Number(line.called_cents),
    postedCents: postedForThisCall,
  });

  const { data: expected } = await db()
    .from("expected_fundings")
    .select("*")
    .eq("capital_call_line_id", line.id)
    .maybeSingle();

  const base = {
    lineId: line.id,
    callId: call.id,
    callNumber: call.call_number,
    callVersion: call.version,
    status: call.status,
    title: call.title,
    purpose: call.purpose,
    noticeDate: call.notice_date,
    dueDate: line.due_date ?? call.due_date,
    fund: offering ? { id: offering.id, name: offering.name, slug: offering.slug } : null,
    profile: profile ? { id: profile.id, label: profile.display_label, type: profile.profile_type } : null,
    ...summary,
    contributedToDateCents: summary.contributedToDateCents,
    postedContributionsCents: postedTotal,
    notice: call.notice_document_path
      ? { path: call.notice_document_path, name: call.notice_document_name }
      : null,
    investorInitiatedAt: expected?.investor_initiated_at ?? null,
    lifecycleStage: deriveLifecycleStage({
      invited: true,
      onboardingStarted: true,
      submittedForReview: true,
      inHarmoniousReview: false,
      subscriptionAcceptedAt: nowIso(),
      admittedAt: line.position_id ? nowIso() : null,
      calledCents: Number(line.called_cents),
      investorInitiatedAt: expected?.investor_initiated_at ?? null,
      cashDetectedCents: 0,
      inReconciliationReview: false,
      cashConfirmedCents: Number(expected?.received_amount_cents ?? 0),
      postedContributionCents: postedForThisCall,
    }),
  };

  if (role === "manager") return managerSafeFunding({ ...base, actorRole: role });

  const instructions = role === "investor" || role === "harmonious"
    ? await investorFundingInstructions(line.offering_id, expected ?? null, summary.amountDueCents)
    : { unlocked: false, reasons: ["Not available."], instructions: null };

  return { ...base, actorRole: role, funding: instructions };
}

/**
 * Funding instructions are shown only when the fund's current instructions are
 * released by Harmonious AND this investor actually owes money.
 */
async function investorFundingInstructions(
  offeringId: string,
  expected: any | null,
  amountDueCents: number,
) {
  const reasons: string[] = [];
  if (amountDueCents <= 0) reasons.push("There is nothing outstanding on this capital call.");
  const released = await currentReleasedInstruction(offeringId);
  if (!released) reasons.push("Harmonious has not released this fund's banking instructions yet.");

  const { data: setup } = await db().from("fund_setups").select("id").eq("offering_id", offeringId).maybeSingle();
  const { data: banking } = setup?.id
    ? await db().from("fund_banking_setups").select("*").eq("setup_id", setup.id).maybeSingle()
    : { data: null };
  if (!banking || banking.status !== "account_active" || !banking.investor_instructions_released) {
    reasons.push("The fund's bank account is not open for investor funding yet.");
  }
  if (reasons.length > 0 || !released) return { unlocked: false, reasons, instructions: null };

  return {
    unlocked: true,
    reasons: [] as string[],
    instructions: {
      instructionVersionId: released.id as string,
      version: released.version as number,
      effectiveDate: released.effective_date as string | null,
      bankName: released.bank_name as string | null,
      details: released.details,
      reference: expected?.reference_code ?? null,
      amountDueCents,
      warning:
        "Always confirm funding instructions inside this portal. Harmonious will never send changed bank details by email.",
    },
  };
}

/** Informational only. It can never move money, cash or status. */
export async function investorReportsTransferInitiated(userId: string, lineId: string) {
  const { actor, line, role } = await assertInvestorLine(userId, lineId);
  if (role !== "investor") forbid("only the investor can report their own transfer.");
  const { data: expected } = await db()
    .from("expected_fundings")
    .select("*")
    .eq("capital_call_line_id", line.id)
    .maybeSingle();
  if (!expected) fail("This capital call has no expected funding record yet.");

  await db()
    .from("expected_fundings")
    .update({ investor_initiated_at: nowIso() })
    .eq("id", expected.id);
  await recordEvent({
    offeringId: line.offering_id,
    capitalCallLineId: line.id,
    expectedFundingId: expected.id,
    event: "investor_reported_transfer",
    detail: { ...selfReportEffect() },
    actorUserId: actor.userId,
    actorRole: "investor",
  });
  return { recorded: true, ...selfReportEffect() };
}

/** Receipt built from posted records only. */
export async function fundingReceipt(userId: string, lineId: string) {
  const { line, role } = await assertInvestorLine(userId, lineId);
  if (role === "manager") forbid("fund managers do not receive investor funding receipts.");
  const { postedForThisCall, postedTotal } = await postedForLine(line);
  if (postedForThisCall <= 0) {
    return { available: false, reason: "No contribution has been posted for this capital call yet." };
  }
  const call = await callRow(line.capital_call_id);
  const { data: offering } = await db()
    .from("offerings")
    .select("id, name")
    .eq("id", line.offering_id)
    .maybeSingle();
  const { data: profile } = line.investment_profile_id
    ? await db()
        .from("investment_profiles")
        .select("id, display_label")
        .eq("id", line.investment_profile_id)
        .maybeSingle()
    : { data: null };
  const { data: journal } = await db()
    .from("funding_matches")
    .select("journal_entry_id, posted_at")
    .eq("expected_funding_id", (await expectedForLine(line.id))?.id ?? "00000000-0000-0000-0000-000000000000")
    .eq("status", "posted")
    .order("posted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const commitment = Number(line.commitment_cents);
  return {
    available: true,
    fund: offering ? { id: offering.id, name: offering.name } : null,
    profile: profile ? { id: profile.id, label: profile.display_label } : null,
    contributionCents: postedForThisCall,
    effectiveDate: journal?.posted_at ?? null,
    capitalCall: { id: call.id, number: call.call_number, title: call.title },
    contributedCapitalCents: Number(line.previously_contributed_cents) + postedForThisCall,
    contributedToDateCents: postedTotal,
    unfundedCommitmentCents: Math.max(0, commitment - postedTotal),
    journalEntryId: journal?.journal_entry_id ?? null,
    basis: "Derived from posted general-ledger records.",
  };
}

async function expectedForLine(lineId: string) {
  const { data } = await db()
    .from("expected_fundings")
    .select("*")
    .eq("capital_call_line_id", lineId)
    .maybeSingle();
  return data ?? null;
}

// ------------------------------------------------------------ cash matching

/**
 * Look at the fund's unapplied bank cash and PROPOSE matches. Nothing here
 * changes an investor's position; every proposal waits for Harmonious.
 */
export async function detectFundingMatches(userId: string, offeringId: string) {
  const actor = await assertStaff(userId);
  const [{ data: txns }, { data: expected }, { data: existing }] = await Promise.all([
    db().from("bank_transactions").select("*").eq("offering_id", offeringId).order("posted_on"),
    db()
      .from("expected_fundings")
      .select("*")
      .eq("offering_id", offeringId)
      .in("status", ["expected", "partially_received"]),
    db().from("funding_matches").select("bank_transaction_id, status").eq("offering_id", offeringId),
  ]);

  const seen = new Map<string, string>();
  for (const m of (existing ?? []) as any[]) seen.set(String(m.bank_transaction_id), String(m.status));
  const applied = [...seen.entries()]
    .filter(([, status]) => ["approved", "posted"].includes(status))
    .map(([id]) => id);

  const candidates: FundingCandidate[] = ((expected ?? []) as any[]).map((e) => ({
    expectedFundingId: String(e.id),
    offeringId: String(e.offering_id),
    onboardingId: e.onboarding_id ? String(e.onboarding_id) : null,
    positionId: e.position_id ? String(e.position_id) : null,
    investorUserId: e.investor_user_id ? String(e.investor_user_id) : null,
    investmentProfileId: e.investment_profile_id ? String(e.investment_profile_id) : null,
    capitalCallLineId: e.capital_call_line_id ? String(e.capital_call_line_id) : null,
    expectedAmountCents: Number(e.expected_amount_cents),
    receivedAmountCents: Number(e.received_amount_cents ?? 0),
    currency: String(e.currency ?? "USD"),
    referenceCode: String(e.reference_code),
  }));

  let created = 0;
  for (const txn of (txns ?? []) as any[]) {
    if (seen.has(String(txn.id))) continue;
    if (Number(txn.amount_cents) <= 0) continue;

    const proposal = proposeFundingMatch(
      {
        transactionId: String(txn.id),
        offeringId: String(txn.offering_id),
        amountCents: Number(txn.amount_cents),
        postedOn: String(txn.posted_on),
        reference: txn.description ?? null,
        description: txn.name ?? null,
        providerTransactionId: txn.plaid_transaction_id ?? null,
        currency: "USD",
        direction: "credit",
      },
      candidates,
      { alreadyMatchedTransactionIds: applied },
    );

    const { data: match } = await db()
      .from("funding_matches")
      .insert({
        offering_id: offeringId,
        expected_funding_id: proposal.candidate?.expectedFundingId ?? null,
        bank_transaction_id: txn.id,
        proposed_amount_cents: Number(txn.amount_cents),
        variance_cents: proposal.varianceCents,
        confidence: proposal.confidence,
        evidence: { reasons: proposal.evidence, conflicts: proposal.conflicts },
        exception_kind: proposal.exceptionKind,
        status: "proposed",
        created_by: actor.userId,
      })
      .select("*")
      .single();
    created += 1;

    if (proposal.kind === "exception" && proposal.exceptionKind && proposal.exceptionKind !== "exact_match") {
      await db().from("funding_exceptions").insert({
        offering_id: offeringId,
        expected_funding_id: proposal.candidate?.expectedFundingId ?? null,
        funding_match_id: match?.id ?? null,
        bank_transaction_id: txn.id,
        capital_call_line_id: proposal.candidate?.capitalCallLineId ?? null,
        kind: proposal.exceptionKind,
        detail: proposal.conflicts.join(" "),
        raised_by: actor.userId,
      });
    }
    await recordEvent({
      offeringId,
      fundingMatchId: match?.id ?? null,
      bankTransactionId: txn.id,
      expectedFundingId: proposal.candidate?.expectedFundingId ?? null,
      event: "cash_detected",
      toStatus: "proposed",
      detail: {
        confidence: proposal.confidence,
        exceptionKind: proposal.exceptionKind,
        evidence: proposal.evidence,
        conflicts: proposal.conflicts,
      },
      actorUserId: actor.userId,
      actorRole: "harmonious",
    });
  }
  return { proposals: created };
}

/**
 * Harmonious decides. Approving hands the cash to the reconciliation and
 * accounting pipeline that already exists — it never writes a balance itself.
 */
export async function decideFundingMatch(
  userId: string,
  input: {
    matchId: string;
    decision: "approve" | "reject" | "correct" | "request_information";
    expectedFundingId?: string | null;
    amountCents?: number | null;
    reason?: string | null;
  },
) {
  const actor = await assertStaff(userId);
  const { data: match } = await db().from("funding_matches").select("*").eq("id", input.matchId).maybeSingle();
  if (!match) fail("That proposed match was not found.");
  if (["approved", "posted"].includes(String(match.status))) {
    fail("This bank transaction has already been applied.");
  }
  const reason = (input.reason ?? "").trim();
  if (input.decision !== "approve" && reason.length < 4) {
    fail("Every correction, rejection or information request needs a reason.");
  }
  if (input.decision === "correct" && !input.expectedFundingId) {
    fail("Name the investor funding this cash belongs to.");
  }

  if (input.decision === "reject" || input.decision === "request_information") {
    const status = input.decision === "reject" ? "rejected" : "information_requested";
    await db()
      .from("funding_matches")
      .update({ status, decision_reason: reason, decided_by: actor.userId, decided_at: nowIso() })
      .eq("id", match.id);
    await recordEvent({
      offeringId: match.offering_id,
      fundingMatchId: match.id,
      bankTransactionId: match.bank_transaction_id,
      event: `funding_match_${status}`,
      fromStatus: match.status,
      toStatus: status,
      reason,
      actorUserId: actor.userId,
      actorRole: "harmonious",
    });
    return { status };
  }

  const expectedFundingId = input.expectedFundingId ?? match.expected_funding_id;
  if (!expectedFundingId) fail("This cash has no investor funding attached to it.");
  const { data: expected } = await db()
    .from("expected_fundings")
    .select("*")
    .eq("id", expectedFundingId)
    .maybeSingle();
  if (!expected) fail("That expected funding was not found.");
  if (String(expected.offering_id) !== String(match.offering_id)) {
    fail("That expected funding belongs to a different fund.");
  }

  const applied = Number(input.amountCents ?? match.proposed_amount_cents);
  const outstanding = Number(expected.expected_amount_cents) - Number(expected.received_amount_cents ?? 0);
  const variance = applied - outstanding;

  // 1. Reconciliation: classify the cash against this investor.
  const reconciliationId = await reconcileFundingCash(actor.userId, {
    offeringId: String(match.offering_id),
    bankTransactionId: String(match.bank_transaction_id),
    investorUserId: expected.investor_user_id,
    investmentProfileId: expected.investment_profile_id,
  });

  // 2. Journal preparation — accounting review and posting stay separate acts.
  const journal = await prepareReconciliationJournal(actor.userId, reconciliationId);

  await db()
    .from("funding_matches")
    .update({
      status: "approved",
      expected_funding_id: expectedFundingId,
      reconciliation_id: reconciliationId,
      journal_entry_id: journal.entryId,
      proposed_amount_cents: applied,
      variance_cents: variance,
      decision_reason: reason || (input.decision === "correct" ? "Corrected by Harmonious" : "Approved"),
      decided_by: actor.userId,
      decided_at: nowIso(),
    })
    .eq("id", match.id);

  await recordEvent({
    offeringId: match.offering_id,
    fundingMatchId: match.id,
    expectedFundingId,
    bankTransactionId: match.bank_transaction_id,
    reconciliationId,
    journalEntryId: journal.entryId,
    event: input.decision === "correct" ? "funding_match_corrected" : "funding_match_approved",
    fromStatus: match.status,
    toStatus: "approved",
    reason: reason || null,
    detail: { appliedCents: applied, varianceCents: variance },
    actorUserId: actor.userId,
    actorRole: "harmonious",
  });

  if (variance !== 0) {
    await db().from("funding_exceptions").insert({
      offering_id: match.offering_id,
      expected_funding_id: expectedFundingId,
      funding_match_id: match.id,
      bank_transaction_id: match.bank_transaction_id,
      capital_call_line_id: expected.capital_call_line_id,
      kind: variance > 0 ? "overfunding" : "partial_funding",
      detail: `Applied ${applied} cents against ${outstanding} cents outstanding.`,
      raised_by: actor.userId,
    });
  }
  return { status: "approved", reconciliationId, journalEntryId: journal.entryId, varianceCents: variance };
}

/** Writes the reconciliation row the accounting pipeline expects. */
async function reconcileFundingCash(
  userId: string,
  input: {
    offeringId: string;
    bankTransactionId: string;
    investorUserId: string | null;
    investmentProfileId: string | null;
  },
) {
  const book = await ledgerBookForOffering(userId, input.offeringId);
  const { data: accounts } = await db()
    .from("chart_of_accounts")
    .select("id, code")
    .eq("book_id", book.id)
    .in("code", ["1000", "3100"]);
  const byCode = new Map(((accounts ?? []) as any[]).map((a) => [String(a.code), a.id]));
  const cash = byCode.get("1000");
  const contributions = byCode.get("3100");
  if (!cash || !contributions) fail("This fund's chart of accounts is missing the cash or contribution account.");

  const { data: rec, error } = await db()
    .from("bank_reconciliations")
    .upsert(
      {
        bank_transaction_id: input.bankTransactionId,
        offering_id: input.offeringId,
        book_id: book.id,
        status: "reconciled",
        transaction_type: "investor_contribution",
        confidence: "high",
        investor_user_id: input.investorUserId,
        investment_profile_id: input.investmentProfileId,
        suggested_debit_account_id: cash,
        suggested_credit_account_id: contributions,
        classified_at: nowIso(),
        reconciled_by: userId,
        reconciled_at: nowIso(),
        approved_by_harmonious: userId,
        harmonious_approved_at: nowIso(),
        updated_at: nowIso(),
      },
      { onConflict: "bank_transaction_id" },
    )
    .select("*")
    .single();
  if (error) fail(error.message);
  return String(rec.id);
}

/**
 * Accounting approval and posting. Only once the journal is POSTED does the
 * contribution reach the commitment ledger and the investor's capital account.
 */
export async function postFundingMatch(userId: string, matchId: string) {
  const actor = await assertStaff(userId);
  const { data: match } = await db().from("funding_matches").select("*").eq("id", matchId).maybeSingle();
  if (!match) fail("That match was not found.");
  if (String(match.status) !== "approved") fail("Only an approved match can be posted.");
  if (String(match.decided_by ?? "") === actor.userId) {
    fail("Maker/checker: the person who approved the match cannot post it to the ledger.");
  }

  await advanceReconciliationJournal(actor.userId, String(match.reconciliation_id), "reviewed");
  await advanceReconciliationJournal(actor.userId, String(match.reconciliation_id), "approved");
  await advanceReconciliationJournal(actor.userId, String(match.reconciliation_id), "posted");

  const { data: expected } = await db()
    .from("expected_fundings")
    .select("*")
    .eq("id", match.expected_funding_id)
    .maybeSingle();

  let commitmentEventId: string | null = null;
  if (expected?.position_id) {
    const { data: event } = await db()
      .from("commitment_events")
      .insert({
        position_id: expected.position_id,
        offering_id: match.offering_id,
        event_type: "contribution",
        amount_cents: Number(match.proposed_amount_cents),
        effective_date: today(),
        source: "funding_match",
        source_ref: String(match.id),
        journal_entry_id: match.journal_entry_id,
        dedupe_key: `funding_match:${match.id}`,
        recorded_by: actor.userId,
      })
      .select("id")
      .maybeSingle();
    commitmentEventId = event?.id ? String(event.id) : null;
  }

  if (expected) {
    const received = Number(expected.received_amount_cents ?? 0) + Number(match.proposed_amount_cents);
    await db()
      .from("expected_fundings")
      .update({
        received_amount_cents: received,
        status: expectedFundingStatus({
          expectedAmountCents: Number(expected.expected_amount_cents),
          receivedAmountCents: received,
        }),
      })
      .eq("id", expected.id);

    if (expected.capital_call_line_id) {
      const { data: line } = await db()
        .from("capital_call_lines")
        .select("*")
        .eq("id", expected.capital_call_line_id)
        .maybeSingle();
      if (line) {
        const lineReceived = Number(line.received_cents ?? 0) + Number(match.proposed_amount_cents);
        await db()
          .from("capital_call_lines")
          .update({
            received_cents: lineReceived,
            status: callLineStatus({
              calledCents: Number(line.called_cents),
              postedCents: lineReceived,
            }),
          })
          .eq("id", line.id);
      }
    }
  }

  await db()
    .from("funding_matches")
    .update({ status: "posted", posted_at: nowIso(), commitment_event_id: commitmentEventId })
    .eq("id", match.id);

  await recordEvent({
    offeringId: match.offering_id,
    fundingMatchId: match.id,
    expectedFundingId: match.expected_funding_id,
    bankTransactionId: match.bank_transaction_id,
    reconciliationId: match.reconciliation_id,
    journalEntryId: match.journal_entry_id,
    event: "contribution_posted",
    fromStatus: "approved",
    toStatus: "posted",
    detail: { amountCents: match.proposed_amount_cents, commitmentEventId },
    actorUserId: actor.userId,
    actorRole: "harmonious",
  });
  return { posted: true, commitmentEventId };
}

/** A returned or reversed wire reverses through accounting, never by editing. */
export async function reverseFundingMatch(userId: string, matchId: string, reason: string) {
  const actor = await assertStaff(userId);
  if (reason.trim().length < 4) fail("Say why this contribution is being reversed.");
  const { data: match } = await db().from("funding_matches").select("*").eq("id", matchId).maybeSingle();
  if (!match) fail("That match was not found.");
  if (String(match.status) !== "posted") fail("Only a posted contribution can be reversed.");

  const { reverseAndCorrectReconciliation } = await import("@/lib/reconciliation.server");
  await reverseAndCorrectReconciliation(actor.userId, String(match.reconciliation_id), reason);

  await db().from("funding_exceptions").insert({
    offering_id: match.offering_id,
    expected_funding_id: match.expected_funding_id,
    funding_match_id: match.id,
    bank_transaction_id: match.bank_transaction_id,
    kind: "returned_wire",
    detail: reason,
    raised_by: actor.userId,
  });
  await recordEvent({
    offeringId: match.offering_id,
    fundingMatchId: match.id,
    reconciliationId: match.reconciliation_id,
    event: "contribution_reversed",
    fromStatus: "posted",
    toStatus: "reversed",
    reason,
    actorUserId: actor.userId,
    actorRole: "harmonious",
  });
  return { reversed: true };
}

export async function resolveFundingException(
  userId: string,
  exceptionId: string,
  resolution: string,
) {
  const actor = await assertStaff(userId);
  if (resolution.trim().length < 4) fail("Say how this exception was resolved.");
  const { data: ex } = await db().from("funding_exceptions").select("*").eq("id", exceptionId).maybeSingle();
  if (!ex) fail("That exception was not found.");
  await db()
    .from("funding_exceptions")
    .update({ status: "resolved", resolution, resolved_by: actor.userId, resolved_at: nowIso() })
    .eq("id", exceptionId);
  await recordEvent({
    offeringId: ex.offering_id,
    fundingMatchId: ex.funding_match_id,
    event: "funding_exception_resolved",
    fromStatus: "open",
    toStatus: "resolved",
    reason: resolution,
    actorUserId: actor.userId,
    actorRole: "harmonious",
  });
  return { resolved: true };
}

// ----------------------------------------------- Harmonious funding queue

export async function fundingQueue(userId: string, offeringId?: string | null) {
  await assertStaff(userId);
  let query = db()
    .from("funding_matches")
    .select("*")
    .order("created_at", { ascending: false });
  if (offeringId) query = query.eq("offering_id", offeringId);
  const { data: matches } = await query;

  const items = [] as any[];
  for (const match of ((matches ?? []) as any[]).slice(0, 200)) {
    const [{ data: txn }, { data: expected }, { data: exceptions }] = await Promise.all([
      db().from("bank_transactions").select("*").eq("id", match.bank_transaction_id).maybeSingle(),
      match.expected_funding_id
        ? db().from("expected_fundings").select("*").eq("id", match.expected_funding_id).maybeSingle()
        : Promise.resolve({ data: null }),
      db().from("funding_exceptions").select("*").eq("funding_match_id", match.id).eq("status", "open"),
    ]);
    const { data: offering } = await db()
      .from("offerings")
      .select("id, name")
      .eq("id", match.offering_id)
      .maybeSingle();
    let profileLabel: string | null = null;
    if (expected?.investment_profile_id) {
      const { data: profile } = await db()
        .from("investment_profiles")
        .select("display_label")
        .eq("id", expected.investment_profile_id)
        .maybeSingle();
      profileLabel = profile?.display_label ?? null;
    }
    items.push({
      matchId: match.id,
      status: match.status,
      confidence: match.confidence,
      exceptionKind: match.exception_kind,
      evidence: match.evidence,
      fund: offering ? { id: offering.id, name: offering.name } : null,
      profileLabel,
      investorUserId: expected?.investor_user_id ?? null,
      capitalCallLineId: expected?.capital_call_line_id ?? null,
      expectedAmountCents: expected ? Number(expected.expected_amount_cents) : null,
      receivedAmountCents: Number(match.proposed_amount_cents),
      varianceCents: Number(match.variance_cents),
      bankTransaction: txn
        ? { id: txn.id, postedOn: txn.posted_on, amountCents: Number(txn.amount_cents), name: txn.name }
        : null,
      openExceptions: ((exceptions ?? []) as any[]).map((e) => ({
        id: e.id,
        kind: e.kind,
        detail: e.detail,
      })),
    });
  }

  const { data: openExceptions } = await db()
    .from("funding_exceptions")
    .select("*")
    .eq("status", "open")
    .order("created_at", { ascending: false });

  return { items, exceptions: (openExceptions ?? []) as any[] };
}

export async function capitalCallBoard(userId: string, offeringId?: string | null) {
  const actor = await actorFor(userId);
  if (!actor.isStaff && actor.managedOfferingIds.length === 0) {
    forbid("you do not administer any funds.");
  }
  let query = db().from("capital_calls").select("*").order("created_at", { ascending: false });
  if (offeringId) query = query.eq("offering_id", offeringId);
  else if (!actor.isStaff) query = query.in("offering_id", actor.managedOfferingIds);
  if (offeringId && !actor.isStaff && !actor.managedOfferingIds.includes(offeringId)) {
    forbid("that fund is not yours.");
  }
  const { data } = await query;

  const calls = [] as any[];
  for (const call of (data ?? []) as any[]) {
    const { data: lines } = await db()
      .from("capital_call_lines")
      .select("called_cents, received_cents, status")
      .eq("capital_call_id", call.id);
    const rows = (lines ?? []) as any[];
    calls.push({
      id: call.id,
      offeringId: call.offering_id,
      callNumber: call.call_number,
      version: call.version,
      title: call.title,
      purpose: call.purpose,
      status: call.status,
      basis: call.basis,
      callType: call.call_type,
      noticeDate: call.notice_date,
      dueDate: call.due_date,
      investors: rows.length,
      calledCents: rows.reduce((s, r) => s + Number(r.called_cents), 0),
      receivedCents: rows.reduce((s, r) => s + Number(r.received_cents ?? 0), 0),
      preparedBy: actor.isStaff ? call.prepared_by : null,
    });
  }
  return actor.isStaff ? calls : calls.map((c) => managerSafeFunding(c));
}

// ------------------------------------------------------- closing dashboard

async function investorRows(offeringId?: string | null) {
  let query = db().from("investor_onboardings").select("*");
  if (offeringId) query = query.eq("offering_id", offeringId);
  const { data } = await query;
  return (data ?? []) as any[];
}

async function buildInvestorState(row: any, posted: Map<string, number>) {
  const [{ data: lines }, { data: exceptions }, { data: expected }] = await Promise.all([
    db()
      .from("capital_call_lines")
      .select("called_cents")
      .eq("offering_id", row.offering_id)
      .eq("investor_user_id", row.investor_user_id)
      .eq("investment_profile_id", row.investment_profile_id),
    db()
      .from("funding_exceptions")
      .select("id, kind, owner")
      .eq("offering_id", row.offering_id)
      .eq("status", "open"),
    db()
      .from("expected_fundings")
      .select("received_amount_cents, investor_initiated_at")
      .eq("offering_id", row.offering_id)
      .eq("investor_user_id", row.investor_user_id),
  ]);
  const called = ((lines ?? []) as any[]).reduce((s, l) => s + Number(l.called_cents), 0);
  const confirmed = ((expected ?? []) as any[]).reduce(
    (s, e) => s + Number(e.received_amount_cents ?? 0),
    0,
  );
  const initiated = ((expected ?? []) as any[]).find((e) => e.investor_initiated_at)?.investor_initiated_at ?? null;
  const postedCents = posted.get(postedKey(row.investor_user_id, row.investment_profile_id)) ?? 0;
  const stage = deriveLifecycleStage({
    invited: true,
    onboardingStarted: true,
    submittedForReview: ["signature", "harmonious_review", "approved_to_fund"].includes(String(row.stage)),
    inHarmoniousReview: String(row.stage) === "harmonious_review",
    subscriptionAcceptedAt: row.accepted_at ?? null,
    admittedAt: row.closed_at ?? null,
    calledCents: called,
    investorInitiatedAt: initiated,
    cashDetectedCents: confirmed,
    inReconciliationReview: false,
    cashConfirmedCents: confirmed,
    postedContributionCents: postedCents,
  });
  return { called, confirmed, postedCents, stage, exceptions: (exceptions ?? []) as any[] };
}

export async function closingDashboard(userId: string, offeringId?: string | null) {
  await assertStaff(userId);
  const rows = await investorRows(offeringId);
  const postedByOffering = new Map<string, Map<string, number>>();
  const buckets: Record<string, any[]> = {};

  for (const row of rows) {
    if (!postedByOffering.has(row.offering_id)) {
      postedByOffering.set(row.offering_id, await postedContributionsFor(row.offering_id));
    }
    const posted = postedByOffering.get(row.offering_id)!;
    const state = await buildInvestorState(row, posted);
    const bucket = closingBucket({
      stage: state.stage,
      openExceptions: state.exceptions.length,
      requirementsComplete: ["approved_to_fund", "awaiting_funds", "funded", "accepted", "closed"].includes(
        String(row.stage),
      ),
      inComplianceReview: ["verification", "eligibility", "tax"].includes(String(row.stage)),
      calledCents: state.called,
      confirmedCents: state.confirmed,
      postedCents: state.postedCents,
      closedAt: row.closed_at,
    });
    buckets[bucket] = [
      ...(buckets[bucket] ?? []),
      {
        onboardingId: row.id,
        offeringId: row.offering_id,
        investorUserId: row.investor_user_id,
        investmentProfileId: row.investment_profile_id,
        stage: state.stage,
        calledCents: state.called,
        confirmedCents: state.confirmed,
        postedCents: state.postedCents,
        funded: isAuthoritativelyFunded({
          calledCents: state.called,
          postedContributionCents: state.postedCents,
        }),
        openExceptions: state.exceptions.length,
      },
    ];
  }
  return buckets;
}

/** Managers: operational progress for their exact funds, nothing financial-internal. */
export async function managerFundingBoard(userId: string, offeringId?: string | null) {
  const actor = await actorFor(userId);
  if (!actor.isStaff && actor.managedOfferingIds.length === 0) forbid("you do not manage any funds.");
  if (offeringId && !actor.isStaff && !actor.managedOfferingIds.includes(offeringId)) {
    forbid("that fund is not yours.");
  }
  const scopeIds = offeringId ? [offeringId] : actor.isStaff ? null : actor.managedOfferingIds;

  let query = db().from("investor_onboardings").select("*");
  if (scopeIds) query = query.in("offering_id", scopeIds);
  const { data } = await query;

  const postedByOffering = new Map<string, Map<string, number>>();
  const items = [] as any[];
  for (const row of (data ?? []) as any[]) {
    if (!postedByOffering.has(row.offering_id)) {
      postedByOffering.set(row.offering_id, await postedContributionsFor(row.offering_id));
    }
    const state = await buildInvestorState(row, postedByOffering.get(row.offering_id)!);
    items.push(
      managerSafeFunding({
        onboardingId: row.id,
        offeringId: row.offering_id,
        stage: state.stage,
        bucket: managerBucket({
          stage: state.stage,
          openManagerExceptions: state.exceptions.filter((e) => e.owner === "manager").length,
          calledCents: state.called,
          postedCents: state.postedCents,
        }),
        calledCents: state.called,
        contributedCents: state.postedCents,
        outstandingCents: Math.max(0, state.called - state.postedCents),
      }),
    );
  }
  return items;
}

/** The full audit reconstruction for one investor's money. */
export async function fundingAuditTrail(userId: string, onboardingId: string) {
  await assertStaff(userId);
  const { data: row } = await db()
    .from("investor_onboardings")
    .select("*")
    .eq("id", onboardingId)
    .maybeSingle();
  if (!row) fail("That investment was not found.");
  const [{ data: onboardingEvents }, { data: callEvents }] = await Promise.all([
    db()
      .from("investor_onboarding_events")
      .select("*")
      .eq("onboarding_id", onboardingId)
      .order("created_at"),
    db()
      .from("capital_call_events")
      .select("*")
      .eq("offering_id", row.offering_id)
      .order("created_at"),
  ]);
  return {
    onboarding: [...((onboardingEvents ?? []) as any[])],
    funding: [...((callEvents ?? []) as any[])],
  };
}
