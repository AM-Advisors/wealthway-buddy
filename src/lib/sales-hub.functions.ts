import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
import { OUTREACH_CHANNELS, SALES_STAGES, periodRange } from "@/lib/sales-model";

const period = z.object({ period: z.enum(["day", "week", "month", "quarter", "year", "custom"]), from: z.string().optional(), to: z.string().optional() });
const range = (p: z.infer<typeof period>) => periodRange(p.period, new Date(), { from: p.from, to: p.to });
const S = () => import("@/lib/sales-hub.server");
const Q = () => import("@/lib/sales-quotes.server");
const opt = z.string().nullish();

export const getSalesDashboard = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).inputValidator((d) => period.parse(d))
  .handler(async ({ data, context }) => { const r = range(data); const s = await S(); return { ...(await s.dashboard(context.userId, r.from, r.to)), lossReasons: await s.lossReasons(context.userId, r.from, r.to), range: r }; });

export const getOutreachList = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => period.extend({ ownerId: z.string().optional(), channel: z.string().optional(), serviceKey: z.string().optional(), contactId: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const r = data.contactId ? { from: undefined, to: undefined } : range(data);
    return (await S()).listOutreach(context.userId, { from: r.from, to: r.to, ownerId: data.ownerId, channel: data.channel, serviceKey: data.serviceKey === "unassigned" ? undefined : data.serviceKey, contactId: data.contactId });
  });

export const getOutreachContacts = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await S()).contactsForOutreach(context.userId));

export const logSalesOutreach = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ contactId: z.string().uuid(), channel: z.enum(OUTREACH_CHANNELS), direction: z.enum(["outbound", "inbound"]), subject: opt, body: z.string().max(20000).nullish(), occurredAt: opt, serviceKey: opt, visibility: z.enum(["team", "private"]) }).parse(d))
  .handler(async ({ data, context }) => (await S()).logOutreach(context.userId, data));

export const sendSalesOutreach = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ contactId: z.string().uuid(), channel: z.enum(["email", "text", "whatsapp"]), subject: opt, body: z.string().min(1).max(5000), serviceKey: opt, visibility: z.enum(["team", "private"]) }).parse(d))
  .handler(async ({ data, context }) => (await S()).sendOutreach(context.userId, data));

export const recordSalesOptOut = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ contactId: z.string().uuid(), channel: z.enum(["email", "text", "whatsapp"]), note: opt }).parse(d))
  .handler(async ({ data, context }) => (await S()).recordOptOut(context.userId, data));

export const parseLinkedInText = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ text: z.string().min(1).max(40000) }).parse(d))
  .handler(async ({ data, context }) => (await S()).parseLinkedIn(context.userId, data));

export const saveLinkedInMessages = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    contactId: z.string().uuid(), serviceKey: opt,
    messages: z.array(z.object({ date: z.string().nullable(), direction: z.enum(["outbound", "inbound"]), text: z.string().min(1).max(10000), visibility: z.enum(["team", "private"]) })).max(200),
    contactFields: z.object({ title: opt, organization: opt, linkedin_url: opt }),
  }).parse(d))
  .handler(async ({ data, context }) => (await S()).saveLinkedInImport(context.userId, data));

export const moveSalesStage = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ dealId: z.string().uuid(), stage: z.enum(SALES_STAGES), connectedVia: opt, followUpAt: opt, lossReason: opt, note: opt, serviceKey: opt, amountCents: z.number().int().min(0).nullish() }).parse(d))
  .handler(async ({ data, context }) => (await S()).moveStage(context.userId, data));

export const getRepOverview = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => period.extend({ repId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => { const r = range(data); return (await S()).repOverview(context.userId, data.repId ?? context.userId, r.from, r.to); });

export const getSalesTeam = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => { const s = await S(); const a = await s.salesActor(context.userId); return { me: context.userId, scope: a.scope, team: await s.salesTeam(a) }; });

export const setSalesTarget = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ repId: z.string().uuid(), periodStart: z.string(), periodEnd: z.string(), revenueTargetCents: z.number().int().min(0), outreachTarget: z.number().int().min(0) }).parse(d))
  .handler(async ({ data, context }) => (await S()).setTarget(context.userId, data));

export const setSalesManager = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ repId: z.string().uuid(), managerId: z.string().uuid().nullable() }).parse(d))
  .handler(async ({ data, context }) => (await S()).setReportingLine(context.userId, data));

export const reassignSalesDeal = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ dealId: z.string().uuid(), ownerId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await S()).reassignDeal(context.userId, data));

export const roundRobinDeals = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ dealIds: z.array(z.string().uuid()).min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => (await S()).roundRobin(context.userId, data));

// ---------------- quotes
const line = z.object({ serviceKey: z.string(), label: z.string(), quantity: z.number().min(0), unitCents: z.number().min(0), baselineUnitCents: z.number().min(0) });

export const getQuoteCatalog = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ clientId: z.string().uuid().nullish() }).parse(d))
  .handler(async ({ data, context }) => (await Q()).quoteCatalog(context.userId, data.clientId ?? null));

export const listSalesQuotes = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await Q()).listQuotes(context.userId));

export const getSalesQuote = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await Q()).getQuote(context.userId, data.id));

export const saveSalesQuote = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid().nullish(), title: z.string().max(200), clientId: z.string().uuid().nullish(), contactId: z.string().uuid().nullish(), dealId: z.string().uuid().nullish(), validUntil: opt, notes: z.string().max(5000).nullish(), lines: z.array(line).max(50) }).parse(d))
  .handler(async ({ data, context }) => (await Q()).saveQuote(context.userId, data));

const idOnly = z.object({ id: z.string().uuid() });
export const submitSalesQuote = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((d) => idOnly.parse(d))
  .handler(async ({ data, context }) => (await Q()).submitQuote(context.userId, data.id));
export const decideSalesQuote = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), approve: z.boolean(), note: opt }).parse(d))
  .handler(async ({ data, context }) => (await Q()).decideQuote(context.userId, data));
export const draftQuoteAgreements = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((d) => idOnly.parse(d))
  .handler(async ({ data, context }) => (await Q()).createAgreements(context.userId, data.id));
export const markSalesQuoteSent = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((d) => idOnly.parse(d))
  .handler(async ({ data, context }) => (await Q()).markSent(context.userId, data.id));
export const reviseSalesQuote = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((d) => idOnly.parse(d))
  .handler(async ({ data, context }) => (await Q()).newVersion(context.userId, data.id));
export const markSalesQuoteLost = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), reason: z.string().min(1).max(500) }).parse(d))
  .handler(async ({ data, context }) => (await Q()).markLost(context.userId, data));

export const listSowsForQuote = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await Q()).sowsForQuote(context.userId, data.clientId));

export const draftQuoteFromSow = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ sowId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await Q()).quoteFromSow(context.userId, data.sowId));

export const getCroDashboard = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).inputValidator((d) => period.parse(d))
  .handler(async ({ data, context }) => { const r = range(data); return { ...(await (await S()).croDashboard(context.userId, r.from, r.to)), range: r }; });

const C = () => import("@/lib/commissions.server");
const rates = z.object({ ae: z.number(), ae_cap_table: z.number(), sales_manager: z.number(), cro: z.number(), ceo: z.number(), bdr: z.number() });
export const getCommissions = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).inputValidator((d) => period.parse(d))
  .handler(async ({ data, context }) => { const r = range(data); return { ...(await (await C()).commissionReport(context.userId, r.from, r.to)), range: r }; });
export const saveCommissionRates = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ rates, reason: z.string().trim().min(3).max(500) }).parse(d))
  .handler(async ({ data, context }) => (await C()).setCommissionRates(context.userId, data.rates, data.reason));
export const saveQuoteBdr = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ quoteId: z.string().uuid(), bdrId: z.string().uuid().nullable() }).parse(d))
  .handler(async ({ data, context }) => (await C()).setQuoteBdr(context.userId, data.quoteId, data.bdrId));
