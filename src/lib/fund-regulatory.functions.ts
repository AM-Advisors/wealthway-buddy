/**
 * Fund Regulatory tab: Form D / Blue Sky filings (from close filings and
 * recorded setup filings), state franchise fees and a computed regulatory
 * calendar. Record-only: nothing here files or pays anything.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const srv = () => import("@/lib/fund-tabs.server");
const fund = z.object({ fundId: z.string().uuid() });
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

export type CalendarItem = { date: string; title: string; detail: string; kind: "form_d" | "blue_sky" | "franchise" | "other"; done: boolean };

const addDays = (d: string, n: number) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const addYears = (d: string, n: number) => { const x = new Date(d + "T00:00:00Z"); x.setUTCFullYear(x.getUTCFullYear() + n); return x.toISOString().slice(0, 10); };

export const fundRegulatoryFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(fund.parse)
  .handler(async ({ data, context }) => {
    const s = await srv(); const a = await s.assertFund(context.userId, data.fundId); const d = await s.db();
    const [{ data: closeF }, { data: setupF }, { data: fees }, { data: reqs }] = await Promise.all([
      d.from("fund_close_filings").select("id, close_request_id, filing_type, jurisdiction, status, investor_count, amount_cents, fee_cents, fee_needs_review, is_amendment, confirmation_number, filed_on, prepared_at").eq("offering_id", data.fundId).order("prepared_at", { ascending: false }),
      d.from("fund_regulatory_filings").select("id, filing_type, filing_kind, state, filing_date, accession_number, notes").eq("offering_id", data.fundId).is("removed_at", null),
      d.from("fund_franchise_fees").select("*").eq("offering_id", data.fundId).is("removed_at", null).order("due_date", { ascending: true, nullsFirst: false }),
      d.from("fund_close_requests").select("id, target_close_date, created_at").eq("offering_id", data.fundId),
    ]);
    const filings = [
      ...((closeF ?? []) as any[]).map((f) => ({
        id: f.id, source: "close", type: f.filing_type === "form_d" ? (f.is_amendment ? "Form D amendment" : "Form D") : "Blue Sky", jurisdiction: f.filing_type === "form_d" ? "SEC" : f.jurisdiction,
        status: f.status, investors: f.investor_count, amountCents: f.amount_cents, feeCents: f.filing_type === "form_d" ? 16000 : f.fee_cents, feeNeedsReview: f.filing_type !== "form_d" && f.fee_needs_review,
        filedOn: f.filed_on, confirmation: f.confirmation_number,
      })),
      ...((setupF ?? []) as any[]).map((f) => ({
        id: f.id, source: "setup", type: /form.?d/i.test(f.filing_type) ? "Form D" : "Blue Sky", jurisdiction: f.state || "SEC", status: f.filing_date ? "filed" : "recorded",
        investors: null, amountCents: null, feeCents: null, feeNeedsReview: false, filedOn: f.filing_date, confirmation: f.accession_number,
      })),
    ];
    const reqDate = new Map(((reqs ?? []) as any[]).map((r) => [r.id, r.target_close_date || String(r.created_at).slice(0, 10)]));
    const cal: CalendarItem[] = [];
    const formDs = ((closeF ?? []) as any[]).filter((f) => f.filing_type === "form_d");
    for (const f of formDs) {
      const first = reqDate.get(f.close_request_id);
      if (first) cal.push({ date: addDays(first, 15), title: f.is_amendment ? "Form D amendment due" : "Form D due", detail: "15 days after first sale (estimated from close date)", kind: "form_d", done: f.status === "filed" || f.status === "not_required" });
    }
    for (const f of ((closeF ?? []) as any[]).filter((x) => x.filing_type !== "form_d")) {
      const first = reqDate.get(f.close_request_id);
      if (first) cal.push({ date: addDays(first, 15), title: `${f.jurisdiction} Blue Sky notice due`, detail: "Most states: 15 days after first sale in the state. Harmonious confirms.", kind: "blue_sky", done: f.status === "filed" || f.status === "not_required" });
    }
    const lastFiledD = [...formDs.filter((f) => f.filed_on).map((f) => f.filed_on), ...((setupF ?? []) as any[]).filter((f) => /form.?d/i.test(f.filing_type) && f.filing_date).map((f) => f.filing_date)].sort().pop();
    if (lastFiledD) cal.push({ date: addYears(lastFiledD, 1), title: "Annual Form D amendment", detail: "Due yearly while the offering is ongoing", kind: "form_d", done: false });
    for (const f of (fees ?? []) as any[]) if (f.due_date) cal.push({ date: f.due_date, title: `${f.state} franchise fee`, detail: f.description || "State franchise tax / annual fee", kind: "franchise", done: !!f.filed_on });
    cal.sort((x, y) => x.date.localeCompare(y.date));
    return { staff: a.staff, filings, fees: fees ?? [], calendar: cal };
  });

export const saveFranchiseFeeFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(fund.extend({ id: z.string().uuid().nullable(), state: z.string().trim().min(2).max(40), description: z.string().max(200), amountCents: z.number().int().min(0).max(1e10), dueDate: day, filedOn: day, confirmation: z.string().max(100) }).parse)
  .handler(async ({ data, context }) => {
    const s = await srv(); await s.assertFund(context.userId, data.fundId); const d = await s.db();
    const row = { state: data.state.toUpperCase(), description: data.description || null, amount_cents: data.amountCents, due_date: data.dueDate, filed_on: data.filedOn, confirmation_number: data.confirmation || null };
    const q = data.id
      ? d.from("fund_franchise_fees").update(row).eq("id", data.id).eq("offering_id", data.fundId).is("removed_at", null)
      : d.from("fund_franchise_fees").insert({ ...row, offering_id: data.fundId, recorded_by: context.userId });
    const { error } = await q; if (error) throw new Error("Couldn't save.");
    return { ok: true };
  });

export const removeFranchiseFeeFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(fund.extend({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const s = await srv(); await s.assertFund(context.userId, data.fundId);
    await (await s.db()).from("fund_franchise_fees").update({ removed_at: new Date().toISOString(), removed_by: context.userId }).eq("id", data.id).eq("offering_id", data.fundId).is("filed_on", null);
    return { ok: true };
  });
