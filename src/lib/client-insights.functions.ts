import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";
import type { Fact } from "@/lib/client-dashboard-model";

async function requireClient(context: any, clientId: string) {
  const { clientAccessIds } = await import("@/lib/client-membership");
  const ids = await clientAccessIds(context.supabase, context.userId);
  if (!ids.includes(clientId)) throw new Error("You don't have access to this organization.");
}

const day = (v: unknown) => (v ? String(v).slice(0, 10) : "");

/** Read-only costs, capital raised and recorded fees/carry for the caller's own client. */
export const getClientInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireClient(context, data.clientId);
    const db = (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
    const { data: offs } = await db.from("offerings").select("id, name").eq("client_id", data.clientId);
    const funds = ((offs ?? []) as any[]).map((o) => ({ id: String(o.id), name: String(o.name) }));
    const name = new Map(funds.map((f) => [f.id, f.name]));
    const ids = funds.map((f) => f.id);
    const none = Promise.resolve({ data: [] as any[] });

    const { data: invs } = await db.from("invoices").select("id, offering_id, status, issue_date, issued_at, created_at, paid_on, total_cents").eq("client_id", data.clientId).is("voided_at", null).limit(2000);
    const live = ((invs ?? []) as any[]).filter((i) => !["draft", "void", "voided", "cancelled", "canceled"].includes(String(i.status)));
    const invIds = live.map((i) => i.id);
    const [{ data: lines }, { data: onbs }, { data: fees }, { data: carry }] = await Promise.all([
      invIds.length ? db.from("invoice_lines").select("invoice_id, label, amount_cents, offering_id").in("invoice_id", invIds) : none,
      ids.length ? db.from("investor_onboardings").select("offering_id, commitment_amount_cents, accepted_amount_cents, funded_amount_cents, created_at, updated_at, removed_at").in("offering_id", ids) : none,
      ids.length ? db.from("fund_ledger_entries").select("offering_id, entry_date, amount_cents, direction").eq("category", "Management fee").is("voided_at", null).in("offering_id", ids) : none,
      ids.length ? db.from("carry_allocations").select("offering_id, amount_cents, clawback_cents, created_at, approved_by").in("offering_id", ids).not("approved_by", "is", null) : none,
    ]);

    const facts: Fact[] = [];
    const byInv = new Map<string, any[]>();
    for (const l of (lines ?? []) as any[]) byInv.set(l.invoice_id, [...(byInv.get(l.invoice_id) ?? []), l]);
    for (const i of live) {
      const fundId = i.offering_id ? String(i.offering_id) : null;
      const date = day(i.issue_date ?? i.issued_at ?? i.created_at);
      const ls = byInv.get(i.id) ?? [];
      const parts = ls.length ? ls.map((l) => ({ service: String(l.label ?? "Other services"), cents: Number(l.amount_cents ?? 0), fundId: l.offering_id ? String(l.offering_id) : fundId }))
        : [{ service: "Other services", cents: Number(i.total_cents ?? 0), fundId }];
      for (const p of parts) {
        const fundName = p.fundId ? name.get(p.fundId) ?? "Other" : "Organization-wide";
        facts.push({ kind: "cost_invoiced", fundId: p.fundId, fundName, service: p.service, date, cents: p.cents });
        if (i.paid_on || String(i.status) === "paid") facts.push({ kind: "cost_paid", fundId: p.fundId, fundName, service: p.service, date: day(i.paid_on) || date, cents: p.cents });
      }
    }
    for (const o of (onbs ?? []) as any[]) {
      if (o.removed_at) continue;
      const fundId = String(o.offering_id); const fundName = name.get(fundId) ?? "Fund";
      const c = Number(o.accepted_amount_cents ?? o.commitment_amount_cents ?? 0);
      if (c) facts.push({ kind: "raised_committed", fundId, fundName, date: day(o.created_at), cents: c });
      const fd = Number(o.funded_amount_cents ?? 0);
      if (fd) facts.push({ kind: "raised_funded", fundId, fundName, date: day(o.updated_at ?? o.created_at), cents: fd });
    }
    for (const f of (fees ?? []) as any[]) {
      const fundId = String(f.offering_id);
      facts.push({ kind: "fee_earned", fundId, fundName: name.get(fundId) ?? "Fund", date: day(f.entry_date), cents: (f.direction === "out" ? 1 : -1) * Number(f.amount_cents ?? 0) });
    }
    for (const c of (carry ?? []) as any[]) {
      const fundId = String(c.offering_id);
      facts.push({ kind: "carry_earned", fundId, fundName: name.get(fundId) ?? "Fund", date: day(c.created_at), cents: Number(c.amount_cents ?? 0) - Number(c.clawback_cents ?? 0) });
    }
    return { funds, facts };
  });

export const getDashboardPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase.from("client_dashboard_prefs").select("layout, hidden, default_period, default_fund_id").eq("user_id", context.userId).eq("client_id", data.clientId).maybeSingle();
    return (row as any) ?? null;
  });

export const saveDashboardPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({
    clientId: z.string().uuid(),
    layout: z.array(z.string().max(40)).max(30),
    hidden: z.array(z.string().max(40)).max(30),
    defaultPeriod: z.enum(["deal", "month", "quarter", "year", "all"]),
    defaultFundId: z.string().uuid().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireClient(context, data.clientId);
    const { error } = await context.supabase.from("client_dashboard_prefs").upsert({
      user_id: context.userId, client_id: data.clientId, layout: data.layout, hidden: data.hidden,
      default_period: data.defaultPeriod, default_fund_id: data.defaultFundId, updated_at: new Date().toISOString(),
    });
    if (error) throw new Error("We couldn't save your dashboard. Try again.");
    return { ok: true };
  });

export const listMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("client_notifications").select("id, kind, title, body, path, read_at, created_at").eq("user_id", context.userId).order("created_at", { ascending: false }).limit(30);
    return (data ?? []) as any[];
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ ids: z.array(z.string().uuid()).max(100).nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("client_notifications").update({ read_at: new Date().toISOString() }).eq("user_id", context.userId).is("read_at", null);
    if (data.ids) q = q.in("id", data.ids);
    await q;
    return { ok: true };
  });
