// Authenticated entry points for investor allocations, capital accounts and
// investor capital statements. Every handler resolves the fund and the caller's
// scope on the server; nothing here trusts an id sent by the browser.
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listAllocationQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { offering_id?: string } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    const { allocationQueue } = await import("@/lib/allocations.server");
    return allocationQueue(context.userId, data.offering_id);
  });

export const getAllocationRun = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { run_id: string }) => input)
  .handler(async ({ data, context }) => {
    const { allocationDetail } = await import("@/lib/allocations.server");
    return allocationDetail(context.userId, data.run_id);
  });

export const getInvestorCapitalOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { offering_id: string }) => input)
  .handler(async ({ data, context }) => {
    const { investorCapitalOverview } = await import("@/lib/allocations.server");
    return investorCapitalOverview(context.userId, data.offering_id);
  });

export const syncInvestorPositions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { offering_id: string }) => input)
  .handler(async ({ data, context }) => {
    const { ensurePositions } = await import("@/lib/allocations.server");
    return ensurePositions(context.userId, data.offering_id);
  });

export const saveAllocationPolicySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      offering_id: string;
      basis: string;
      methodology_note?: string;
      time_weighted?: boolean;
      spv_simple?: boolean;
      manager_workflow?: string;
      tolerance_cents?: number;
      effective_from: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { saveAllocationPolicy } = await import("@/lib/allocations.server");
    return saveAllocationPolicy(context.userId, {
      offeringId: data.offering_id,
      basis: data.basis as any,
      methodologyNote: data.methodology_note ?? "",
      timeWeighted: data.time_weighted ?? false,
      spvSimple: data.spv_simple ?? false,
      managerWorkflow: (data.manager_workflow ?? "acknowledge") as any,
      toleranceCents: data.tolerance_cents ?? 0,
      effectiveFrom: data.effective_from,
    });
  });

export const saveManagementFeeTerm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      offering_id: string;
      basis: string;
      frequency: string;
      rate_bps?: number;
      flat_amount_cents?: number;
      starts_on: string;
      ends_on?: string | null;
      waiver_bps?: number;
      offset_pct?: number;
      note?: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { saveFeeTerm } = await import("@/lib/allocations.server");
    return saveFeeTerm(context.userId, {
      offeringId: data.offering_id,
      basis: data.basis as any,
      frequency: data.frequency as any,
      rateBps: data.rate_bps ?? 0,
      flatAmountCents: data.flat_amount_cents ?? 0,
      startsOn: data.starts_on,
      endsOn: data.ends_on ?? null,
      waiverBps: data.waiver_bps ?? 0,
      offsetPct: data.offset_pct ?? 0,
      note: data.note ?? "",
    });
  });

export const saveFundWaterfallTerms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      offering_id: string;
      structure: string;
      preferred_return_bps?: number;
      catch_up_pct?: number;
      carry_pct?: number;
      return_of_capital_first?: boolean;
      effective_from: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { saveWaterfallTerms } = await import("@/lib/allocations.server");
    return saveWaterfallTerms(context.userId, {
      offeringId: data.offering_id,
      structure: data.structure as any,
      preferredReturnBps: data.preferred_return_bps ?? 0,
      catchUpPct: data.catch_up_pct ?? 0,
      carryPct: data.carry_pct ?? 0,
      returnOfCapitalFirst: data.return_of_capital_first ?? true,
      effectiveFrom: data.effective_from,
    });
  });

export const runAllocationCalculation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { nav_id: string }) => input)
  .handler(async ({ data, context }) => {
    const { calculateAllocations } = await import("@/lib/allocations.server");
    return calculateAllocations(context.userId, { navId: data.nav_id });
  });

export const decideAllocations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { run_id: string; action: string; reason?: string }) => input)
  .handler(async ({ data, context }) => {
    const { decideAllocationRun } = await import("@/lib/allocations.server");
    return decideAllocationRun(context.userId, data.run_id, data.action as any, data.reason ?? "");
  });

export const submitAllocations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { run_id: string }) => input)
  .handler(async ({ data, context }) => {
    const { submitAllocationRun } = await import("@/lib/allocations.server");
    return submitAllocationRun(context.userId, data.run_id);
  });

export const respondToAllocations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { run_id: string; response: string; note?: string }) => input)
  .handler(async ({ data, context }) => {
    const { managerRespondToAllocations } = await import("@/lib/allocations.server");
    return managerRespondToAllocations(
      context.userId,
      data.run_id,
      data.response as any,
      data.note ?? "",
    );
  });

export const generateInvestorStatements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { run_id: string }) => input)
  .handler(async ({ data, context }) => {
    const { generateStatements } = await import("@/lib/allocations.server");
    return generateStatements(context.userId, data.run_id);
  });

export const decideInvestorStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { statement_id: string; action: string; reason?: string }) => input)
  .handler(async ({ data, context }) => {
    const { decideStatement } = await import("@/lib/allocations.server");
    return decideStatement(context.userId, data.statement_id, data.action as any, data.reason ?? "");
  });

export const reviseInvestorStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { statement_id: string; reason: string }) => input)
  .handler(async ({ data, context }) => {
    const { reviseStatement } = await import("@/lib/allocations.server");
    return reviseStatement(context.userId, data.statement_id, data.reason);
  });

export const requestAdjustment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      position_id: string;
      classification: string;
      amount_cents: number;
      effective_date: string;
      reason: string;
      evidence_path: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { requestCapitalAdjustment } = await import("@/lib/allocations.server");
    return requestCapitalAdjustment(context.userId, {
      positionId: data.position_id,
      classification: data.classification,
      amountCents: data.amount_cents,
      effectiveDate: data.effective_date,
      reason: data.reason,
      evidencePath: data.evidence_path,
    });
  });

export const decideAdjustment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { adjustment_id: string; decision: string; note?: string }) => input)
  .handler(async ({ data, context }) => {
    const { decideCapitalAdjustment } = await import("@/lib/allocations.server");
    return decideCapitalAdjustment(
      context.userId,
      data.adjustment_id,
      data.decision as any,
      data.note ?? "",
    );
  });

export const recordPositionTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      from_position_id: string;
      to_position_id: string;
      effective_date: string;
      capital_cents: number;
      commitment_cents: number;
      authorization_reference: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { recordTransfer } = await import("@/lib/allocations.server");
    return recordTransfer(context.userId, {
      fromPositionId: data.from_position_id,
      toPositionId: data.to_position_id,
      effectiveDate: data.effective_date,
      capitalCents: data.capital_cents,
      commitmentCents: data.commitment_cents,
      authorizationReference: data.authorization_reference,
    });
  });

export const getCommitmentLedger = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { position_id: string; as_of?: string }) => input)
  .handler(async ({ data, context }) => {
    const { commitmentLedger } = await import("@/lib/allocations.server");
    return commitmentLedger(context.userId, data.position_id, data.as_of);
  });

export const getAllocationAsOf = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { position_id: string; as_of: string }) => input)
  .handler(async ({ data, context }) => {
    const { capitalAccountAsOf, ownershipAsOfDate } = await import("@/lib/allocations.server");
    const [account, ownershipPct] = await Promise.all([
      capitalAccountAsOf(context.userId, data.position_id, data.as_of),
      ownershipAsOfDate(context.userId, data.position_id, data.as_of),
    ]);
    return { account, ownershipPct };
  });

export const listMyCapitalStatements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { myCapitalStatements } = await import("@/lib/allocations.server");
    return myCapitalStatements(context.userId);
  });

export const getMyStatement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { statement_id: string }) => input)
  .handler(async ({ data, context }) => {
    const { myStatementDetail } = await import("@/lib/allocations.server");
    return myStatementDetail(context.userId, data.statement_id);
  });
