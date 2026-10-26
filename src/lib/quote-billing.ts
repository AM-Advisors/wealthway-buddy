import type { BillingFrequency } from "./invoice-schedule-model";
import type { QuoteLineInput } from "./sales-model";

export type QuoteRate = {
  serviceKey: string; label: string; baselineCents: number;
  pricingModel?: string | null; quarterlyCents?: number | null;
};

/** Rate-card amounts retain their source period; quote amounts are per selected bill. */
export function recurringQuoteRate(rate: QuoteRate): boolean {
  return rate.serviceKey.startsWith("ADMIN:") || ["annual", "monthly", "quarterly", "recurring"].includes(rate.pricingModel ?? "");
}

export function defaultQuoteBilling(rate: QuoteRate): BillingFrequency {
  return recurringQuoteRate(rate) ? "annual" : "one_time";
}

export function quotePeriodBaseline(rate: QuoteRate, frequency: BillingFrequency): number {
  if (!recurringQuoteRate(rate) || frequency === "one_time") return rate.baselineCents;
  if (frequency === "quarterly" && rate.quarterlyCents != null) return rate.quarterlyCents;
  const months = { monthly: 1, quarterly: 3, annual: 12 };
  const sourceMonths = rate.pricingModel === "monthly" ? 1 : rate.pricingModel === "quarterly" ? 3 : 12;
  return Math.round(rate.baselineCents * months[frequency] / sourceMonths);
}

/** Shared by preview and authorized saves; never trust a browser-supplied baseline. */
export function normalizeQuoteBilling(line: QuoteLineInput, rate: QuoteRate): QuoteLineInput {
  const billingFrequency = line.billingFrequency ?? defaultQuoteBilling(rate);
  if (rate.serviceKey.endsWith(":SAAS") && !["quarterly", "annual"].includes(billingFrequency)) {
    throw new Error("SaaS platform billing must be quarterly or annual.");
  }
  return { ...line, billingFrequency,
    label: recurringQuoteRate(rate) ? rate.label.replace(/\s*\(annual\)\s*/gi, " ").trim() : rate.label,
    baselineUnitCents: quotePeriodBaseline(rate, billingFrequency) };
}

/** Switching cadence converts a negotiated per-bill price without dropping its discount. */
export function changeQuoteBilling(line: QuoteLineInput, rate: QuoteRate, frequency: BillingFrequency): QuoteLineInput {
  const oldBaseline = quotePeriodBaseline(rate, line.billingFrequency ?? defaultQuoteBilling(rate));
  const newBaseline = quotePeriodBaseline(rate, frequency);
  const unitCents = recurringQuoteRate(rate) && oldBaseline > 0
    ? Math.round(line.unitCents * newBaseline / oldBaseline) : line.unitCents;
  return normalizeQuoteBilling({ ...line, billingFrequency: frequency, unitCents }, rate);
}

/** Fund-specific negotiated cadence choice; never changes the global White Glove rate card. */
export function hasRoasWhiteGloveCadences(fundId: string | null | undefined, serviceKey: string) {
  return fundId === "acb8193f-35fc-41cc-9ee5-629bde3e11b2" && serviceKey === "ADMIN:FUND_ADMINISTRATION:WHITE_GLOVE";
}
export function changeRoasWhiteGloveBilling(line: QuoteLineInput, rate: QuoteRate, frequency: BillingFrequency): QuoteLineInput {
  const months = { monthly: 1, quarterly: 3, annual: 12, one_time: 12 };
  const unitCents = Math.round(line.unitCents * months[frequency] / months[line.billingFrequency ?? "annual"]);
  return normalizeQuoteBilling({ ...line, billingFrequency: frequency, unitCents }, rate);
}