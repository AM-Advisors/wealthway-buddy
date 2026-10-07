import { ladderLevel } from "@/lib/service-ladders";
import { tierByKey, type TierKey } from "@/lib/administration-tiers";

const LEVEL_TO_TIER: Record<string, TierKey> = { CORE: "core", FUND_ADMINISTRATION: "fund_admin", WHITE_GLOVE: "white_glove", INSTITUTIONAL: "institutional" };

export function serviceLevelLabel(level: string, product?: string) {
  const ladder = ladderLevel(product, level);
  if (ladder) return { name: ladder.name, positioning: ladder.positioning };
  const t = LEVEL_TO_TIER[level];
  if (!t) return { name: titleCase(level), positioning: titleCase(product) };
  const tier = tierByKey(t);
  return { name: tier.name, positioning: tier.positioning };
}
export const titleCase = (s?: string | null) => (s ? s.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—");
export const usd = (n?: number | string | null) => (n == null || n === "" ? "—" : `$${Number(n).toLocaleString("en-US")}`);
export const fmtDate = (d?: string | null) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—");
