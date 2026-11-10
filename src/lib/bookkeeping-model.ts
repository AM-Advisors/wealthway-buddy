import { z } from "zod";
import { ADDONS, BOOKKEEPING_OPTIONS, CHARGED_LABELS, FREQUENCY_LABELS, OPTION_KEYS, resolveFrequency, scopeReviewReasons, supportDescription, type ChargedScope } from "@/lib/bookkeeping-options";

/**
 * Bookkeeping pricing configuration and quote calculation (pure).
 * Prices are optional: a null price means "Request a quote" and a staff quote needs a documented
 * custom price with executive approval. Configurations stay proposed until a separately approved release.
 */
export const BOOKKEEPING_KEY = "BOOKKEEPING_ACCOUNTING";
export const cadenceSchema = z.enum(["monthly", "quarterly", "annual"]);
const cents = z.number().int().nonnegative().nullable();
const optionKey = z.enum(["self_service", "review", "managed"]);
const addonKey = z.enum(["initial_setup", "historical_cleanup", "bill_pay_invoicing", "payroll", "tax_preparation", "cfo_advisory"]);
const chargedScope = z.enum(["tools", "categorize", "reconcile", "journal_entries", "close", "reports", "review", "corrections"]);

export const bookkeepingConfigSchema = z.object({
  serviceKey: z.literal(BOOKKEEPING_KEY), name: z.string().min(1),
  /** Monthly-equivalent prices. Self-Service uses `platform`; Review and Managed use their service frequency. */
  options: z.array(z.object({
    key: optionKey,
    monthlyCents: z.object({ platform: cents, monthly: cents, quarterly: cents, annual: cents }),
    limits: z.object({
      entities: z.number().int().positive().nullable(), financialAccounts: z.number().int().nonnegative().nullable(),
      monthlyTransactions: z.number().int().nonnegative().nullable(), accountingBases: z.array(z.enum(["cash", "accrual"])).min(1),
      reporting: z.enum(["standard", "custom"]),
    }),
  })).length(3),
  addons: z.array(z.object({ key: addonKey, unitCents: cents, cadence: z.enum(["one_time", "monthly", "hour", "per_filing"]) })).length(6),
  reviewBusinessDays: z.number().int().positive().nullable(),
  closeBusinessDays: z.object({ monthly: z.number().int().positive().nullable(), quarterly: z.number().int().positive().nullable(), annual: z.number().int().positive().nullable() }),
  exclusions: z.array(z.string()), responsibilities: z.array(z.string()), amendmentTerms: z.string(),
}).superRefine((c, ctx) => {
  if (new Set(c.options.map((o) => o.key)).size !== 3) ctx.addIssue({ code: "custom", message: "Each bookkeeping option must appear exactly once." });
  if (new Set(c.addons.map((a) => a.key)).size !== c.addons.length) ctx.addIssue({ code: "custom", message: "Each add-on must appear exactly once." });
  const self = c.options.find((o) => o.key === "self_service");
  if (self && (self.monthlyCents.monthly !== null || self.monthlyCents.quarterly !== null || self.monthlyCents.annual !== null)) ctx.addIssue({ code: "custom", message: "Self-Service has no review schedule; price it as platform access only." });
  for (const o of c.options) if (o.key !== "self_service" && o.monthlyCents.platform !== null) ctx.addIssue({ code: "custom", message: "Review and Managed are priced by service frequency, not as platform access." });
  const managed = c.options.find((o) => o.key === "managed");
  if (managed?.monthlyCents.annual !== null) ctx.addIssue({ code: "custom", message: "Managed Bookkeeping closes monthly or quarterly; it has no annual price." });
});
export type BookkeepingConfig = z.infer<typeof bookkeepingConfigSchema>;

export const bookkeepingInputSchema = z.object({
  configVersionId: z.string().uuid(),
  option: optionKey,
  /** Review: review frequency. Managed: close frequency (monthly by default). Self-Service: none. */
  frequency: cadenceSchema.nullable(),
  /** Support responsiveness only; never changes scope, frequency or deadlines. */
  supportLevel: z.enum(["self_serve", "core", "plus", "white_glove", "institutional"]),
  /** How often invoices go out; independent of the service frequency. */
  billing: cadenceSchema,
  entityId: z.string().uuid().nullable(),
  entityReferences: z.array(z.string().trim().min(2).max(200)).min(1).max(50),
  expectedTransactions: z.number().int().nonnegative().max(1000000), financialAccounts: z.number().int().nonnegative().max(10000),
  accountingMethod: z.enum(["cash", "accrual"]), reporting: z.enum(["standard", "custom"]), reportingRequirements: z.string().trim().max(2000),
  effectiveOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), termMonths: z.number().int().min(1).max(120),
  addons: z.array(z.object({ key: addonKey, quantity: z.number().int().nonnegative().max(10000), quotedCents: cents.default(null) })).max(6),
  /** Scope already covered elsewhere for this entity that staff confirm is excluded from this quote. */
  excludedScope: z.array(chargedScope).max(8).default([]),
  customMonthlyCents: z.number().int().nonnegative().max(1000000000).nullable(), customReason: z.string().trim().max(1000),
  /** The open client bookkeeping request this quote answers, if any; checked against the entity on the server. */
  sourceRequestId: z.string().uuid().nullable().default(null),
});
export type BookkeepingInput = z.input<typeof bookkeepingInputSchema>;

const multiples = { monthly: 1, quarterly: 3, annual: 12 } as const;
const ADDON_NAME = new Map(ADDONS.map((a) => [a.key, a.name]));

export function calculateBookkeeping(config: BookkeepingConfig, raw: BookkeepingInput) {
  const input = bookkeepingInputSchema.parse(raw);
  const optionConfig = config.options.find((o) => o.key === input.option);
  if (!optionConfig) throw new Error("Choose a configured bookkeeping option.");
  const option = BOOKKEEPING_OPTIONS[input.option];
  const frequency = resolveFrequency(input.option, input.frequency);
  if (new Set(input.entityReferences).size !== input.entityReferences.length) throw new Error("List each legal entity only once.");
  if (new Set(input.addons.map((a) => a.key)).size !== input.addons.length) throw new Error("Select each add-on only once.");
  const listMonthly = optionConfig.monthlyCents[frequency ?? "platform"];
  const scopeReview = scopeReviewReasons(optionConfig.limits, {
    entities: input.entityReferences.length, financialAccounts: input.financialAccounts, monthlyTransactions: input.expectedTransactions,
    accountingBasis: input.accountingMethod, reporting: input.reporting,
  });
  const blockers: string[] = [];
  const customRequired = listMonthly === null || scopeReview.length > 0;
  if (customRequired && input.customMonthlyCents === null) blockers.push(listMonthly === null
    ? `${option.name} has no approved price yet; enter a documented custom monthly price.`
    : `Outside the configured scope (${scopeReview.join("; ")}): a scope review and an approved custom price are needed before any additional charge.`);
  if (input.customMonthlyCents !== null && input.customReason.length < 3) blockers.push("Give a reason for custom pricing; executive approval is required before release.");
  let recurringAddons = 0; let oneTimeCents = 0; let usageCents = 0;
  const selectedAddons = input.addons.filter((a) => a.quantity > 0).map((a) => {
    const configured = config.addons.find((x) => x.key === a.key);
    if (!configured) throw new Error("An add-on is not configured.");
    const unitCents = configured.unitCents ?? a.quotedCents;
    const name = ADDON_NAME.get(a.key) ?? a.key;
    if (unitCents === null) { blockers.push(`${name} has no approved price; quote it before adding.`); return { key: a.key, name, cadence: configured.cadence, quantity: a.quantity, unitCents: null, amountCents: null, quoted: false }; }
    const amountCents = unitCents * a.quantity;
    if (configured.cadence === "monthly") recurringAddons += amountCents;
    else if (configured.cadence === "one_time") oneTimeCents += amountCents;
    else usageCents += amountCents;
    return { key: a.key, name, cadence: configured.cadence, quantity: a.quantity, unitCents, amountCents, quoted: configured.unitCents === null };
  });
  const baseMonthlyCents = input.customMonthlyCents ?? listMonthly;
  const monthlyCents = baseMonthlyCents === null ? null : baseMonthlyCents + recurringAddons;
  const invoiceCents = monthlyCents === null ? null : monthlyCents * multiples[input.billing];
  const annualCents = monthlyCents === null ? null : monthlyCents * 12;
  const businessDays = input.option === "self_service" || !frequency ? null : input.option === "managed" ? config.closeBusinessDays[frequency] : config.reviewBusinessDays;
  return {
    input: { ...input, frequency }, option, listMonthly, customRequired, scopeReview, blockers, monthlyCents, invoiceCents, annualCents,
    oneTimeCents, usageCents, selectedAddons, businessDays, support: supportDescription(input.option, input.supportLevel),
    needsExecutiveApproval: customRequired || input.customMonthlyCents !== null || selectedAddons.some((a) => a.quoted),
  };
}

export function bookkeepingTerms(config: BookkeepingConfig, raw: BookkeepingInput) {
  const p = calculateBookkeeping(config, raw);
  const input = p.input;
  const money = (n: number | null) => n === null ? "Custom price required" : `$${(n / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  const who = (owner: string) => owner === "client" ? "Client" : owner === "harmonious" ? "Harmonious" : "Not included";
  const schedule = input.option === "self_service"
    ? "No Harmonious review, close or completion schedule. The client maintains the books; Harmonious provides the tools and platform support only, with no accuracy guarantee."
    : input.option === "review"
      ? `${FREQUENCY_LABELS[input.frequency!]} review${p.businessDays ? `, delivered within ${p.businessDays} business days after the later of period end and receipt of required records` : ", on the dates agreed in the engagement"}.`
      : `${FREQUENCY_LABELS[input.frequency!]} close${p.businessDays ? `, completed within ${p.businessDays} business days after the later of period end and receipt of required records` : ", on the dates agreed in the engagement"}.`;
  return [
    `${config.name} · ${p.option.name}`,
    p.option.description,
    `Covered legal entities: ${input.entityReferences.join("; ")}. Exact entity authorization and coverage must be confirmed before activation.`,
    `Responsibilities: ${Object.entries(p.option.responsibilities).map(([k, v]) => `${k.replace(/_/g, " ")}: ${who(v)}`).join("; ")}.`,
    schedule,
    `${p.support.title}. ${p.support.detail} The support level does not change scope, review frequency or close deadlines.`,
    `${input.accountingMethod} accounting; ${input.reporting} reporting; billed ${input.billing}. Billing frequency is separate from how often work is performed.`,
    `Monthly-equivalent ${money(p.monthlyCents)}; recurring invoice ${money(p.invoiceCents)}; annual recurring value ${money(p.annualCents)}. One-time ${money(p.oneTimeCents)}; quoted usage ${money(p.usageCents)} (separate from recurring billing).`,
    `Expected ${input.expectedTransactions} monthly transactions and ${input.financialAccounts} bank and credit accounts. Work beyond the agreed limits requires a scope review and an approved quote before additional charges.${p.scopeReview.length ? ` Scope review: ${p.scopeReview.join("; ")}.` : ""}`,
    `Additional requirements: ${input.reportingRequirements || "None specified"}.`,
    `Add-ons: ${p.selectedAddons.map((a) => `${a.name}: ${a.quantity} × ${money(a.unitCents)} (${a.cadence.replace("_", " ")})`).join("; ") || "None"}.`,
    input.excludedScope.length ? `Excluded because already covered for this entity and period: ${input.excludedScope.map((s) => CHARGED_LABELS[s as ChargedScope]).join("; ")}.` : "",
    `Client responsibilities: ${config.responsibilities.join(" ")}`,
    `Excluded unless separately contracted: ${config.exclusions.join("; ")}.`,
    `Effective ${input.effectiveOn}; term ${input.termMonths} months. ${config.amendmentTerms}`,
    "Proposed terms only. No activation, invoice or bank action is authorized.",
  ].filter(Boolean).join("\n\n");
}

export function bookkeepingDraftBlocker(lines: readonly { bookkeeping_snapshot?: unknown; service_key?: string }[]) {
  return lines.some((l) => l.bookkeeping_snapshot || l.service_key === BOOKKEEPING_KEY) ? "Bookkeeping prices are proposed: approval, signing, enrollment and billing remain disabled pending a separately approved release." : null;
}

export const COVERAGE_PENDING = "Coverage check pending";

/** Server-computed result of the coverage and open-request checks, saved on each bookkeeping quote line. */
export interface CoverageCheck {
  status: "pending" | "passed";
  entityId: string | null;
  entityName: string | null;
  organizationId: string | null;
  organizationName: string | null;
  /** Entities named on the line that are not linked to a canonical entity on file. */
  unlinkedReferences: string[];
  checkedAt: string | null;
}

/**
 * A line passes only when it names exactly the one entity it is linked to and the server has
 * run the coverage checks for it. Anything not yet on file stays "Coverage check pending".
 */
export function coverageCheckFor(
  input: { entityId: string | null; entityReferences: readonly string[] },
  linked: { entityName: string; organizationId: string; organizationName: string | null } | null,
  now: string,
): CoverageCheck {
  const unlinked = linked ? input.entityReferences.filter((r) => r !== linked.entityName) : [...input.entityReferences];
  const passed = Boolean(linked && input.entityId) && unlinked.length === 0;
  return {
    status: passed ? "passed" : "pending",
    entityId: linked ? input.entityId : null,
    entityName: linked?.entityName ?? null,
    organizationId: linked?.organizationId ?? null,
    organizationName: linked?.organizationName ?? null,
    unlinkedReferences: unlinked,
    checkedAt: linked ? now : null,
  };
}

/** Blocks submission, agreements and sending while any bookkeeping line's coverage check is pending. */
export function bookkeepingCoverageBlocker(lines: readonly { bookkeeping_snapshot?: unknown; service_key?: string }[]) {
  const pending = lines
    .filter((l) => l.bookkeeping_snapshot || l.service_key === BOOKKEEPING_KEY)
    .map((l) => (l.bookkeeping_snapshot ?? {}) as { coverageCheck?: CoverageCheck; entityReferences?: string[] })
    .filter((s) => s.coverageCheck?.status !== "passed");
  if (!pending.length) return null;
  const names = [...new Set(pending.flatMap((s) => s.coverageCheck?.unlinkedReferences ?? s.entityReferences ?? []))];
  return `${COVERAGE_PENDING}: ${names.length ? names.join(", ") : "an entity"} ${names.length === 1 ? "isn't" : "aren't"} linked to an entity on file. Link each entity and rerun the coverage and open-request checks before this quote can move forward.`;
}

export function bookkeepingDueOn(periodEnd: string, documentationOn: string, businessDays: number | null): string | null {
  if (businessDays === null) return null;
  const date = new Date(`${periodEnd > documentationOn ? periodEnd : documentationOn}T00:00:00Z`);
  for (let count = 0; count < businessDays;) { date.setUTCDate(date.getUTCDate() + 1); if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) count++; }
  return date.toISOString().slice(0, 10);
}

export const OPTION_ORDER = OPTION_KEYS;
