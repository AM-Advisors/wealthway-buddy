import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Harmonious CapTable — Phase 2.
 *
 * Employee equity and investor records, plus the holder-side portal where each
 * person sees only their own position. Permissions are per holder and set by the
 * company; nothing a holder does here changes the official ledger on its own —
 * an exercise request stays pending until someone with authority records it.
 */

const EMPLOYEE_TYPES = ["employee", "advisor", "founder"];
const INVESTOR_TYPES = ["investor", "entity", "fund", "spv", "other"];

const DEFAULT_PERMISSIONS = {
  canViewHoldings: true,
  canViewVesting: true,
  canViewDocuments: true,
  canViewTransactions: true,
  canViewCompanySummary: false,
  canViewValuations: false,
  canViewTaxDocuments: false,
  canRequestExercise: true,
};

function mapPermissions(row: any) {
  if (!row) return { ...DEFAULT_PERMISSIONS, isDefault: true, notes: null as string | null };
  return {
    canViewHoldings: Boolean(row.can_view_holdings),
    canViewVesting: Boolean(row.can_view_vesting),
    canViewDocuments: Boolean(row.can_view_documents),
    canViewTransactions: Boolean(row.can_view_transactions),
    canViewCompanySummary: Boolean(row.can_view_company_summary),
    canViewValuations: Boolean(row.can_view_valuations),
    canViewTaxDocuments: Boolean(row.can_view_tax_documents),
    canRequestExercise: Boolean(row.can_request_exercise),
    notes: (row.notes as string | null) ?? null,
    isDefault: false,
  };
}

function n(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function recordEvent(
  context: any,
  entry: { companyId: string; action: string; entityType?: string; entityId?: string | null; next?: unknown; reason?: string | null },
) {
  await context.supabase.from("ct_events").insert({
    company_id: entry.companyId,
    actor_id: context.userId,
    action: entry.action,
    entity_type: entry.entityType ?? null,
    entity_id: entry.entityId ?? null,
    new_state: (entry.next ?? null) as any,
    reason: entry.reason ?? null,
  });
}

async function assertManage(context: any, companyId: string) {
  const { data } = await context.supabase.rpc("ct_can_manage", { _company_id: companyId });
  if (!data) throw new Error("You do not have authority to change this cap table.");
}

/* ------------------------------------------------------- holder-side portal */

/**
 * Everything the signed-in person holds, across every company that recorded
 * them as a stakeholder. Row level security does the scoping; this only shapes
 * the data and applies the company's permission settings.
 */
export const getMyEquity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;
    const email = String((claims as any)?.email ?? "").toLowerCase() || null;

    // Match an invited holder to their account the first time they sign in.
    if (email) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("ct_stakeholders")
        .update({ user_id: userId })
        .is("user_id", null)
        .ilike("email", email);
    }

    const { data: stakeholders } = await supabase
      .from("ct_stakeholders")
      .select("id, company_id, name, email, stakeholder_type, title, entity_name")
      .eq("user_id", userId);

    const holders = (stakeholders ?? []) as any[];
    if (holders.length === 0) return { holdings: [] };

    const ids = holders.map((h) => h.id);
    const companyIds = [...new Set(holders.map((h) => h.company_id))];

    const [
      { data: companies },
      { data: securities },
      { data: transactions },
      { data: schedules },
      { data: permissions },
      { data: requests },
      { data: documents },
    ] = await Promise.all([
      supabase.from("ct_companies").select("id, name, legal_name, currency, is_demo").in("id", companyIds),
      supabase.from("ct_securities").select("*").in("stakeholder_id", ids),
      supabase
        .from("ct_transactions")
        .select("id, kind, quantity, amount, effective_date, status, reason, stakeholder_id, security_id")
        .in("stakeholder_id", ids)
        .order("effective_date", { ascending: false })
        .limit(200),
      supabase.from("ct_vesting_schedules").select("*"),
      supabase.from("ct_holder_permissions").select("*").in("stakeholder_id", ids),
      supabase
        .from("ct_exercise_requests")
        .select("*")
        .in("stakeholder_id", ids)
        .order("created_at", { ascending: false }),
      supabase.from("ct_documents").select("id, title, doc_type, linked_id, linked_type, status, created_at"),
    ]);

    // Secondary transfers where this person is the seller or the named buyer.
    // Row level security keeps every other transfer out of reach.
    const { data: transfers } = await supabase
      .from("ct_secondary_transfers")
      .select(
        "id, company_id, seller_stakeholder_id, buyer_stakeholder_id, buyer_name, quantity, price_per_share, total_amount, status, restriction_status, rofr_status, consent_status, proposed_date, closed_date, created_at",
      )
      .order("created_at", { ascending: false });

    const companyById = new Map(((companies ?? []) as any[]).map((c) => [c.id, c]));
    const scheduleById = new Map(((schedules ?? []) as any[]).map((s) => [s.id, s]));
    const permByStakeholder = new Map(((permissions ?? []) as any[]).map((p) => [p.stakeholder_id, p]));

    // Balances come from the same event history the company cap table is built
    // from, so what a holder sees here always ties back to the official record.
    const balances = new Map<string, number>();
    for (const tx of ((transactions ?? []) as any[])) {
      if (!tx.security_id) continue;
      if (tx.status === "rejected" || tx.status === "pending") continue;
      balances.set(tx.security_id, (balances.get(tx.security_id) ?? 0) + n(tx.quantity));
    }

    const holdings = holders.map((holder) => {
      const perms = mapPermissions(permByStakeholder.get(holder.id));
      const company = companyById.get(holder.company_id);
      const mine = ((securities ?? []) as any[]).filter((s) => s.stakeholder_id === holder.id);

      const grants = mine.map((s) => {
        const sched = s.vesting_schedule_id ? scheduleById.get(s.vesting_schedule_id) : null;
        const outstanding = balances.has(s.id) ? balances.get(s.id)! : n(s.quantity);
        return {
          id: s.id as string,
          securityType: s.security_type as string,
          label: s.label as string | null,
          quantity: outstanding,
          originalQuantity: n(s.quantity),
          issueDate: s.issue_date as string | null,
          exercisePrice: s.exercise_price === null ? null : n(s.exercise_price),
          purchasePrice: s.purchase_price === null ? null : n(s.purchase_price),
          principal: s.principal === null ? null : n(s.principal),
          valuationCap: s.valuation_cap === null ? null : n(s.valuation_cap),
          status: s.status as string,
          verificationStatus: s.verification_status as string,
          transferRestrictions: s.transfer_restrictions as string | null,
          acceptedAt: s.accepted_at as string | null,
          acceptanceName: s.acceptance_name as string | null,
          schedule: sched
            ? {
                name: sched.name as string,
                startDate: sched.start_date as string | null,
                cliffMonths: Number(sched.cliff_months ?? 0),
                durationMonths: Number(sched.duration_months ?? 0),
                frequency: (sched.frequency as string) ?? "monthly",
              }
            : null,
          documents: perms.canViewDocuments
            ? ((documents ?? []) as any[])
                .filter((d) => d.linked_type === "security" && d.linked_id === s.id)
                .map((d) => ({
                  id: d.id as string,
                  title: d.title as string,
                  docType: d.doc_type as string | null,
                  status: d.status as string,
                  createdAt: d.created_at as string,
                }))
            : [],
        };
      });

      return {
        stakeholderId: holder.id as string,
        name: holder.name as string,
        email: holder.email as string | null,
        title: holder.title as string | null,
        stakeholderType: holder.stakeholder_type as string,
        company: {
          id: holder.company_id as string,
          name: (company?.name as string) ?? "Company",
          legalName: (company?.legal_name as string) ?? null,
          currency: (company?.currency as string) ?? "USD",
          isDemo: Boolean(company?.is_demo),
        },
        permissions: perms,
        grants: perms.canViewHoldings ? grants : [],
        transactions: perms.canViewTransactions
          ? ((transactions ?? []) as any[])
              .filter((t) => t.stakeholder_id === holder.id)
              .map((t) => ({
                id: t.id as string,
                kind: t.kind as string,
                quantity: n(t.quantity),
                amount: t.amount === null ? null : n(t.amount),
                effectiveDate: t.effective_date as string,
                status: t.status as string,
                reason: t.reason as string | null,
              }))
          : [],
        transfers: perms.canViewTransactions
          ? ((transfers ?? []) as any[])
              .filter(
                (t) =>
                  t.seller_stakeholder_id === holder.id || t.buyer_stakeholder_id === holder.id,
              )
              .map((t) => ({
                id: t.id as string,
                side: t.seller_stakeholder_id === holder.id ? "selling" : "buying",
                counterparty:
                  t.seller_stakeholder_id === holder.id
                    ? ((t.buyer_name as string | null) ?? "Buyer to be named")
                    : "The selling shareholder",
                quantity: n(t.quantity),
                pricePerShare: t.price_per_share === null ? null : n(t.price_per_share),
                totalAmount: t.total_amount === null ? null : n(t.total_amount),
                status: t.status as string,
                restrictionStatus: t.restriction_status as string,
                rofrStatus: t.rofr_status as string,
                consentStatus: t.consent_status as string,
                proposedDate: t.proposed_date as string | null,
                closedDate: t.closed_date as string | null,
              }))
          : [],
        exerciseRequests: ((requests ?? []) as any[])
          .filter((r) => r.stakeholder_id === holder.id)
          .map((r) => ({
            id: r.id as string,
            securityId: r.security_id as string,
            quantity: n(r.quantity),
            exercisePrice: r.exercise_price === null ? null : n(r.exercise_price),
            totalCost: r.total_cost === null ? null : n(r.total_cost),
            method: r.method as string,
            note: r.note as string | null,
            status: r.status as string,
            decisionNote: r.decision_note as string | null,
            createdAt: r.created_at as string,
            decidedAt: r.decided_at as string | null,
          })),
      };
    });

    return { holdings };
  });

/** A holder accepting the terms of their own grant. Recordkeeping only. */
export const acceptCapGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ securityId: z.string().uuid(), legalName: z.string().trim().min(2).max(160) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: security } = await supabase
      .from("ct_securities")
      .select("id, company_id, stakeholder_id, accepted_at")
      .eq("id", data.securityId)
      .maybeSingle();
    if (!security) throw new Error("Grant not found.");

    const { data: isHolder } = await supabase.rpc("ct_is_holder", {
      _stakeholder_id: security.stakeholder_id,
    });
    if (!isHolder) throw new Error("This grant is not yours to accept.");
    if (security.accepted_at) return { ok: true };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("ct_securities")
      .update({
        accepted_at: new Date().toISOString(),
        accepted_by: userId,
        acceptance_name: data.legalName,
      })
      .eq("id", data.securityId);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("ct_events").insert({
      company_id: security.company_id,
      actor_id: userId,
      action: "grant.accepted",
      entity_type: "security",
      entity_id: data.securityId,
      new_state: { accepted_by_name: data.legalName } as any,
      reason: "Holder accepted their grant in the portal",
    });
    return { ok: true };
  });

/** A holder asking to exercise vested options. Stays pending until recorded. */
export const requestCapExercise = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        securityId: z.string().uuid(),
        quantity: z.number().positive(),
        method: z.enum(["cash", "cashless", "other"]).default("cash"),
        note: z.string().trim().max(1000).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: security } = await supabase
      .from("ct_securities")
      .select("id, company_id, stakeholder_id, exercise_price, quantity, security_type")
      .eq("id", data.securityId)
      .maybeSingle();
    if (!security) throw new Error("Grant not found.");
    if (data.quantity > n(security.quantity)) {
      throw new Error("You cannot request more shares than the grant holds.");
    }

    const { data: perms } = await supabase
      .from("ct_holder_permissions")
      .select("can_request_exercise")
      .eq("stakeholder_id", security.stakeholder_id)
      .maybeSingle();
    if (perms && perms.can_request_exercise === false) {
      throw new Error("Exercise requests are not enabled on your account. Contact your company.");
    }

    const price = security.exercise_price === null ? null : n(security.exercise_price);
    const { data: row, error } = await supabase
      .from("ct_exercise_requests")
      .insert({
        company_id: security.company_id,
        security_id: security.id,
        stakeholder_id: security.stakeholder_id,
        quantity: data.quantity,
        exercise_price: price,
        total_cost: price === null ? null : price * data.quantity,
        method: data.method,
        note: data.note || null,
        status: "pending",
        requested_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const withdrawCapExercise = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("ct_exercise_requests")
      .update({ status: "withdrawn" })
      .eq("id", data.id)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------- company-side desks */

/**
 * Employee equity centre / investor management, depending on the audience.
 * One holder per row with their grants, vesting, acceptance and permissions.
 */
export const getCapHolderDesk = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        audience: z.enum(["employee", "investor"]).default("employee"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const types = data.audience === "employee" ? EMPLOYEE_TYPES : INVESTOR_TYPES;

    const [
      { data: stakeholders },
      { data: securities },
      { data: schedules },
      { data: permissions },
      { data: requests },
      { data: rounds },
    ] = await Promise.all([
      supabase
        .from("ct_stakeholders")
        .select("*")
        .eq("company_id", data.companyId)
        .in("stakeholder_type", types)
        .order("name"),
      supabase.from("ct_securities").select("*").eq("company_id", data.companyId),
      supabase.from("ct_vesting_schedules").select("*").eq("company_id", data.companyId),
      supabase.from("ct_holder_permissions").select("*").eq("company_id", data.companyId),
      supabase
        .from("ct_exercise_requests")
        .select("*")
        .eq("company_id", data.companyId)
        .order("created_at", { ascending: false }),
      supabase.from("ct_rounds").select("id, name").eq("company_id", data.companyId),
    ]);

    const { data: canManage } = await supabase.rpc("ct_can_manage", { _company_id: data.companyId });
    const scheduleById = new Map(((schedules ?? []) as any[]).map((s) => [s.id, s]));
    const roundById = new Map(((rounds ?? []) as any[]).map((r) => [r.id, r]));
    const permByStakeholder = new Map(((permissions ?? []) as any[]).map((p) => [p.stakeholder_id, p]));
    const nameById = new Map(((stakeholders ?? []) as any[]).map((s) => [s.id, s.name]));

    const holders = ((stakeholders ?? []) as any[]).map((holder) => {
      const mine = ((securities ?? []) as any[]).filter((s) => s.stakeholder_id === holder.id);
      return {
        id: holder.id as string,
        name: holder.name as string,
        email: holder.email as string | null,
        title: holder.title as string | null,
        entityName: holder.entity_name as string | null,
        stakeholderType: holder.stakeholder_type as string,
        linked: Boolean(holder.user_id),
        permissions: mapPermissions(permByStakeholder.get(holder.id)),
        grants: mine.map((s) => {
          const sched = s.vesting_schedule_id ? scheduleById.get(s.vesting_schedule_id) : null;
          return {
            id: s.id as string,
            securityType: s.security_type as string,
            label: s.label as string | null,
            quantity: n(s.quantity),
            issueDate: s.issue_date as string | null,
            exercisePrice: s.exercise_price === null ? null : n(s.exercise_price),
            purchasePrice: s.purchase_price === null ? null : n(s.purchase_price),
            principal: s.principal === null ? null : n(s.principal),
            roundName: s.round_id ? ((roundById.get(s.round_id)?.name as string) ?? null) : null,
            status: s.status as string,
            verificationStatus: s.verification_status as string,
            acceptedAt: s.accepted_at as string | null,
            acceptanceName: s.acceptance_name as string | null,
            schedule: sched
              ? {
                  name: sched.name as string,
                  startDate: sched.start_date as string | null,
                  cliffMonths: Number(sched.cliff_months ?? 0),
                  durationMonths: Number(sched.duration_months ?? 0),
                  frequency: (sched.frequency as string) ?? "monthly",
                }
              : null,
          };
        }),
      };
    });

    return {
      canManage: Boolean(canManage),
      holders,
      exerciseRequests: ((requests ?? []) as any[]).map((r) => ({
        id: r.id as string,
        stakeholderId: r.stakeholder_id as string,
        stakeholder: nameById.get(r.stakeholder_id) ?? "Holder",
        securityId: r.security_id as string,
        quantity: n(r.quantity),
        exercisePrice: r.exercise_price === null ? null : n(r.exercise_price),
        totalCost: r.total_cost === null ? null : n(r.total_cost),
        method: r.method as string,
        note: r.note as string | null,
        status: r.status as string,
        decisionNote: r.decision_note as string | null,
        createdAt: r.created_at as string,
        decidedAt: r.decided_at as string | null,
      })),
    };
  });

export const saveHolderPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        stakeholderId: z.string().uuid(),
        canViewHoldings: z.boolean(),
        canViewVesting: z.boolean(),
        canViewDocuments: z.boolean(),
        canViewTransactions: z.boolean(),
        canViewCompanySummary: z.boolean(),
        canViewValuations: z.boolean(),
        canViewTaxDocuments: z.boolean(),
        canRequestExercise: z.boolean(),
        notes: z.string().trim().max(1000).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertManage(context, data.companyId);
    const payload = {
      company_id: data.companyId,
      stakeholder_id: data.stakeholderId,
      can_view_holdings: data.canViewHoldings,
      can_view_vesting: data.canViewVesting,
      can_view_documents: data.canViewDocuments,
      can_view_transactions: data.canViewTransactions,
      can_view_company_summary: data.canViewCompanySummary,
      can_view_valuations: data.canViewValuations,
      can_view_tax_documents: data.canViewTaxDocuments,
      can_request_exercise: data.canRequestExercise,
      notes: data.notes || null,
      updated_by: context.userId,
    };
    const { error } = await context.supabase
      .from("ct_holder_permissions")
      .upsert(payload, { onConflict: "stakeholder_id" });
    if (error) throw new Error(error.message);

    await recordEvent(context, {
      companyId: data.companyId,
      action: "holder.permissions_updated",
      entityType: "stakeholder",
      entityId: data.stakeholderId,
      next: payload,
    });
    return { ok: true };
  });

/**
 * Decide an exercise request. Approving records the exercise on the ledger as a
 * dated transaction; declining leaves the grant untouched. Either way the
 * decision, the person and the date are kept.
 */
export const decideCapExercise = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["approved", "declined"]),
        note: z.string().trim().max(1000).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: request } = await supabase
      .from("ct_exercise_requests")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!request) throw new Error("Request not found.");
    if (request.status !== "pending") throw new Error("This request has already been decided.");
    await assertManage(context, request.company_id);

    const { error } = await supabase
      .from("ct_exercise_requests")
      .update({
        status: data.decision,
        decision_note: data.note || null,
        decided_by: userId,
        decided_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    if (data.decision === "approved") {
      await supabase.from("ct_transactions").insert({
        company_id: request.company_id,
        security_id: request.security_id,
        stakeholder_id: request.stakeholder_id,
        kind: "exercise",
        quantity: -Math.abs(n(request.quantity)),
        amount: request.total_cost === null ? null : n(request.total_cost),
        effective_date: new Date().toISOString().slice(0, 10),
        status: "recorded",
        reason: data.note || "Exercise approved in Harmonious CapTable",
        created_by: userId,
      });
    }

    await recordEvent(context, {
      companyId: request.company_id,
      action: `exercise.${data.decision}`,
      entityType: "exercise_request",
      entityId: data.id,
      next: { quantity: n(request.quantity), decision: data.decision },
      reason: data.note || null,
    });
    return { ok: true };
  });

/** Invite a holder by recording their email so their account matches on sign-in. */
export const setHolderEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        stakeholderId: z.string().uuid(),
        email: z.string().trim().email().max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertManage(context, data.companyId);
    const { error } = await context.supabase
      .from("ct_stakeholders")
      .update({ email: data.email.toLowerCase() })
      .eq("id", data.stakeholderId)
      .eq("company_id", data.companyId);
    if (error) throw new Error(error.message);
    await recordEvent(context, {
      companyId: data.companyId,
      action: "holder.portal_access_email_set",
      entityType: "stakeholder",
      entityId: data.stakeholderId,
      next: { email: data.email.toLowerCase() },
    });
    return { ok: true };
  });
