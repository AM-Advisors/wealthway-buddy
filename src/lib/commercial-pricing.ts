/**
 * Phase 3.10 commercial model — pure rules, no I/O.
 *
 * Pricing resolves: current rate card → valid Client Pricing → authorised
 * Fund adjustment → Fund Pricing Snapshot. Commercial states are Harmonious
 * account-management facts and never feed Fund Setup or investor readiness.
 */

export const SALES_ROLES = ["sales", "sales_management"] as const;
/** May approve discounts and set Client Pricing. Never ordinary Sales. */
export const PRICING_AUTHORITY_ROLES = ["sales_management", "super_admin"] as const;
/** May view the Sales area (commercial data only). */
export const COMMERCIAL_VIEW_ROLES = ["sales", "sales_management", "super_admin", "admin", "executive", "finance", "client_success", "legal"] as const;

export type CatalogItem = {
  serviceKey: string;
  label: string;
  amountCents: number;
  pricingModel: string | null;
  passThrough: boolean;
};

export type ClientPrice = {
  serviceKey: string;
  contractedCents: number;
  effectiveDate: string | null;
  expiresOn: string | null;
  superseded: boolean;
  offeringId: string | null;
};

export type ResolvedLine = {
  serviceKey: string;
  label: string;
  pricingModel: string | null;
  passThrough: boolean;
  catalogCents: number;
  clientCents: number | null;
  baselineCents: number;
  baselineSource: "catalog" | "client_pricing";
};

const hasRole = (roles: readonly string[], set: readonly string[]) => roles.some((r) => set.includes(r));
export const canApprovePricing = (roles: readonly string[]) => hasRole(roles, PRICING_AUTHORITY_ROLES);
export const canViewCommercial = (roles: readonly string[]) => hasRole(roles, COMMERCIAL_VIEW_ROLES);
export const canProposePricing = (roles: readonly string[]) => canApprovePricing(roles) || hasRole(roles, SALES_ROLES);

/** Client Pricing applies only to future Funds, within its dates, when not superseded. */
export function clientPriceIsValid(p: ClientPrice, onDate: string): boolean {
  if (p.superseded || p.offeringId) return false;
  if (p.effectiveDate && p.effectiveDate > onDate) return false;
  if (p.expiresOn && p.expiresOn < onDate) return false;
  return true;
}

/** Applicable baseline for each catalog service. */
export function resolveBaseline(catalog: CatalogItem[], clientPrices: ClientPrice[], onDate: string): ResolvedLine[] {
  return catalog.map((c) => {
    const cp = clientPrices
      .filter((p) => p.serviceKey === c.serviceKey && clientPriceIsValid(p, onDate))
      .sort((a, b) => String(b.effectiveDate ?? "").localeCompare(String(a.effectiveDate ?? "")))[0];
    const useClient = cp && !c.passThrough;
    return {
      serviceKey: c.serviceKey,
      label: c.label,
      pricingModel: c.pricingModel,
      passThrough: c.passThrough,
      catalogCents: c.amountCents,
      clientCents: cp ? cp.contractedCents : null,
      baselineCents: useClient ? cp!.contractedCents : c.amountCents,
      baselineSource: useClient ? "client_pricing" : "catalog",
    };
  });
}

export type SnapshotDecision = {
  status: "approved" | "pricing_review";
  lines: (ResolvedLine & { finalCents: number })[];
  belowBaseline: string[];
  baselineTotal: number;
  finalTotal: number;
};

/**
 * Applies requested final prices. At or above baseline → Approved at once.
 * Below baseline → Pricing Approval Required (never silently accepted).
 * Pass-through items are billed at cost and cannot be overridden.
 */
export function decideSnapshot(baseline: ResolvedLine[], requested: Record<string, number> = {}): SnapshotDecision {
  const lines = baseline.map((l) => {
    const req = requested[l.serviceKey];
    const finalCents = l.passThrough || req === undefined || !Number.isFinite(req) ? l.baselineCents : Math.max(0, Math.round(req));
    return { ...l, finalCents };
  });
  const belowBaseline = lines.filter((l) => l.finalCents < l.baselineCents).map((l) => l.serviceKey);
  return {
    status: belowBaseline.length ? "pricing_review" : "approved",
    lines,
    belowBaseline,
    baselineTotal: lines.reduce((s, l) => s + l.baselineCents, 0),
    finalTotal: lines.reduce((s, l) => s + l.finalCents, 0),
  };
}

/** Maker-checker: approver needs authority and must not be the requester. */
export function assertCanDecide(roles: readonly string[], approverId: string, requesterId: string) {
  if (!canApprovePricing(roles)) throw new Error("Only Sales Management or a Super User can approve pricing below the baseline.");
  if (approverId === requesterId) throw new Error("A pricing request cannot be approved by the person who requested it.");
}

export const COMMERCIAL_STATUS_LABEL = {
  approved: "Approved",
  pricing_review: "Pricing Approval Required",
  legacy_review: "Legacy Pricing Review",
  none: "Legacy Pricing Review",
} as const;

/** What a client or fund manager sees — never baseline, approvals or notes. */
export function clientFacingStatus(status: keyof typeof COMMERCIAL_STATUS_LABEL): string {
  return status === "approved" ? "Approved" : "Being finalised by Harmonious";
}

/** Commercial states are never investor or Fund Setup readiness conditions. */
export const COMMERCIAL_STATES = ["msa_follow_up", "pricing_review", "legacy_review"] as const;
export const isReadinessCondition = (_state: string) => false;
