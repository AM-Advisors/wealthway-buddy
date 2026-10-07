// Separate administration ladders (pure). Service identity is always
// service_product + service_level; a level key alone (e.g. CORE) is ambiguous.

export type LadderProduct = "SPV_ADMINISTRATION" | "FUND_ADMINISTRATION";

export interface LadderLevel { level: string; name: string; positioning: string; }

export const SERVICE_LADDERS: Record<LadderProduct, { label: string; levels: LadderLevel[] }> = {
  SPV_ADMINISTRATION: {
    label: "SPV Administration",
    levels: [
      { level: "CORE", name: "SPV Core", positioning: "Essential SPV Infrastructure" },
      { level: "PLUS", name: "SPV Plus", positioning: "Enhanced SPV Administration" },
      { level: "WHITE_GLOVE", name: "SPV White Glove", positioning: "Managed SPV Operations" },
    ],
  },
  FUND_ADMINISTRATION: {
    label: "Fund Administration",
    levels: [
      { level: "CORE", name: "Fund Core", positioning: "Essential Fund Administration" },
      { level: "FUND_ADMINISTRATION", name: "Fund Administration", positioning: "Complete Fund Administration" },
      { level: "WHITE_GLOVE", name: "White Glove Fund Administration", positioning: "Managed Fund Operations" },
      { level: "INSTITUTIONAL", name: "Institutional Fund Administration", positioning: "Outsourced Fund Operations" },
    ],
  },
};

export const isLadderProduct = (p?: string | null): p is LadderProduct => p === "SPV_ADMINISTRATION" || p === "FUND_ADMINISTRATION";

/** Levels valid for a product; non-ladder products keep the generic list. */
export function levelsFor(product?: string | null): string[] {
  return isLadderProduct(product) ? SERVICE_LADDERS[product].levels.map((l) => l.level) : ["CORE", "FUND_ADMINISTRATION", "WHITE_GLOVE", "INSTITUTIONAL"];
}

export function isValidCombination(product: string, level: string) {
  return levelsFor(product).includes(level);
}

export function ladderLevel(product?: string | null, level?: string | null): LadderLevel | null {
  if (!isLadderProduct(product) || !level) return null;
  return SERVICE_LADDERS[product].levels.find((l) => l.level === level) ?? null;
}

/** Only SPV Core is included at no charge; Fund Core is a paid package. */
export const isIncludedAtNoCharge = (product: string, level: string) => product === "SPV_ADMINISTRATION" && level === "CORE";

/** Upgrades move within the same product only; changing product is a structure change, not an upgrade. */
export function upgradeOptions(product: string, level: string): string[] {
  const lv = levelsFor(product); const i = lv.indexOf(level);
  return i < 0 ? [] : lv.slice(i + 1);
}

export const ADMIN_QUOTE_KEY_PREFIX = "ADMIN:";
export const adminQuoteKey = (product: string, level: string) => `${ADMIN_QUOTE_KEY_PREFIX}${product}:${level}`;
