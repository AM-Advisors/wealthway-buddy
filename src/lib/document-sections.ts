// Pure model for grouping investor/fund documents into sections, deriving automatic tags
// and a read-only clean check. Shared by Investor 360 and the fund Documents page.

export type DocSource = "investor_document" | "tax_document" | "k1" | "signature";
export type DocSection = "subscription" | "tax" | "fund" | "identity" | "other";

export const SECTION_ORDER: { id: DocSection; title: string }[] = [
  { id: "subscription", title: "Subscription & signature" },
  { id: "tax", title: "Tax forms (W-9/W-8, K-1)" },
  { id: "fund", title: "Fund docs (PPM, OA, side letters)" },
  { id: "identity", title: "Identity & accreditation" },
  { id: "other", title: "Other documents" },
];

export type LibraryDoc = {
  source: DocSource;
  id: string;
  title: string;
  kind: string;
  investorUserId: string | null;
  offeringId: string | null;
  onboardingId: string | null;
  /** Expected investor/fund from the linked investment record, when one is linked. */
  linkedInvestorUserId?: string | null;
  linkedOfferingId?: string | null;
  taxYear: number | null;
  date: string | null;
  status: string | null;
  signed: boolean;
  replaced: boolean;
  /** Groups copies that should have only one current version. */
  slotKey?: string | null;
};

export type AutoTag = "Past version" | "Signed" | `Prior tax year ${number}`;

export function sectionFor(source: DocSource, kind: string, title = ""): DocSection {
  const k = `${kind} ${title}`.toLowerCase().replace(/[_-]/g, " ");
  if (source === "k1" || source === "tax_document") return "tax";
  if (/\b(w ?9|w ?8|k ?1|tax|1099|ss ?4)\b/.test(k) || /w8|w9|k1/.test(k)) return "tax";
  if (/(ppm|memorandum|operating agreement|\boa\b|side letter|lpa|partnership agreement|circular)/.test(k)) return "fund";
  if (/(subscription|signature|sub agreement|joinder)/.test(k) || source === "signature") return "subscription";
  if (/(identity|passport|licen[cs]e|\bid\b|accredit|kyc|kyb|aml|bsa|trust|formation|certificate|proof|ira|beneficial)/.test(k)) return "identity";
  return "other";
}

export function autoTags(doc: Pick<LibraryDoc, "replaced" | "signed" | "taxYear">, currentYear = new Date().getUTCFullYear()): AutoTag[] {
  const tags: AutoTag[] = [];
  if (doc.replaced) tags.push("Past version");
  if (doc.signed) tags.push("Signed");
  if (doc.taxYear && doc.taxYear < currentYear) tags.push(`Prior tax year ${doc.taxYear}`);
  return tags;
}

export type CleanIssue = {
  kind: "duplicate" | "wrong_party" | "multiple_current";
  message: string;
  docs: { source: DocSource; id: string; title: string; investorUserId: string | null; offeringId: string | null; onboardingId: string | null }[];
};

const brief = (d: LibraryDoc) => ({ source: d.source, id: d.id, title: d.title, investorUserId: d.investorUserId, offeringId: d.offeringId, onboardingId: d.onboardingId });

/** Read-only report. Never changes anything. */
export function cleanCheck(docs: LibraryDoc[]): CleanIssue[] {
  const issues: CleanIssue[] = [];
  const current = docs.filter((d) => !d.replaced);

  const byFile = new Map<string, LibraryDoc[]>();
  for (const d of current) {
    if (d.source !== "investor_document" && d.source !== "tax_document") continue;
    const key = [d.source, d.investorUserId, d.offeringId, d.kind.toLowerCase(), d.title.trim().toLowerCase(), d.taxYear ?? ""].join("|");
    byFile.set(key, [...(byFile.get(key) ?? []), d]);
  }
  for (const group of byFile.values()) {
    if (group.length > 1) issues.push({ kind: "duplicate", message: `${group.length} copies of "${group[0]!.title}" for the same investor and fund`, docs: group.map(brief) });
  }

  for (const d of docs) {
    const wrongInvestor = d.linkedInvestorUserId && d.investorUserId && d.linkedInvestorUserId !== d.investorUserId;
    const wrongFund = d.linkedOfferingId && d.offeringId && d.linkedOfferingId !== d.offeringId;
    if (wrongInvestor || wrongFund) {
      issues.push({ kind: "wrong_party", message: `"${d.title}" is filed under a different ${wrongInvestor ? "investor" : "fund"} than its investment`, docs: [brief(d)] });
    }
  }

  const bySlot = new Map<string, LibraryDoc[]>();
  for (const d of current) {
    if (!d.slotKey) continue;
    bySlot.set(d.slotKey, [...(bySlot.get(d.slotKey) ?? []), d]);
  }
  for (const group of bySlot.values()) {
    if (group.length > 1) issues.push({ kind: "multiple_current", message: `${group.length} current versions of "${group[0]!.title}"`, docs: group.map(brief) });
  }
  return issues;
}

export function normalizeTag(raw: string): string | null {
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t || t.length > 40) return null;
  return t;
}
