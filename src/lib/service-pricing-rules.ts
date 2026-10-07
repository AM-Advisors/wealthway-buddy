/** Pure pricing-permission rules for Service Engagements (unit-tested). */
export type PricingInput = { pricing_type?: string | undefined; grandfathered?: boolean | undefined; service_level: string; pricing_override_reason?: string | null | undefined };

/** Is this save a pricing override (grandfathered / negotiated / custom / off-list price)? Institutional is always custom-quoted. */
export function isPricingOverride(fields: PricingInput, contracted: number | null | undefined, listAnnual: number | null | undefined) {
  return (!!fields.pricing_type && fields.pricing_type !== "CURRENT") || fields.grandfathered === true
    || (contracted != null && listAnnual != null && Number(contracted) !== Number(listAnnual) && fields.service_level !== "INSTITUTIONAL");
}

/** Throws unless an Admin with a 10+ character reason applies an override. */
export function assertPricingOverrideAllowed(isAdmin: boolean, fields: PricingInput) {
  if (!isAdmin) throw new Error("Only a Harmonious Admin can apply negotiated, grandfathered or custom pricing.");
  if (!fields.pricing_override_reason || fields.pricing_override_reason.trim().length < 10) throw new Error("Give a reason (10+ characters) for the pricing override.");
}

/** Columns a client-facing Services query may ever select. */
export const CLIENT_SERVICE_FIELDS = ["id", "service_product", "service_level", "service_status", "contracted_annual_value", "billing_frequency", "recurring_invoice_amount", "currency", "effective_date", "renewal_date", "reporting_frequency", "nav_frequency", "included_at_no_charge"];
export const INTERNAL_ONLY_SERVICE_FIELDS = ["notes_internal", "pricing_override_reason", "pricing_type", "grandfathered", "pricing_version_id", "created_by", "updated_by"];
