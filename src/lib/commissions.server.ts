/** Server-only commission tracking. Read-only projection over signed quotes and their invoices; never moves money. */
import { COMMISSION_EDITORS, COMMISSION_VIEW_ALL, DEFAULT_RATES, PAYOUT_RECORDERS, payoutDueDate, isCapTableLine, splitLine, validRates, type CommissionRates } from "@/lib/commission-model";
import { names, salesActor as salesHubActor } from "@/lib/sales-hub.server";

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

/** Sales staff use their Sales scope; Finance and leadership (no Sales role) still see every commission. */
async function salesActor(userId: string) {
  try { return await salesHubActor(userId); } catch (e) {
    const db = await admin();
    const { data } = await db.from("user_roles").select("role").eq("user_id", userId);
    const roles = ((data ?? []) as any[]).map((r) => String(r.role));
    if (!roles.some((r) => COMMISSION_VIEW_ALL.includes(r))) throw e;
    return { userId, roles, scope: "all" as const, visible: null as string[] | null };
  }
}

export async function commissionReport(userId: string, from: string, to: string) {
  const db = await admin();
  const a = await salesActor(userId);
  const viewAll = a.roles.some((r: string) => COMMISSION_VIEW_ALL.includes(r));
  const isManager = a.roles.includes("sales_management");
  const hist = await rateHistory(db);

  const { data: quotes } = await db.from("sales_quotes").select("id, quote_number, title, client_id, owner_user_id, bdr_user_id, sow_id, signed_at")
    .eq("status", "signed");
  const qs = (quotes ?? []) as any[];
  const sowIds = qs.map((q) => q.sow_id).filter(Boolean);
  const quoteIds = qs.map((q) => q.id);
  // Invoices billed under the quote's SOW, plus invoices created automatically when the client signed the quote/proposal/RFP/RFQ.
  const [bySow, byQuote] = await Promise.all([
    sowIds.length ? db.from("invoices").select("id, number, sow_id, sales_quote_id, status, paid_on, issue_date, voided_at").in("sow_id", sowIds) : { data: [] },
    quoteIds.length ? db.from("invoices").select("id, number, sow_id, sales_quote_id, status, paid_on, issue_date, voided_at").in("sales_quote_id", quoteIds) : { data: [] },
  ]);
  const invoices = [...new Map([...((bySow as any).data ?? []), ...((byQuote as any).data ?? [])].map((i: any) => [i.id, i])).values()];
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
    const q = (inv.sales_quote_id ? qs.find((x) => x.id === inv.sales_quote_id) : null) ?? qs.find((x) => x.sow_id && x.sow_id === inv.sow_id); if (!q?.owner_user_id) continue;
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
          lineId: ln.id, paidCents: paid ? base : 0, service: ln.label, capTable: isCapTableLine(ln.service_key), layer: s.layer, userId: s.userId, ratePct: s.ratePct, baseCents: base, amountCents: Math.round((base * s.ratePct) / 100) });
      }
    }
  }
  const lineIds = [...new Set(rows.map((r) => r.lineId))];
  const { data: pays } = lineIds.length ? await db.from("commission_payouts").select("id, invoice_line_id, user_id, layer, amount_cents, payout_date, reference, note, reversal_of, reason, created_at").in("invoice_line_id", lineIds) : { data: [] };
  const payList = (pays ?? []) as any[];
  const reversed = new Set(payList.filter((p) => p.reversal_of).map((p) => p.reversal_of));
  const { data: queued } = lineIds.length ? await db.from("commission_payout_queue").select("invoice_line_id, user_id, layer, status, reason, due_on, amount_cents").in("invoice_line_id", lineIds) : { data: [] };
  const queueOf = (r: any) => ((queued ?? []) as any[]).find((x) => x.invoice_line_id === r.lineId && (x.user_id ?? null) === (r.userId ?? null) && x.layer === r.layer);
  for (const r of rows) {
    const active = payList.find((p) => !p.reversal_of && !reversed.has(p.id) && p.invoice_line_id === r.lineId && p.user_id === r.userId && p.layer === r.layer);
    r.payout = active ? { id: active.id, date: active.payout_date, reference: active.reference, note: active.note } : null;
    const qd = queueOf(r);
    // The amount queued when the invoice was paid is the commission of record.
    if (qd && qd.amount_cents != null) r.amountCents = Number(qd.amount_cents);
    r.status = active ? "paid_out" : qd?.status === "cancelled" ? "cancelled" : r.paid ? "scheduled" : "not_earned";
    r.cancelReason = qd?.status === "cancelled" ? qd.reason : null;
    r.payoutDue = qd?.due_on ?? (r.paid && r.paidOn ? payoutDueDate(r.paidOn) : null);
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
    canRecordPayout: a.roles.some((r: string) => PAYOUT_RECORDERS.includes(r)),
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

/** Records (never sends) commission payouts for scheduled rows. Amount is recomputed server-side. */
export async function recordCommissionPayouts(userId: string, items: { lineId: string; userId: string; layer: string }[], payoutDate: string, reference: string, note: string | null) {
  const a = await salesActor(userId);
  if (!a.roles.some((r: string) => PAYOUT_RECORDERS.includes(r))) throw new Error("Only Finance, the CRO or the CEO can record payouts.");
  if (!reference.trim()) throw new Error("Add a payroll reference.");
  const rep = await commissionReport(userId, "1900-01-01", "2999-12-31");
  const db = await admin();
  const inserts = items.map((it) => {
    const row = rep.rows.find((r: any) => r.lineId === it.lineId && r.userId === it.userId && r.layer === it.layer);
    if (!row) throw new Error("A selected commission couldn't be found.");
    if (row.status !== "scheduled") throw new Error("Only earned commissions that aren't already paid out can be recorded.");
    return { quote_id: row.quoteId, invoice_line_id: row.lineId, user_id: row.userId, layer: row.layer, amount_cents: row.amountCents, payout_date: payoutDate, reference: reference.trim(), note, recorded_by: userId };
  });
  // Claim each queued row first (scheduled -> confirmed), so two people can't record the same payout twice.
  let count = 0;
  for (const ins of inserts) {
    let q = db.from("commission_payout_queue").update({ status: "confirmed" }).eq("invoice_line_id", ins.invoice_line_id).eq("layer", ins.layer).eq("status", "scheduled");
    q = ins.user_id ? q.eq("user_id", ins.user_id) : q.is("user_id", null);
    const { data: hit, error: ce } = await q.select("id, amount_cents");
    if (ce) throw new Error(ce.message);
    const claimed = (hit ?? []) as any[];
    if (!claimed.length) continue; // already confirmed by someone else, or not queued
    const amount = claimed[0].amount_cents != null ? Number(claimed[0].amount_cents) : ins.amount_cents;
    const { data: made, error } = await db.from("commission_payouts").insert({ ...ins, amount_cents: amount }).select("id").single();
    if (error) {
      for (const h of claimed) await db.from("commission_payout_queue").update({ status: "scheduled" }).eq("id", h.id);
      throw new Error(error.message);
    }
    for (const h of claimed) {
      await db.from("commission_payout_queue").update({ payout_id: made.id }).eq("id", h.id);
      await db.from("commission_payout_queue_events").insert({ queue_id: h.id, event_kind: "confirmed", actor_id: userId, detail: { payout_id: made.id, payout_date: payoutDate, reference: reference.trim() } });
    }
    count++;
  }
  if (!count) throw new Error("Those payouts were already recorded.");
  return { ok: true, count };
}

export async function reverseCommissionPayout(userId: string, payoutId: string, reason: string) {
  const a = await salesActor(userId);
  if (!a.roles.some((r: string) => PAYOUT_RECORDERS.includes(r))) throw new Error("Only Finance, the CRO or the CEO can reverse payouts.");
  if (!reason.trim()) throw new Error("A reason is required.");
  const db = await admin();
  const { data: p } = await db.from("commission_payouts").select("*").eq("id", payoutId).is("reversal_of", null).maybeSingle();
  if (!p) throw new Error("Payout not found.");
  const { error } = await db.from("commission_payouts").insert({ quote_id: p.quote_id, invoice_line_id: p.invoice_line_id, user_id: p.user_id, layer: p.layer, amount_cents: -p.amount_cents, payout_date: new Date().toISOString().slice(0, 10), reference: p.reference, recorded_by: userId, reversal_of: p.id, reason: reason.trim() });
  if (error) throw new Error(error.code === "23505" ? "That payout was already reversed." : error.message);
  return { ok: true };
}

/**
 * Queues each rep's commission for a paid invoice as Scheduled for quarter-end.
 * Idempotent: a line/rep/layer is queued once. Records only; never sends money.
 */
export async function queueInvoicePayouts(invoiceId: string) {
  const db = await admin();
  const { data: inv } = await db.from("invoices").select("id, sow_id, status, paid_on, issue_date, voided_at").eq("id", invoiceId).maybeSingle();
  if (!inv?.sow_id || inv.status !== "paid" || inv.voided_at) return { queued: 0 };
  const { data: q } = await db.from("sales_quotes").select("id, owner_user_id, bdr_user_id").eq("sow_id", inv.sow_id).eq("status", "signed").maybeSingle();
  if (!q?.owner_user_id) return { queued: 0 };
  const paidOn = String(inv.paid_on ?? new Date().toISOString().slice(0, 10));
  const rates = ratesAt(await rateHistory(db), paidOn + "T23:59:59Z");
  const { data: roleRows } = await db.from("user_roles").select("user_id, role");
  const rolesOf = new Map<string, string[]>();
  for (const r of roleRows ?? []) rolesOf.set(r.user_id, [...(rolesOf.get(r.user_id) ?? []), r.role]);
  const firstWith = (role: string) => [...rolesOf].find(([, rs]) => rs.includes(role))?.[0] ?? null;
  const { data: rl } = await db.from("sales_reporting_lines").select("manager_user_id").eq("user_id", q.owner_user_id).maybeSingle();
  const mgr = rl?.manager_user_id ?? null;
  const managerId = mgr && (rolesOf.get(mgr) ?? []).includes("sales_management") ? mgr : null;
  const { data: lines } = await db.from("invoice_lines").select("id, service_key, amount_cents").eq("invoice_id", invoiceId);
  const due = payoutDueDate(paidOn);
  let queued = 0;
  for (const ln of (lines ?? []) as any[]) {
    const base = Number(ln.amount_cents) || 0; if (base <= 0) continue;
    for (const s of splitLine({ rates, capTable: isCapTableLine(ln.service_key), closerId: q.owner_user_id, closerRoles: rolesOf.get(q.owner_user_id) ?? [], bdrId: q.bdr_user_id, managerId, croId: firstWith("cro"), ceoId: firstWith("executive") })) {
      const amount = Math.round((base * s.ratePct) / 100); if (amount <= 0) continue;
      const { data: row, error } = await db.from("commission_payout_queue").insert({ invoice_id: invoiceId, invoice_line_id: ln.id, quote_id: q.id, user_id: s.userId, layer: s.layer, amount_cents: amount, due_on: due }).select("id").maybeSingle();
      if (error) { if (error.code === "23505") continue; throw new Error(error.message); }
      await db.from("commission_payout_queue_events").insert({ queue_id: row.id, event_kind: "scheduled", detail: { invoice_id: invoiceId, due_on: due, amount_cents: amount } });
      queued++;
    }
  }
  return { queued };
}

/** Cancels still-scheduled payouts for an invoice (void, failed or reversed payment). Paid-out records are untouched. */
export async function cancelInvoicePayouts(invoiceId: string, reason: string, actorId: string | null) {
  const db = await admin();
  const { data: hit } = await db.from("commission_payout_queue").update({ status: "cancelled", reason }).eq("invoice_id", invoiceId).eq("status", "scheduled").select("id");
  for (const h of (hit ?? []) as any[]) await db.from("commission_payout_queue_events").insert({ queue_id: h.id, event_kind: "cancelled", actor_id: actorId, detail: { reason } });
  return { cancelled: (hit ?? []).length };
}
