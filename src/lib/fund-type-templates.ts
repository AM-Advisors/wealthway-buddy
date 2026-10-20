/** Pure: which approved templates are assigned to a fund type (case-insensitive). */
export type AssignableTemplate = { id: string; title: string; fundTypes: string[]; approvedVersion: number | null };

export function canonicalTemplateFundType(value: string): string {
  const key = value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  const aliases: Record<string, string> = {
    equity: "private equity", "equity fund": "private equity", "private equity fund": "private equity",
    debt: "private credit", "debt fund": "private credit", "debt / credit": "private credit", "private credit fund": "private credit",
    "real estate fund": "real estate",
  };
  return aliases[key] ?? key;
}

export const TEMPLATE_FUND_TYPES = ["SPV", "Single asset SPV", "Venture capital", "Private equity", "Private credit", "Real estate", "Hedge fund", "Fund of funds", "Other"];

/** Publisher links only: these are research references, never approved signing files. */
export const FUND_MODEL_SOURCES = [
  { title: "ILPA Model Limited Partnership Agreement", url: "https://ilpa.org/industry-guidance/templates-standards-model-documents/model-limited-partnership-agreement/", fundTypes: ["private equity"], scope: "Private-equity buyout fund model · counsel tailoring required" },
  { title: "ILPA Model Subscription Agreement", url: "https://ilpa.org/industry-guidance/templates-standards-model-documents/model-subscription-agreement/", fundTypes: ["private equity"], scope: "Private-equity investor subscription model · counsel tailoring required" },
];

export function modelSourcesForFundType(fundType: string | null) {
  return FUND_MODEL_SOURCES.filter((source) => source.fundTypes.includes(canonicalTemplateFundType(fundType ?? "")));
}

export function templatesForFundType<T extends AssignableTemplate>(templates: T[], fundType: string | null): T[] {
  const ft = canonicalTemplateFundType(fundType ?? "");
  if (!ft) return [];
  return templates.filter((t) => t.approvedVersion != null && t.fundTypes.some((x) => canonicalTemplateFundType(x) === ft));
}
