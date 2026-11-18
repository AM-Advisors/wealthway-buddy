/**
 * Fund State filings: yearly franchise tax / annual report obligations derived
 * from the fund's formation state and manager office state. Record-only:
 * nothing here files or pays. Staff write; staff and the fund's own managers read.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
import { entityKindOf, nextDue, ruleFor, stateFromAddress, urgency, reminderStage, LAST_CHECKED, type StateFilingRule, type FilingUrgency } from "@/lib/state-filing-rules";
import { normalizeUsState } from "@/lib/regulatory-filings-model";

const srv = () => import("@/lib/fund-tabs.server");
const fund = z.object({ fundId: z.string().uuid() });
const st = z.string().trim().min(2).max(40).transform((s, c) => { const n = normalizeUsState(s); if (!n) { c.addIssue({ code: "custom", message: "Unknown state" }); return z.NEVER; } return n; });

export type StateFilingRow = {
  state: string; basis: "formation" | "manager" | "added"; applies: boolean; notApplicableReason: string | null; filer: string | null;
  rule: StateFilingRule | null; needsCounsel: boolean; nextYear: number | null; nextDue: string | null; urgency: FilingUrgency; reminder: ReturnType<typeof reminderStage>;
  needsFormationDate: boolean; awaitingConfirmation: { id: string; year: number; filedOn: string; confirmation: string | null; byMe: boolean } | null;
  history: { year: number; filedOn: string; confirmation: string | null; confirmed: boolean }[];
};
export type StateFilingsData = { staff: boolean; formedIn: string | null; managerState: string | null; formedOn: string | null; entity: "LLC" | "LP"; lastChecked: string; rows: StateFilingRow[] };

export async function loadStateFilings(d: any, fundId: string, uid: string, staff: boolean, today = new Date().toISOString().slice(0, 10)): Promise<StateFilingsData> {
  const [{ data: o }, { data: saved }, { data: ev }] = await Promise.all([
    d.from("offerings").select("state_formed, date_formed, entity_type, principal_address").eq("id", fundId).maybeSingle(),
    d.from("fund_state_filings").select("*").eq("offering_id", fundId),
    d.from("fund_state_filing_events").select("*").eq("offering_id", fundId).order("created_at", { ascending: true }),
  ]);
  const formedIn = normalizeUsState(o?.state_formed); const managerState = stateFromAddress(o?.principal_address);
  const entity = entityKindOf(o?.entity_type); const formedOn = o?.date_formed ?? null;
  const states = new Map<string, any>();
  if (formedIn) states.set(formedIn, { state: formedIn, basis: "formation", applies: true });
  if (managerState && managerState !== formedIn) states.set(managerState, { state: managerState, basis: "manager", applies: true });
  for (const s of (saved ?? []) as any[]) states.set(s.state, { ...states.get(s.state), ...s, basis: states.get(s.state)?.basis ?? s.basis });
  const events = (ev ?? []) as any[];
  const rows: StateFilingRow[] = [...states.values()].map((s) => {
    const rule = ruleFor(s.state, entity);
    const filed = events.filter((e) => e.state === s.state && e.kind === "filed");
    const confirmedIds = new Set(events.filter((e) => e.state === s.state && e.kind === "confirmed").map((e) => e.filed_event_id));
    const history = filed.map((e) => ({ year: e.filing_year, filedOn: e.filed_on, confirmation: e.confirmation_number, confirmed: confirmedIds.has(e.id) }));
    const pending = filed.find((e) => !confirmedIds.has(e.id));
    const n = rule && s.applies ? nextDue(rule, formedOn, filed.map((e) => e.filing_year), today) : null;
    return {
      state: s.state, basis: s.basis, applies: s.applies !== false, notApplicableReason: s.not_applicable_reason ?? null, filer: s.filer ?? null,
      rule, needsCounsel: s.basis === "manager", nextYear: n?.year ?? null, nextDue: n?.due ?? null,
      urgency: s.applies === false ? "filed" : urgency(n?.due ?? null, today), reminder: n ? reminderStage(n.due, today) : null,
      needsFormationDate: !!rule && rule.due.kind !== "fixed" && !formedOn,
      awaitingConfirmation: pending ? { id: pending.id, year: pending.filing_year, filedOn: pending.filed_on, confirmation: pending.confirmation_number, byMe: pending.actor === uid } : null,
      history,
    };
  }).sort((a, b) => (a.nextDue ?? "9").localeCompare(b.nextDue ?? "9"));
  return { staff, formedIn, managerState, formedOn, entity, lastChecked: LAST_CHECKED, rows };
}

export const fundStateFilingsFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator((v: unknown) => fund.parse(v))
  .handler(async ({ data, context }) => {
    const s = await srv(); const a = await s.assertFund(context.userId, data.fundId);
    return loadStateFilings(await s.db(), data.fundId, context.userId, a.staff);
  });

async function staffOnly(uid: string, fundId: string) {
  const s = await srv(); const a = await s.assertFund(uid, fundId);
  if (!a.staff) throw new Error("Only Harmonious can change state filings.");
  return s.db();
}

export const saveStateFilingFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(fund.extend({ state: st, applies: z.boolean(), reason: z.string().trim().max(300), filer: z.enum(["harmonious", "client_counsel"]).nullable() })
    .refine((v) => v.applies || v.reason.length >= 3, { message: "Add a reason when a state doesn't apply." }).parse)
  .handler(async ({ data, context }) => {
    const d = await staffOnly(context.userId, data.fundId);
    const { error } = await d.from("fund_state_filings").upsert({ offering_id: data.fundId, state: data.state, applies: data.applies, not_applicable_reason: data.applies ? null : data.reason, filer: data.filer, updated_by: context.userId, updated_at: new Date().toISOString() }, { onConflict: "offering_id,state" });
    if (error) throw new Error("Couldn't save.");
    await d.from("fund_state_filing_events").insert({ offering_id: data.fundId, state: data.state, kind: "applicability", note: data.applies ? `Applies; filer ${data.filer ?? "not set"}` : `Not applicable: ${data.reason}`, actor: context.userId });
    return { ok: true };
  });

export const recordStateFilingFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(fund.extend({ state: st, year: z.number().int().min(2000).max(2100), filedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), confirmation: z.string().trim().min(1).max(100) }).parse)
  .handler(async ({ data, context }) => {
    const d = await staffOnly(context.userId, data.fundId);
    const { data: dup } = await d.from("fund_state_filing_events").select("id").eq("offering_id", data.fundId).eq("state", data.state).eq("kind", "filed").eq("filing_year", data.year).limit(1);
    if (dup?.length) throw new Error("This year's filing is already recorded.");
    const { error } = await d.from("fund_state_filing_events").insert({ offering_id: data.fundId, state: data.state, kind: "filed", filing_year: data.year, filed_on: data.filedOn, confirmation_number: data.confirmation, actor: context.userId });
    if (error) throw new Error("Couldn't save.");
    return { ok: true };
  });

export const confirmStateFilingFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(fund.extend({ eventId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const d = await staffOnly(context.userId, data.fundId);
    const { data: e } = await d.from("fund_state_filing_events").select("*").eq("id", data.eventId).eq("offering_id", data.fundId).eq("kind", "filed").maybeSingle();
    if (!e) throw new Error("Filing not found.");
    if (e.actor === context.userId) throw new Error("A different person needs to confirm this filing.");
    const { data: done } = await d.from("fund_state_filing_events").select("id").eq("filed_event_id", e.id).eq("kind", "confirmed").limit(1);
    if (done?.length) return { ok: true };
    await d.from("fund_state_filing_events").insert({ offering_id: data.fundId, state: e.state, kind: "confirmed", filing_year: e.filing_year, filed_event_id: e.id, actor: context.userId });
    return { ok: true };
  });
