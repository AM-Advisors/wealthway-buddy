/**
 * Fund Administration Phase D — server-only distribution, withholding and
 * outbound payment engine.
 *
 * This layer owns NO money truth of its own. It reads and writes through the
 * authoritative systems already built:
 *
 *   allocation_runs / capital_accounts      economic entitlement
 *   commitment_events / investor_positions  commitment and contributed capital
 *   bank_transactions                       cash actually seen at the bank
 *   bank_reconciliations                    classification, review, approval
 *   journal_entries / journal_lines         posted general ledger
 *   compliance_holds                        blocking compliance state
 *
 * The rule the whole phase turns on: money is only PAID when the provider
 * confirmation correlates, the bank activity reconciles and the journal posts.
 * Not when a screen says so, and never on a provider callback alone.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { onboardingActor, type OnboardingActor } from "@/lib/investor-onboarding.server";
import { commitmentAsOf, type CommitmentEvent } from "@/lib/allocation-model";
import { assertNoHold } from "@/lib/compliance-holds.functions";
import { capabilitiesFor, hasOperationsEntry } from "@/lib/ops-capabilities";
import { ledgerBookForOffering } from "@/lib/accounting.server";
import {
  advanceReconciliationJournal,
  prepareReconciliationJournal,
  reverseAndCorrectReconciliation,
} from "@/lib/reconciliation.server";
import {
  batchTransitionError,
  calculateEntitlements,
  calculateWithholding,
  canActOnDistribution,
  capitalAccountEffect,
  changedDestinationFields,
  complianceGateBlockers,
  investorPaymentLabel,
  matchAdvancesSettlement,
  matchOutbound,
  operationsStage,
  OPERATIONS_STAGE_LABELS,
  reversalRequestError,
  snapshotHash,
  staffCapabilityError,
  withholdingReviewBlockers,
  type BankCandidate,
  type DistributionAction,
  type EconomicSnapshot,
  type EvidenceState,
  checkBatchBalance,
  coolingOffSatisfied,
  coolingOffUntil,
  correlateProviderEvent,
  destinationFingerprint,
  distributionBucket,
  DISTRIBUTION_TREATMENT,
  executionBlockers,
  instructionChangeBlockers,
  investorSafeLine,
  isHighRiskChange,
  makerCheckerError,
  managerSafeLine,
  manualAdjustmentError,
  maskTail,
  paymentInstructionTransitionError,
  paymentTransitionError,
  pendingDistributionsNeedingRevalidation,
  selfReportEffect,
  type ApprovalChainEntry,
  type BatchStatus,
  type DestinationFields,
  type DistributionActorRole,
  type DistributionType,
  type EntitlementInput,
  type PaymentInstructionStatus,
  type WithholdingRule,
} from "@/lib/distributions-model";

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

type DistributionActor = OnboardingActor & { capabilities: string[] };

/**
 * Authority is resolved from authoritative role records on every call. Being
 * "staff" grants read visibility only; every action needs its own granular
 * Operations capability (see DISTRIBUTION_CAPABILITY).
 */
async function actorFor(userId: string): Promise<DistributionActor> {
  const base = await onboardingActor(userId);
  const { data: roles } = await db().from("user_roles").select("role").eq("user_id", userId);
  const list = ((roles ?? []) as { role: string }[]).map((r) => String(r.role));
  const capabilities = hasOperationsEntry(list) ? capabilitiesFor(list) : [];
  return {
    ...base,
    capabilities,
    isStaff: capabilities.includes("capital:see") || capabilities.includes("accounting:see"),
  };
}

async function assertStaff(userId: string, action: DistributionAction | "see" = "see") {
  const actor = await actorFor(userId);
  if (!actor.isStaff) forbid("Harmonious distribution authority is required.");
  if (action !== "see") {
    const error = staffCapabilityError(actor.capabilities, action);
    if (error) forbid(error);
  }
  return actor;
}

async function roleForOffering(
  userId: string,
  offeringId: string,
): Promise<{ actor: DistributionActor; role: DistributionActorRole }> {
  const actor = await actorFor(userId);
  if (actor.isStaff) return { actor, role: "harmonious" };
  if (actor.managedOfferingIds.includes(offeringId)) return { actor, role: "manager" };
  return { actor, role: "investor" };
}

async function assertCan(userId: string, offeringId: string, action: DistributionAction) {
  const { actor, role } = await roleForOffering(userId, offeringId);
  const verdict = canActOnDistribution(role, action);
  if (!verdict.allowed) forbid(verdict.reason ?? "you do not have authority for this action.");
  if (role === "harmonious") {
    const error = staffCapabilityError(actor.capabilities, action);
    if (error) forbid(error);
  }
  return { actor, role };
}

async function recordEvent(entry: {
  offeringId?: string | null;
  batchId?: string | null;
  distributionLineId?: string | null;
  paymentId?: string | null;
  instructionId?: string | null;
  instructionChangeId?: string | null;
  providerEventId?: string | null;
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
  await db().from("distribution_events").insert({
    offering_id: entry.offeringId ?? null,
    batch_id: entry.batchId ?? null,
    distribution_line_id: entry.distributionLineId ?? null,
    payment_id: entry.paymentId ?? null,
    instruction_id: entry.instructionId ?? null,
    instruction_change_id: entry.instructionChangeId ?? null,
    provider_event_id: entry.providerEventId ?? null,
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

async function raiseException(input: {
  offeringId?: string | null;
  batchId?: string | null;
  distributionLineId?: string | null;
  paymentId?: string | null;
  providerEventId?: string | null;
  instructionChangeId?: string | null;
  kind: string;
  severity?: string;
  owner?: string;
  detail: string;
  raisedBy: string;
}) {
  const { data } = await db()
    .from("distribution_exceptions")
    .insert({
      offering_id: input.offeringId ?? null,
      batch_id: input.batchId ?? null,
      distribution_line_id: input.distributionLineId ?? null,
      payment_id: input.paymentId ?? null,
      provider_event_id: input.providerEventId ?? null,
      instruction_change_id: input.instructionChangeId ?? null,
      kind: input.kind,
      severity: input.severity ?? "blocking",
      owner: input.owner ?? "harmonious",
      detail: input.detail,
      raised_by: input.raisedBy,
    })
    .select("id")
    .maybeSingle();
  return data?.id ? String(data.id) : null;
}

// ------------------------------------------------- payment instructions

function splitDestination(fields: DestinationFields) {
  const secured = {
    accountNumber: fields.accountNumber ?? null,
    routingNumber: fields.routingNumber ?? null,
    swift: fields.swift ?? null,
    custodianAccount: fields.custodianAccount ?? null,
  };
  return {
    secured,
    maskedAccount: maskTail(fields.accountNumber ?? fields.custodianAccount ?? null),
    maskedRouting: maskTail(fields.routingNumber ?? fields.swift ?? null),
  };
}

function destinationFromRow(row: any): DestinationFields {
  const secured = (row?.secured_details ?? {}) as Record<string, string | null>;
  return {
    method: String(row?.method ?? "wire"),
    beneficiaryName: row?.beneficiary_name ?? null,
    bankName: row?.bank_name ?? null,
    accountNumber: secured['accountNumber'] ?? null,
    routingNumber: secured['routingNumber'] ?? null,
    swift: secured['swift'] ?? null,
    custodianAccount: secured['custodianAccount'] ?? null,
    country: row?.country ?? null,
    currency: row?.currency ?? "USD",
  };
}

/** The masked view a browser is allowed to receive. */
export function maskedInstruction(row: any) {
  if (!row) return null;
  return {
    id: String(row.id),
    version: Number(row.version ?? 1),
    method: String(row.method ?? "wire"),
    label: row.label ?? null,
    beneficiaryName: row.beneficiary_name ?? null,
    bankName: row.bank_name ?? null,
    country: row.country ?? null,
    currency: row.currency ?? "USD",
    maskedAccount: row.masked_account ?? null,
    maskedRouting: row.masked_routing ?? null,
    status: String(row.status ?? "draft"),
    verificationStatus: String(row.verification_status ?? "unverified"),
    effectiveDate: row.effective_date ?? null,
    coolingOffUntil: row.cooling_off_until ?? null,
  };
}

async function assertOwnsProfile(userId: string, profileId: string | null) {
  if (!profileId) return;
  const { data } = await db()
    .from("investment_profiles")
    .select("id, owner_user_id")
    .eq("id", profileId)
    .maybeSingle();
  if (!data) fail("That investment profile was not found.");
  if (String(data.owner_user_id ?? "") !== userId) {
    forbid("that investment profile is not yours.");
  }
}

/**
 * Request a payment destination. A new or changed destination is always a
 * high-risk event: it enters verification and Harmonious review, never
 * straight into use.
 */
export async function requestPaymentInstruction(
  userId: string,
  input: {
    investorUserId?: string | null;
    investmentProfileId?: string | null;
    offeringId?: string | null;
    destination: DestinationFields;
    label?: string | null;
  },
) {
  const actor = await actorFor(userId);
  const ownerId = String(input.investorUserId ?? userId);

  if (!actor.isStaff) {
    if (ownerId !== actor.userId) {
      forbid("you can only manage your own payment details.");
    }
    await assertOwnsProfile(actor.userId, input.investmentProfileId ?? null);
    // Phase D deliberately does not grant delegated transaction authority.
    const { data: delegated } = await db()
      .from("delegations")
      .select("id")
      .eq("delegate_user_id", actor.userId)
      .eq("status", "active")
      .limit(1);
    if ((delegated ?? []).length > 0 && ownerId !== actor.userId) {
      forbid("delegated authority does not extend to changing payment details.");
    }
  }

  const profileId = input.investmentProfileId ?? null;
  const { data: current } = await db()
    .from("investor_payment_instructions")
    .select("*")
    .eq("investor_user_id", ownerId)
    .eq("status", "approved")
    .order("version", { ascending: false })
    .limit(50);

  const previous =
    ((current ?? []) as any[]).find(
      (r) => String(r.investment_profile_id ?? "") === String(profileId ?? ""),
    ) ?? null;

  const fingerprint = destinationFingerprint(input.destination);
  if (previous && String(previous.fingerprint) === fingerprint) {
    fail("Those payment details are already on file and approved.");
  }

  const changedFields = changedDestinationFields(
    previous ? destinationFromRow(previous) : null,
    input.destination,
  );
  const highRisk = isHighRiskChange(changedFields);

  const { data: latest } = await db()
    .from("investor_payment_instructions")
    .select("version")
    .eq("investor_user_id", ownerId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const version = Number(latest?.version ?? 0) + 1;

  const { secured, maskedAccount, maskedRouting } = splitDestination(input.destination);

  const { data: created, error } = await db()
    .from("investor_payment_instructions")
    .insert({
      investor_user_id: ownerId,
      investment_profile_id: profileId,
      offering_id: input.offeringId ?? null,
      version,
      supersedes_id: previous?.id ?? null,
      method: input.destination.method,
      label: input.label ?? null,
      beneficiary_name: input.destination.beneficiaryName ?? null,
      bank_name: input.destination.bankName ?? null,
      country: input.destination.country ?? null,
      currency: input.destination.currency ?? "USD",
      secured_details: secured,
      masked_account: maskedAccount,
      masked_routing: maskedRouting,
      fingerprint,
      status: "pending_verification",
      verification_status: "unverified",
      cooling_off_until: highRisk ? coolingOffUntil(nowIso()) : null,
      created_by: actor.userId,
    })
    .select("*")
    .single();
  if (error) fail(error.message);

  const change = await db()
    .from("payment_instruction_changes")
    .insert({
      instruction_id: created.id,
      previous_instruction_id: previous?.id ?? null,
      investor_user_id: ownerId,
      investment_profile_id: profileId,
      offering_id: input.offeringId ?? null,
      change_kind: previous ? "destination_change" : "new_destination",
      risk_level: highRisk ? "high" : "standard",
      old_masked: previous?.masked_account ?? null,
      new_masked: maskedAccount,
      changed_fields: changedFields,
      status: "requested",
      cooling_off_until: highRisk ? coolingOffUntil(nowIso()) : null,
      harmonious_notified_at: nowIso(),
      requested_by: actor.userId,
    })
    .select("*")
    .single();

  await recordEvent({
    offeringId: input.offeringId ?? null,
    instructionId: String(created.id),
    instructionChangeId: String(change.data?.id ?? change.id ?? ""),
    event: "payment_instruction_requested",
    toStatus: "pending_verification",
    detail: { changedFields, highRisk, newMasked: maskedAccount },
    actorUserId: actor.userId,
    actorRole: actor.isStaff ? "harmonious" : "investor",
  });

  // Any pending distribution on the previous destination must be revalidated.
  if (previous) {
    const { data: lines } = await db()
      .from("distribution_lines")
      .select("id, payment_instruction_id, approval_state, payment_state")
      .eq("payment_instruction_id", previous.id);
    const affected = pendingDistributionsNeedingRevalidation(
      ((lines ?? []) as any[]).map((l) => ({
        id: String(l.id),
        paymentInstructionId: l.payment_instruction_id ? String(l.payment_instruction_id) : null,
        approvalState: String(l.approval_state),
        paymentState: String(l.payment_state),
      })),
      String(previous.id),
    );
    for (const lineId of affected) {
      await db()
        .from("distribution_lines")
        .update({ destination_verified: false, approval_state: "revalidation_required" })
        .eq("id", lineId);
      await raiseException({
        distributionLineId: lineId,
        kind: "destination_change_pending",
        detail: "The investor's payment details changed; this distribution needs re-approval.",
        raisedBy: actor.userId,
      });
      await recordEvent({
        distributionLineId: lineId,
        instructionId: String(created.id),
        event: "distribution_revalidation_required",
        reason: "Payment destination changed.",
        actorUserId: actor.userId,
        actorRole: actor.isStaff ? "harmonious" : "investor",
      });
    }
  }

  return {
    instruction: maskedInstruction(created),
    changeId: String((change.data ?? change).id),
    highRisk,
    changedFields,
  };
}

/** Step-up authentication on the change request. */
export async function recordInstructionStepUp(userId: string, changeId: string, method: string) {
  const actor = await actorFor(userId);
  const { data: change } = await db()
    .from("payment_instruction_changes")
    .select("*")
    .eq("id", changeId)
    .maybeSingle();
  if (!change) fail("That change request was not found.");
  if (!actor.isStaff && String(change.investor_user_id) !== actor.userId) {
    forbid("that change request is not yours.");
  }
  await db()
    .from("payment_instruction_changes")
    .update({ stepup_verified_at: nowIso(), stepup_method: method, status: "stepup_verified" })
    .eq("id", changeId);
  await recordEvent({
    instructionChangeId: changeId,
    instructionId: change.instruction_id,
    event: "payment_instruction_stepup",
    toStatus: "stepup_verified",
    detail: { method },
    actorUserId: actor.userId,
    actorRole: actor.isStaff ? "harmonious" : "investor",
  });
  return { ok: true };
}

/** Harmonious records independent verification of the destination. */
export async function verifyPaymentInstruction(
  userId: string,
  input: { changeId: string; method: string; independentNoticeChannel: string },
) {
  const actor = await assertStaff(userId, "review");
  const { data: change } = await db()
    .from("payment_instruction_changes")
    .select("*")
    .eq("id", input.changeId)
    .maybeSingle();
  if (!change) fail("That change request was not found.");
  if (!change.stepup_verified_at) fail("Step-up authentication must be completed first.");

  await db()
    .from("payment_instruction_changes")
    .update({
      status: "verified",
      independent_notice_sent_at: nowIso(),
      independent_notice_channel: input.independentNoticeChannel,
      harmonious_notified_at: change.harmonious_notified_at ?? nowIso(),
    })
    .eq("id", change.id);

  await db()
    .from("investor_payment_instructions")
    .update({
      verification_status: "verified",
      verification_method: input.method,
      verified_by: actor.userId,
      verified_at: nowIso(),
      status: "pending_review",
    })
    .eq("id", change.instruction_id);

  await recordEvent({
    instructionChangeId: change.id,
    instructionId: change.instruction_id,
    event: "payment_instruction_verified",
    toStatus: "verified",
    detail: { method: input.method, channel: input.independentNoticeChannel },
    actorUserId: actor.userId,
    actorRole: "harmonious",
  });
  return { ok: true };
}

/** Harmonious reviews, then a different person approves the new destination. */
export async function reviewPaymentInstruction(userId: string, changeId: string) {
  const actor = await assertStaff(userId, "review");
  const { data: change } = await db()
    .from("payment_instruction_changes")
    .select("*")
    .eq("id", changeId)
    .maybeSingle();
  if (!change) fail("That change request was not found.");
  if (String(change.requested_by ?? "") === actor.userId && change.risk_level === "high") {
    fail("The person who requested this change cannot also review it.");
  }
  await db()
    .from("payment_instruction_changes")
    .update({ status: "harmonious_review", reviewed_by: actor.userId, reviewed_at: nowIso() })
    .eq("id", changeId);
  await recordEvent({
    instructionChangeId: changeId,
    instructionId: change.instruction_id,
    event: "payment_instruction_reviewed",
    toStatus: "harmonious_review",
    actorUserId: actor.userId,
    actorRole: "harmonious",
  });
  return { ok: true };
}

export async function approvePaymentInstruction(
  userId: string,
  input: { changeId: string; waiveCoolingOff?: boolean; waiverReason?: string | null },
) {
  const actor = await assertStaff(userId, "final_approve");
  const { data: change } = await db()
    .from("payment_instruction_changes")
    .select("*")
    .eq("id", input.changeId)
    .maybeSingle();
  if (!change) fail("That change request was not found.");

  const { data: instruction } = await db()
    .from("investor_payment_instructions")
    .select("*")
    .eq("id", change.instruction_id)
    .maybeSingle();
  if (!instruction) fail("That payment destination was not found.");

  const blockers = instructionChangeBlockers({
    stepupVerifiedAt: change.stepup_verified_at ?? null,
    verificationStatus: String(instruction.verification_status ?? "unverified"),
    independentNoticeSentAt: change.independent_notice_sent_at ?? null,
    harmoniousNotifiedAt: change.harmonious_notified_at ?? null,
    reviewedBy: change.reviewed_by ?? null,
    requestedBy: change.requested_by ?? null,
    approverUserId: actor.userId,
  });
  if (blockers.length > 0) fail(blockers.join(" "));

  const transitionError = paymentInstructionTransitionError(
    String(instruction.status) as PaymentInstructionStatus,
    "approved",
  );
  if (transitionError) fail(transitionError);

  if (input.waiveCoolingOff) {
    const check = coolingOffSatisfied({
      coolingOffUntil: instruction.cooling_off_until ?? null,
      nowIso: nowIso(),
      waivedBy: actor.userId,
      waiverReason: input.waiverReason ?? null,
      requestedBy: change.requested_by ?? null,
    });
    if (!check.satisfied) fail(check.reason ?? "The cooling-off period cannot be waived.");
  }

  await db()
    .from("investor_payment_instructions")
    .update({
      status: "approved",
      approved_by: actor.userId,
      approved_at: nowIso(),
      effective_date: today(),
      cooling_off_waived_by: input.waiveCoolingOff ? actor.userId : null,
      cooling_off_waiver_reason: input.waiveCoolingOff ? (input.waiverReason ?? null) : null,
    })
    .eq("id", instruction.id);

  if (instruction.supersedes_id) {
    await db()
      .from("investor_payment_instructions")
      .update({ status: "superseded", superseded_at: nowIso() })
      .eq("id", instruction.supersedes_id);
  }

  await db()
    .from("payment_instruction_changes")
    .update({ status: "approved", approved_by: actor.userId, approved_at: nowIso() })
    .eq("id", change.id);

  await recordEvent({
    instructionChangeId: change.id,
    instructionId: instruction.id,
    event: "payment_instruction_approved",
    toStatus: "approved",
    detail: { waivedCoolingOff: Boolean(input.waiveCoolingOff) },
    actorUserId: actor.userId,
    actorRole: "harmonious",
  });
  return { ok: true };
}

export async function myPaymentInstructions(userId: string) {
  const actor = await actorFor(userId);
  const { data } = await db()
    .from("investor_payment_instructions")
    .select("*")
    .eq("investor_user_id", actor.userId)
    .order("version", { ascending: false });
  return { instructions: ((data ?? []) as any[]).map(maskedInstruction) };
}

// ------------------------------------------------------ economic inputs

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

/** Latest finalized capital account per position — authoritative, not recomputed. */
async function capitalAccountsFor(offeringId: string) {
  const { data } = await db()
    .from("capital_accounts")
    .select("position_id, ending_capital_cents, ownership_pct, period_end, finalized_at, class_id")
    .eq("offering_id", offeringId)
    .order("period_end", { ascending: false });
  const map = new Map<string, any>();
  for (const row of (data ?? []) as any[]) {
    const key = String(row.position_id ?? "");
    if (!key || map.has(key)) continue;
    map.set(key, row);
  }
  return map;
}

/** Cash the fund actually has, from posted ledger lines on the cash account. */
async function availableCashCents(offeringId: string) {
  const { data: book } = await db()
    .from("ledger_books")
    .select("id")
    .eq("offering_id", offeringId)
    .eq("domain", "fund_accounting")
    .maybeSingle();
  if (!book?.id) return 0;
  const { data: account } = await db()
    .from("chart_of_accounts")
    .select("id")
    .eq("book_id", book.id)
    .eq("code", "1000")
    .maybeSingle();
  if (!account?.id) return 0;
  const { data: lines } = await db()
    .from("journal_lines")
    .select("debit_cents, credit_cents, journal_entries!inner(status)")
    .eq("account_id", account.id)
    .eq("journal_entries.status", "posted");
  return ((lines ?? []) as any[]).reduce(
    (sum, l) => sum + Number(l.debit_cents ?? 0) - Number(l.credit_cents ?? 0),
    0,
  );
}

async function taxFactsFor(offeringId: string) {
  const { data } = await db()
    .from("investor_tax_profiles")
    .select("*")
    .order("updated_at", { ascending: false });
  const byKey = new Map<string, any>();
  for (const row of (data ?? []) as any[]) {
    const key = `${row.investor_user_id ?? ""}:${row.investment_profile_id ?? ""}`;
    if (!byKey.has(key)) byKey.set(key, row);
  }
  void offeringId;
  return byKey;
}

export const DEFAULT_WITHHOLDING_RULES: WithholdingRule[] = [
  {
    type: "foreign_person",
    rateBps: 3000,
    reason: "Statutory withholding on a distribution to a documented foreign person.",
  },
  {
    type: "backup",
    rateBps: 2400,
    reason: "Backup withholding applies while the investor's taxpayer information is incomplete.",
  },
];

// -------------------------------------------------------------- batches

/**
 * Propose a distribution. Investor amounts are derived from the fund's
 * approved economics — nobody types them in.
 */
export async function proposeDistribution(
  userId: string,
  input: {
    offeringId: string;
    distributionType: DistributionType;
    declaredAmountCents: number;
    reserveCents?: number;
    title?: string | null;
    purpose?: string | null;
    sourceProceeds?: string | null;
    recordDate?: string | null;
    effectiveDate?: string | null;
    paymentDate?: string | null;
    allocationRunId?: string | null;
    useWaterfall?: boolean;
    withholdingRules?: WithholdingRule[];
    investorConfirmationRequired?: boolean;
  },
) {
  const { actor, role } = await assertCan(userId, input.offeringId, "prepare");

  const [{ data: positions }, capitalAccounts, taxProfiles] = await Promise.all([
    db()
      .from("investor_positions")
      .select("id, investor_user_id, investment_profile_id, display_name, class_id, status, is_gp")
      .eq("offering_id", input.offeringId)
      .eq("status", "active"),
    capitalAccountsFor(input.offeringId),
    taxFactsFor(input.offeringId),
  ]);

  const rows = (positions ?? []) as any[];
  if (rows.length === 0) fail("This fund has no admitted investors to distribute to.");
  const commitments = await commitmentStateFor(rows.map((r) => String(r.id)));

  let waterfall = new Map<string, number>();
  if (input.allocationRunId) {
    const { data: run } = await db()
      .from("allocation_runs")
      .select("id, status, offering_id")
      .eq("id", input.allocationRunId)
      .maybeSingle();
    if (!run) fail("That allocation run was not found.");
    if (String(run.offering_id) !== input.offeringId) fail("That allocation run belongs to another fund.");
    if (!["approved", "finalized"].includes(String(run.status))) {
      fail("A distribution must start from an approved allocation run.");
    }
    const { data: allocLines } = await db()
      .from("allocation_lines")
      .select("position_id, ending_capital_cents, ownership_pct")
      .eq("run_id", input.allocationRunId);
    waterfall = new Map(
      ((allocLines ?? []) as any[]).map((l) => [
        String(l.position_id),
        Number(l.ending_capital_cents ?? 0),
      ]),
    );
  }

  const entitlementInput: EntitlementInput[] = rows.map((r) => {
    const account = capitalAccounts.get(String(r.id));
    const commitment = commitments.get(String(r.id));
    return {
      positionId: String(r.id),
      investorUserId: r.investor_user_id ? String(r.investor_user_id) : null,
      investmentProfileId: r.investment_profile_id ? String(r.investment_profile_id) : null,
      displayName: r.display_name ?? null,
      classId: r.class_id ? String(r.class_id) : null,
      commitmentCents: Number(commitment?.currentCommitmentCents ?? 0),
      contributedCents: Number(commitment?.contributedCents ?? 0),
      capitalAccountCents: Number(account?.ending_capital_cents ?? 0),
      ownershipBps: Math.round(Number(account?.ownership_pct ?? 0) * 100),
      waterfallCents: waterfall.get(String(r.id)) ?? null,
    };
  });

  const entitlement = calculateEntitlements({
    declaredAmountCents: input.declaredAmountCents - Math.max(0, input.reserveCents ?? 0),
    distributionType: input.distributionType,
    lines: entitlementInput,
    useWaterfall: input.useWaterfall === true && waterfall.size > 0,
  });
  if (entitlement.error) fail(entitlement.error);

  const { data: lastBatch } = await db()
    .from("distribution_batches")
    .select("batch_number")
    .eq("offering_id", input.offeringId)
    .order("batch_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const batchNumber = Number(lastBatch?.batch_number ?? 0) + 1;

  const { data: batch, error } = await db()
    .from("distribution_batches")
    .insert({
      offering_id: input.offeringId,
      batch_number: batchNumber,
      version: 1,
      title: input.title ?? `Distribution #${batchNumber}`,
      purpose: input.purpose ?? null,
      distribution_type: input.distributionType,
      allocation_run_id: input.allocationRunId ?? null,
      source_proceeds: input.sourceProceeds ?? null,
      record_date: input.recordDate ?? null,
      effective_date: input.effectiveDate ?? today(),
      payment_date: input.paymentDate ?? null,
      declared_amount_cents: input.declaredAmountCents,
      reserve_cents: Math.max(0, input.reserveCents ?? 0),
      status: "draft",
      prepared_by: actor.userId,
      prepared_at: nowIso(),
      recipient_count: entitlement.lines.length,
    })
    .select("*")
    .single();
  if (error) fail(error.message);

  const rules = input.withholdingRules ?? DEFAULT_WITHHOLDING_RULES;
  const treatment = DISTRIBUTION_TREATMENT[input.distributionType];

  let totalGross = 0;
  let totalWithholding = 0;
  let totalNet = 0;

  for (const line of entitlement.lines) {
    const taxKey = `${line.investorUserId ?? ""}:${line.investmentProfileId ?? ""}`;
    const tax = taxProfiles.get(taxKey);
    const withholding = calculateWithholding({
      grossCents: line.grossCents,
      distributionType: input.distributionType,
      rules,
      tax: {
        documentationForm: tax?.documentation_form ?? null,
        isForeignPerson:
          tax?.tax_residency_country && String(tax.tax_residency_country).toUpperCase() !== "US"
            ? true
            : tax
              ? false
              : null,
        backupWithholdingFlag: tax ? tax.tin_on_file === false : true,
        treatyRateBps: tax?.treaty_rate_bps ?? null,
        stateCode: null,
        tinOnFile: Boolean(tax?.tin_on_file),
      },
    });

    const netCents = line.grossCents - withholding.totalCents;

    const instruction = line.investorUserId
      ? (
          await db()
            .from("investor_payment_instructions")
            .select("*")
            .eq("investor_user_id", line.investorUserId)
            .eq("status", "approved")
            .order("version", { ascending: false })
            .limit(1)
            .maybeSingle()
        ).data
      : null;

    const { data: created } = await db()
      .from("distribution_lines")
      .insert({
        batch_id: batch.id,
        offering_id: input.offeringId,
        position_id: line.positionId,
        investment_profile_id: line.investmentProfileId,
        investor_user_id: line.investorUserId,
        display_name: line.displayName,
        investor_class_id: line.classId,
        distribution_type: input.distributionType,
        entitlement_basis: line.basis,
        entitlement_detail: {
          basis: line.basis,
          ownershipSource: input.allocationRunId ?? "capital_account",
        },
        commitment_cents: line.commitmentCents,
        contributed_cents: line.contributedCents,
        capital_account_cents: line.capitalAccountCents,
        gross_cents: line.grossCents,
        withholding_cents: withholding.totalCents,
        fee_cents: 0,
        net_cents: netCents,
        characterization: {
          character: treatment.defaultCharacter,
          source: "distribution_type_default",
          taxReportable: treatment.taxReportable,
        },
        payment_method: instruction?.method ?? null,
        payment_instruction_id: instruction?.id ?? null,
        payment_instruction_version: instruction?.version ?? null,
        destination_verified: instruction?.verification_status === "verified",
        investor_confirmation_required: Boolean(input.investorConfirmationRequired),
        approval_state: "draft",
        effective_date: input.effectiveDate ?? today(),
      })
      .select("id")
      .single();

    for (const w of withholding.lines) {
      await db().from("distribution_withholdings").insert({
        distribution_line_id: created.id,
        offering_id: input.offeringId,
        withholding_type: w.type,
        jurisdiction: w.jurisdiction,
        basis_cents: w.basisCents,
        rate_bps: w.rateBps,
        amount_cents: w.amountCents,
        tax_profile_id: tax?.id ?? null,
        documentation_form: tax?.documentation_form ?? null,
        determination_reason: w.reason,
        determined_by: actor.userId,
      });
    }

    if (withholding.notes.length > 0) {
      await raiseException({
        offeringId: input.offeringId,
        batchId: String(batch.id),
        distributionLineId: String(created.id),
        kind: "withholding_missing_documentation",
        severity: "warning",
        detail: withholding.notes.join(" "),
        raisedBy: actor.userId,
      });
    }

    totalGross += line.grossCents;
    totalWithholding += withholding.totalCents;
    totalNet += netCents;
  }

  const balance = checkBatchBalance({
    lines: [{ grossCents: totalGross, withholdingCents: totalWithholding, feeCents: 0, netCents: totalNet }],
    declaredAmountCents: input.declaredAmountCents,
    reserveCents: Math.max(0, input.reserveCents ?? 0),
  });

  await db()
    .from("distribution_batches")
    .update({
      total_gross_cents: totalGross,
      total_withholding_cents: totalWithholding,
      total_fee_cents: 0,
      total_net_cents: totalNet,
      balances: balance.balances,
      balance_detail: balance,
    })
    .eq("id", batch.id);

  await recordEvent({
    offeringId: input.offeringId,
    batchId: String(batch.id),
    event: "distribution_prepared",
    toStatus: "draft",
    detail: {
      declaredAmountCents: input.declaredAmountCents,
      totalGross,
      totalWithholding,
      totalNet,
      balances: balance.balances,
      recipients: entitlement.lines.length,
    },
    actorUserId: actor.userId,
    actorRole: role,
  });

  return { batchId: String(batch.id), balance, recipients: entitlement.lines.length };
}

// ------------------------------------------------ D1 compliance evidence

const CLEAR_STATUSES = ["cleared", "clear", "passed", "approved", "verified", "accepted", "received", "valid", "on_file", "reviewed"];
const BLOCKED_STATUSES = ["rejected", "failed", "blocked", "declined", "hit", "confirmed_match"];

function evidenceFrom(status: string | null | undefined): EvidenceState {
  if (!status) return "unknown";
  const v = String(status).toLowerCase();
  if (CLEAR_STATUSES.includes(v)) return "clear";
  if (BLOCKED_STATUSES.includes(v)) return "blocked";
  if (v === "expired") return "expired";
  return "unknown";
}

/**
 * Reads the authoritative identity, AML, sanctions and tax records for one
 * line. Anything that has no authoritative record comes back "unknown", which
 * the gate turns into REVIEW_REQUIRED — never an assumed pass.
 */
async function identityEvidenceForLine(line: any, batch: any) {
  const out = { kyc: "unknown" as EvidenceState, aml: "unknown" as EvidenceState, sanctions: "unknown" as EvidenceState, taxDocument: "missing" as EvidenceState };
  if (line.investor_user_id) {
    const { data: onboarding } = await db()
      .from("investor_onboardings")
      .select("person_id")
      .eq("offering_id", batch.offering_id)
      .eq("investor_user_id", line.investor_user_id)
      .not("person_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (onboarding?.person_id) {
      const { data: checks } = await db()
        .from("identity_check_results")
        .select("check_kind, harmonious_status, evaluated_at")
        .eq("person_id", onboarding.person_id)
        .order("evaluated_at", { ascending: false });
      const latest = (kind: string) => ((checks ?? []) as any[]).find((c) => String(c.check_kind) === kind);
      out.kyc = evidenceFrom(latest("identity")?.harmonious_status);
      out.aml = evidenceFrom(latest("aml")?.harmonious_status);
      // The AML screening is the sanctions-list screening; a sanctions hold overrides it below.
      out.sanctions = out.aml;
    }
  }
  const { data: sanctionHolds } = await db()
    .from("compliance_holds")
    .select("id, kind")
    .eq("status", "active")
    .in("kind", ["sanctions_concern", "aml_concern"])
    .or([`offering_id.eq.${batch.offering_id}`, line.investor_user_id ? `subject_user_id.eq.${line.investor_user_id}` : null].filter(Boolean).join(","));
  for (const h of (sanctionHolds ?? []) as any[]) {
    if (String(h.kind) === "sanctions_concern") out.sanctions = "blocked";
    if (String(h.kind) === "aml_concern") out.aml = "blocked";
  }
  let taxQuery = db().from("investor_tax_profiles").select("documentation_status, documentation_expires_on").order("updated_at", { ascending: false }).limit(1);
  taxQuery = line.investment_profile_id ? taxQuery.eq("investment_profile_id", line.investment_profile_id) : taxQuery.eq("investor_user_id", line.investor_user_id ?? "00000000-0000-0000-0000-000000000000");
  const { data: tax } = await taxQuery.maybeSingle();
  if (tax) {
    if (tax.documentation_expires_on && String(tax.documentation_expires_on) < today()) out.taxDocument = "expired";
    else out.taxDocument = evidenceFrom(tax.documentation_status);
  }
  return out;
}

async function openMaterialAccountingExceptions(offeringId: string) {
  const { count } = await db()
    .from("accounting_exceptions")
    .select("id", { count: "exact", head: true })
    .eq("offering_id", offeringId)
    .eq("is_material", true)
    .neq("status", "resolved");
  return Number(count ?? 0);
}

function economicSnapshotFor(batch: any, lines: any[]): EconomicSnapshot {
  return {
    allocationRunId: batch.allocation_run_id ?? null,
    navVersionId: batch.nav_version_id ?? null,
    distributionType: String(batch.distribution_type ?? "ordinary"),
    calculatedAt: nowIso(),
    lines: lines.map((l) => {
      const isRoc = String(l.distribution_type ?? batch.distribution_type) === "return_of_capital";
      const detail = (l.entitlement_detail ?? {}) as Record<string, any>;
      return {
        lineId: String(l.id),
        investorUserId: l.investor_user_id ?? null,
        investmentProfileId: l.investment_profile_id ?? null,
        positionId: l.position_id ?? null,
        grossCents: Number(l.gross_cents),
        returnOfCapitalCents: isRoc ? Number(l.gross_cents) : (typeof detail['returnOfCapitalCents'] === "number" ? detail['returnOfCapitalCents'] : null),
        incomeGainCents: isRoc ? 0 : (typeof detail['incomeGainCents'] === "number" ? detail['incomeGainCents'] : null),
        withholdingCents: Number(l.withholding_cents),
        feeCents: Number(l.fee_cents ?? 0),
        netCents: Number(l.net_cents),
        capitalAccountSource: l.capital_account_cents != null ? `capital_account_cents:${l.capital_account_cents}` : null,
      };
    }),
  };
}

/** Harmonious tax reviews the withholding used. Hard-coded rules are an aid, not authority. */
export async function reviewDistributionWithholding(userId: string, batchId: string) {
  const batch = await batchRow(batchId);
  const actor = await assertStaff(userId, "review_withholding");
  if (["approved", "executing", "completed", "superseded", "cancelled"].includes(String(batch.status))) {
    fail("Withholding on an approved distribution is frozen.");
  }
  const { data: lines } = await db().from("distribution_lines").select("*").eq("batch_id", batchId);
  const { data: withholdings } = await db()
    .from("distribution_withholdings")
    .select("*")
    .in("distribution_line_id", ((lines ?? []) as any[]).map((l) => l.id));
  const evidence = await Promise.all(((lines ?? []) as any[]).map((l) => identityEvidenceForLine(l, batch)));
  const blockers = withholdingReviewBlockers({
    reviewedBy: actor.userId,
    preparedBy: batch.prepared_by ? String(batch.prepared_by) : null,
    lines: evidence.map((e) => ({ taxDocument: e.taxDocument, taxDocumentRequired: true })),
  });
  if (blockers.length > 0) fail(blockers.join(" "));
  const basis = {
    ruleSource: "default_calculation_aid",
    authoritative: false,
    reviewedAs: "reviewed_input",
    lines: ((lines ?? []) as any[]).map((l) => ({
      lineId: String(l.id),
      withholdingCents: Number(l.withholding_cents),
      detail: ((withholdings ?? []) as any[])
        .filter((w) => String(w.distribution_line_id) === String(l.id))
        .map((w) => ({ type: w.withholding_type, rateBps: w.rate_bps, amountCents: w.amount_cents, basisCents: w.basis_cents, form: w.documentation_form, reason: w.determination_reason })),
    })),
  };
  await db()
    .from("distribution_batches")
    .update({ withholding_basis: basis, withholding_reviewed_by: actor.userId, withholding_reviewed_at: nowIso() })
    .eq("id", batchId);
  await recordEvent({
    offeringId: batch.offering_id,
    batchId,
    event: "distribution_withholding_reviewed",
    detail: basis,
    actorUserId: actor.userId,
    actorRole: "harmonious",
  });
  return { ok: true };
}

async function batchRow(batchId: string) {
  const { data } = await db().from("distribution_batches").select("*").eq("id", batchId).maybeSingle();
  if (!data) fail("That distribution was not found.");
  return data;
}

function approvalChain(batch: any): ApprovalChainEntry[] {
  const chain: ApprovalChainEntry[] = [];
  if (batch.prepared_by) {
    chain.push({ step: "prepared", userId: String(batch.prepared_by), at: batch.prepared_at ?? "" });
  }
  if (batch.requested_by) {
    chain.push({ step: "requested", userId: String(batch.requested_by), at: batch.requested_at ?? "" });
  }
  if (batch.reviewed_by) {
    chain.push({ step: "reviewed", userId: String(batch.reviewed_by), at: batch.reviewed_at ?? "" });
  }
  if (batch.manager_approved_by) {
    chain.push({
      step: "manager_approved",
      userId: String(batch.manager_approved_by),
      at: batch.manager_approved_at ?? "",
    });
  }
  if (batch.final_approved_by) {
    chain.push({
      step: "final_approved",
      userId: String(batch.final_approved_by),
      at: batch.final_approved_at ?? "",
    });
  }
  if (batch.executed_by) {
    chain.push({ step: "executed", userId: String(batch.executed_by), at: batch.executed_at ?? "" });
  }
  return chain;
}

async function moveBatch(
  batch: any,
  to: BatchStatus,
  patch: Record<string, unknown>,
  actorUserId: string,
  actorRole: string,
  event: string,
  reason?: string | null,
) {
  const error = batchTransitionError(String(batch.status) as BatchStatus, to);
  if (error) fail(error);
  await db()
    .from("distribution_batches")
    .update({ status: to, ...patch })
    .eq("id", batch.id);
  await recordEvent({
    offeringId: batch.offering_id,
    batchId: String(batch.id),
    event,
    fromStatus: String(batch.status),
    toStatus: to,
    reason: reason ?? null,
    actorUserId,
    actorRole,
  });
  return { status: to };
}

export async function requestDistribution(userId: string, batchId: string) {
  const batch = await batchRow(batchId);
  const { actor, role } = await assertCan(userId, String(batch.offering_id), "request");
  return moveBatch(
    batch,
    "proposed",
    { requested_by: actor.userId, requested_at: nowIso() },
    actor.userId,
    role,
    "distribution_requested",
  );
}

export async function reviewDistribution(userId: string, batchId: string) {
  const batch = await batchRow(batchId);
  const { actor } = await assertCan(userId, String(batch.offering_id), "review");
  if (!batch.balances) fail("This distribution does not balance to the cent and cannot be reviewed.");
  return moveBatch(
    batch,
    "harmonious_review",
    { reviewed_by: actor.userId, reviewed_at: nowIso() },
    actor.userId,
    "harmonious",
    "distribution_reviewed",
  );
}

export async function managerApproveDistribution(userId: string, batchId: string) {
  const batch = await batchRow(batchId);
  const { actor, role } = await roleForOffering(userId, String(batch.offering_id));
  const verdict = canActOnDistribution(role, "manager_approve");
  if (!verdict.allowed) forbid(verdict.reason ?? "you cannot approve this distribution.");
  if (String(batch.status) === "harmonious_review") {
    await moveBatch(batch, "manager_approval", {}, actor.userId, role, "distribution_sent_to_manager");
    batch.status = "manager_approval";
  }
  if (String(batch.status) !== "manager_approval") {
    fail("This distribution is not waiting on manager approval.");
  }
  await db()
    .from("distribution_batches")
    .update({ manager_approved_by: actor.userId, manager_approved_at: nowIso() })
    .eq("id", batch.id);
  await recordEvent({
    offeringId: batch.offering_id,
    batchId: String(batch.id),
    event: "distribution_manager_approved",
    toStatus: "manager_approval",
    actorUserId: actor.userId,
    actorRole: role,
  });
  return { ok: true };
}

/** The investor confirms their own details where the workflow requires it. */
export async function investorConfirmDistribution(userId: string, lineId: string) {
  const actor = await actorFor(userId);
  const { data: line } = await db().from("distribution_lines").select("*").eq("id", lineId).maybeSingle();
  if (!line) fail("That distribution was not found.");
  if (String(line.investor_user_id ?? "") !== actor.userId) {
    forbid("that distribution belongs to another investor.");
  }
  await db()
    .from("distribution_lines")
    .update({ investor_confirmed_at: nowIso() })
    .eq("id", lineId);
  await recordEvent({
    offeringId: line.offering_id,
    batchId: line.batch_id,
    distributionLineId: lineId,
    event: "distribution_investor_confirmed",
    actorUserId: actor.userId,
    actorRole: "investor",
  });
  return { ok: true, ...selfReportEffect() };
}

/** A documented, approved correction to one investor's economics. */
export async function adjustDistributionLine(
  userId: string,
  input: {
    lineId: string;
    newGrossCents: number;
    reason: string;
    evidencePath: string;
    requestedByUserId: string;
  },
) {
  const actor = await assertStaff(userId, "correct");
  const { data: line } = await db()
    .from("distribution_lines")
    .select("*")
    .eq("id", input.lineId)
    .maybeSingle();
  if (!line) fail("That distribution line was not found.");
  const batch = await batchRow(String(line.batch_id));
  if (["approved", "executing", "completed", "superseded"].includes(String(batch.status))) {
    fail("An approved distribution is immutable; issue a superseding version instead.");
  }

  const error = manualAdjustmentError({
    reason: input.reason,
    evidencePath: input.evidencePath,
    approvedByUserId: actor.userId,
    requestedByUserId: input.requestedByUserId,
  });
  if (error) fail(error);

  const delta = Number(input.newGrossCents) - Number(line.gross_cents);
  await db()
    .from("distribution_lines")
    .update({
      gross_cents: input.newGrossCents,
      net_cents: Number(input.newGrossCents) - Number(line.withholding_cents) - Number(line.fee_cents),
      entitlement_basis: "manual",
      manual_adjustment_cents: delta,
      manual_adjustment_reason: input.reason,
      manual_adjustment_evidence: input.evidencePath,
      manual_adjustment_approved_by: actor.userId,
      manual_adjustment_approved_at: nowIso(),
    })
    .eq("id", input.lineId);

  await refreshBatchTotals(String(line.batch_id));
  await recordEvent({
    offeringId: line.offering_id,
    batchId: line.batch_id,
    distributionLineId: input.lineId,
    event: "distribution_line_adjusted",
    reason: input.reason,
    detail: { deltaCents: delta, evidence: input.evidencePath },
    actorUserId: actor.userId,
    actorRole: "harmonious",
  });
  return { ok: true, deltaCents: delta };
}

async function refreshBatchTotals(batchId: string) {
  const batch = await batchRow(batchId);
  const { data: lines } = await db()
    .from("distribution_lines")
    .select("gross_cents, withholding_cents, fee_cents, net_cents")
    .eq("batch_id", batchId);
  const balance = checkBatchBalance({
    lines: ((lines ?? []) as any[]).map((l) => ({
      grossCents: Number(l.gross_cents),
      withholdingCents: Number(l.withholding_cents),
      feeCents: Number(l.fee_cents),
      netCents: Number(l.net_cents),
    })),
    declaredAmountCents: Number(batch.declared_amount_cents),
    reserveCents: Number(batch.reserve_cents ?? 0),
  });
  await db()
    .from("distribution_batches")
    .update({
      total_gross_cents: balance.totalGrossCents,
      total_withholding_cents: balance.totalWithholdingCents,
      total_fee_cents: balance.totalFeeCents,
      total_net_cents: balance.totalNetCents,
      balances: balance.balances,
      balance_detail: balance,
      recipient_count: (lines ?? []).length,
    })
    .eq("id", batchId);
  return balance;
}

/** Second authorised Harmonious human. This is the gate before any money moves. */
export async function finalApproveDistribution(userId: string, batchId: string) {
  const batch = await batchRow(batchId);
  const { actor } = await assertCan(userId, String(batch.offering_id), "final_approve");

  const balance = await refreshBatchTotals(batchId);
  if (!balance.balances) {
    fail(`This distribution does not balance: ${balance.problems.join(" ")}`);
  }

  const chainError = makerCheckerError(approvalChain(batch), {
    step: "final_approved",
    actor: { userId: actor.userId, role: "harmonious" },
  });
  if (chainError) fail(chainError);

  // D1: withholding must be a reviewed input, and identity/tax evidence must be current.
  if (!batch.withholding_reviewed_by) fail("Withholding has not been reviewed by Harmonious tax.");
  const { data: approvalLines } = await db().from("distribution_lines").select("*").eq("batch_id", batch.id);
  const identityBlockers: string[] = [];
  for (const l of (approvalLines ?? []) as any[]) {
    const ev = await identityEvidenceForLine(l, batch);
    const gate = complianceGateBlockers({
      ...ev,
      taxDocumentRequired: true,
      destinationVerified: true,
      coolingOffSatisfied: true,
      openAccountingExceptions: 0,
      availableCashCents: Number.MAX_SAFE_INTEGER,
      netPaymentCents: 0,
      batchBalances: true,
      withholdingReviewed: true,
    });
    for (const g of gate) identityBlockers.push(`${l.display_name ?? "Investor"}: ${g.reason}`);
  }
  if (identityBlockers.length > 0) fail(identityBlockers.join(" "));

  const snapshot = economicSnapshotFor(batch, (approvalLines ?? []) as any[]);
  const frozenHash = snapshotHash(snapshot);

  if (String(batch.status) !== "final_approval") {
    const move = batchTransitionError(String(batch.status) as BatchStatus, "final_approval");
    if (move) fail(move);
    await db().from("distribution_batches").update({ status: "final_approval" }).eq("id", batch.id);
    batch.status = "final_approval";
  }

  await db()
    .from("distribution_batches")
    .update({
      status: "approved",
      final_approved_by: actor.userId,
      final_approved_at: nowIso(),
      economic_snapshot: batch.economic_snapshot_hash ? batch.economic_snapshot : snapshot,
      economic_snapshot_hash: batch.economic_snapshot_hash ?? frozenHash,
      economic_snapshot_at: batch.economic_snapshot_at ?? nowIso(),
    })
    .eq("id", batch.id);
  await db()
    .from("distribution_lines")
    .update({ approval_state: "approved", payment_state: "ready" })
    .eq("batch_id", batch.id);

  await recordEvent({
    offeringId: batch.offering_id,
    batchId: String(batch.id),
    event: "distribution_final_approved",
    fromStatus: String(batch.status),
    toStatus: "approved",
    detail: { economicSnapshotHash: batch.economic_snapshot_hash ?? frozenHash },
    actorUserId: actor.userId,
    actorRole: "harmonious",
  });
  return { status: "approved" };
}

export async function supersedeDistribution(userId: string, batchId: string, reason: string) {
  const batch = await batchRow(batchId);
  await assertCan(userId, String(batch.offering_id), "correct");
  const actor = await assertStaff(userId, "correct");
  if (!reason || reason.trim().length < 8) fail("A correction needs a written reason.");

  const { data: created, error } = await db()
    .from("distribution_batches")
    .insert({
      offering_id: batch.offering_id,
      batch_number: batch.batch_number,
      version: Number(batch.version) + 1,
      supersedes_id: batch.id,
      title: batch.title,
      purpose: batch.purpose,
      distribution_type: batch.distribution_type,
      allocation_run_id: batch.allocation_run_id,
      source_proceeds: batch.source_proceeds,
      record_date: batch.record_date,
      effective_date: batch.effective_date,
      declared_amount_cents: batch.declared_amount_cents,
      reserve_cents: batch.reserve_cents,
      status: "draft",
      prepared_by: actor.userId,
      prepared_at: nowIso(),
    })
    .select("id")
    .single();
  if (error) fail(error.message);

  await db()
    .from("distribution_batches")
    .update({ status: "superseded", superseded_at: nowIso() })
    .eq("id", batch.id);

  await recordEvent({
    offeringId: batch.offering_id,
    batchId: String(batch.id),
    event: "distribution_superseded",
    fromStatus: String(batch.status),
    toStatus: "superseded",
    reason,
    detail: { replacementBatchId: String(created.id) },
    actorUserId: actor.userId,
    actorRole: "harmonious",
  });
  return { supersededBy: String(created.id) };
}

export async function cancelDistribution(userId: string, batchId: string, reason: string) {
  const batch = await batchRow(batchId);
  const { actor } = await assertCan(userId, String(batch.offering_id), "cancel");
  if (!reason || reason.trim().length < 4) fail("Cancelling a distribution needs a reason.");
  return moveBatch(
    batch,
    "cancelled",
    { cancelled_at: nowIso(), cancel_reason: reason },
    actor.userId,
    "harmonious",
    "distribution_cancelled",
    reason,
  );
}

// ------------------------------------------------------------- execution

async function executionFactsForLine(line: any, batch: any) {
  const instruction = line.payment_instruction_id
    ? (
        await db()
          .from("investor_payment_instructions")
          .select("*")
          .eq("id", line.payment_instruction_id)
          .maybeSingle()
      ).data
    : null;

  const { data: holds } = await db()
    .from("compliance_holds")
    .select("scope, reason")
    .eq("status", "active")
    .in("scope", ["distributions", "account_activity", "service_delivery"])
    .or(
      [
        `offering_id.eq.${batch.offering_id}`,
        line.investor_user_id ? `subject_user_id.eq.${line.investor_user_id}` : null,
      ]
        .filter(Boolean)
        .join(","),
    );

  const { data: withholdings } = await db()
    .from("distribution_withholdings")
    .select("id")
    .eq("distribution_line_id", line.id);

  const cash = await availableCashCents(String(batch.offering_id));

  return {
    instruction,
    facts: {
      batchStatus: String(batch.status) as BatchStatus,
      batchBalances: Boolean(batch.balances),
      economicAllocationApproved: line.entitlement_basis !== "manual" || Boolean(line.manual_adjustment_approved_by),
      managerApprovalRequired: true,
      managerApprovedBy: batch.manager_approved_by ? String(batch.manager_approved_by) : null,
      finalApprovedBy: batch.final_approved_by ? String(batch.final_approved_by) : null,
      investorConfirmationRequired: Boolean(line.investor_confirmation_required),
      investorConfirmedAt: line.investor_confirmed_at ?? null,
      destinationStatus: (instruction?.status ?? null) as PaymentInstructionStatus | null,
      destinationVerified: instruction?.verification_status === "verified",
      destinationCoolingOffUntil: instruction?.cooling_off_until ?? null,
      destinationWaivedBy: instruction?.cooling_off_waived_by ?? null,
      destinationWaiverReason: instruction?.cooling_off_waiver_reason ?? null,
      destinationRequestedBy: instruction?.created_by ?? null,
      withholdingCalculated:
        Number(line.withholding_cents) === 0 || (withholdings ?? []).length > 0,
      availableCashCents: cash,
      netPaymentCents: Number(line.net_cents),
      activeHolds: ((holds ?? []) as any[]).map((h) => String(h.reason ?? h.scope)),
      nowIso: nowIso(),
    },
  };
}

/** Read-only: exactly why a payment can or cannot be sent. */
export async function distributionExecutionCheck(userId: string, lineId: string) {
  await assertStaff(userId);
  const { data: line } = await db().from("distribution_lines").select("*").eq("id", lineId).maybeSingle();
  if (!line) fail("That distribution line was not found.");
  const batch = await batchRow(String(line.batch_id));
  const { facts, instruction } = await executionFactsForLine(line, batch);
  return {
    blockers: executionBlockers(facts),
    destination: maskedInstruction(instruction),
    netCents: Number(line.net_cents),
  };
}

/**
 * Transmit one approved payment. Uses the exact approved record: the amount
 * and destination are read from the frozen line, never from the caller.
 */
export async function executeDistributionPayment(
  userId: string,
  input: { lineId: string; provider?: string; providerPaymentId?: string | null; externalReference?: string | null },
) {
  // D1: this records a bank transfer a person already initiated outside the
  // application. The application never sends money.
  if (input.provider && input.provider !== "manual_bank") {
    fail("Only a manually initiated bank transfer can be recorded. No payment provider is connected.");
  }
  const externalReference = (input.externalReference ?? input.providerPaymentId ?? "").trim();
  if (externalReference.length < 3) {
    fail("Enter the bank's reference for the transfer you initiated outside Harmonious.");
  }
  const { data: line } = await db()
    .from("distribution_lines")
    .select("*")
    .eq("id", input.lineId)
    .maybeSingle();
  if (!line) fail("That distribution line was not found.");
  const batch = await batchRow(String(line.batch_id));
  const { actor } = await assertCan(userId, String(batch.offering_id), "execute");

  await assertNoHold(db(), "distributions", {
    offeringId: String(batch.offering_id),
    userId: line.investor_user_id ? String(line.investor_user_id) : null,
  });

  const { facts, instruction } = await executionFactsForLine(line, batch);
  const blockers = executionBlockers(facts);
  const ev = await identityEvidenceForLine(line, batch);
  const gate = complianceGateBlockers({
    ...ev,
    taxDocumentRequired: true,
    destinationVerified: facts.destinationVerified,
    coolingOffSatisfied: !blockers.some((b) => /cooling/i.test(b)),
    openAccountingExceptions: await openMaterialAccountingExceptions(String(batch.offering_id)),
    availableCashCents: facts.availableCashCents,
    netPaymentCents: facts.netPaymentCents,
    batchBalances: facts.batchBalances,
    withholdingReviewed: Boolean(batch.withholding_reviewed_by),
  });
  for (const g of gate) if (!blockers.includes(g.reason)) blockers.push(g.reason);
  if (!batch.economic_snapshot_hash) blockers.push("The economic calculation was not frozen at approval.");
  if (
    instruction &&
    line.payment_instruction_version != null &&
    Number(instruction.version) !== Number(line.payment_instruction_version)
  ) {
    blockers.push("The destination changed after approval; the approval must be renewed.");
  }
  if (blockers.length > 0) {
    await raiseException({
      offeringId: batch.offering_id,
      batchId: String(batch.id),
      distributionLineId: String(line.id),
      kind: "destination_unverified",
      detail: blockers.join(" "),
      raisedBy: actor.userId,
    });
    fail(blockers.join(" "));
  }

  const chain = approvalChain(batch);
  const chainError = makerCheckerError(chain, {
    step: "executed",
    actor: { userId: actor.userId, role: "harmonious" },
  });
  if (chainError) fail(chainError);

  const transitionError = paymentTransitionError(String(line.payment_state) as any, "submitted");
  if (transitionError) fail(transitionError);

  const { data: attempts } = await db()
    .from("distribution_payments")
    .select("id, attempt, status")
    .eq("distribution_line_id", line.id)
    .order("attempt", { ascending: false });
  const live = ((attempts ?? []) as any[]).find((a) =>
    ["submitted", "confirmed"].includes(String(a.status)),
  );
  if (live) fail("This distribution already has a live payment; it cannot be sent twice.");
  const attempt = Number((attempts ?? [])[0]?.attempt ?? 0) + 1;

  const submittedDestination = instruction
    ? {
        method: instruction.method,
        beneficiaryName: instruction.beneficiary_name,
        bankName: instruction.bank_name,
        maskedAccount: instruction.masked_account,
        fingerprint: instruction.fingerprint,
      }
    : {};

  const { data: payment, error } = await db()
    .from("distribution_payments")
    .insert({
      distribution_line_id: line.id,
      batch_id: batch.id,
      offering_id: batch.offering_id,
      attempt,
      provider: "manual_bank",
      provider_payment_id: input.providerPaymentId ?? null,
      external_reference: externalReference,
      recorded_as: "external_bank_action",
      idempotency_key: `distribution:${line.id}:${attempt}`,
      payment_instruction_id: instruction?.id ?? null,
      payment_instruction_version: instruction?.version ?? null,
      submitted_amount_cents: Number(line.net_cents),
      submitted_currency: String(line.currency ?? "USD"),
      submitted_destination: submittedDestination,
      submitted_destination_masked: instruction?.masked_account ?? null,
      approval_chain: [...chain, { step: "executed", userId: actor.userId, at: nowIso() }],
      status: "submitted",
      submitted_by: actor.userId,
    })
    .select("*")
    .single();
  if (error) fail(error.message);

  await db()
    .from("distribution_lines")
    .update({ payment_state: "submitted" })
    .eq("id", line.id);
  if (String(batch.status) === "approved") {
    await db()
      .from("distribution_batches")
      .update({ status: "executing", executed_by: actor.userId, executed_at: nowIso(), payment_status: "submitted" })
      .eq("id", batch.id);
  }

  await recordEvent({
    offeringId: batch.offering_id,
    batchId: String(batch.id),
    distributionLineId: String(line.id),
    paymentId: String(payment.id),
    instructionId: instruction?.id ?? null,
    event: "distribution_external_transfer_recorded",
    toStatus: "submitted",
    detail: {
      amountCents: Number(line.net_cents),
      destinationMasked: instruction?.masked_account ?? null,
      provider: payment.provider,
      attempt,
    },
    actorUserId: actor.userId,
    actorRole: "harmonious",
  });

  return { paymentId: String(payment.id), attempt, amountCents: Number(line.net_cents) };
}

// -------------------------------------------------- provider confirmation

/**
 * Intake a provider or bank event. Replays are ignored, mismatches become
 * exceptions, and nothing here changes the intended amount or destination.
 */
export async function recordProviderEvent(input: {
  provider: string;
  providerEventId: string;
  providerPaymentId?: string | null;
  paymentId?: string | null;
  eventType: string;
  reportedAmountCents?: number | null;
  reportedCurrency?: string | null;
  reportedDestinationMasked?: string | null;
  reportedDirection?: string | null;
  payload?: Record<string, unknown>;
  actorUserId?: string | null;
}) {
  const { data: existing } = await db()
    .from("distribution_provider_events")
    .select("id, correlation_status")
    .eq("provider", input.provider)
    .eq("provider_event_id", input.providerEventId)
    .maybeSingle();
  if (existing) {
    return { duplicate: true, eventId: String(existing.id), status: String(existing.correlation_status) };
  }

  let payment: any = null;
  if (input.paymentId) {
    payment = (await db().from("distribution_payments").select("*").eq("id", input.paymentId).maybeSingle())
      .data;
  } else if (input.providerPaymentId) {
    payment = (
      await db()
        .from("distribution_payments")
        .select("*")
        .eq("provider", input.provider)
        .eq("provider_payment_id", input.providerPaymentId)
        .maybeSingle()
    ).data;
  }

  const correlation = payment
    ? correlateProviderEvent(
        {
          providerPaymentId: input.providerPaymentId ?? null,
          reportedAmountCents: input.reportedAmountCents ?? null,
          reportedCurrency: input.reportedCurrency ?? null,
          reportedDestinationMasked: input.reportedDestinationMasked ?? null,
          reportedDirection: input.reportedDirection ?? null,
          eventType: input.eventType,
        },
        {
          providerPaymentId: payment.provider_payment_id ?? input.providerPaymentId ?? null,
          submittedAmountCents: Number(payment.submitted_amount_cents),
          submittedCurrency: String(payment.submitted_currency ?? "USD"),
          submittedDestinationMasked: payment.submitted_destination_masked ?? null,
          offeringId: String(payment.offering_id),
        },
      )
    : { status: "unknown" as const, mismatches: ["No matching outbound payment."] };

  const { data: event } = await db()
    .from("distribution_provider_events")
    .insert({
      payment_id: payment?.id ?? null,
      provider: input.provider,
      provider_event_id: input.providerEventId,
      provider_payment_id: input.providerPaymentId ?? null,
      event_type: input.eventType,
      reported_amount_cents: input.reportedAmountCents ?? null,
      reported_currency: input.reportedCurrency ?? null,
      reported_destination_masked: input.reportedDestinationMasked ?? null,
      reported_direction: input.reportedDirection ?? null,
      payload: input.payload ?? {},
      correlation_status: correlation.status,
      correlation_detail: { mismatches: correlation.mismatches },
    })
    .select("*")
    .single();

  const actorUserId = input.actorUserId ?? null;

  if (!payment || correlation.status === "mismatch" || correlation.status === "unknown") {
    await raiseException({
      offeringId: payment?.offering_id ?? null,
      paymentId: payment?.id ?? null,
      providerEventId: String(event.id),
      distributionLineId: payment?.distribution_line_id ?? null,
      kind:
        correlation.mismatches.some((m) => m.includes("destination"))
          ? "provider_destination_mismatch"
          : correlation.mismatches.some((m) => m.includes("amount"))
            ? "provider_amount_mismatch"
            : "provider_unknown_event",
      detail: correlation.mismatches.join(" ") || "Unrecognised provider event.",
      raisedBy: actorUserId ?? "00000000-0000-0000-0000-000000000000",
    });
    return { duplicate: false, eventId: String(event.id), status: correlation.status, applied: false };
  }

  if (correlation.status === "confirmed") {
    await db()
      .from("distribution_payments")
      .update({ status: "confirmed", confirmed_at: nowIso() })
      .eq("id", payment.id);
    await db()
      .from("distribution_lines")
      .update({ payment_state: "confirmed", reconciliation_state: "pending" })
      .eq("id", payment.distribution_line_id);
  } else {
    const to = correlation.status === "returned" ? "returned" : "failed";
    await db()
      .from("distribution_payments")
      .update({ status: to, failed_at: nowIso(), failure_reason: input.eventType })
      .eq("id", payment.id);
    await db().from("distribution_lines").update({ payment_state: to }).eq("id", payment.distribution_line_id);
    await raiseException({
      offeringId: payment.offering_id,
      paymentId: String(payment.id),
      distributionLineId: payment.distribution_line_id,
      providerEventId: String(event.id),
      kind: to === "returned" ? "payment_returned" : "payment_failed",
      detail: `The provider reported ${input.eventType}. The original payment record is preserved.`,
      raisedBy: actorUserId ?? "00000000-0000-0000-0000-000000000000",
    });
  }

  await recordEvent({
    offeringId: payment.offering_id,
    batchId: payment.batch_id,
    distributionLineId: payment.distribution_line_id,
    paymentId: String(payment.id),
    providerEventId: String(event.id),
    event: `provider_${correlation.status}`,
    toStatus: correlation.status,
    detail: { eventType: input.eventType, mismatches: correlation.mismatches },
    actorUserId: actorUserId ?? "00000000-0000-0000-0000-000000000000",
    actorRole: "provider",
  });

  return { duplicate: false, eventId: String(event.id), status: correlation.status, applied: true };
}

// ----------------------------------------------------------- reconciliation

/**
 * Step 1 of outbound reconciliation (the reconciler). Evaluates the selected
 * bank transaction against every plausible candidate using independent
 * authoritative fields; amount alone never matches. Nothing is approved here.
 */
export async function reconcileDistributionPayment(
  userId: string,
  input: { paymentId: string; bankTransactionId: string },
) {
  const actor = await assertStaff(userId, "reconcile");
  const { data: payment } = await db()
    .from("distribution_payments")
    .select("*")
    .eq("id", input.paymentId)
    .maybeSingle();
  if (!payment) fail("That payment was not found.");
  if (!["submitted", "confirmed"].includes(String(payment.status))) {
    fail("Only a recorded or bank-confirmed payment can be reconciled.");
  }
  if (payment.reconciliation_id) fail("This payment already has a reconciliation.");

  const chainError = makerCheckerError(paymentChain(payment), {
    step: "reconciled",
    actor: { userId: actor.userId, role: "harmonious" },
  });
  if (chainError) fail(chainError);

  const { data: selected } = await db()
    .from("bank_transactions")
    .select("*")
    .eq("id", input.bankTransactionId)
    .maybeSingle();
  if (!selected) fail("That bank transaction was not found.");

  const { data: batch } = await db()
    .from("distribution_batches")
    .select("source_bank_account_id")
    .eq("id", payment.batch_id)
    .maybeSingle();
  const { data: others } = await db()
    .from("bank_transactions")
    .select("*")
    .eq("offering_id", payment.offering_id)
    .in("amount_cents", [Number(payment.submitted_amount_cents), -Number(payment.submitted_amount_cents)])
    .limit(50);
  const { data: taken } = await db()
    .from("distribution_payments")
    .select("bank_transaction_id")
    .not("bank_transaction_id", "is", null)
    .neq("id", payment.id);
  const takenIds = new Set(((taken ?? []) as any[]).map((t) => String(t.bank_transaction_id)));

  const toCandidate = (t: any): BankCandidate => ({
    id: String(t.id),
    offeringId: t.offering_id ?? null,
    bankAccountId: t.bank_account_id ?? null,
    amountCents: Number(t.amount_cents),
    direction: t.direction ?? null,
    currency: t.currency ?? null,
    counterpartyFingerprint: t.counterparty_fingerprint ?? null,
    reference: t.reference ?? t.name ?? t.description ?? null,
    postedOn: t.posted_on ?? null,
    alreadyMatched:
      takenIds.has(String(t.id)) ||
      Boolean(t.matched_application_id || t.matched_invoice_id || t.matched_wire_request_id),
  });
  const pool = new Map<string, BankCandidate>();
  for (const t of (others ?? []) as any[]) pool.set(String(t.id), toCandidate(t));
  pool.set(String(selected.id), toCandidate(selected));

  const result = matchOutbound(
    {
      offeringId: String(payment.offering_id),
      sourceBankAccountId: batch?.source_bank_account_id ?? null,
      amountCents: Number(payment.submitted_amount_cents),
      currency: String(payment.submitted_currency ?? "USD"),
      destinationFingerprint: (payment.submitted_destination ?? {})['fingerprint'] ?? null,
      providerReference: payment.external_reference ?? payment.provider_payment_id ?? null,
      recordedAtIso: String(payment.submitted_at ?? payment.created_at ?? nowIso()),
    },
    String(selected.id),
    [...pool.values()],
  );

  await db()
    .from("distribution_payments")
    .update({ match_outcome: result.outcome, match_evidence: result.evidence })
    .eq("id", payment.id);

  if (!matchAdvancesSettlement(result.outcome)) {
    await raiseException({
      offeringId: payment.offering_id,
      paymentId: String(payment.id),
      distributionLineId: payment.distribution_line_id,
      kind: "reconciliation_unmatched",
      detail: `${result.outcome}: ${result.reason}`,
      raisedBy: actor.userId,
    });
    await recordEvent({
      offeringId: payment.offering_id,
      batchId: payment.batch_id,
      distributionLineId: payment.distribution_line_id,
      paymentId: String(payment.id),
      bankTransactionId: String(selected.id),
      event: "distribution_match_rejected",
      detail: { outcome: result.outcome, reason: result.reason, evidence: result.evidence },
      actorUserId: actor.userId,
      actorRole: "harmonious",
    });
    fail(`This bank transaction cannot be matched (${result.outcome}): ${result.reason}`);
  }

  const { data: line } = await db()
    .from("distribution_lines")
    .select("*")
    .eq("id", payment.distribution_line_id)
    .maybeSingle();
  const book = await ledgerBookForOffering(actor.userId, String(payment.offering_id));
  const { data: accounts } = await db()
    .from("chart_of_accounts")
    .select("id, code")
    .eq("book_id", book.id)
    .in("code", ["1000", "3200"]);
  const byCode = new Map(((accounts ?? []) as any[]).map((a) => [String(a.code), a.id]));
  const cash = byCode.get("1000");
  const distributions = byCode.get("3200");
  if (!cash || !distributions) {
    fail("This fund's chart of accounts is missing the cash or distribution account.");
  }

  const { data: rec, error } = await db()
    .from("bank_reconciliations")
    .upsert(
      {
        bank_transaction_id: String(selected.id),
        offering_id: payment.offering_id,
        book_id: book.id,
        status: "harmonious_reviewed",
        transaction_type: "distribution",
        confidence: result.outcome === "EXACT" ? "high" : "medium",
        investor_user_id: line?.investor_user_id ?? null,
        investment_profile_id: line?.investment_profile_id ?? null,
        suggested_debit_account_id: distributions,
        suggested_credit_account_id: cash,
        classified_at: nowIso(),
        reconciled_by: actor.userId,
        reconciled_at: nowIso(),
        updated_at: nowIso(),
      },
      { onConflict: "bank_transaction_id" },
    )
    .select("*")
    .single();
  if (error) fail(error.message);

  await db()
    .from("distribution_payments")
    .update({
      bank_transaction_id: String(selected.id),
      reconciliation_id: rec.id,
      reconciled_by: actor.userId,
      reconciled_at: nowIso(),
    })
    .eq("id", payment.id);
  await db()
    .from("distribution_lines")
    .update({ reconciliation_state: "pending_approval" })
    .eq("id", payment.distribution_line_id);

  await recordEvent({
    offeringId: payment.offering_id,
    batchId: payment.batch_id,
    distributionLineId: payment.distribution_line_id,
    paymentId: String(payment.id),
    bankTransactionId: String(selected.id),
    reconciliationId: String(rec.id),
    event: "distribution_reconciliation_prepared",
    toStatus: "pending_approval",
    detail: { outcome: result.outcome, reason: result.reason, evidence: result.evidence },
    actorUserId: actor.userId,
    actorRole: "harmonious",
  });
  return { reconciliationId: String(rec.id), outcome: result.outcome, evidence: result.evidence };
}

/** Step 2 (a different person): approve the reconciliation and prepare the journal. */
export async function approveDistributionReconciliation(userId: string, paymentId: string) {
  const actor = await assertStaff(userId, "approve_reconciliation");
  const { data: payment } = await db()
    .from("distribution_payments")
    .select("*")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment) fail("That payment was not found.");
  if (!payment.reconciliation_id) fail("This payment has not been reconciled.");
  if (payment.reconciliation_approved_by) fail("This reconciliation is already approved.");
  if (!matchAdvancesSettlement(String(payment.match_outcome ?? "UNMATCHED") as any)) {
    fail("Only an EXACT or STRONG match can be approved.");
  }
  const chainError = makerCheckerError(paymentChain(payment), {
    step: "reconciliation_approved",
    actor: { userId: actor.userId, role: "harmonious" },
  });
  if (chainError) fail(chainError);

  await db()
    .from("bank_reconciliations")
    .update({
      status: "reconciled",
      approved_by_harmonious: actor.userId,
      harmonious_approved_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq("id", payment.reconciliation_id);
  const journal = await prepareReconciliationJournal(actor.userId, String(payment.reconciliation_id));

  await db()
    .from("distribution_payments")
    .update({
      reconciliation_approved_by: actor.userId,
      reconciliation_approved_at: nowIso(),
      journal_entry_id: journal.entryId,
    })
    .eq("id", payment.id);
  await db()
    .from("distribution_lines")
    .update({ reconciliation_state: "reconciled", accounting_state: "prepared" })
    .eq("id", payment.distribution_line_id);

  await recordEvent({
    offeringId: payment.offering_id,
    batchId: payment.batch_id,
    distributionLineId: payment.distribution_line_id,
    paymentId: String(payment.id),
    bankTransactionId: payment.bank_transaction_id,
    reconciliationId: String(payment.reconciliation_id),
    journalEntryId: journal.entryId,
    event: "distribution_reconciled",
    toStatus: "reconciled",
    actorUserId: actor.userId,
    actorRole: "harmonious",
  });
  return { reconciliationId: String(payment.reconciliation_id), journalEntryId: journal.entryId };
}

function paymentChain(payment: any): ApprovalChainEntry[] {
  const chain: ApprovalChainEntry[] = Array.isArray(payment.approval_chain)
    ? (payment.approval_chain as ApprovalChainEntry[])
    : [];
  const extra: ApprovalChainEntry[] = [];
  if (payment.submitted_by && !chain.some((c) => c.step === "executed")) {
    extra.push({ step: "executed", userId: String(payment.submitted_by), at: payment.submitted_at ?? "" });
  }
  if (payment.reconciled_by) extra.push({ step: "reconciled", userId: String(payment.reconciled_by), at: payment.reconciled_at ?? "" });
  if (payment.reconciliation_approved_by) {
    extra.push({ step: "reconciliation_approved", userId: String(payment.reconciliation_approved_by), at: payment.reconciliation_approved_at ?? "" });
  }
  if (payment.posted_by) extra.push({ step: "posted", userId: String(payment.posted_by), at: payment.posted_at ?? "" });
  if (payment.reversal_requested_by) {
    extra.push({ step: "reversal_requested", userId: String(payment.reversal_requested_by), at: payment.reversal_requested_at ?? "" });
  }
  return [...chain, ...extra];
}

/**
 * Accounting approval and posting. Only once the journal is POSTED does the
 * distribution reach the commitment ledger and the investor's capital account.
 */
export async function postDistributionPayment(userId: string, paymentId: string) {
  const actor = await assertStaff(userId, "post");
  const { data: payment } = await db()
    .from("distribution_payments")
    .select("*")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment) fail("That payment was not found.");
  if (!payment.reconciliation_id) fail("This payment has not been reconciled.");
  if (payment.posted_at) fail("This payment is already posted.");
  const postError = makerCheckerError(paymentChain(payment), {
    step: "posted",
    actor: { userId: actor.userId, role: "harmonious" },
  });
  if (postError) fail(postError);

  await advanceReconciliationJournal(actor.userId, String(payment.reconciliation_id), "reviewed");
  await advanceReconciliationJournal(actor.userId, String(payment.reconciliation_id), "approved");
  await advanceReconciliationJournal(actor.userId, String(payment.reconciliation_id), "posted");

  const { data: line } = await db()
    .from("distribution_lines")
    .select("*")
    .eq("id", payment.distribution_line_id)
    .maybeSingle();

  const effect = capitalAccountEffect({
    paymentStatus: "confirmed",
    reconciled: true,
    journalPosted: true,
    netCents: Number(payment.submitted_amount_cents),
    grossCents: Number(line?.gross_cents ?? payment.submitted_amount_cents),
    distributionType: String(line?.distribution_type ?? "ordinary") as DistributionType,
  });

  let commitmentEventId: string | null = null;
  if (effect.applies && line?.position_id) {
    const eventType =
      String(line.distribution_type) === "return_of_capital" ? "return_of_capital" : "distribution";
    const { data: event } = await db()
      .from("commitment_events")
      .insert({
        position_id: line.position_id,
        offering_id: payment.offering_id,
        event_type: eventType,
        amount_cents: effect.reduceCapitalCents,
        effective_date: line.effective_date ?? today(),
        source: "distribution_payment",
        source_ref: String(payment.id),
        journal_entry_id: payment.journal_entry_id,
        dedupe_key: `distribution_payment:${payment.id}`,
        recorded_by: actor.userId,
      })
      .select("id")
      .maybeSingle();
    commitmentEventId = event?.id ? String(event.id) : null;
  }

  await db()
    .from("distribution_payments")
    .update({ posted_at: nowIso(), posted_by: actor.userId, commitment_event_id: commitmentEventId })
    .eq("id", payment.id);
  // Settlement: only now — bank transaction, approved reconciliation, posted journal.
  // The database refuses settled_at unless the journal is actually posted.
  await db().from("distribution_payments").update({ settled_at: nowIso() }).eq("id", payment.id);
  // Compatibility read projection consumed by capital statements and reports.
  await db().from("fund_distributions").insert({
    offering_id: payment.offering_id,
    paid_on: today(),
    amount_cents: Number(line?.gross_cents ?? payment.submitted_amount_cents),
    kind: String(line?.distribution_type) === "return_of_capital" ? "return_of_capital" : "distribution",
    note: `Distribution payment ${payment.id}`,
    created_by: actor.userId,
    distribution_payment_id: payment.id,
  });
  await db()
    .from("distribution_lines")
    .update({ accounting_state: "posted" })
    .eq("id", payment.distribution_line_id);

  const { data: siblings } = await db()
    .from("distribution_lines")
    .select("accounting_state")
    .eq("batch_id", payment.batch_id);
  if (((siblings ?? []) as any[]).every((s) => String(s.accounting_state) === "posted")) {
    await db()
      .from("distribution_batches")
      .update({ status: "completed", payment_status: "confirmed", completed_at: nowIso() })
      .eq("id", payment.batch_id);
  }

  await recordEvent({
    offeringId: payment.offering_id,
    batchId: payment.batch_id,
    distributionLineId: payment.distribution_line_id,
    paymentId: String(payment.id),
    journalEntryId: payment.journal_entry_id,
    event: "distribution_posted",
    toStatus: "posted",
    detail: { reduceCapitalCents: effect.reduceCapitalCents },
    actorUserId: actor.userId,
    actorRole: "harmonious",
  });
  return { posted: true, commitmentEventId, reduceCapitalCents: effect.reduceCapitalCents };
}

/** Step 1 of a reversal: a requester records why, against the original references. */
export async function reverseDistributionPayment(userId: string, paymentId: string, reason: string) {
  const actor = await assertStaff(userId, "request_reversal");
  const { data: payment } = await db()
    .from("distribution_payments")
    .select("*")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment) fail("That payment was not found.");
  if (payment.reversal_requested_by) fail("A reversal has already been requested for this payment.");
  const error = reversalRequestError({
    reason,
    originalPaymentId: payment.id,
    originalJournalEntryId: payment.journal_entry_id,
    paymentStatus: String(payment.status),
    reconciled: Boolean(payment.reconciliation_approved_by),
  });
  if (error) fail(error);

  await db()
    .from("distribution_payments")
    .update({ reversal_requested_by: actor.userId, reversal_requested_at: nowIso(), reversal_reason: reason.trim() })
    .eq("id", payment.id);
  await recordEvent({
    offeringId: payment.offering_id,
    batchId: payment.batch_id,
    distributionLineId: payment.distribution_line_id,
    paymentId: String(payment.id),
    journalEntryId: payment.journal_entry_id ?? null,
    reconciliationId: payment.reconciliation_id ?? null,
    event: "distribution_reversal_requested",
    reason,
    detail: { originalPaymentId: payment.id, originalJournalEntryId: payment.journal_entry_id ?? null },
    actorUserId: actor.userId,
    actorRole: "harmonious",
  });
  return { requested: true };
}

/**
 * Step 2 (a different person): approve the reversal. Posted entries are never
 * rewritten; accounting reverses and reclassifies forward.
 */
export async function approveDistributionReversal(userId: string, paymentId: string) {
  const actor = await assertStaff(userId, "approve_reversal");
  const { data: payment } = await db()
    .from("distribution_payments")
    .select("*")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment) fail("That payment was not found.");
  if (!payment.reversal_requested_by) fail("No reversal has been requested.");
  if (payment.reversal_approved_by) fail("This reversal is already approved.");
  const chainError = makerCheckerError(paymentChain(payment), {
    step: "reversal_approved",
    actor: { userId: actor.userId, role: "harmonious" },
  });
  if (chainError) fail(chainError);
  const reason = String(payment.reversal_reason ?? "Reversal");

  if (payment.reconciliation_id && payment.posted_at) {
    await reverseAndCorrectReconciliation(actor.userId, String(payment.reconciliation_id), reason);
  }

  await db()
    .from("distribution_payments")
    .update({
      status: "reversed",
      failure_reason: reason,
      failed_at: nowIso(),
      reversal_approved_by: actor.userId,
      reversal_approved_at: nowIso(),
    })
    .eq("id", payment.id);
  await db()
    .from("distribution_lines")
    .update({ payment_state: "reversed", accounting_state: payment.posted_at ? "reversed" : "not_started" })
    .eq("id", payment.distribution_line_id);

  await raiseException({
    offeringId: payment.offering_id,
    paymentId: String(payment.id),
    distributionLineId: payment.distribution_line_id,
    kind: "payment_reversed",
    detail: reason,
    raisedBy: actor.userId,
  });
  await recordEvent({
    offeringId: payment.offering_id,
    batchId: payment.batch_id,
    distributionLineId: payment.distribution_line_id,
    paymentId: String(payment.id),
    journalEntryId: payment.journal_entry_id ?? null,
    reconciliationId: payment.reconciliation_id ?? null,
    event: "distribution_payment_reversed",
    toStatus: "reversed",
    reason,
    detail: { requestedBy: payment.reversal_requested_by, originalJournalEntryId: payment.journal_entry_id ?? null },
    actorUserId: actor.userId,
    actorRole: "harmonious",
  });
  return { reversed: true };
}

/** A failed or returned payment is reissued as a new attempt, never rewritten. */
export async function reissueDistributionPayment(userId: string, paymentId: string, reason: string) {
  const actor = await assertStaff(userId, "correct");
  const { data: original } = await db()
    .from("distribution_payments")
    .select("*")
    .eq("id", paymentId)
    .maybeSingle();
  if (!original) fail("That payment was not found.");
  if (!["failed", "returned", "reversed"].includes(String(original.status))) {
    fail("Only a failed, returned or reversed payment can be reissued.");
  }
  await db()
    .from("distribution_lines")
    .update({ payment_state: "ready" })
    .eq("id", original.distribution_line_id);
  await recordEvent({
    offeringId: original.offering_id,
    batchId: original.batch_id,
    distributionLineId: original.distribution_line_id,
    paymentId: String(original.id),
    event: "distribution_payment_reissue_authorised",
    reason,
    actorUserId: actor.userId,
    actorRole: "harmonious",
  });
  return { ok: true, note: "The original payment record is preserved; the next attempt is a new record." };
}

export async function resolveDistributionException(
  userId: string,
  input: { exceptionId: string; resolution: string },
) {
  const actor = await assertStaff(userId, "resolve_exception");
  if (!input.resolution || input.resolution.trim().length < 4) {
    fail("Closing an exception needs an explanation.");
  }
  const { data: exception } = await db()
    .from("distribution_exceptions")
    .select("*")
    .eq("id", input.exceptionId)
    .maybeSingle();
  if (!exception) fail("That exception was not found.");
  await db()
    .from("distribution_exceptions")
    .update({
      status: "resolved",
      resolution: input.resolution,
      resolved_by: actor.userId,
      resolved_at: nowIso(),
    })
    .eq("id", input.exceptionId);
  await recordEvent({
    offeringId: exception.offering_id,
    batchId: exception.batch_id,
    distributionLineId: exception.distribution_line_id,
    event: "distribution_exception_resolved",
    toStatus: "resolved",
    reason: input.resolution,
    actorUserId: actor.userId,
    actorRole: "harmonious",
  });
  return { ok: true };
}

// ----------------------------------------------------------------- notices

export async function publishDistributionNotice(userId: string, lineId: string) {
  const actor = await assertStaff(userId, "prepare");
  const { data: line } = await db().from("distribution_lines").select("*").eq("id", lineId).maybeSingle();
  if (!line) fail("That distribution was not found.");
  if (String(line.accounting_state) !== "posted") {
    fail("A distribution notice is issued from posted records only.");
  }
  const batch = await batchRow(String(line.batch_id));

  const { data: existing } = await db()
    .from("distribution_notices")
    .select("id, version")
    .eq("distribution_line_id", lineId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const commitment = line.position_id
    ? (await commitmentStateFor([String(line.position_id)])).get(String(line.position_id))
    : null;

  const { data: instruction } = line.payment_instruction_id
    ? await db()
        .from("investor_payment_instructions")
        .select("masked_account, method")
        .eq("id", line.payment_instruction_id)
        .maybeSingle()
    : { data: null };

  const content = {
    fundId: String(batch.offering_id),
    batchNumber: Number(batch.batch_number),
    investmentProfileId: line.investment_profile_id ?? null,
    distributionType: String(line.distribution_type),
    grossCents: Number(line.gross_cents),
    withholdingCents: Number(line.withholding_cents),
    feeCents: Number(line.fee_cents),
    netCents: Number(line.net_cents),
    paymentDate: batch.payment_date ?? line.effective_date ?? null,
    paymentMethod: instruction?.method ?? line.payment_method ?? null,
    destinationEnding: instruction?.masked_account ?? null,
    characterization: line.characterization ?? {},
    remainingCommitmentCents: Number(commitment?.remainingCommitmentCents ?? 0),
    contributedCents: Number(commitment?.contributedCents ?? 0),
  };

  const { data: notice, error } = await db()
    .from("distribution_notices")
    .insert({
      distribution_line_id: lineId,
      batch_id: batch.id,
      offering_id: batch.offering_id,
      investor_user_id: line.investor_user_id,
      investment_profile_id: line.investment_profile_id,
      version: Number(existing?.version ?? 0) + 1,
      supersedes_id: existing?.id ?? null,
      status: "published",
      content,
      published_by: actor.userId,
      published_at: nowIso(),
    })
    .select("id")
    .single();
  if (error) fail(error.message);

  if (existing?.id) {
    await db()
      .from("distribution_notices")
      .update({ status: "superseded", superseded_at: nowIso() })
      .eq("id", existing.id);
  }

  await recordEvent({
    offeringId: batch.offering_id,
    batchId: String(batch.id),
    distributionLineId: lineId,
    event: "distribution_notice_published",
    toStatus: "published",
    actorUserId: actor.userId,
    actorRole: "harmonious",
  });
  return { noticeId: String(notice.id) };
}

// -------------------------------------------------------- investor views

/** Strictly the signed-in investor's own lines, never merged across profiles. */
export async function myDistributions(userId: string, filter?: { investmentProfileId?: string | null }) {
  const actor = await actorFor(userId);
  let query = db()
    .from("distribution_lines")
    .select("*")
    .eq("investor_user_id", actor.userId)
    .order("created_at", { ascending: false });
  if (filter?.investmentProfileId) {
    query = query.eq("investment_profile_id", filter.investmentProfileId);
  }
  const { data: lines } = await query;

  const batchIds = [...new Set(((lines ?? []) as any[]).map((l) => String(l.batch_id)))];
  const { data: batches } = batchIds.length
    ? await db().from("distribution_batches").select("*").in("id", batchIds)
    : { data: [] };
  const batchById = new Map(((batches ?? []) as any[]).map((b) => [String(b.id), b]));

  const instructionIds = [
    ...new Set(
      ((lines ?? []) as any[]).map((l) => l.payment_instruction_id).filter(Boolean).map(String),
    ),
  ];
  const { data: instructions } = instructionIds.length
    ? await db()
        .from("investor_payment_instructions")
        .select("id, masked_account")
        .in("id", instructionIds)
    : { data: [] };
  const maskedById = new Map(
    ((instructions ?? []) as any[]).map((i) => [String(i.id), i.masked_account ?? null]),
  );

  const { data: notices } = await db()
    .from("distribution_notices")
    .select("id, distribution_line_id, version, content, published_at")
    .eq("investor_user_id", actor.userId)
    .eq("status", "published");
  const noticeByLine = new Map(
    ((notices ?? []) as any[]).map((n) => [String(n.distribution_line_id), n]),
  );

  const visible = ((lines ?? []) as any[]).filter((l) => {
    const batch = batchById.get(String(l.batch_id));
    return batch && ["approved", "executing", "completed", "superseded"].includes(String(batch.status));
  });

  return {
    distributions: visible.map((l) => {
      const batch = batchById.get(String(l.batch_id));
      return {
        ...investorSafeLine(l, maskedById.get(String(l.payment_instruction_id ?? "")) ?? null),
        fundName: null as string | null,
        batchNumber: Number(batch?.batch_number ?? 0),
        title: batch?.title ?? null,
        paymentDate: batch?.payment_date ?? null,
        status:
          String(l.accounting_state) === "posted"
            ? "paid"
            : String(l.payment_state) === "submitted"
              ? "sent"
              : String(l.payment_state),
        notice: noticeByLine.get(String(l.id)) ?? null,
        confirmationRequired:
          Boolean(l.investor_confirmation_required) && !l.investor_confirmed_at,
      };
    }),
  };
}

export async function distributionForInvestor(userId: string, lineId: string) {
  const actor = await actorFor(userId);
  const { data: line } = await db().from("distribution_lines").select("*").eq("id", lineId).maybeSingle();
  if (!line) fail("That distribution was not found.");
  if (String(line.investor_user_id ?? "") !== actor.userId) {
    forbid("that distribution belongs to another investor.");
  }
  const batch = await batchRow(String(line.batch_id));
  if (!["approved", "executing", "completed", "superseded"].includes(String(batch.status))) {
    forbid("that distribution has not been approved for release.");
  }
  const { data: instruction } = line.payment_instruction_id
    ? await db()
        .from("investor_payment_instructions")
        .select("masked_account")
        .eq("id", line.payment_instruction_id)
        .maybeSingle()
    : { data: null };
  const { data: withholdings } = await db()
    .from("distribution_withholdings")
    .select("withholding_type, jurisdiction, rate_bps, amount_cents")
    .eq("distribution_line_id", lineId);
  const { data: notice } = await db()
    .from("distribution_notices")
    .select("id, version, content, published_at")
    .eq("distribution_line_id", lineId)
    .eq("status", "published")
    .maybeSingle();

  return {
    line: investorSafeLine(line, instruction?.masked_account ?? null),
    withholdings: withholdings ?? [],
    notice: notice ?? null,
    batch: {
      number: Number(batch.batch_number),
      title: batch.title,
      paymentDate: batch.payment_date,
      distributionType: batch.distribution_type,
    },
  };
}

// ------------------------------------------------------ operations views

export async function distributionsWorkspace(userId: string, offeringId?: string | null) {
  await assertStaff(userId);
  let batchQuery = db()
    .from("distribution_batches")
    .select("*")
    .order("created_at", { ascending: false });
  if (offeringId) batchQuery = batchQuery.eq("offering_id", offeringId);
  const { data: batches } = await batchQuery;

  const batchIds = ((batches ?? []) as any[]).map((b) => String(b.id));
  const { data: lines } = batchIds.length
    ? await db().from("distribution_lines").select("*").in("batch_id", batchIds)
    : { data: [] };
  const { data: exceptions } = await db()
    .from("distribution_exceptions")
    .select("*")
    .eq("status", "open");

  const openByLine = new Set(
    ((exceptions ?? []) as any[]).map((e) => String(e.distribution_line_id ?? "")),
  );
  const batchById = new Map(((batches ?? []) as any[]).map((b) => [String(b.id), b]));

  const instructionIds = [
    ...new Set(((lines ?? []) as any[]).map((l) => l.payment_instruction_id).filter(Boolean).map(String)),
  ];
  const { data: instructions } = instructionIds.length
    ? await db().from("investor_payment_instructions").select("*").in("id", instructionIds)
    : { data: [] };
  const instructionById = new Map(((instructions ?? []) as any[]).map((i) => [String(i.id), i]));

  const { data: payments } = batchIds.length
    ? await db()
        .from("distribution_payments")
        .select("id, distribution_line_id, attempt, status")
        .in("batch_id", batchIds)
        .order("attempt", { ascending: true })
    : { data: [] };
  const paymentByLine = new Map<string, any>();
  for (const p of (payments ?? []) as any[]) paymentByLine.set(String(p.distribution_line_id), p);

  const now = nowIso();
  const rows = ((lines ?? []) as any[]).map((l) => {
    const batch = batchById.get(String(l.batch_id));
    const instruction = instructionById.get(String(l.payment_instruction_id ?? ""));
    const coolingOffActive = instruction?.cooling_off_until
      ? new Date(instruction.cooling_off_until).getTime() > new Date(now).getTime() &&
        !instruction.cooling_off_waived_by
      : false;
    const bucket = distributionBucket({
      batchStatus: String(batch?.status ?? "draft") as BatchStatus,
      approvalState: String(l.approval_state),
      paymentState: String(l.payment_state) as any,
      reconciliationState: String(l.reconciliation_state),
      accountingState: String(l.accounting_state),
      hasOpenException: openByLine.has(String(l.id)),
      destinationStatus: (instruction?.status ?? null) as PaymentInstructionStatus | null,
      coolingOffActive,
      executionBlockerCount: 0,
    });
    return {
      id: String(l.id),
      batchId: String(l.batch_id),
      batchNumber: Number(batch?.batch_number ?? 0),
      offeringId: String(l.offering_id),
      displayName: l.display_name,
      grossCents: Number(l.gross_cents),
      withholdingCents: Number(l.withholding_cents),
      netCents: Number(l.net_cents),
      destinationEnding: instruction?.masked_account ?? null,
      destinationStatus: instruction?.status ?? null,
      paymentState: String(l.payment_state),
      reconciliationState: String(l.reconciliation_state),
      accountingState: String(l.accounting_state),
      paymentId: paymentByLine.get(String(l.id))?.id
        ? String(paymentByLine.get(String(l.id)).id)
        : null,
      bucket,
    };
  });

  return {
    batches: ((batches ?? []) as any[]).map((b) => ({
      id: String(b.id),
      offeringId: String(b.offering_id),
      batchNumber: Number(b.batch_number),
      version: Number(b.version),
      title: b.title,
      distributionType: b.distribution_type,
      status: String(b.status),
      declaredAmountCents: Number(b.declared_amount_cents),
      totalGrossCents: Number(b.total_gross_cents),
      totalWithholdingCents: Number(b.total_withholding_cents),
      totalNetCents: Number(b.total_net_cents),
      reserveCents: Number(b.reserve_cents),
      recipientCount: Number(b.recipient_count),
      balances: Boolean(b.balances),
      balanceDetail: b.balance_detail ?? {},
      managerApproved: Boolean(b.manager_approved_by),
      finalApproved: Boolean(b.final_approved_by),
    })),
    lines: rows,
    exceptions: ((exceptions ?? []) as any[]).map((e) => ({
      id: String(e.id),
      kind: String(e.kind),
      severity: String(e.severity),
      detail: e.detail,
      batchId: e.batch_id,
      distributionLineId: e.distribution_line_id,
    })),
  };
}

/** Managers see progress and totals for their funds. Never a destination. */
export async function managerDistributionBoard(userId: string, offeringId?: string | null) {
  const actor = await actorFor(userId);
  const allowed = actor.isStaff ? null : actor.managedOfferingIds;
  if (allowed && allowed.length === 0) forbid("you do not manage any funds.");
  if (offeringId && allowed && !allowed.includes(offeringId)) {
    forbid("that fund is not one you manage.");
  }

  let query = db().from("distribution_batches").select("*").order("created_at", { ascending: false });
  if (offeringId) query = query.eq("offering_id", offeringId);
  else if (allowed) query = query.in("offering_id", allowed);
  const { data: batches } = await query;

  const batchIds = ((batches ?? []) as any[]).map((b) => String(b.id));
  const { data: lines } = batchIds.length
    ? await db().from("distribution_lines").select("*").in("batch_id", batchIds)
    : { data: [] };

  return {
    batches: ((batches ?? []) as any[]).map((b) => ({
      id: String(b.id),
      offeringId: String(b.offering_id),
      batchNumber: Number(b.batch_number),
      title: b.title,
      distributionType: b.distribution_type,
      status: String(b.status),
      totalGrossCents: Number(b.total_gross_cents),
      totalWithholdingCents: Number(b.total_withholding_cents),
      totalNetCents: Number(b.total_net_cents),
      recipientCount: Number(b.recipient_count),
      managerApproved: Boolean(b.manager_approved_by),
      finalApproved: Boolean(b.final_approved_by),
      paymentStatus: String(b.payment_status),
    })),
    lines: ((lines ?? []) as any[]).map(managerSafeLine),
  };
}

/** The complete reconstruction an auditor needs, in order. */
export async function distributionAuditTrail(userId: string, batchId: string) {
  await assertStaff(userId);
  const batch = await batchRow(batchId);
  const [{ data: lines }, { data: payments }, { data: events }, { data: exceptions }, { data: notices }] =
    await Promise.all([
      db().from("distribution_lines").select("*").eq("batch_id", batchId),
      db().from("distribution_payments").select("*").eq("batch_id", batchId),
      db()
        .from("distribution_events")
        .select("*")
        .eq("batch_id", batchId)
        .order("created_at", { ascending: true }),
      db().from("distribution_exceptions").select("*").eq("batch_id", batchId),
      db().from("distribution_notices").select("*").eq("batch_id", batchId),
    ]);

  const paymentIds = ((payments ?? []) as any[]).map((p) => String(p.id));
  const { data: providerEvents } = paymentIds.length
    ? await db().from("distribution_provider_events").select("*").in("payment_id", paymentIds)
    : { data: [] };

  return {
    batch,
    lines: lines ?? [],
    payments: payments ?? [],
    providerEvents: providerEvents ?? [],
    exceptions: exceptions ?? [],
    notices: notices ?? [],
    events: events ?? [],
  };
}

/** Provider intake is a Harmonious-operated action, never an open endpoint. */
export async function assertStaffForProviderIntake(userId: string) {
  return assertStaff(userId);
}
