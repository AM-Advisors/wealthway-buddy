/**
 * Diligence structures differ depending on who is raising capital.
 * A fund is judged on its manager, strategy and track record; a company is
 * judged on its cap table, product, customers and traction. Each room picks
 * one of these types and the whole module (categories, checklist starter,
 * readiness score) follows from it.
 */

export type DiligenceEntityType = "fund" | "startup";

export type DiligenceCategory = {
  value: string;
  label: string;
  required: boolean;
  /** Grouping shown as a section heading in the room. */
  section: string;
  hint?: string;
};

export const ENTITY_TYPES: {
  value: DiligenceEntityType;
  label: string;
  description: string;
}[] = [
  {
    value: "fund",
    label: "Fund / investment manager",
    description: "A managed vehicle raising from limited partners — strategy, track record, terms.",
  },
  {
    value: "startup",
    label: "Startup / operating company",
    description: "A company raising a round — cap table, product, customers and traction.",
  },
];

const FUND_CATEGORIES: DiligenceCategory[] = [
  { value: "formation", label: "Formation & legal", required: true, section: "The vehicle", hint: "LPA, subscription docs, certificate of formation." },
  { value: "offering_terms", label: "Offering terms", required: true, section: "The vehicle", hint: "PPM, fee and carry summary, capital call mechanics." },
  { value: "cap_table", label: "Capitalization", required: false, section: "The vehicle", hint: "Live capitalization / LP register kept in the platform — no upload needed." },
  { value: "strategy", label: "Strategy & market", required: false, section: "The vehicle", hint: "Investment thesis, pipeline, target market." },
  { value: "financials", label: "Financial statements", required: true, section: "Numbers", hint: "Audited or reviewed statements for the vehicle." },
  { value: "track_record", label: "Track record & performance", required: true, section: "Numbers", hint: "Realised and unrealised performance, prior funds." },
  { value: "tax", label: "Tax & K-1 samples", required: false, section: "Numbers" },
  { value: "team", label: "Team & bios", required: true, section: "People & controls", hint: "Principals, key-person terms, org chart." },
  { value: "compliance", label: "Compliance & policies", required: false, section: "People & controls", hint: "Form ADV, valuation and AML policies." },
  { value: "service_providers", label: "Service providers", required: false, section: "People & controls", hint: "Auditor, administrator, custodian, counsel." },
  { value: "other", label: "Other materials", required: false, section: "Other" },
];

const STARTUP_CATEGORIES: DiligenceCategory[] = [
  { value: "incorporation", label: "Incorporation & corporate records", required: true, section: "Corporate", hint: "Charter, bylaws, board consents, minute book." },
  { value: "cap_table", label: "Cap table & equity", required: true, section: "Corporate", hint: "Fully diluted cap table, option pool, SAFEs and notes." },
  { value: "fundraising", label: "Round terms", required: true, section: "Corporate", hint: "Term sheet, use of proceeds, prior round docs." },
  { value: "financials", label: "Financial statements", required: true, section: "Numbers", hint: "P&L, balance sheet, cash position, burn." },
  { value: "traction", label: "Traction & metrics", required: true, section: "Numbers", hint: "Revenue, retention, pipeline, cohort data." },
  { value: "projections", label: "Model & projections", required: false, section: "Numbers" },
  { value: "product", label: "Product & technology", required: true, section: "Business", hint: "Product overview, architecture, roadmap, security." },
  { value: "market", label: "Market & competition", required: false, section: "Business" },
  { value: "customers", label: "Customers & contracts", required: false, section: "Business", hint: "Key contracts, MSAs, concentration." },
  { value: "ip", label: "Intellectual property", required: false, section: "Business", hint: "Patents, trademarks, IP assignments." },
  { value: "team", label: "Team & bios", required: true, section: "People & controls", hint: "Founders, key hires, employment and equity agreements." },
  { value: "legal", label: "Legal & compliance", required: false, section: "People & controls", hint: "Litigation, insurance, regulatory matters." },
  { value: "other", label: "Other materials", required: false, section: "Other" },
];

export const CATEGORY_SETS: Record<DiligenceEntityType, DiligenceCategory[]> = {
  fund: FUND_CATEGORIES,
  startup: STARTUP_CATEGORIES,
};

/** Legacy export: the fund structure remains the default. */
export const DILIGENCE_CATEGORIES = FUND_CATEGORIES;

export function normalizeEntityType(value: unknown): DiligenceEntityType {
  return value === "startup" ? "startup" : "fund";
}

export function categoriesFor(entityType: unknown): DiligenceCategory[] {
  return CATEGORY_SETS[normalizeEntityType(entityType)];
}

export function sectionsFor(entityType: unknown): { section: string; categories: DiligenceCategory[] }[] {
  const out: { section: string; categories: DiligenceCategory[] }[] = [];
  for (const cat of categoriesFor(entityType)) {
    const found = out.find((s) => s.section === cat.section);
    if (found) found.categories.push(cat);
    else out.push({ section: cat.section, categories: [cat] });
  }
  return out;
}

export function categoryLabel(entityType: unknown, value: string): string {
  const all = [...FUND_CATEGORIES, ...STARTUP_CATEGORIES];
  return (
    categoriesFor(entityType).find((c) => c.value === value)?.label ??
    all.find((c) => c.value === value)?.label ??
    value
  );
}

export const ALL_CATEGORY_VALUES = Array.from(
  new Set([...FUND_CATEGORIES, ...STARTUP_CATEGORIES].map((c) => c.value)),
) as [string, ...string[]];

export function entityTypeLabel(entityType: unknown): string {
  return ENTITY_TYPES.find((t) => t.value === normalizeEntityType(entityType))?.label ?? "Fund";
}
