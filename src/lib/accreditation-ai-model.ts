/** AI pre-check for accreditation proof. Pure. AI output is advisory only; it never approves or rejects. */
export type Verdict = "looks_complete" | "needs_review" | "mismatch" | "unavailable";
export type Criterion = { label: string; status: "met" | "not_met" | "unclear"; note: string };

export const VERDICT_LABELS: Record<Verdict, string> = {
  looks_complete: "Looks complete", needs_review: "Needs a closer look", mismatch: "Doesn't match", unavailable: "AI pre-check unavailable",
};

const CRITERIA: Record<string, string[]> = {
  income_documents: ["Shows income for the two most recent years", "Income over $200,000 individually or $300,000 joint in each year", "Name matches the investor", "Official tax form or employer document (W-2, 1099, K-1 or tax return)"],
  net_worth_documents: ["Asset statement dated within the last 3 months", "Credit report dated within the last 3 months showing debts", "Net worth over $1,000,000 excluding the main home", "Name matches the investor"],
  professional_license: ["Shows a Series 7, 65 or 82 license", "License is active / in good standing", "Name matches the investor"],
  entity_documents: ["Financial statements or similar showing total assets over $5,000,000, or proof every owner is accredited", "Entity name matches the investing entity", "Dated recently"],
  third_party_letter: ["Signed by a CPA, attorney, registered investment adviser or broker-dealer", "Dated within the last 90 days", "Names the investor", "States the investor is an accredited investor", "Includes the professional's license or registration number"],
};

export function criteriaFor(method: string | null | undefined): string[] {
  return CRITERIA[String(method ?? "")] ?? CRITERIA["net_worth_documents"]!;
}

/** Final verdict is derived conservatively: any unmet criterion or warning sign blocks "looks complete". */
export function deriveVerdict(aiVerdict: string, criteria: Criterion[], redFlags: string[]): Verdict {
  if (aiVerdict === "mismatch") return "mismatch";
  if (!criteria.length) return "needs_review";
  if (criteria.some((c) => c.status === "not_met") && criteria.every((c) => c.status !== "met")) return "mismatch";
  if (redFlags.length || criteria.some((c) => c.status !== "met")) return "needs_review";
  return aiVerdict === "looks_complete" ? "looks_complete" : "needs_review";
}

const RANK: Record<Verdict, number> = { looks_complete: 0, needs_review: 1, mismatch: 2, unavailable: 3 };
/** Overall verdict for an investor across all their documents: the worst one wins, except a passing letter. */
export function overallVerdict(verdicts: Verdict[]): Verdict {
  if (!verdicts.length) return "unavailable";
  return verdicts.reduce((a, b) => (RANK[b] > RANK[a] ? b : a));
}
export const verdictRank = (v: Verdict) => RANK[v];
