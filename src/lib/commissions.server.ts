/** Server-only commission tracking. Read-only projection over signed quotes and their invoices; never moves money. */
import { COMMISSION_EDITORS, COMMISSION_VIEW_ALL, DEFAULT_RATES, isCapTableLine, splitLine, validRates, type CommissionRates } from "@/lib/commission-model";
import { names, salesActor } from "@/lib/sales-hub.server";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;

async function rateHistory(db: any) {
  const { data } = await db.from("commission_rate_versions").select("id, rates, reason, set_by, effective_at").order("effective_at", { ascending: true });
  return (data ?? []) as { id: string; rates: CommissionRates; reason: string; set_by: string; effective_at: string }[];
}
const ratesAt = (hist: Awaited<ReturnType<typeof rateHistory>>, at: string) => {
  let r: CommissionRates = DEFAULT_RATES;
  for (const v of hist) if (v.effective_at <= at) r = { ...DEFAULT_RATES, ...v.rates };
  return r;
};

export async function commissionReport(userId: string, from: string, to: string) {
  const db = await admin();
  const a = await salesActor(userId);
  const viewAll = a.roles.some((r: string) => COMMISSION_VIEW_ALL.includes(r));
  const isManager = a.roles.includes("sales_management");
  const hist = await rateHistory(db);

  const { data: quotes } = await db.from("sales_quotes").select("id, quote_number, title, client_id, owner_user_id, bdr_user_id, sow_id, signed_at")
    .eq("status", "signed").not("sow_id", "is", null);
  const qs = (quotes ?? []) as any[];
  const sowIds = qs.map((q) => q.sow_id);
  const { data: invoices } = sowIds.length ? await db.from("invoices").select("id, number, sow_id, status, paid_on, issue_date, voided_at").in("sow_id", sowIds) : { data: [] };
  const invs = ((invoices ?? []) as any[]).filter((i) => !i.voided_at && i.status !== "void" && i.status !== "draft");
  const { data: lines } = invs.length ? await db.from("invoice_lines").select("id, invoice_id, service_key, label, amount_cents").in("invoice_id", invs.map((i) => i.id)) : { data: [] };

  const { data: roleRows } = await db.from("user_roles").select("user_id, role");
  const rolesOf = new Map<string, string[]>();
  for (const r of roleRows ?? []) rolesOf.set(r.user_id, [...(rolesOf.get(r.user_id) ?? []), r.role]);
  const firstWith = (role: string) => [...rolesOf].find(([, rs]) => rs.includes(role))?.[0] ?? null;
  const croId = firstWith("cro"); const ceoId = firstWith("executive");
  const { data: rl } = await db.from("sales_reporting_lines").select("user_id, manager_user_id");
  const managerOf = new Map<string, string>(((rl ?? []) as any[]).map((r) => [r.user_id, r.manager_user_id]));
  const { data: clients } = await db.from("clients").select("id, name").in("id", [...new Set(qs.map((q) => q.client_id).filter(Boolean))]);
  const clientName = new Map(((clients ?? []) as any[]).map((c) => [c.id, c.name]));

  const team = new Set<string>(a.visible ?? [userId]);
  const rows: any[] = [];
  for (const inv of invs) {
    const q = qs.find((x) => x.sow_id === inv.sow_id); if (!q?.owner_user_id) continue;
    const paid = inv.status === "paid" || Boolean(inv.paid_on);
    const at = (inv.paid_on ?? inv.issue_date ?? new Date().toISOString().slice(0, 10)) + "T23:59:59Z";
    if (paid && (inv.paid_on < from || inv.paid_on > to)) continue;
    const rates = ratesAt(hist, at);
    const mgr = managerOf.get(q.owner_user_id) ?? null;
    const managerId = mgr && (rolesOf.get(mgr) ?? []).includes("sales_management") ? mgr : null;
    for (const ln of ((lines ?? []) as any[]).filter((l) => l.invoice_id === inv.id)) {
      const base = Number(ln.amount_cents) || 0; if (base <= 0) continue;
      const splits = splitLine({ rates, capTable: isCapTableLine(ln.service_key), closerId: q.owner_user_id, closerRoles: rolesOf.get(q.owner_user_id) ?? [], bdrId: q.bdr_user_id, managerId, croId, ceoId });
      for (const s of splits) {
        if (!viewAll && s.userId !== userId && !(isManager && s.userId && team.has(s.userId))) continue;
        rows.push({ quoteId: q.id, quoteNumber: q.quote_number, client: clientName.get(q.client_id) ?? "-", invoice: inv.number, paid, paidOn: inv.paid_on,
          service: ln.label, capTable: isCapTableLine(ln.service_key), layer: s.layer, userId: s.userId, ratePct: s.ratePct, baseCents: base, amountCents: Math.round((base * s.ratePct) / 100) });
      }
    }
  }
  const nm = await names(rows.map((r) => r.userId).filter(Boolean));
  for (const r of rows) r.name = r.userId ? nm.get(r.userId) ?? "Unknown" : "Unassigned";
  const byPerson = new Map<string, { userId: string | null; name: string; earnedCents: number; pendingCents: number }>();
  for (const r of rows) {
    const k = r.userId ?? "none";
    const p = byPerson.get(k) ?? { userId: r.userId, name: r.name, earnedCents: 0, pendingCents: 0 };
    if (r.paid) p.earnedCents += r.amountCents; else p.pendingCents += r.amountCents;
    byPerson.set(k, p);
  }
  const current = hist.length ? { ...DEFAULT_RATES, ...hist[hist.length - 1]!.rates } : DEFAULT_RATES;
  const hnm = await names(hist.map((h) => h.set_by));
  return {
    rows, people: [...byPerson.values()].sort((x, y) => y.earnedCents - x.earnedCents), rates: current,
    history: hist.slice().reverse().map((h) => ({ ...h, setByName: hnm.get(h.set_by) ?? "Unknown" })),
    canEdit: a.roles.some((r: string) => COMMISSION_EDITORS.includes(r)),
    quotes: qs.map((q) => ({ id: q.id, label: `${q.quote_number ?? ""} ${q.title ?? ""}`.trim(), bdrUserId: q.bdr_user_id, ownerUserId: q.owner_user_id })),
    bdrs: await (async () => { const ids = [...rolesOf].filter(([, rs]) => rs.includes("bdr")).map(([id]) => id); const m = await names(ids); return ids.map((id) => ({ id, name: m.get(id) ?? "BDR" })); })(),
  };
}

export async function setCommissionRates(userId: string, rates: CommissionRates, reason: string) {
  const db = await admin();
  const a = await salesActor(userId);
  if (!a.roles.some((r: string) => COMMISSION_EDITORS.includes(r))) throw new Error("Only the CRO or CEO can change commission rates.");
  if (!validRates(rates)) throw new Error("Each rate must be between 0% and 50%.");
  const { error } = await db.from("commission_rate_versions").insert({ rates, reason, set_by: userId });
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function setQuoteBdr(userId: string, quoteId: string, bdrId: string | null) {
  const db = await admin();
  const a = await salesActor(userId);
  const { data: q } = await db.from("sales_quotes").select("owner_user_id").eq("id", quoteId).maybeSingle();
  if (!q) throw new Error("Quote not found.");
  if (q.owner_user_id !== userId && !a.roles.some((r: string) => COMMISSION_EDITORS.includes(r))) throw new Error("Only the deal owner, CRO or CEO can set the BDR.");
  if (bdrId) {
    const { data: r } = await db.from("user_roles").select("role").eq("user_id", bdrId).eq("role", "bdr").maybeSingle();
    if (!r) throw new Error("That person isn't a BDR.");
  }
  await db.from("sales_quotes").update({ bdr_user_id: bdrId }).eq("id", quoteId);
  return { ok: true };
}
