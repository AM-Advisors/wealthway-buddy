import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

/** The rule set for one engagement: platform defaults, overridden per statement of work. */
async function rulesFor(context: any, clientId: string | null) {
  const [{ data: rules }, { data: sows }] = await Promise.all([
    context.supabase
      .from("eligibility_rules")
      .select("*")
      .eq("active", true)
      .order("sort_order"),
    clientId
      ? context.supabase
          .from("client_sows")
          .select("id, eligibility, status")
          .eq("client_id", clientId)
          .eq("status", "active")
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const overrides: Record<string, unknown> = {};
  for (const sow of sows ?? []) {
    Object.assign(overrides, (sow.eligibility ?? {}) as Record<string, unknown>);
  }

  return (rules ?? []).map((rule: any) => ({
    key: rule.key as string,
    label: rule.label as string,
    description: rule.description as string | null,
    ruleType: rule.rule_type as string,
    blocking: rule.blocking as boolean,
    appliesTo: rule.applies_to as string,
    sourceReference: rule.source_reference as string | null,
    value: rule.key in overrides ? overrides[rule.key] : rule.default_value,
    overridden: rule.key in overrides,
  }));
}

/**
 * Checks one fund against the rules that come from the statement of work.
 * Anything Harmonious cannot verify from the data is reported as "confirm",
 * never as a pass, so no screen claims a condition is met when it isn't.
 */
export const checkFundEligibility = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offeringId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await rolesOf(context);
    const { data: fund, error } = await context.supabase
      .from("offerings")
      .select("id, name, reg_type, client_id")
      .eq("id", data.offeringId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!fund) throw new Error("That fund isn't available.");

    const rules = await rulesFor(context, fund.client_id ?? null);

    const [{ data: applications }, { count: investorCount }] = await Promise.all([
      context.supabase
        .from("investor_applications")
        .select("id, accreditation_status")
        .eq("offering_id", fund.id),
      context.supabase
        .from("investor_applications")
        .select("id", { count: "exact", head: true })
        .eq("offering_id", fund.id),
    ]);

    const apps = applications ?? [];
    const notAccredited = apps.filter(
      (a: any) => a.accreditation_status === "declined" || a.accreditation_status === "not_started",
    ).length;
    const total = investorCount ?? apps.length;

    const findings = rules.map((rule) => {
      let state: "pass" | "attention" | "confirm" = "confirm";
      let detail = "Harmonious cannot check this automatically. Confirm it with the client.";

      if (rule.key === "accredited_investors_only") {
        state = notAccredited === 0 ? "pass" : "attention";
        detail =
          notAccredited === 0
            ? `${total} investor${total === 1 ? "" : "s"}, none recorded as unaccredited.`
            : `${notAccredited} investor${notAccredited === 1 ? " has" : "s have"} no confirmed accredited status.`;
      } else if (rule.key === "max_beneficial_owners") {
        const limit = Number(rule.value ?? 99);
        state = total <= limit ? "pass" : "attention";
        detail = `${total} of ${limit} allowed.`;
      } else if (rule.key === "allowed_exemptions") {
        const allowed = (rule.value as string[]) ?? [];
        const ok = allowed.includes(String(fund.reg_type));
        state = ok ? "pass" : "attention";
        detail = ok
          ? `This fund relies on ${fund.reg_type}.`
          : `This fund relies on ${fund.reg_type}, which needs written approval.`;
      } else if (rule.key === "investor_count_fee_threshold") {
        const threshold = Number(rule.value ?? 20);
        state = total > threshold ? "attention" : "pass";
        detail =
          total > threshold
            ? `${total - threshold} investor${total - threshold === 1 ? "" : "s"} above the threshold, so the per-investor fee applies.`
            : `${total} of ${threshold} before the per-investor fee applies.`;
      }

      return { ...rule, state, detail };
    });

    return {
      fund,
      isStaff: roles.some((r) => STAFF.includes(r)),
      findings,
      blockers: findings.filter((f) => f.blocking && f.state === "attention").length,
    };
  });

export const listEligibilityRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ clientId: z.string().uuid().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const roles = await rolesOf(context);
    return {
      canManage: roles.some((r) => STAFF.includes(r)),
      rules: await rulesFor(context, data.clientId ?? null),
    };
  });

/** Records a per-engagement change to a rule, kept on the statement of work. */
export const setEligibilityOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        sowId: z.string().uuid(),
        key: z.string().min(2).max(80),
        value: z.any(),
        note: z.string().max(1000).optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const roles = await rolesOf(context);
    if (!roles.some((r) => ["admin", "super_admin", "legal", "compliance", "client_success"].includes(r))) {
      throw new Error("Forbidden: changing an engagement's rules needs contract authority.");
    }

    const { data: sow } = await context.supabase
      .from("client_sows")
      .select("id, client_id, eligibility")
      .eq("id", data.sowId)
      .maybeSingle();
    if (!sow) throw new Error("That statement of work isn't available.");

    const next = { ...((sow.eligibility ?? {}) as Record<string, unknown>), [data.key]: data.value };
    const { error } = await context.supabase
      .from("client_sows")
      .update({ eligibility: next })
      .eq("id", data.sowId);
    if (error) throw new Error(error.message);

    await context.supabase.from("contract_audit_events").insert({
      actor_id: context.userId,
      actor_role: roles.join(", "),
      client_id: sow.client_id,
      area: "eligibility",
      action: "rule changed",
      target: data.key,
      new_value: { value: data.value, note: data.note || null } as any,
      source: "web",
    });
    return { ok: true };
  });
