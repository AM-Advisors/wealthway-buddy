/**
 * Fund Setup AI reader: pure rules. The AI returns raw text per field with the page it
 * came from; this module normalizes values, redacts numbers that must never be read by AI,
 * merges readings across documents (flagging disagreements) and compares with current setup.
 * Nothing here saves; every value needs an explicit person's Approve or Update.
 */
export const FUND_DOC_MAX_FILES = 15;

export type FundFieldKind = "text" | "cents" | "percent" | "date" | "months" | "fye";
export type FundFieldGroup = "details" | "fees" | "tax" | "banking" | "questions";
/** How a field saves: through existing setup savers, or reference only (shown, never saved here). */
export type FundFieldTarget = "legal_name" | "offering" | "setup" | "economics" | "reference";

export const FUND_FIELDS = [
  { key: "legalName", label: "Legal name", group: "details", kind: "text", target: "legal_name" },
  { key: "gpName", label: "GP or manager", group: "details", kind: "text", target: "offering" },
  { key: "signatoryName", label: "Signatory", group: "details", kind: "text", target: "reference" },
  { key: "signatoryTitle", label: "Signatory title", group: "details", kind: "text", target: "offering" },
  { key: "entityType", label: "Entity type", group: "details", kind: "text", target: "offering" },
  { key: "seriesMaster", label: "Series LLC master", group: "details", kind: "text", target: "reference" },
  { key: "jurisdiction", label: "State formed", group: "details", kind: "text", target: "offering" },
  { key: "formationDate", label: "Formation date", group: "details", kind: "date", target: "offering" },
  { key: "registeredAgent", label: "Registered agent", group: "details", kind: "text", target: "offering" },
  { key: "principalAddress", label: "Principal address", group: "details", kind: "text", target: "offering" },
  { key: "arbitrationCity", label: "Arbitration city", group: "details", kind: "text", target: "offering" },
  { key: "arbitrationState", label: "Arbitration state", group: "details", kind: "text", target: "offering" },
  { key: "fiscalYearEnd", label: "Fiscal year end (MM-DD)", group: "details", kind: "fye", target: "setup" },
  { key: "fundTermMonths", label: "Fund term (months)", group: "details", kind: "months", target: "setup" },
  { key: "investmentPeriodMonths", label: "Investment period (months)", group: "details", kind: "months", target: "setup" },
  { key: "targetRaiseCents", label: "Target raise", group: "details", kind: "cents", target: "offering" },
  { key: "maxOfferingCents", label: "Maximum offering", group: "details", kind: "cents", target: "offering" },
  { key: "minInvestmentCents", label: "Minimum investment", group: "details", kind: "cents", target: "offering" },
  { key: "managementFeePercent", label: "Management fee (%)", group: "fees", kind: "percent", target: "economics" },
  { key: "carryPercent", label: "Carried interest (%)", group: "fees", kind: "percent", target: "economics" },
  { key: "preferredReturnPercent", label: "Preferred return (%)", group: "fees", kind: "percent", target: "economics" },
  { key: "distributionFrequency", label: "Distribution frequency", group: "fees", kind: "text", target: "economics" },
  { key: "orgExpenseTreatment", label: "Organizational expenses", group: "fees", kind: "text", target: "economics" },
  { key: "classesSummary", label: "Classes and amount ranges", group: "fees", kind: "text", target: "reference" },
  { key: "einLetterName", label: "Name on EIN letter", group: "tax", kind: "text", target: "reference" },
  { key: "bankName", label: "Bank name", group: "banking", kind: "text", target: "reference" },
  { key: "beneficiaryName", label: "Wire beneficiary", group: "banking", kind: "text", target: "reference" },
  { key: "investorEligibility", label: "Investor eligibility", group: "questions", kind: "text", target: "reference" },
] as const satisfies ReadonlyArray<{ key: string; label: string; group: FundFieldGroup; kind: FundFieldKind; target: FundFieldTarget }>;

export type FundFieldKey = (typeof FUND_FIELDS)[number]["key"];
export const FUND_FIELD_KEYS = FUND_FIELDS.map((f) => f.key) as FundFieldKey[];
export const fundField = (k: string) => FUND_FIELDS.find((f) => f.key === k) ?? null;
export const GROUP_LABEL: Record<FundFieldGroup, string> = { details: "Fund details", fees: "Fees and terms", tax: "Tax", banking: "Banking", questions: "Investor questions" };

export const DOC_KINDS = ["operating_agreement", "subscription_agreement", "ppm", "side_letter", "ein_letter", "ss4", "wire_instructions", "formation_certificate", "term_sheet", "other"] as const;
export type FundDocKind = (typeof DOC_KINDS)[number];
export const DOC_KIND_LABEL: Record<FundDocKind, string> = {
  operating_agreement: "Operating Agreement", subscription_agreement: "Subscription Agreement", ppm: "PPM", side_letter: "Side letter",
  ein_letter: "EIN letter", ss4: "SS-4", wire_instructions: "Wire instructions", formation_certificate: "Formation certificate", term_sheet: "Term sheet", other: "Other",
};
/** Fund Documents categories a reading can be added to (others are filed on their own steps). */
export function documentCategoryFor(kind: FundDocKind): "operating_agreement" | "subscription_agreement" | "ppm" | "other" | null {
  if (kind === "operating_agreement" || kind === "subscription_agreement" || kind === "ppm") return kind;
  if (kind === "side_letter" || kind === "term_sheet") return "other";
  return null;
}

const fieldSchema = { type: "object", additionalProperties: false, required: ["value", "page"], properties: { value: { type: ["string", "null"] }, page: { type: ["integer", "null"] } } };
export const FUND_EXTRACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["documentKind", "fields", "notes"],
  properties: {
    documentKind: { type: "string", enum: [...DOC_KINDS] },
    fields: { type: "object", additionalProperties: false, required: FUND_FIELD_KEYS, properties: Object.fromEntries(FUND_FIELD_KEYS.map((k) => [k, fieldSchema])) },
    notes: { type: "array", items: { type: "string" } },
  },
} as const;

export const FUND_EXTRACT_INSTRUCTIONS = [
  "You read private fund documents (operating agreements, LLOAs, PPMs, subscription agreements, side letters, EIN letters, SS-4s, wire instructions, formation certificates, term sheets) to help set up a fund.",
  "For each field return the value exactly as the document states it and the page number it appears on. Use null when the document does not state it. Never guess.",
  "Money: write the dollar amount, e.g. 250000. Percentages: write the number, e.g. 0.25 for 0.25%. Dates: YYYY-MM-DD. Fiscal year end: MM-DD. Terms and periods: number of months.",
  "managementFeePercent, carryPercent, preferredReturnPercent: the fund's default terms. If classes differ, summarize each class with its fee, carry and amount range in classesSummary.",
  "investorEligibility: who may invest, e.g. 'Accredited investors only' or 'Qualified purchasers'.",
  "NEVER return bank account numbers, routing or ABA numbers, SWIFT codes, EINs, SSNs, ITINs, dates of birth or ID numbers. For wire instructions return only the bank name and beneficiary name.",
  "notes: short plain-English points a reviewer should know, such as two values that disagree inside the document. No numbers that are listed as forbidden.",
].join("\n");

export type FieldReading = { value: string | null; page: number | null };
export type FundDocReading = { documentKind: FundDocKind; fields: Partial<Record<FundFieldKey, FieldReading>>; notes: string[] };

/** Long digit runs (account, routing, EIN, SSN) are removed from any text the AI returns. */
export function redactNumbers(s: string): string {
  return s
    .replace(/\b\d{2}-\d{7}\b/g, "[removed]")
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[removed]")
    .replace(/(?<![\d.,$])\d{8,}(?![\d.,])/g, "[removed]");
}

const MONTHS: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };

/** Turns raw text into the stored form for a field kind, or null when it cannot be read reliably. */
export function normalizeFieldValue(kind: FundFieldKind, raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  switch (kind) {
    case "cents": {
      const m = s.replace(/[$,\s]/g, "").match(/^(\d+(?:\.\d+)?)(k|m|million|thousand)?$/i);
      if (!m) return null;
      const mult = /^m/i.test(m[2] ?? "") ? 1_000_000 : /^(k|thousand)/i.test(m[2] ?? "") ? 1_000 : 1;
      return String(Math.round(Number(m[1]) * mult * 100));
    }
    case "percent": {
      const m = s.replace(/[%\s]/g, "").match(/^(\d*\.?\d+)$/);
      if (!m) return null;
      const n = Number(m[1]);
      return n >= 0 && n <= 100 ? String(n) : null;
    }
    case "date": {
      const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (iso) return s;
      const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (us) return `${us[3]}-${us[1]!.padStart(2, "0")}-${us[2]!.padStart(2, "0")}`;
      const t = Date.parse(s);
      return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
    }
    case "months": {
      const m = s.match(/(\d+(?:\.\d+)?)\s*(year|yr|month|mo)?/i);
      if (!m) return null;
      const n = Number(m[1]) * (/^y/i.test(m[2] ?? "") ? 12 : 1);
      return Number.isInteger(n) && n >= 0 && n <= 600 ? String(n) : null;
    }
    case "fye": {
      const mmdd = s.match(/^(\d{1,2})[-/](\d{1,2})$/);
      if (mmdd) return `${mmdd[1]!.padStart(2, "0")}-${mmdd[2]!.padStart(2, "0")}`;
      const word = s.toLowerCase().match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})/);
      return word ? `${MONTHS[word[1]!]}-${word[2]!.padStart(2, "0")}` : null;
    }
    default: {
      const t = redactNumbers(s).replace(/\s+/g, " ").slice(0, 500);
      return t && t !== "[removed]" ? t : null;
    }
  }
}

export function normalizeFundReading(raw: any): FundDocReading {
  const kind = (DOC_KINDS as readonly string[]).includes(raw?.documentKind) ? (raw.documentKind as FundDocKind) : "other";
  const fields: FundDocReading["fields"] = {};
  for (const f of FUND_FIELDS) {
    const r = raw?.fields?.[f.key];
    const value = normalizeFieldValue(f.kind, r?.value);
    if (value != null) fields[f.key] = { value, page: Number.isInteger(r?.page) && r.page > 0 ? r.page : null };
  }
  const notes = (Array.isArray(raw?.notes) ? raw.notes : []).map((n: unknown) => redactNumbers(String(n ?? "")).trim().slice(0, 300)).filter(Boolean).slice(0, 10);
  return { documentKind: kind, fields, notes };
}

export type Source = { fileName: string; page: number | null };
export type Candidate = { value: string; sources: Source[] };
export type FieldStatus = "matches" | "suggested" | "conflict" | "reference";
export type FieldRow = { key: FundFieldKey; label: string; group: FundFieldGroup; kind: FundFieldKind; target: FundFieldTarget; current: string | null; candidates: Candidate[]; status: FieldStatus };

const same = (kind: FundFieldKind, a: string | null, b: string | null) => {
  if (a == null || b == null) return a === b;
  if (kind === "text") return a.trim().toLowerCase().replace(/[.,]/g, "") === b.trim().toLowerCase().replace(/[.,]/g, "");
  if (kind === "percent" || kind === "cents" || kind === "months") return Number(a) === Number(b);
  return a === b;
};

/** Combines readings of several documents; different values for one field become a conflict. */
export function mergeFundReadings(readings: Array<{ fileName: string; reading: FundDocReading }>, current: Partial<Record<FundFieldKey, string | null>>): FieldRow[] {
  const rows: FieldRow[] = [];
  for (const f of FUND_FIELDS) {
    const candidates: Candidate[] = [];
    for (const { fileName, reading } of readings) {
      const r = reading.fields[f.key];
      if (!r?.value) continue;
      const hit = candidates.find((c) => same(f.kind, c.value, r.value));
      if (hit) hit.sources.push({ fileName, page: r.page });
      else candidates.push({ value: r.value, sources: [{ fileName, page: r.page }] });
    }
    if (!candidates.length) continue;
    const cur = current[f.key] ?? null;
    const status: FieldStatus = f.target === "reference" ? "reference"
      : candidates.length > 1 ? "conflict"
      : same(f.kind, candidates[0]!.value, cur) ? "matches" : "suggested";
    rows.push({ key: f.key, label: f.label, group: f.group, kind: f.kind, target: f.target, current: cur, candidates, status });
  }
  return rows;
}

/** Readable value for screens: cents as dollars, percent with %. */
export function displayFieldValue(kind: FundFieldKind, v: string | null): string {
  if (v == null || v === "") return "Not set";
  if (kind === "cents") return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(v) / 100);
  if (kind === "percent") return `${v}%`;
  return v;
}
/** Value to type in the Update box (dollars for money). */
export function editableFieldValue(kind: FundFieldKind, v: string | null): string {
  if (v == null) return "";
  return kind === "cents" ? String(Number(v) / 100) : v;
}
