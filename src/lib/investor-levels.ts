/**
 * Investor levels (pure). Accreditation sets the floor, commitment size can raise it.
 * Portal features unlock per level but only when the fund's investor servicing tier
 * (what the fund manager pays for) includes them. Display/visibility only — never authority.
 */
import { INVESTOR_TIERS, investorTierFor } from "./product-pricing";

export type InvestorLevel = "standard" | "accredited" | "select" | "premier";
export type PortalFeature = "deal_room" | "detailed_reports" | "co_invest";

export const LEVELS: { key: InvestorLevel; label: string; rule: string }[] = [
  { key: "standard", label: "Standard", rule: "Accreditation not verified" },
  { key: "accredited", label: "Accredited", rule: "Verified accredited, under $250,000" },
  { key: "select", label: "Select", rule: "Accredited $250,000-$999,999, or Qualified Purchaser" },
  { key: "premier", label: "Premier", rule: "Accredited $1,000,000+" },
];
export const SELECT_MIN_CENTS = 250_000_00;
export const PREMIER_MIN_CENTS = 1_000_000_00;

export const FEATURE_LABELS: Record<PortalFeature, string> = { deal_room: "Deal room / diligence", detailed_reports: "Detailed reports", co_invest: "Co-invest offers" };
/** Lowest level that may see each feature. */
export const FEATURE_MIN_LEVEL: Record<PortalFeature, InvestorLevel> = { deal_room: "accredited", detailed_reports: "select", co_invest: "premier" };
/** Features each investor servicing tier includes (what the fund manager pays for). */
export const TIER_FEATURES: Record<string, PortalFeature[]> = {
  self_serve: [],
  essentials: ["deal_room"],
  standard: ["deal_room", "detailed_reports"],
  plus: ["deal_room", "detailed_reports", "co_invest"],
  premier: ["deal_room", "detailed_reports", "co_invest"],
  institutional: ["deal_room", "detailed_reports", "co_invest"],
};
const RANK: Record<InvestorLevel, number> = { standard: 0, accredited: 1, select: 2, premier: 3 };

export function investorLevel(a: { accredited: boolean; qualifiedPurchaser?: boolean; commitmentCents: number | null }): InvestorLevel {
  if (!a.accredited && !a.qualifiedPurchaser) return "standard";
  const c = a.commitmentCents ?? 0;
  if (c >= PREMIER_MIN_CENTS) return "premier";
  if (c >= SELECT_MIN_CENTS || a.qualifiedPurchaser) return "select";
  return "accredited";
}

export function portalFeatures(level: InvestorLevel, tierKey: string): PortalFeature[] {
  const paid = TIER_FEATURES[tierKey] ?? [];
  return paid.filter((f) => RANK[level] >= RANK[FEATURE_MIN_LEVEL[f]]);
}

/** Smallest tier whose features cover every feature these levels would use. */
function tierForFeatures(levels: InvestorLevel[]): string {
  const want = (Object.keys(FEATURE_MIN_LEVEL) as PortalFeature[]).filter((f) => levels.some((l) => RANK[l] >= RANK[FEATURE_MIN_LEVEL[f]]));
  return INVESTOR_TIERS.find((t) => want.every((f) => (TIER_FEATURES[t.key] ?? []).includes(f)))!.key;
}
const order = (k: string) => INVESTOR_TIERS.findIndex((t) => t.key === k);

export function upgradeCheck(tierKey: string | null, levels: InvestorLevel[]) {
  const current = tierKey ?? "self_serve";
  const t = INVESTOR_TIERS.find((x) => x.key === current);
  const reasons: string[] = [];
  const byCount = levels.length && current !== "self_serve" && current !== "institutional" && t?.maxInvestors != null && levels.length > t.maxInvestors ? investorTierFor(levels.length).key : null;
  if (byCount) reasons.push(`${levels.length} investors is over the ${t!.name} limit of ${t!.maxInvestors}`);
  const byLevel = tierForFeatures(levels);
  const levelNeeds = order(byLevel) > order(current) ? byLevel : null;
  if (levelNeeds) {
    const missing = (Object.keys(FEATURE_MIN_LEVEL) as PortalFeature[]).filter((f) => !(TIER_FEATURES[current] ?? []).includes(f) && (TIER_FEATURES[levelNeeds] ?? []).includes(f));
    reasons.push(`Investors qualify for ${missing.map((f) => FEATURE_LABELS[f]).join(", ")}, which ${t?.name ?? "this tier"} doesn't include`);
  }
  const candidates = [byCount, levelNeeds].filter(Boolean) as string[];
  const suggested = candidates.sort((a, b) => order(b) - order(a))[0] ?? null;
  return { needsUpgrade: reasons.length > 0, reasons, suggestedTier: suggested };
}
