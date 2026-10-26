export const RECURRING_SERVICE_CADENCES = ["MONTHLY", "QUARTERLY", "ANNUAL"] as const;
export type ServiceCadence = typeof RECURRING_SERVICE_CADENCES[number];
type Terms = { contracted_annual_value?: number | string | null; recurring_invoice_amount?: number | string | null; billing_frequency?: string | null; pricing_type?: string | null; grandfathered?: boolean };
type Rates = { annual_price?: number | string | null; quarterly_price?: number | string | null; monthly_price?: number | string | null };
const billsPerYear: Record<ServiceCadence, number> = { MONTHLY: 12, QUARTERLY: 4, ANNUAL: 1 };
export function isServiceCadence(value: string | null | undefined): value is ServiceCadence {
  return RECURRING_SERVICE_CADENCES.some(c => c === value);
}
export function assertServiceCadenceChange(status: string, previous: string | null | undefined, next: string | null | undefined) {
  if (next !== undefined && next !== previous && !["PROPOSED", "PENDING_AGREEMENT"].includes(status)) {
    throw new Error("Contracted billing frequency requires a new agreement. Prepare a proposed engagement instead.");
  }
}
/** Negotiated terms retain their annual value; list pricing uses the recorded period rate. */
export function serviceCadenceAmount(terms: Terms, cadence: ServiceCadence, rates?: Rates | null): number | null {
  const annual = terms.contracted_annual_value == null ? null : Number(terms.contracted_annual_value);
  const custom = terms.pricing_type != null && terms.pricing_type !== "CURRENT" || terms.grandfathered === true
    || annual != null && rates?.annual_price != null && annual !== Number(rates.annual_price);
  if (!custom && rates) {
    const rate = rates[cadence === "MONTHLY" ? "monthly_price" : cadence === "QUARTERLY" ? "quarterly_price" : "annual_price"];
    if (rate != null) return Number(rate);
  }
  const basis = annual ?? (isServiceCadence(terms.billing_frequency) && terms.recurring_invoice_amount != null
    ? Number(terms.recurring_invoice_amount) * billsPerYear[terms.billing_frequency] : rates?.annual_price == null ? null : Number(rates.annual_price));
  return basis == null || !Number.isFinite(basis) ? null : Math.round(basis * 100 / billsPerYear[cadence]) / 100;
}