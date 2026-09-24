import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { planReversal } from "./company-360-views";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeVesting } from "@/lib/vesting";

/**
 * Harmonious CapTable — ownership records.
 *
 * The ledger is event based: every issuance, grant, exercise, cancellation,
 * conversion, transfer and adjustment is a dated transaction, and the current
 * cap table is derived from that history. Nothing overwrites a balance.
 *
 * Nothing here changes the official record on its own: securities carry a
 * status (recorded / pending / verified / rejected) and transactions must be
 * recorded deliberately by someone with authority on the account.
 */

export const SECURITY_KINDS = [
  { value: "common", label: "Common stock", diluted: true, outstanding: true },
  { value: "preferred", label: "Preferred stock", diluted: true, outstanding: true },
  { value: "option", label: "Options", diluted: true, outstanding: false },
  { value: "rsu", label: "RSUs", diluted: true, outstanding: false },
  { value: "warrant", label: "Warrants", diluted: true, outstanding: false },
  { value: "safe", label: "SAFE", diluted: false, outstanding: false },
  { value: "note", label: "Convertible note", diluted: false, outstanding: false },
  { value: "profits_interest", label: "Profits interest", diluted: true, outstanding: false },
  { value: "spv_interest", label: "SPV interest", diluted: true, outstanding: true },
  { value: "fund_interest", label: "Fund interest", diluted: true, outstanding: true },
  { value: "other", label: "Other convertible security", diluted: false, outstanding: false },
] as const;

export const STAKEHOLDER_TYPES = [
  { value: "founder", label: "Founder" },
  { value: "employee", label: "Employee" },
  { value: "investor", label: "Investor" },
  { value: "entity", label: "Entity" },
  { value: "fund", label: "Fund" },
  { value: "spv", label: "SPV" },
  { value: "advisor", label: "Advisor" },
  { value: "other", label: "Other" },
] as const;

export const TRANSACTION_KINDS = [
  { value: "issuance", label: "Issuance" },
  { value: "grant", label: "Grant" },
  { value: "exercise", label: "Exercise" },
  { value: "cancellation", label: "Cancellation" },
  { value: "conversion", label: "Conversion" },
  { value: "transfer", label: "Transfer" },
  { value: "repurchase", label: "Repurchase" },
  { value: "adjustment", label: "Adjustment" },
] as const;

function kindMeta(kind: string) {
  return SECURITY_KINDS.find((k) => k.value === kind) ?? SECURITY_KINDS[SECURITY_KINDS.length - 1]!;
}

function n(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/* --------------------------------------------------------------- workspace */

async function loadCompanies(context: any) {
  const { data } = await context.supabase
    .from("ct_companies")
    .select("id, client_id, name, legal_name, entity_type, jurisdiction, incorporation_date, authorized_shares, par_value, fiscal_year_end, currency, is_demo")
    .order("is_demo", { ascending: true })
    .order("name", { ascending: true });
  return (data ?? []) as any[];
}

export const getCapTableWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ companyId: z.string().uuid().optional().nullable() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const companies = await loadCompanies(context);
    const company =
      companies.find((c) => c.id === data.companyId) ??
      companies.find((c) => !c.is_demo) ??
      companies[0] ??
      null;

    if (!company) {
      return {
        companies: [],
        company: null,
        canManage: false,
        stakeholders: [],
        classes: [],
        rounds: [],
        vesting: [],
        securities: [],
        transactions: [],
        events: [],
        metrics: null,
      };
    }

    const companyId = company.id as string;
    const [
      { data: stakeholders },
      { data: classes },
      { data: rounds },
      { data: vesting },
      { data: securities },
      { data: transactions },
      { data: events },
      { data: documents },
    ] = await Promise.all([
      context.supabase.from("ct_stakeholders").select("*").eq("company_id", companyId).order("name"),
      context.supabase.from("ct_security_classes").select("*").eq("company_id", companyId).order("seniority"),
      context.supabase.from("ct_rounds").select("*").eq("company_id", companyId).order("close_date"),
      context.supabase.from("ct_vesting_schedules").select("*").eq("company_id", companyId).order("name"),
      context.supabase.from("ct_securities").select("*").eq("company_id", companyId).order("issue_date"),
      context.supabase
        .from("ct_transactions")
        .select("*")
        .eq("company_id", companyId)
        .order("effective_date", { ascending: false })
        .limit(300),
      context.supabase
        .from("ct_events")
        .select("*")
        .eq("company_id", companyId)
        .order("occurred_at", { ascending: false })
        .limit(300),
      context.supabase
        .from("ct_documents")
        .select("id, title, doc_type, purpose, status, stakeholder_id, security_id, transaction_id, round_id, uploaded_by, created_at, updated_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    let canManage = false;
    if (!company.is_demo) {
      const { data: allowed } = await context.supabase.rpc("ct_can_manage", { _company_id: companyId });
      canManage = Boolean(allowed);
    }

    const holderById = new Map((stakeholders ?? []).map((s: any) => [s.id, s]));
    const classById = new Map((classes ?? []).map((c: any) => [c.id, c]));
    const roundById = new Map((rounds ?? []).map((r: any) => [r.id, r]));
    const vestById = new Map((vesting ?? []).map((v: any) => [v.id, v]));

    // Balances are derived from the transaction history, never stored.
    const balances = new Map<string, number>();
    for (const tx of (transactions ?? []) as any[]) {
      if (!tx.security_id) continue;
      if (tx.status === "rejected" || tx.status === "pending") continue;
      balances.set(tx.security_id, (balances.get(tx.security_id) ?? 0) + n(tx.quantity));
    }

    const rows = ((securities ?? []) as any[]).map((s) => {
      const holder = holderById.get(s.stakeholder_id);
      const cls = s.class_id ? classById.get(s.class_id) : null;
      const round = s.round_id ? roundById.get(s.round_id) : null;
      const sched = s.vesting_schedule_id ? vestById.get(s.vesting_schedule_id) : null;
      const outstanding = balances.has(s.id) ? balances.get(s.id)! : n(s.quantity);
      // Same vesting maths the holder sees in My Equity, so the two agree.
      const vest = computeVesting(
        outstanding,
        sched
          ? {
              name: sched.name as string,
              startDate: (sched.start_date as string | null) ?? null,
              cliffMonths: Number(sched.cliff_months ?? 0),
              durationMonths: Number(sched.duration_months ?? 0),
              frequency: (sched.frequency as string) ?? "monthly",
            }
          : null,
      );
      return {
        id: s.id as string,
        stakeholderId: s.stakeholder_id as string,
        stakeholder: holder?.name ?? "Unknown holder",
        stakeholderType: holder?.stakeholder_type ?? "other",
        className: cls?.name ?? null,
        classKind: cls?.kind ?? null,
        roundName: round?.name ?? null,
        securityType: s.security_type as string,
        securityLabel: kindMeta(s.security_type).label,
        label: s.label as string | null,
        quantity: outstanding,
        originalQuantity: n(s.quantity),
        vested: vest.vested,
        unvested: vest.unvested,
        vestedPercent: vest.percent,
        nextVestDate: vest.nextVestDate,
        nextVestQuantity: vest.nextVestQuantity,
        fullyVestedDate: vest.fullyVestedDate,
        accepted: Boolean(s.accepted_at),
        issueDate: s.issue_date as string | null,
        purchasePrice: s.purchase_price === null ? null : n(s.purchase_price),
        exercisePrice: s.exercise_price === null ? null : n(s.exercise_price),
        principal: s.principal === null ? null : n(s.principal),
        valuationCap: s.valuation_cap === null ? null : n(s.valuation_cap),
        discountRate: s.discount_rate === null ? null : n(s.discount_rate),
        vesting: sched ? `${sched.name}` : null,
        vestingStart: sched?.start_date ?? null,
        transferRestrictions: s.transfer_restrictions as string | null,
        status: s.status as string,
        verificationStatus: s.verification_status as string,
        notes: s.notes as string | null,
      };
    });

    const outstandingShares = rows
      .filter((r) => kindMeta(r.securityType).outstanding)
      .reduce((sum, r) => sum + r.quantity, 0);
    const dilutedIssued = rows
      .filter((r) => kindMeta(r.securityType).diluted)
      .reduce((sum, r) => sum + r.quantity, 0);

    const pool = (classes ?? []).find((c: any) => c.kind === "option_pool");
    const poolSize = n(pool?.authorized);
    const granted = rows
      .filter((r) => r.securityType === "option" || r.securityType === "rsu")
      .reduce((sum, r) => sum + r.quantity, 0);
    const poolAvailable = Math.max(poolSize - granted, 0);
    const fullyDiluted = dilutedIssued + poolAvailable;

    const byStakeholder = new Map<
      string,
      {
        id: string;
        name: string;
        type: string;
        outstanding: number;
        diluted: number;
        vested: number;
        unvested: number;
      }
    >();
    for (const row of rows) {
      const entry = byStakeholder.get(row.stakeholderId) ?? {
        id: row.stakeholderId,
        name: row.stakeholder,
        type: row.stakeholderType,
        outstanding: 0,
        diluted: 0,
        vested: 0,
        unvested: 0,
      };
      if (kindMeta(row.securityType).outstanding) entry.outstanding += row.quantity;
      if (kindMeta(row.securityType).diluted) {
        entry.diluted += row.quantity;
        entry.vested += row.vested;
        entry.unvested += row.unvested;
      }
      byStakeholder.set(row.stakeholderId, entry);
    }

    const equityRows = rows.filter((r) => r.securityType === "option" || r.securityType === "rsu");
    const vestedShares = rows
      .filter((r) => kindMeta(r.securityType).diluted)
      .reduce((sum, r) => sum + r.vested, 0);
    const unvestedShares = rows
      .filter((r) => kindMeta(r.securityType).diluted)
      .reduce((sum, r) => sum + r.unvested, 0);

    const metrics = {
      authorizedShares: n(company.authorized_shares),
      outstandingShares,
      fullyDiluted,
      poolSize,
      poolGranted: granted,
      poolAvailable,
      stakeholders: (stakeholders ?? []).length,
      employeesWithEquity: new Set(
        rows.filter((r) => r.stakeholderType === "employee").map((r) => r.stakeholderId),
      ).size,
      investors: new Set(
        rows.filter((r) => r.stakeholderType === "investor").map((r) => r.stakeholderId),
      ).size,
      spvs: (stakeholders ?? []).filter((s: any) => s.stakeholder_type === "spv" || s.stakeholder_type === "fund").length,
      safes: rows.filter((r) => r.securityType === "safe").length,
      safePrincipal: rows
        .filter((r) => r.securityType === "safe")
        .reduce((sum, r) => sum + (r.principal ?? 0), 0),
      notes: rows.filter((r) => r.securityType === "note").length,
      notePrincipal: rows
        .filter((r) => r.securityType === "note")
        .reduce((sum, r) => sum + (r.principal ?? 0), 0),
      pendingTransactions: ((transactions ?? []) as any[]).filter((t) => t.status === "pending").length,
      unverifiedSecurities: rows.filter(
        (r) => r.verificationStatus !== "verified" && r.verificationStatus !== "verified_direct",
      ).length,
      missingDocuments: rows.filter((r) => !r.label).length,
      rounds: (rounds ?? []).length,
      vestedShares,
      unvestedShares,
      grantsOutstanding: equityRows.reduce((sum, r) => sum + r.quantity, 0),
      grantsVested: equityRows.reduce((sum, r) => sum + r.vested, 0),
      grantsUnvested: equityRows.reduce((sum, r) => sum + r.unvested, 0),
      grantsAwaitingAcceptance: equityRows.filter((r) => !r.accepted).length,
    };

    const ownership = [...byStakeholder.values()]
      .map((s) => ({
        ...s,
        outstandingPct: outstandingShares ? (s.outstanding / outstandingShares) * 100 : 0,
        dilutedPct: fullyDiluted ? (s.diluted / fullyDiluted) * 100 : 0,
      }))
      .sort((a, b) => b.dilutedPct - a.dilutedPct);

    return {
      companies: companies.map((c) => ({
        id: c.id as string,
        name: c.name as string,
        isDemo: Boolean(c.is_demo),
      })),
      company: {
        id: companyId,
        name: company.name as string,
        legalName: company.legal_name as string | null,
        entityType: company.entity_type as string | null,
        jurisdiction: company.jurisdiction as string | null,
        incorporationDate: company.incorporation_date as string | null,
        authorizedShares: n(company.authorized_shares),
        parValue: company.par_value === null ? null : n(company.par_value),
        fiscalYearEnd: company.fiscal_year_end as string | null,
        currency: (company.currency as string) ?? "USD",
        isDemo: Boolean(company.is_demo),
      },
      canManage,
      stakeholders: ((stakeholders ?? []) as any[]).map((s) => ({
        id: s.id as string,
        name: s.name as string,
        email: s.email as string | null,
        type: s.stakeholder_type as string,
        entityName: s.entity_name as string | null,
        title: s.title as string | null,
      })),
      classes: ((classes ?? []) as any[]).map((c) => ({
        id: c.id as string,
        name: c.name as string,
        kind: c.kind as string,
        seniority: Number(c.seniority ?? 0),
        authorized: c.authorized === null ? null : n(c.authorized),
        pricePerShare: c.price_per_share === null ? null : n(c.price_per_share),
        liquidationPreference: c.liquidation_preference === null ? null : n(c.liquidation_preference),
        conversionRatio: n(c.conversion_ratio ?? 1),
      })),
      rounds: ((rounds ?? []) as any[]).map((r) => ({
        id: r.id as string,
        name: r.name as string,
        roundType: r.round_type as string,
        closeDate: r.close_date as string | null,
        preMoney: r.pre_money === null ? null : n(r.pre_money),
        amountRaised: r.amount_raised === null ? null : n(r.amount_raised),
        pricePerShare: r.price_per_share === null ? null : n(r.price_per_share),
        status: r.status as string,
      })),
      vesting: ((vesting ?? []) as any[]).map((v) => ({
        id: v.id as string,
        name: v.name as string,
        startDate: v.start_date as string | null,
        cliffMonths: Number(v.cliff_months ?? 0),
        durationMonths: Number(v.duration_months ?? 0),
        frequency: v.frequency as string,
      })),
      securities: rows,
      ownership,
      transactions: ((transactions ?? []) as any[]).map((t) => ({
        id: t.id as string,
        kind: t.kind as string,
        quantity: n(t.quantity),
        amount: t.amount === null ? null : n(t.amount),
        effectiveDate: t.effective_date as string,
        status: t.status as string,
        reason: t.reason as string | null,
        stakeholder: t.stakeholder_id ? (holderById.get(t.stakeholder_id)?.name ?? null) : null,
        counterparty: t.counterparty_stakeholder_id
          ? (holderById.get(t.counterparty_stakeholder_id)?.name ?? null)
          : null,
        securityId: t.security_id as string | null,
        stakeholderId: t.stakeholder_id as string | null,
        counterpartyId: t.counterparty_stakeholder_id as string | null,
        postingStatus: ((t.posting_status as string) ?? "draft") as "draft" | "review" | "posted",
        reversesTransactionId: t.reverses_transaction_id as string | null,
        postedAt: t.posted_at as string | null,
      })),
      events: ((events ?? []) as any[]).map((e) => ({
        id: e.id as string,
        action: e.action as string,
        entityType: e.entity_type as string | null,
        entityId: e.entity_id as string | null,
        reason: e.reason as string | null,
        occurredAt: e.occurred_at as string,
      })),
      documents: ((documents ?? []) as any[]).map((d) => ({
        id: d.id as string,
        title: d.title as string,
        docType: d.doc_type as string,
        purpose: d.purpose as string | null,
        status: d.status as string,
        stakeholderId: d.stakeholder_id as string | null,
        securityId: d.security_id as string | null,
        transactionId: d.transaction_id as string | null,
        roundId: d.round_id as string | null,
        uploadedBy: d.uploaded_by as string | null,
        createdAt: d.created_at as string,
        updatedAt: d.updated_at as string,
      })),
      metrics,
    };
  });

/* ------------------------------------------------------------------ writes */

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

export const createCapCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        name: z.string().trim().min(1).max(160),
        legalName: z.string().trim().max(200).optional().nullable(),
        entityType: z.string().trim().max(80).optional().nullable(),
        jurisdiction: z.string().trim().max(80).optional().nullable(),
        incorporationDate: z.string().trim().optional().nullable(),
        authorizedShares: z.number().nonnegative().default(0),
        parValue: z.number().nonnegative().optional().nullable(),
        fiscalYearEnd: z.string().trim().max(10).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // Only the caller's own (non read-only) company, or cap-table staff.
    const [{ data: member }, { data: staff }] = await Promise.all([
      context.supabase
        .from("client_users")
        .select("client_role")
        .eq("client_id", data.clientId)
        .eq("user_id", context.userId)
        .maybeSingle(),
      context.supabase.rpc("ct_is_staff"),
    ]);
    if (!staff && (!member || member.client_role === "client_readonly")) {
      throw new Error("You can only set up the cap table for a company you administer.");
    }
    const { data: row, error } = await context.supabase
      .from("ct_companies")
      .insert({
        client_id: data.clientId,
        name: data.name,
        legal_name: data.legalName ?? null,
        entity_type: data.entityType ?? null,
        jurisdiction: data.jurisdiction ?? null,
        incorporation_date: data.incorporationDate || null,
        authorized_shares: data.authorizedShares,
        par_value: data.parValue ?? null,
        fiscal_year_end: data.fiscalYearEnd ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await recordEvent(context, {
      companyId: row.id,
      action: "company.created",
      entityType: "company",
      entityId: row.id,
      next: data,
    });
    return { companyId: row.id as string };
  });

export const saveCapStakeholder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        id: z.string().uuid().optional().nullable(),
        name: z.string().trim().min(1).max(160),
        email: z.string().trim().email().max(200).optional().or(z.literal("")).nullable(),
        type: z.string().trim().min(1).max(40),
        entityName: z.string().trim().max(200).optional().nullable(),
        title: z.string().trim().max(120).optional().nullable(),
        notes: z.string().trim().max(2000).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertManage(context, data.companyId);
    const payload = {
      company_id: data.companyId,
      name: data.name,
      email: data.email || null,
      stakeholder_type: data.type,
      entity_name: data.entityName || null,
      title: data.title || null,
      notes: data.notes || null,
    };
    if (data.id) {
      const { error } = await context.supabase.from("ct_stakeholders").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      await recordEvent(context, {
        companyId: data.companyId,
        action: "stakeholder.updated",
        entityType: "stakeholder",
        entityId: data.id,
        next: payload,
      });
      return { id: data.id };
    }
    // Reuse an existing holder with the same email instead of duplicating them.
    if (payload.email) {
      const { data: existing } = await context.supabase
        .from("ct_stakeholders")
        .select("id")
        .eq("company_id", data.companyId)
        .ilike("email", payload.email)
        .maybeSingle();
      if (existing?.id) return { id: existing.id as string, reused: true };
    }
    const { data: row, error } = await context.supabase
      .from("ct_stakeholders")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await recordEvent(context, {
      companyId: data.companyId,
      action: "stakeholder.added",
      entityType: "stakeholder",
      entityId: row.id,
      next: payload,
    });
    return { id: row.id as string };
  });

export const issueCapSecurity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        stakeholderId: z.string().uuid(),
        classId: z.string().uuid().optional().nullable(),
        roundId: z.string().uuid().optional().nullable(),
        vestingScheduleId: z.string().uuid().optional().nullable(),
        securityType: z.string().trim().min(1).max(40),
        label: z.string().trim().max(60).optional().nullable(),
        quantity: z.number().nonnegative().default(0),
        issueDate: z.string().trim().optional().nullable(),
        purchasePrice: z.number().nonnegative().optional().nullable(),
        exercisePrice: z.number().nonnegative().optional().nullable(),
        principal: z.number().nonnegative().optional().nullable(),
        valuationCap: z.number().nonnegative().optional().nullable(),
        discountRate: z.number().nonnegative().max(100).optional().nullable(),
        transferRestrictions: z.string().trim().max(500).optional().nullable(),
        notes: z.string().trim().max(2000).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertManage(context, data.companyId);
    const { data: row, error } = await context.supabase
      .from("ct_securities")
      .insert({
        company_id: data.companyId,
        stakeholder_id: data.stakeholderId,
        class_id: data.classId || null,
        round_id: data.roundId || null,
        vesting_schedule_id: data.vestingScheduleId || null,
        security_type: data.securityType,
        label: data.label || null,
        quantity: data.quantity,
        issue_date: data.issueDate || null,
        purchase_price: data.purchasePrice ?? null,
        exercise_price: data.exercisePrice ?? null,
        principal: data.principal ?? null,
        valuation_cap: data.valuationCap ?? null,
        discount_rate: data.discountRate ?? null,
        transfer_restrictions: data.transferRestrictions || null,
        notes: data.notes || null,
        status: "recorded",
        verification_status: "verified",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const kind = data.securityType === "option" || data.securityType === "rsu" ? "grant" : "issuance";
    await context.supabase.from("ct_transactions").insert({
      company_id: data.companyId,
      security_id: row.id,
      stakeholder_id: data.stakeholderId,
      round_id: data.roundId || null,
      kind,
      quantity: data.quantity,
      amount: data.quantity * (data.purchasePrice ?? 0),
      effective_date: data.issueDate || new Date().toISOString().slice(0, 10),
      status: "recorded",
      reason: "Recorded in Harmonious CapTable",
      created_by: context.userId,
    });

    await recordEvent(context, {
      companyId: data.companyId,
      action: kind === "grant" ? "grant.issued" : "security.issued",
      entityType: "security",
      entityId: row.id,
      next: data,
    });
    return { id: row.id as string };
  });

export const recordCapTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        securityId: z.string().uuid(),
        kind: z.string().trim().min(1).max(40),
        quantity: z.number(),
        amount: z.number().optional().nullable(),
        effectiveDate: z.string().trim().min(4),
        reason: z.string().trim().min(3).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertManage(context, data.companyId);
    const { data: security, error: secError } = await context.supabase
      .from("ct_securities")
      .select("id, stakeholder_id, company_id")
      .eq("id", data.securityId)
      .maybeSingle();
    if (secError) throw new Error(secError.message);
    if (!security || security.company_id !== data.companyId) throw new Error("Security not found.");

    const signed = ["cancellation", "repurchase", "exercise"].includes(data.kind)
      ? -Math.abs(data.quantity)
      : data.quantity;

    const { data: row, error } = await context.supabase
      .from("ct_transactions")
      .insert({
        company_id: data.companyId,
        security_id: data.securityId,
        stakeholder_id: security.stakeholder_id,
        kind: data.kind,
        quantity: signed,
        amount: data.amount ?? null,
        effective_date: data.effectiveDate,
        status: "recorded",
        reason: data.reason,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await recordEvent(context, {
      companyId: data.companyId,
      action: `transaction.${data.kind}`,
      entityType: "transaction",
      entityId: row.id,
      next: { ...data, quantity: signed },
      reason: data.reason,
    });
    return { id: row.id as string };
  });

/** Records a linked reversal of a finalized transaction. The original row is never edited. */
export const reverseCapTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        originalId: z.string().uuid(),
        correctionType: z.enum(["full_reversal", "partial_reversal"]),
        quantity: z.number().positive().optional(),
        effectiveDate: z.string().trim().min(4),
        reason: z.string().trim().min(5).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertManage(context, data.companyId);
    const { data: orig, error } = await context.supabase
      .from("ct_transactions")
      .select("*")
      .eq("id", data.originalId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const plan = planReversal(orig as any, data);
    if (!plan.ok) throw new Error(plan.error);
    const { data: existing } = await context.supabase
      .from("ct_transactions").select("id, quantity").eq("reverses_transaction_id", data.originalId);
    const already = ((existing ?? []) as any[]).reduce((a, r) => a + Math.abs(Number(r.quantity)), 0);
    if (already + Math.abs(plan.row.quantity) > Math.abs(Number((orig as any).quantity)) + 1e-9)
      throw new Error("This transaction has already been reversed for that quantity.");
    const { data: row, error: insErr } = await context.supabase
      .from("ct_transactions")
      .insert({ ...plan.row, created_by: context.userId, status: "recorded" } as any)
      .select("id").single();
    if (insErr) throw new Error(insErr.message);
    await recordEvent(context, {
      companyId: data.companyId, action: "transaction.reversal", entityType: "transaction",
      entityId: row.id, previous: { originalId: data.originalId }, next: plan.row, reason: data.reason,
    });
    return { id: row.id as string };
  });
