import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CONTRACT_ROLES } from "@/lib/contracts.functions";

/**
 * One place where a fund is measured against the conditions in its client's
 * statement of work. Screens and server actions both read this, so nothing
 * can disagree about whether a fund may take an application or move money.
 */

export type ConditionState = "pass" | "attention" | "confirm";

export type ConditionFinding = {
  key: string;
  label: string;
  description: string | null;
  ruleType: string;
  blocking: boolean;
  appliesTo: string;
  sourceReference: string | null;
  value: unknown;
  overridden: boolean;
  state: ConditionState;
  detail: string;
  clearedAt: string | null;
  clearedReason: string | null;
};

export type FeeNotice = {
  threshold: number;
  investors: number;
  over: number;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  acknowledgedCount: number | null;
};

export type FundConditions = {
  fund: { id: string; name: string; reg_type: string; client_id: string | null };
  clientName: string | null;
  configured: boolean;
  findings: ConditionFinding[];
  blocking: ConditionFinding[];
  feeNotice: FeeNotice | null;
};

const STAFF = [
  "admin",
  "super_admin",
  "operations",
  "legal",
  "compliance",
  "fund_administration",
  "tax",
  "finance",
  "client_success",
  "executive",
];

async function rolesOf(context: any) {
  const { data } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  return ((data ?? []) as any[]).map((r) => String(r.role));
}

export const NO_SCOPE_MESSAGE =
  "The engagement scope for this fund has not been recorded yet, so Harmonious cannot start onboarding or move funds for it. Your Harmonious contact can record the statement of work.";

/** Runs the conditions check for one fund using the caller's own access. */
export async function evaluateFundConditions(
  supabase: any,
  offeringId: string,
): Promise<FundConditions> {
  // One guarded lookup gives the same picture to investors, managers and staff,
  // so a fund's limits can't read differently depending on who is looking.
  const [{ data: context, error: contextError }, { data: rules }] = await Promise.all([
    supabase.rpc("fund_condition_context", { p_offering_id: offeringId }),
    supabase.from("eligibility_rules").select("*").eq("active", true).order("sort_order"),
  ]);
  if (contextError) throw new Error(contextError.message);
  if (!context) throw new Error("That fund isn't available.");

  const ctx = context as any;
  const fund = {
    id: offeringId,
    name: String(ctx.name ?? ""),
    reg_type: String(ctx.reg_type ?? ""),
    client_id: (ctx.client_id ?? null) as string | null,
  };
  const client = ctx.client_name ? { name: String(ctx.client_name) } : null;
  const overrides = (ctx.overrides ?? {}) as Record<string, unknown>;
  const clearances = (ctx.clearances ?? []) as any[];
  const notAccredited = Number(ctx.unaccredited_count ?? 0);
  const total = Number(ctx.investor_count ?? 0);
  const configured = Boolean(ctx.configured);

  const clearedFor = (key: string) =>
    ((clearances ?? []) as any[]).find((c) => c.rule_key === key && c.kind === "cleared") ?? null;

  const findings: ConditionFinding[] = ((rules ?? []) as any[]).map((rule) => {
    const value = rule.key in overrides ? overrides[rule.key] : rule.default_value;
    let state: ConditionState = "confirm";
    let detail = "Harmonious cannot check this automatically. Confirm it with the client.";

    if (rule.key === "accredited_investors_only" && value !== false) {
      state = notAccredited === 0 ? "pass" : "attention";
      detail =
        notAccredited === 0
          ? `${total} investor${total === 1 ? "" : "s"}, none recorded as unaccredited.`
          : `${notAccredited} investor${notAccredited === 1 ? " has" : "s have"} no confirmed accredited status.`;
    } else if (rule.key === "max_beneficial_owners") {
      const limit = Number(value ?? 99);
      state = total <= limit ? "pass" : "attention";
      detail = `${total} of ${limit} allowed.`;
    } else if (rule.key === "allowed_exemptions") {
      const allowed = Array.isArray(value) ? (value as string[]) : [];
      const ok = allowed.includes(String(fund.reg_type));
      state = ok ? "pass" : "attention";
      detail = ok
        ? `This fund relies on ${fund.reg_type}.`
        : `This fund relies on ${fund.reg_type}, which is not one of the exemptions in the current statement of work.`;
    } else if (rule.key === "investor_count_fee_threshold") {
      const threshold = Number(value ?? 20);
      state = total > threshold ? "attention" : "pass";
      detail =
        total > threshold
          ? `${total - threshold} investor${total - threshold === 1 ? "" : "s"} above the threshold, so the per-investor fee applies.`
          : `${total} of ${threshold} before the per-investor fee applies.`;
    }

    const cleared = state === "attention" ? clearedFor(rule.key) : null;

    return {
      key: rule.key as string,
      label: rule.label as string,
      description: (rule.description ?? null) as string | null,
      ruleType: rule.rule_type as string,
      blocking: Boolean(rule.blocking),
      appliesTo: rule.applies_to as string,
      sourceReference: (rule.source_reference ?? null) as string | null,
      value,
      overridden: rule.key in overrides,
      state,
      detail,
      clearedAt: cleared?.created_at ?? null,
      clearedReason: cleared?.reason ?? null,
    };
  });

  const feeRule = findings.find((f) => f.key === "investor_count_fee_threshold");
  const feeAck = ((clearances ?? []) as any[]).find((c) => c.kind === "fee_ack") ?? null;
  const ackCount = feeAck ? Number((feeAck.snapshot ?? {}).investors ?? 0) : null;
  const threshold = Number(feeRule?.value ?? 20);

  const feeNotice: FeeNotice | null =
    feeRule && total > threshold
      ? {
          threshold,
          investors: total,
          over: total - threshold,
          acknowledged: ackCount !== null && ackCount >= total,
          acknowledgedAt: feeAck?.created_at ?? null,
          acknowledgedCount: ackCount,
        }
      : null;

  return {
    fund: fund as FundConditions["fund"],
    clientName: (client as any)?.name ?? null,
    configured,
    findings,
    blocking: findings.filter((f) => f.blocking && f.state === "attention" && !f.clearedAt),
    feeNotice,
  };
}

/**
 * Refuses the action when the fund breaks a condition in the client's
 * agreement, has no recorded scope, or has passed a fee threshold that
 * nobody with contract authority has acknowledged yet.
 */
export async function assertFundConditions(
  supabase: any,
  offeringId: string,
  stage: "application" | "funding",
) {
  const result = await evaluateFundConditions(supabase, offeringId);

  if (!result.configured) throw new Error(NO_SCOPE_MESSAGE);

  if (result.blocking.length) {
    const first = result.blocking[0]!;
    throw new Error(
      `${first.label}: ${first.detail} This condition comes from the client's statement of work and has to be cleared by Harmonious before this fund can continue.`,
    );
  }

  if (stage === "application" && result.feeNotice && !result.feeNotice.acknowledged) {
    throw new Error(
      `This fund has ${result.feeNotice.investors} investors, above the ${result.feeNotice.threshold} in the statement of work. Onboarding pauses until Harmonious acknowledges the additional per-investor fee.`,
    );
  }

  return result;
}

/* -------------------------------------------------------------- server fns */

export const getFundConditions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offeringId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await rolesOf(context);
    const result = await evaluateFundConditions(context.supabase, data.offeringId);
    return {
      ...result,
      isStaff: roles.some((r) => STAFF.includes(r)),
      canClear: roles.some((r) => (CONTRACT_ROLES as readonly string[]).includes(r)),
    };
  });

async function requireContractAuthority(context: any) {
  const roles = await rolesOf(context);
  if (!roles.some((r) => (CONTRACT_ROLES as readonly string[]).includes(r))) {
    throw new Error("Forbidden: clearing an agreement condition needs contract authority.");
  }
  return roles;
}

async function recordClearance(
  context: any,
  roles: string[],
  args: {
    offeringId: string;
    ruleKey: string;
    kind: "cleared" | "fee_ack";
    reason: string | null;
    snapshot: Record<string, unknown>;
    clientId: string | null;
    action: string;
  },
) {
  const { error } = await context.supabase.from("fund_condition_clearances").insert({
    offering_id: args.offeringId,
    rule_key: args.ruleKey,
    kind: args.kind,
    reason: args.reason,
    snapshot: args.snapshot as any,
    created_by: context.userId,
  });
  if (error) throw new Error(error.message);

  await context.supabase.from("contract_audit_events").insert({
    actor_id: context.userId,
    actor_role: roles.join(", "),
    client_id: args.clientId,
    offering_id: args.offeringId,
    area: "eligibility",
    action: args.action,
    target: args.ruleKey,
    new_value: { reason: args.reason, ...args.snapshot } as any,
    source: "web",
  });
}

/** Clears one blocking condition for one fund, with a recorded reason. */
export const clearFundCondition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        offeringId: z.string().uuid(),
        ruleKey: z.string().min(2).max(80),
        reason: z.string().trim().min(5).max(1000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const roles = await requireContractAuthority(context);
    const result = await evaluateFundConditions(context.supabase, data.offeringId);
    const finding = result.findings.find((f) => f.key === data.ruleKey);
    if (!finding) throw new Error("That condition isn't part of this engagement.");

    await recordClearance(context, roles, {
      offeringId: data.offeringId,
      ruleKey: data.ruleKey,
      kind: "cleared",
      reason: data.reason,
      snapshot: { detail: finding.detail, value: finding.value },
      clientId: result.fund.client_id,
      action: "condition cleared",
    });
    return { ok: true };
  });

/** Acknowledges the additional per-investor fee so onboarding can continue. */
export const acknowledgeFeeThreshold = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        offeringId: z.string().uuid(),
        note: z.string().trim().max(1000).optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const roles = await requireContractAuthority(context);
    const result = await evaluateFundConditions(context.supabase, data.offeringId);
    if (!result.feeNotice) throw new Error("This fund is not above its fee threshold.");

    await recordClearance(context, roles, {
      offeringId: data.offeringId,
      ruleKey: "investor_count_fee_threshold",
      kind: "fee_ack",
      reason: data.note || null,
      snapshot: {
        investors: result.feeNotice.investors,
        threshold: result.feeNotice.threshold,
      },
      clientId: result.fund.client_id,
      action: "fee threshold acknowledged",
    });
    return { ok: true };
  });

/** Staff view: funds with no recorded scope, or with an open blocking condition. */
export const listFundConditionExceptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await rolesOf(context);
    if (!roles.some((r) => STAFF.includes(r))) {
      throw new Error("Forbidden: this view is for the Harmonious team.");
    }

    const { data: funds } = await context.supabase
      .from("offerings")
      .select("id, name, reg_type, client_id")
      .order("created_at", { ascending: false });

    const rows = [];
    for (const fund of (funds ?? []) as any[]) {
      const result = await evaluateFundConditions(context.supabase, fund.id);
      if (result.configured && !result.blocking.length && !result.feeNotice) continue;
      rows.push({
        id: fund.id as string,
        name: fund.name as string,
        clientName: result.clientName,
        configured: result.configured,
        blocking: result.blocking.map((b) => ({ label: b.label, detail: b.detail })),
        feeNotice: result.feeNotice,
      });
    }
    return { rows };
  });
