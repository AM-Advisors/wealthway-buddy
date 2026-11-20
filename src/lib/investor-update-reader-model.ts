/**
 * Investor document reader (pure rules). A fund manager adds a fund-wide document for
 * investors (valuation report, investor letter) on Documents > Send to investors. AI reads
 * it in memory and suggests a title, a short note and any holding values; this module
 * normalizes those suggestions and decides where each one may go. Nothing here saves.
 */
import { normalizeFieldValue, redactNumbers } from "@/lib/fund-doc-extract-model";

/** Kinds a manager may add here as a fund-wide, read-only document for every investor. */
export const SHAREABLE_KINDS = ["valuation_report", "investor_update", "other"] as const;
export type ShareableKind = (typeof SHAREABLE_KINDS)[number];
export const SHAREABLE_KIND_LABEL: Record<ShareableKind, string> = {
  valuation_report: "Valuation report",
  investor_update: "Investor update",
  other: "Other document",
};

/** Everything the reader may recognize. Kinds outside SHAREABLE_KINDS have their own home. */
export const READ_KINDS = [
  ...SHAREABLE_KINDS,
  "fund_agreement",
  "financial_statement",
  "capital_account_statement",
  "tax_form",
] as const;
export type ReadKind = (typeof READ_KINDS)[number];

export const ASSET_CLASSES = ["private_common", "private_preferred", "safe", "convertible_note", "debt", "fund_interest", "spv_interest", "real_estate", "digital_security", "cash_equivalent", "other"] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

export type Holding = {
  companyName: string;
  assetName: string;
  assetClass: AssetClass;
  valueCents: number | null;
  costCents: number | null;
  valuationDate: string | null;
  method: string | null;
  page: number | null;
};

export type InvestorDocReading = {
  kind: ReadKind;
  title: string | null;
  asOfDate: string | null;
  summary: string | null;
  aboutOneInvestor: boolean;
  holdings: Holding[];
  notes: string[];
};

const holdingSchema = {
  type: "object", additionalProperties: false,
  required: ["companyName", "assetName", "assetClass", "value", "cost", "valuationDate", "method", "page"],
  properties: {
    companyName: { type: "string" }, assetName: { type: "string" },
    assetClass: { type: "string", enum: [...ASSET_CLASSES] },
    value: { type: ["string", "null"] }, cost: { type: ["string", "null"] },
    valuationDate: { type: ["string", "null"] }, method: { type: ["string", "null"] }, page: { type: ["integer", "null"] },
  },
};
export const INVESTOR_DOC_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["kind", "title", "asOfDate", "summary", "aboutOneInvestor", "holdings", "notes"],
  properties: {
    kind: { type: "string", enum: [...READ_KINDS] },
    title: { type: ["string", "null"] }, asOfDate: { type: ["string", "null"] }, summary: { type: ["string", "null"] },
    aboutOneInvestor: { type: "boolean" },
    holdings: { type: "array", items: holdingSchema },
    notes: { type: "array", items: { type: "string" } },
  },
} as const;

export const INVESTOR_DOC_INSTRUCTIONS = [
  "You read one private fund document that a fund manager wants to share with the fund's investors.",
  "kind: valuation_report (values of the fund's investments, NAV, marks, 409A or appraisal), investor_update (quarterly letter, news, portfolio update without values), fund_agreement (operating agreement, LPA, PPM, subscription agreement, side letter), financial_statement (balance sheet, income statement, audited financials), capital_account_statement, tax_form (K-1, W-9, 1099), or other.",
  "title: a short plain title an investor would understand, e.g. 'Valuation report, Q3 2026'. asOfDate: the date the document speaks as of, YYYY-MM-DD.",
  "summary: two or three plain-English sentences for the email to investors, stating only what the document says. Never promise returns.",
  "aboutOneInvestor: true when the document is about one named investor's own account, holdings, tax or identity, rather than the fund as a whole.",
  "holdings: each investment of the fund the document gives a value for. assetName is the full name including the company, e.g. 'Acme Inc. Series A Preferred'. value and cost are dollar amounts as written, e.g. 2500000. valuationDate YYYY-MM-DD. method: how it was valued, e.g. 'recent financing round', 'appraisal', 'cost'. Use null when not stated. Never guess.",
  "NEVER return bank account numbers, routing numbers, EINs, SSNs, dates of birth or ID numbers.",
  "notes: short points the manager should check, such as values that disagree inside the document.",
].join("\n");

/** Homes for documents that must not be shared fund-wide from this screen. */
export const OTHER_HOME: Partial<Record<ReadKind, string>> = {
  fund_agreement: "This looks like a fund agreement. Add it under Review & approve so its signing setup is checked, and use Setup to fill fund details from it.",
  financial_statement: "This looks like a financial statement. Financial statements reach investors through Accounting, where they are reviewed first.",
  capital_account_statement: "This looks like a capital account statement. Those go to each investor separately through Accounting, never to the whole fund.",
  tax_form: "This looks like a tax form. Tax forms go to each investor separately through Tax, never to the whole fund.",
};

/** Why this file can't be shared with every investor here, or null when it can. */
export function sharingBlock(r: Pick<InvestorDocReading, "kind" | "aboutOneInvestor">): string | null {
  if (r.aboutOneInvestor) return "This document looks like it is about one investor. Everything added here can be opened by every investor in the fund, so add it to that investor's own record instead.";
  return OTHER_HOME[r.kind] ?? null;
}

export function shareableKindFor(kind: ReadKind): ShareableKind {
  return (SHAREABLE_KINDS as readonly string[]).includes(kind) ? (kind as ShareableKind) : "other";
}

const clean = (s: unknown, max: number) => {
  const t = redactNumbers(String(s ?? "")).replace(/\s+/g, " ").trim().slice(0, max);
  return t && t !== "[removed]" ? t : null;
};
const cents = (s: unknown) => { const v = normalizeFieldValue("cents", s == null ? null : String(s)); return v == null ? null : Number(v); };
const day = (s: unknown) => normalizeFieldValue("date", s == null ? null : String(s));

export function normalizeInvestorDocReading(raw: any): InvestorDocReading {
  const kind = (READ_KINDS as readonly string[]).includes(raw?.kind) ? (raw.kind as ReadKind) : "other";
  const holdings: Holding[] = (Array.isArray(raw?.holdings) ? raw.holdings : []).slice(0, 50).map((h: any) => {
    const company = clean(h?.companyName, 200);
    const raw = clean(h?.assetName, 200) ?? company;
    if (!raw) return null;
    // "Series A Preferred" alone is not a usable investment name; lead with the company.
    const assetName = company && !norm(raw).includes(norm(company)) ? `${company} ${raw}`.slice(0, 200) : raw;
    return {
      companyName: company ?? assetName,
      assetName,
      assetClass: (ASSET_CLASSES as readonly string[]).includes(h?.assetClass) ? h.assetClass : "other",
      valueCents: cents(h?.value),
      costCents: cents(h?.cost),
      valuationDate: day(h?.valuationDate),
      method: clean(h?.method, 120),
      page: Number.isInteger(h?.page) ? h.page : null,
    } satisfies Holding;
  }).filter(Boolean) as Holding[];
  return {
    kind,
    title: clean(raw?.title, 200),
    asOfDate: day(raw?.asOfDate),
    summary: clean(raw?.summary, 900),
    aboutOneInvestor: raw?.aboutOneInvestor === true,
    holdings,
    notes: (Array.isArray(raw?.notes) ? raw.notes : []).map((n: unknown) => clean(n, 300)).filter(Boolean).slice(0, 10) as string[],
  };
}

const norm = (s: string) => s.toLowerCase().replace(/\b(inc|llc|ltd|corp|corporation|co|lp|l\.p)\b\.?/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** The fund investment a reading refers to: exact name first, then one unambiguous company match. */
export function matchHolding<T extends { id: string; asset_name: string; issuer_name: string | null }>(h: Pick<Holding, "assetName" | "companyName">, assets: T[]): T | null {
  const an = norm(h.assetName); const cn = norm(h.companyName);
  const exact = assets.filter((a) => norm(a.asset_name) === an);
  if (exact.length === 1) return exact[0]!;
  const byCompany = assets.filter((a) => cn && norm(a.issuer_name ?? a.asset_name) === cn);
  return byCompany.length === 1 ? byCompany[0]! : null;
}

/** Recorded valuation method closest to the document's wording. */
export function markMethodFor(method: string | null): "recent_financing" | "transaction_price" | "secondary_transaction" | "market_comparable" | "public_market" | "cost" | "appraisal" | "manager_mark" | "third_party" | "other" {
  const m = (method ?? "").toLowerCase();
  if (/financ|round|priced/.test(m)) return "recent_financing";
  if (/secondary/.test(m)) return "secondary_transaction";
  if (/compar|multiple/.test(m)) return "market_comparable";
  if (/public|market price|ticker/.test(m)) return "public_market";
  if (/apprais|409a|independent|third/.test(m)) return /third|independent/.test(m) ? "third_party" : "appraisal";
  if (/transaction|purchase price/.test(m)) return "transaction_price";
  if (/cost/.test(m)) return "cost";
  return m ? "other" : "manager_mark";
}
