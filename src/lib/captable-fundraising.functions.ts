import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Harmonious CapTable — Phase 3: fundraising.
 *
 * Priced rounds, SAFEs, convertible notes and direct investments are tracked
 * as commitments. A commitment never changes the official ledger on its own:
 * only a deliberate close issues the security and writes the transaction the
 * cap table is derived from.
 */

export const INSTRUMENTS = [
  { value: "priced", label: "Priced round", securityType: "preferred" },
  { value: "safe", label: "SAFE", securityType: "safe" },
  { value: "note", label: "Convertible note", securityType: "note" },
  { value: "direct", label: "Direct investment", securityType: "common" },
] as const;

export const INVESTMENT_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "committed", label: "Committed" },
  { value: "signed", label: "Signed" },
  { value: "funded", label: "Funded" },
  { value: "closed", label: "Closed to the ledger" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export const ROUND_TYPES = [
  { value: "priced", label: "Priced round" },
  { value: "safe", label: "SAFE round" },
  { value: "note", label: "Convertible note round" },
  { value: "bridge", label: "Bridge" },
  { value: "direct", label: "Direct investments" },
] as const;

function n(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function instrumentMeta(value: string) {
  return INSTRUMENTS.find((i) => i.value === value) ?? INSTRUMENTS[0];
}

async function assertManage(context: any, companyId: string) {
  const { data } = await context.supabase.rpc("ct_can_manage", { _company_id: companyId });
  if (!data) throw new Error("You do not have authority to change this cap table.");
}

async function recordEvent(
  context: any,
  entry: {
    companyId: string;
    action: string;
    entityType?: string;
    entityId?: string | null;
    previous?: unknown;
    next?: unknown;
    reason?: string | null;
  },
) {
  await context.supabase.from("ct_events").insert({
    company_id: entry.companyId,
    actor_id: context.userId,
    action: entry.action,
    entity_type: entry.entityType ?? null,
    entity_id: entry.entityId ?? null,
    previous_state: (entry.previous ?? null) as any,
    new_state: (entry.next ?? null) as any,
    reason: entry.reason ?? null,
  });
}

/* -------------------------------------------------------------------- read */

export const getCapFundraising = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ companyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const companyId = data.companyId;
    const [{ data: rounds }, { data: investments }, { data: stakeholders }, { data: classes }] =
      await Promise.all([
        context.supabase
          .from("ct_rounds")
          .select("*")
          .eq("company_id", companyId)
          .order("close_date", { ascending: false, nullsFirst: true }),
        context.supabase
          .from("ct_round_investments")
          .select("*")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false }),
        context.supabase
          .from("ct_stakeholders")
          .select("id, name, stakeholder_type, email")
          .eq("company_id", companyId)
          .order("name"),
        context.supabase
          .from("ct_security_classes")
          .select("id, name, kind, price_per_share")
          .eq("company_id", companyId)
          .order("seniority"),
      ]);

    const { data: allowed } = await context.supabase.rpc("ct_can_manage", {
      _company_id: companyId,
    });

    const holderById = new Map((stakeholders ?? []).map((s: any) => [s.id, s]));
    const roundById = new Map((rounds ?? []).map((r: any) => [r.id, r]));

    const rows = ((investments ?? []) as any[]).map((i) => ({
      id: i.id as string,
      roundId: i.round_id as string | null,
      roundName: i.round_id ? ((roundById.get(i.round_id) as any)?.name ?? null) : null,
      stakeholderId: i.stakeholder_id as string,
      stakeholder: (holderById.get(i.stakeholder_id) as any)?.name ?? "Unknown investor",
      classId: i.class_id as string | null,
      securityId: i.security_id as string | null,
      instrument: i.instrument as string,
      instrumentLabel: instrumentMeta(i.instrument).label,
      amount: n(i.amount),
      shares: i.shares === null ? null : n(i.shares),
      pricePerShare: i.price_per_share === null ? null : n(i.price_per_share),
      valuationCap: i.valuation_cap === null ? null : n(i.valuation_cap),
      discountRate: i.discount_rate === null ? null : n(i.discount_rate),
      interestRate: i.interest_rate === null ? null : n(i.interest_rate),
      maturityDate: i.maturity_date as string | null,
      status: i.status as string,
      commitmentDate: i.commitment_date as string | null,
      signedAt: i.signed_at as string | null,
      fundedAt: i.funded_at as string | null,
      closedAt: i.closed_at as string | null,
      notes: i.notes as string | null,
    }));

    const sum = (list: typeof rows) => list.reduce((t, r) => t + r.amount, 0);
    const live = rows.filter((r) => r.status !== "cancelled");

    return {
      canManage: Boolean(allowed),
      rounds: ((rounds ?? []) as any[]).map((r) => {
        const own = live.filter((i) => i.roundId === r.id);
        return {
          id: r.id as string,
          name: r.name as string,
          roundType: r.round_type as string,
          status: r.status as string,
          closeDate: r.close_date as string | null,
          preMoney: r.pre_money === null ? null : n(r.pre_money),
          pricePerShare: r.price_per_share === null ? null : n(r.price_per_share),
          amountRaised: r.amount_raised === null ? null : n(r.amount_raised),
          targetAmount: r.target_amount === null ? null : n(r.target_amount),
          leadInvestor: r.lead_investor as string | null,
          notes: r.notes as string | null,
          committed: sum(own),
          funded: sum(own.filter((i) => i.status === "funded" || i.status === "closed")),
          closed: sum(own.filter((i) => i.status === "closed")),
          investors: own.length,
        };
      }),
      investments: rows,
      stakeholders: ((stakeholders ?? []) as any[]).map((s) => ({
        id: s.id as string,
        name: s.name as string,
        type: s.stakeholder_type as string,
      })),
      classes: ((classes ?? []) as any[]).map((c) => ({
        id: c.id as string,
        name: c.name as string,
        kind: c.kind as string,
        pricePerShare: c.price_per_share === null ? null : n(c.price_per_share),
      })),
      totals: {
        committed: sum(live),
        funded: sum(live.filter((i) => i.status === "funded" || i.status === "closed")),
        closed: sum(live.filter((i) => i.status === "closed")),
        openCommitments: live.filter((i) => i.status !== "closed").length,
        safePrincipal: sum(live.filter((i) => i.instrument === "safe")),
        notePrincipal: sum(live.filter((i) => i.instrument === "note")),
      },
    };
  });

/* ------------------------------------------------------------------ writes */

export const saveCapRound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        id: z.string().uuid().optional().nullable(),
        name: z.string().trim().min(1).max(160),
        roundType: z.string().trim().min(1).max(40),
        status: z.string().trim().min(1).max(40).default("open"),
        closeDate: z.string().trim().optional().nullable(),
        preMoney: z.number().nonnegative().optional().nullable(),
        pricePerShare: z.number().nonnegative().optional().nullable(),
        targetAmount: z.number().nonnegative().optional().nullable(),
        leadInvestor: z.string().trim().max(160).optional().nullable(),
        notes: z.string().trim().max(2000).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertManage(context, data.companyId);
    const payload = {
      company_id: data.companyId,
      name: data.name,
      round_type: data.roundType,
      status: data.status,
      close_date: data.closeDate || null,
      pre_money: data.preMoney ?? null,
      price_per_share: data.pricePerShare ?? null,
      target_amount: data.targetAmount ?? null,
      lead_investor: data.leadInvestor || null,
      notes: data.notes || null,
    };

    const query = data.id
      ? context.supabase.from("ct_rounds").update(payload).eq("id", data.id).eq("company_id", data.companyId)
      : context.supabase.from("ct_rounds").insert(payload);
    const { data: row, error } = await query.select("id").single();
    if (error) throw new Error(error.message);

    await recordEvent(context, {
      companyId: data.companyId,
      action: data.id ? "round.updated" : "round.created",
      entityType: "round",
      entityId: row.id,
      next: payload,
    });
    return { id: row.id as string };
  });

export const saveRoundInvestment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        id: z.string().uuid().optional().nullable(),
        roundId: z.string().uuid().optional().nullable(),
        stakeholderId: z.string().uuid(),
        classId: z.string().uuid().optional().nullable(),
        instrument: z.string().trim().min(1).max(40),
        amount: z.number().nonnegative(),
        shares: z.number().nonnegative().optional().nullable(),
        pricePerShare: z.number().nonnegative().optional().nullable(),
        valuationCap: z.number().nonnegative().optional().nullable(),
        discountRate: z.number().nonnegative().max(100).optional().nullable(),
        interestRate: z.number().nonnegative().max(100).optional().nullable(),
        maturityDate: z.string().trim().optional().nullable(),
        commitmentDate: z.string().trim().optional().nullable(),
        status: z.string().trim().min(1).max(40).default("committed"),
        notes: z.string().trim().max(2000).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertManage(context, data.companyId);
    if (data.status === "closed") {
      throw new Error("Use Close to the ledger to record a closed investment.");
    }

    const payload = {
      company_id: data.companyId,
      round_id: data.roundId || null,
      stakeholder_id: data.stakeholderId,
      class_id: data.classId || null,
      instrument: data.instrument,
      amount: data.amount,
      shares: data.shares ?? null,
      price_per_share: data.pricePerShare ?? null,
      valuation_cap: data.valuationCap ?? null,
      discount_rate: data.discountRate ?? null,
      interest_rate: data.interestRate ?? null,
      maturity_date: data.maturityDate || null,
      commitment_date: data.commitmentDate || null,
      status: data.status,
      notes: data.notes || null,
      created_by: context.userId,
    };

    if (data.id) {
      const { data: existing } = await context.supabase
        .from("ct_round_investments")
        .select("status")
        .eq("id", data.id)
        .eq("company_id", data.companyId)
        .maybeSingle();
      if (!existing) throw new Error("Investment not found.");
      if (existing.status === "closed") {
        throw new Error("This investment is already on the ledger and cannot be edited.");
      }
    }

    const query = data.id
      ? context.supabase
          .from("ct_round_investments")
          .update(payload)
          .eq("id", data.id)
          .eq("company_id", data.companyId)
      : context.supabase.from("ct_round_investments").insert(payload);
    const { data: row, error } = await query.select("id").single();
    if (error) throw new Error(error.message);

    await recordEvent(context, {
      companyId: data.companyId,
      action: data.id ? "investment.updated" : "investment.recorded",
      entityType: "round_investment",
      entityId: row.id,
      next: payload,
    });
    return { id: row.id as string };
  });

export const setInvestmentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        id: z.string().uuid(),
        status: z.enum(["draft", "committed", "signed", "funded", "cancelled"]),
        reason: z.string().trim().max(500).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertManage(context, data.companyId);
    const { data: existing } = await context.supabase
      .from("ct_round_investments")
      .select("id, status")
      .eq("id", data.id)
      .eq("company_id", data.companyId)
      .maybeSingle();
    if (!existing) throw new Error("Investment not found.");
    if (existing.status === "closed") {
      throw new Error("This investment is already on the ledger.");
    }

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { status: data.status };
    if (data.status === "signed") patch['signed_at'] = now;
    if (data.status === "funded") patch['funded_at'] = now;

    const { error } = await context.supabase
      .from("ct_round_investments")
      .update(patch)
      .eq("id", data.id)
      .eq("company_id", data.companyId);
    if (error) throw new Error(error.message);

    await recordEvent(context, {
      companyId: data.companyId,
      action: `investment.${data.status}`,
      entityType: "round_investment",
      entityId: data.id,
      previous: { status: existing.status },
      next: patch,
      reason: data.reason ?? null,
    });
    return { ok: true };
  });

/** Issues the security and writes the transaction the cap table is derived from. */
export const closeRoundInvestment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        id: z.string().uuid(),
        issueDate: z.string().trim().min(4),
        shares: z.number().nonnegative().optional().nullable(),
        pricePerShare: z.number().nonnegative().optional().nullable(),
        classId: z.string().uuid().optional().nullable(),
        reason: z.string().trim().min(3).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertManage(context, data.companyId);
    const { data: inv, error: invError } = await context.supabase
      .from("ct_round_investments")
      .select("*")
      .eq("id", data.id)
      .eq("company_id", data.companyId)
      .maybeSingle();
    if (invError) throw new Error(invError.message);
    if (!inv) throw new Error("Investment not found.");
    if (inv.status === "closed") throw new Error("This investment is already on the ledger.");
    if (inv.status === "cancelled") throw new Error("This investment was cancelled.");
    if (inv.status !== "funded") {
      throw new Error("Mark the investment funded before closing it to the ledger.");
    }

    const meta = instrumentMeta(inv.instrument as string);
    const equity = meta.value === "priced" || meta.value === "direct";
    const price = data.pricePerShare ?? (inv.price_per_share === null ? null : n(inv.price_per_share));
    const shares =
      data.shares ??
      (inv.shares === null ? null : n(inv.shares)) ??
      (equity && price ? Math.floor(n(inv.amount) / price) : null);

    if (equity && (!shares || shares <= 0)) {
      throw new Error("Enter the number of shares, or a price per share, before closing.");
    }

    const classId = data.classId || (inv.class_id as string | null);

    const { data: security, error: secError } = await context.supabase
      .from("ct_securities")
      .insert({
        company_id: data.companyId,
        stakeholder_id: inv.stakeholder_id,
        class_id: classId || null,
        round_id: inv.round_id || null,
        security_type: meta.securityType,
        quantity: equity ? shares : 0,
        issue_date: data.issueDate,
        purchase_price: equity ? price : null,
        principal: equity ? null : n(inv.amount),
        valuation_cap: inv.valuation_cap ?? null,
        discount_rate: inv.discount_rate ?? null,
        notes: inv.notes ?? null,
        status: "recorded",
        verification_status: "verified",
      })
      .select("id")
      .single();
    if (secError) throw new Error(secError.message);

    const { error: txError } = await context.supabase.from("ct_transactions").insert({
      company_id: data.companyId,
      security_id: security.id,
      stakeholder_id: inv.stakeholder_id,
      round_id: inv.round_id || null,
      kind: "issuance",
      quantity: equity ? shares : 0,
      amount: n(inv.amount),
      effective_date: data.issueDate,
      status: "recorded",
      reason: data.reason,
      created_by: context.userId,
    });
    if (txError) throw new Error(txError.message);

    const { error: updError } = await context.supabase
      .from("ct_round_investments")
      .update({
        status: "closed",
        closed_at: new Date().toISOString(),
        security_id: security.id,
        shares: equity ? shares : null,
        price_per_share: equity ? price : null,
        class_id: classId || null,
      })
      .eq("id", data.id)
      .eq("company_id", data.companyId);
    if (updError) throw new Error(updError.message);

    if (inv.round_id) {
      const { data: closedRows } = await context.supabase
        .from("ct_round_investments")
        .select("amount")
        .eq("round_id", inv.round_id)
        .eq("status", "closed");
      const raised = ((closedRows ?? []) as any[]).reduce((t, r) => t + n(r.amount), 0);
      await context.supabase
        .from("ct_rounds")
        .update({ amount_raised: raised })
        .eq("id", inv.round_id)
        .eq("company_id", data.companyId);
    }

    await recordEvent(context, {
      companyId: data.companyId,
      action: "investment.closed",
      entityType: "round_investment",
      entityId: data.id,
      previous: { status: inv.status },
      next: { status: "closed", securityId: security.id, shares, price },
      reason: data.reason,
    });

    return { securityId: security.id as string };
  });
