import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertCanDecide, canApprovePricing, canProposePricing, canViewCommercial, clientFacingStatus,
} from "@/lib/commercial-pricing";

async function rolesOf(context: any): Promise<string[]> {
  const { data } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  return ((data ?? []) as any[]).map((r) => String(r.role));
}
const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;

/**
 * Services & Pricing for one Fund. Staff/Sales see the full snapshot; anyone
 * else must already be able to read the Fund (RLS) and sees only services,
 * price and a simple status — never baseline, approvals or notes.
 */
export const getFundServicesPricing = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offeringId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const roles = await rolesOf(context);
    const internal = canViewCommercial(roles) || roles.some((r) => ["operations", "compliance", "fund_administration", "tax"].includes(r));
    if (!internal) {
      const { data: visible } = await context.supabase.from("offerings").select("id").eq("id", data.offeringId).maybeSingle();
      if (!visible) throw new Error("Fund not found.");
    }
    const { currentSnapshot } = await import("@/lib/commercial-pricing.server");
    const snap: any = await currentSnapshot(data.offeringId);
    const status = (snap?.status ?? "legacy_review") as "approved" | "pricing_review" | "legacy_review";
    const lines = ((snap?.lines ?? []) as any[]).map((l) => ({
      serviceKey: l.service_key, label: l.label, pricingModel: l.pricing_model, passThrough: l.pass_through, finalCents: Number(l.final_cents),
      ...(internal ? { baselineCents: Number(l.baseline_cents), catalogCents: l.catalog_cents, clientCents: l.client_cents, baselineSource: l.baseline_source } : {}),
    }));
    return {
      internal,
      status: internal ? status : null,
      clientStatus: snap ? clientFacingStatus(status) : null,
      createdAt: snap?.created_at ?? null,
      lines,
      canReprice: canProposePricing(roles),
    };
  });

/** Sales area overview: commercial data only. */
export const getSalesOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await rolesOf(context);
    if (!canViewCommercial(roles)) throw new Error("Forbidden: the Sales area is for Harmonious commercial staff.");
    const db = await admin();
    const { loadBaseline } = await import("@/lib/commercial-pricing.server");
    const [clients, funds, snaps, reqs, msas, requests, cp, catalog] = await Promise.all([
      db.from("clients").select("id, legal_name, status, msa_signed_on").order("legal_name"),
      db.from("offerings").select("id, name, client_id, created_at").order("created_at", { ascending: false }),
      db.from("fund_pricing_snapshots").select("id, offering_id, client_id, status, source, baseline_total_cents, final_total_cents, created_at, superseded_at, created_by").order("created_at", { ascending: false }),
      db.from("pricing_approval_requests").select("*").order("created_at", { ascending: false }),
      db.from("client_msa_agreements").select("client_id, status, executed_at"),
      db.from("fund_requests").select("id, client_id, fund_name, status, created_at").order("created_at", { ascending: false }).limit(100),
      db.from("client_pricing").select("id, client_id, service_key, label, standard_cents, contracted_cents, effective_date, expires_on, scope, approval_reason, superseded_at, offering_id").is("offering_id", null).order("created_at", { ascending: false }),
      loadBaseline(null),
    ]);
    const clientName = new Map(((clients.data ?? []) as any[]).map((c) => [c.id, c.legal_name]));
    const fundName = new Map(((funds.data ?? []) as any[]).map((f) => [f.id, f.name]));
    const current = new Map(((snaps.data ?? []) as any[]).filter((s) => !s.superseded_at).map((s) => [s.offering_id, s]));
    const executed = new Set(((msas.data ?? []) as any[]).filter((m) => m.executed_at || m.status === "executed").map((m) => m.client_id));
    return {
      canApprove: canApprovePricing(roles),
      me: context.userId,
      clients: ((clients.data ?? []) as any[]).map((c) => ({
        id: c.id, name: c.legal_name, status: c.status,
        msaFollowUp: !(c.msa_signed_on || executed.has(c.id)),
        funds: ((funds.data ?? []) as any[]).filter((f) => f.client_id === c.id).length,
      })),
      funds: ((funds.data ?? []) as any[]).map((f) => ({
        id: f.id, name: f.name, clientName: clientName.get(f.client_id) ?? null,
        status: (current.get(f.id)?.status ?? "legacy_review") as string,
        finalTotalCents: current.get(f.id)?.final_total_cents ?? null,
      })),
      fundRequests: requests.error ? [] : ((requests.data ?? []) as any[]).map((r) => ({ id: r.id, name: r.fund_name, clientName: clientName.get(r.client_id) ?? null, status: r.status, createdAt: r.created_at })),
      approvals: ((reqs.data ?? []) as any[]).map((r) => ({ ...r, fundName: fundName.get(r.offering_id) ?? null, clientName: clientName.get(r.client_id) ?? null })),
      clientPricing: ((cp.data ?? []) as any[]).map((p) => ({ ...p, clientName: clientName.get(p.client_id) ?? null })),
      history: ((snaps.data ?? []) as any[]).map((s) => ({ ...s, fundName: fundName.get(s.offering_id) ?? null })),
      catalog: catalog.lines,
    };
  });

/**
 * Sales sets the Fund's final prices before its snapshot is finalised (no
 * applications yet). At/above baseline → Approved; below → Pricing Approval Required.
 */
export const priceFund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    offeringId: z.string().uuid(), prices: z.record(z.string(), z.number().int().min(0)), reason: z.string().max(1000).optional(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const roles = await rolesOf(context);
    if (!canProposePricing(roles)) throw new Error("Forbidden: pricing is set by Harmonious Sales.");
    const db = await admin();
    const { data: fund } = await db.from("offerings").select("id, client_id").eq("id", data.offeringId).maybeSingle();
    if (!fund) throw new Error("Fund not found.");
    const { count } = await db.from("investor_applications").select("id", { count: "exact", head: true }).eq("offering_id", data.offeringId);
    if ((count ?? 0) > 0) throw new Error("This Fund's pricing is already final — it has investors. Existing Funds are never repriced.");
    const { data: open } = await db.from("pricing_approval_requests").select("id").eq("offering_id", data.offeringId).eq("status", "pending").maybeSingle();
    if (open) throw new Error("A pricing request for this Fund is already waiting for approval.");
    const { createFundPricingSnapshot } = await import("@/lib/commercial-pricing.server");
    return createFundPricingSnapshot({ offeringId: data.offeringId, clientId: fund.client_id, actorId: context.userId, source: "sales_pricing", requested: data.prices, reason: data.reason ?? null });
  });

/** Sales Management / Super User decides a below-baseline request (never their own). */
export const decidePricingRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    requestId: z.string().uuid(), approve: z.boolean(), scope: z.enum(["fund_only", "client_future"]).optional(), reason: z.string().min(3).max(1000),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const roles = await rolesOf(context);
    const db = await admin();
    const { data: req } = await db.from("pricing_approval_requests").select("*").eq("id", data.requestId).maybeSingle();
    if (!req) throw new Error("Request not found.");
    if (req.status !== "pending") throw new Error("This request has already been decided.");
    assertCanDecide(roles, context.userId, req.requested_by);
    if (data.approve && !data.scope) throw new Error("Choose This Fund Only or Client Pricing — Future Funds.");
    const now = new Date().toISOString();
    const { error } = await db.from("pricing_approval_requests").update({
      status: data.approve ? "approved" : "rejected", decision_scope: data.approve ? data.scope : null,
      decided_by: context.userId, decided_at: now, decision_reason: data.reason,
    }).eq("id", req.id);
    if (error) throw new Error(error.message);
    if (data.approve) {
      await db.from("fund_pricing_snapshots").update({ status: "approved", approved_exception: { requestId: req.id, scope: data.scope, approvedBy: context.userId, approvedAt: now, reason: data.reason } }).eq("id", req.snapshot_id);
      if (data.scope === "client_future" && req.client_id) {
        const rows = ((req.lines ?? []) as any[]).map((l) => ({
          client_id: req.client_id, service_key: l.serviceKey, label: l.label, standard_cents: l.baselineCents, contracted_cents: l.finalCents,
          effective_date: now.slice(0, 10), approved_by: context.userId, approved_at: now, approval_reason: data.reason, scope: "client_future", pricing_source: "pricing_exception",
        }));
        if (rows.length) { const { error: ce } = await db.from("client_pricing").insert(rows); if (ce) throw new Error(ce.message); }
      }
    } else if (req.offering_id) {
      const { createFundPricingSnapshot } = await import("@/lib/commercial-pricing.server");
      await createFundPricingSnapshot({ offeringId: req.offering_id, clientId: req.client_id, actorId: context.userId, source: "discount_declined" });
    }
    return { ok: true };
  });

/** Client Pricing for future Funds — Sales Management / Super User only. */
export const saveClientPricing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    clientId: z.string().uuid(), serviceKey: z.string().min(1), priceCents: z.number().int().min(0),
    effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
    reason: z.string().min(3).max(1000),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const roles = await rolesOf(context);
    if (!canApprovePricing(roles)) throw new Error("Only Sales Management or a Super User can set Client Pricing.");
    const { loadBaseline } = await import("@/lib/commercial-pricing.server");
    const item = (await loadBaseline(null)).lines.find((l) => l.serviceKey === data.serviceKey);
    if (!item) throw new Error("That service is not on the current rate card.");
    const db = await admin();
    const now = new Date().toISOString();
    await db.from("client_pricing").update({ superseded_at: now }).eq("client_id", data.clientId).eq("service_key", data.serviceKey).is("offering_id", null).is("superseded_at", null);
    const { error } = await db.from("client_pricing").insert({
      client_id: data.clientId, service_key: data.serviceKey, label: item.label, standard_cents: item.catalogCents, contracted_cents: data.priceCents,
      effective_date: data.effectiveDate, expires_on: data.expiresOn || null, approved_by: context.userId, approved_at: now,
      approval_reason: data.reason, scope: "client_future", pricing_source: "client_pricing",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
