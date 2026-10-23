import { z } from "zod";

export const BOOKKEEPING_KEY = "BOOKKEEPING_ACCOUNTING";
export const cadenceSchema = z.enum(["monthly", "quarterly", "annual"]);
export const bookkeepingConfigSchema = z.object({
  serviceKey: z.literal(BOOKKEEPING_KEY), name: z.string().min(1),
  tiers: z.array(z.object({ key: z.enum(["self_service", "essential", "growth", "professional", "enterprise"]), name: z.string().min(1), monthlyCents: z.object({ monthly: z.number().int().nonnegative().nullable(), quarterly: z.number().int().nonnegative().nullable(), annual: z.number().int().nonnegative().nullable() }), transactions: z.number().int().nonnegative(), accounts: z.number().int().nonnegative().nullable(), monthlyBusinessDays: z.number().int().positive().nullable(), deliverables: z.array(z.string()) })).length(5),
  addons: z.array(z.object({ key: z.string().min(1), name: z.string().min(1), unitCents: z.number().int().nonnegative(), cadence: z.enum(["monthly", "one_time", "hour", "report"]) })).max(30),
  quarterlyBusinessDays: z.number().int().positive(), annualBusinessDays: z.number().int().positive(), exclusions: z.array(z.string()), responsibilities: z.array(z.string()), amendmentTerms: z.string(),
}).superRefine((c, ctx) => {
  if (new Set(c.tiers.map(t => t.key)).size !== 5) ctx.addIssue({ code: "custom", message: "Each tier must appear exactly once." });
  if (new Set(c.addons.map(a => a.key)).size !== c.addons.length) ctx.addIssue({ code: "custom", message: "Optional service keys must be unique." });
  const enterprise = c.tiers.find(t => t.key === "enterprise");
  if (enterprise?.monthlyCents.annual !== null) ctx.addIssue({ code: "custom", message: "Enterprise annual reconciliation requires a custom quote." });
});
export type BookkeepingConfig = z.infer<typeof bookkeepingConfigSchema>;
export const bookkeepingInputSchema = z.object({
  configVersionId: z.string().uuid(), tier: z.enum(["self_service", "essential", "growth", "professional", "enterprise"]),
  reconciliation: cadenceSchema, billing: cadenceSchema,
  entityReferences: z.array(z.string().trim().min(2).max(200)).min(1).max(50),
  expectedTransactions: z.number().int().nonnegative().max(1000000), financialAccounts: z.number().int().nonnegative().max(10000),
  accountingMethod: z.enum(["cash", "accrual"]), reportingRequirements: z.string().trim().max(2000),
  effectiveOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), termMonths: z.number().int().min(1).max(120),
  addons: z.array(z.object({ key: z.string(), quantity: z.number().int().nonnegative().max(10000) })).max(30),
  customMonthlyCents: z.number().int().nonnegative().max(1000000000).nullable(), customReason: z.string().trim().max(1000),
});
export type BookkeepingInput = z.infer<typeof bookkeepingInputSchema>;
const multiples = { monthly: 1, quarterly: 3, annual: 12 };
export function calculateBookkeeping(config: BookkeepingConfig, raw: BookkeepingInput) {
  const input = bookkeepingInputSchema.parse(raw);
  const tier = config.tiers.find(t => t.key === input.tier);
  if (!tier) throw new Error("Choose a configured bookkeeping tier.");
  if (new Set(input.entityReferences).size !== input.entityReferences.length) throw new Error("List each legal entity only once.");
  if (input.tier !== "enterprise" && input.entityReferences.length > 1) throw new Error("Multi-entity coverage requires an explicitly scoped Enterprise quote.");
  if (new Set(input.addons.map(a => a.key)).size !== input.addons.length) throw new Error("Select each optional service only once.");
  const listMonthly = tier.monthlyCents[input.reconciliation];
  const customRequired = listMonthly === null || (input.tier === "enterprise" && (tier.accounts === null || input.entityReferences.length > 1));
  const blockers: string[] = [];
  if (customRequired && input.customMonthlyCents === null) blockers.push("Enterprise scope requires a documented custom monthly price.");
  if (input.customMonthlyCents !== null && input.customReason.length < 3) blockers.push("Give a reason for custom pricing; executive approval is required before release.");
  const extraTransactions = Math.ceil(Math.max(0, input.expectedTransactions - tier.transactions) / 50);
  const extraAccounts = tier.accounts === null ? 0 : Math.max(0, input.financialAccounts - tier.accounts);
  const quantities = new Map(input.addons.map(a => [a.key, a.quantity]));
  quantities.set("extra_transactions", Math.max(extraTransactions, quantities.get("extra_transactions") ?? 0));
  quantities.set("extra_account", Math.max(extraAccounts, quantities.get("extra_account") ?? 0));
  if (input.tier !== "enterprise" && (quantities.get("extra_entity") ?? 0) > 0) throw new Error("Additional entities require Enterprise.");
  if (input.tier === "enterprise" && input.entityReferences.length > 1) blockers.push("Confirm the custom price explicitly covers every named entity and consolidation scope.");
  let recurringAddons = 0; let oneTimeCents = 0; let usageCents = 0;
  const selectedAddons = [...quantities].filter(([, q]) => q > 0).map(([key, quantity]) => {
    const addon = config.addons.find(a => a.key === key);
    if (!addon) throw new Error("An optional service is not configured.");
    const amountCents = addon.unitCents * quantity;
    if (addon.cadence === "monthly") recurringAddons += amountCents;
    else if (addon.cadence === "one_time") oneTimeCents += amountCents;
    else usageCents += amountCents;
    return { ...addon, quantity, amountCents };
  });
  const baseMonthlyCents = input.customMonthlyCents ?? listMonthly;
  const monthlyCents = baseMonthlyCents === null ? null : baseMonthlyCents + recurringAddons;
  const invoiceCents = monthlyCents === null ? null : monthlyCents * multiples[input.billing];
  const annualCents = monthlyCents === null ? null : monthlyCents * 12;
  const businessDays = input.tier === "self_service" ? null : input.reconciliation === "monthly" ? tier.monthlyBusinessDays : input.reconciliation === "quarterly" ? config.quarterlyBusinessDays : config.annualBusinessDays;
  return { input, tier, listMonthly, customRequired, blockers, monthlyCents, invoiceCents, annualCents, oneTimeCents, usageCents, selectedAddons, businessDays, extraTransactions, extraAccounts, needsExecutiveApproval: customRequired || input.customMonthlyCents !== null };
}
export function bookkeepingTerms(config: BookkeepingConfig, input: BookkeepingInput) {
  const p = calculateBookkeeping(config, input);
  const money = (n: number | null) => n === null ? "Custom price required" : `$${(n / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  return [
    `${config.name} — ${p.tier.name}`,
    `Covered proposed legal entities: ${input.entityReferences.join("; ")}. Exact entity authorization and coverage must be confirmed before activation.`,
    `${input.accountingMethod} accounting; ${input.reconciliation} reconciliation; ${input.billing} billing.`,
    `Monthly-equivalent ${money(p.monthlyCents)}; recurring invoice ${money(p.invoiceCents)}; annual recurring value ${money(p.annualCents)}. One-time ${money(p.oneTimeCents)}; quoted usage ${money(p.usageCents)} (separate from recurring billing).`,
    `${p.tier.transactions} monthly transactions; ${p.tier.accounts ?? "custom"} financial accounts included. Expected ${input.expectedTransactions} transactions / ${input.financialAccounts} accounts.`,
    `Deliverables: ${p.tier.deliverables.join("; ")}. Additional requirements: ${input.reportingRequirements || "None specified"}.`,
    p.businessDays === null ? "Customer-managed reconciliation; no Harmonious-managed review, certification or completion guarantee." : `Managed completion target: ${p.businessDays} business days after the later of period end and receipt of all required records; annual periods follow the entity's confirmed fiscal year.`,
    `Optional services: ${p.selectedAddons.map(a => `${a.name}: ${a.quantity} × ${money(a.unitCents)} (${a.cadence})`).join("; ") || "None"}.`,
    `Client responsibilities: ${config.responsibilities.join(" ")}`,
    `Excluded unless separately contracted: ${config.exclusions.join("; ")}.`,
    `Effective ${input.effectiveOn}; term ${input.termMonths} months. ${config.amendmentTerms}`,
    "Proposed terms only. Existing contracted accounting/reporting must be reviewed for overlap before approval. No activation, invoice or bank action is authorized.",
  ].join("\n\n");
}
export function bookkeepingDraftBlocker(lines: readonly { bookkeeping_snapshot?: unknown; service_key?: string }[]) {
  return lines.some(l => l.bookkeeping_snapshot || l.service_key === BOOKKEEPING_KEY) ? "Bookkeeping prices are proposed: approval, signing, enrollment and billing remain disabled pending a separately approved release." : null;
}
export function bookkeepingDueOn(periodEnd: string, documentationOn: string, businessDays: number | null): string | null {
  if (businessDays === null) return null;
  const date = new Date(`${periodEnd > documentationOn ? periodEnd : documentationOn}T00:00:00Z`);
  for (let count = 0; count < businessDays;) { date.setUTCDate(date.getUTCDate() + 1); if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) count++; }
  return date.toISOString().slice(0, 10);
}