// Pure rules for the staff-only BSA profile. No I/O.
export const BSA_RISK = ["low", "medium", "high"] as const;
export type BsaRisk = (typeof BSA_RISK)[number];

export const BSA_DOC_KINDS = {
  formation: "Formation documents",
  ownership: "Ownership chart / owner ID",
  source_of_funds: "Bank or source-of-funds proof",
  compliance_memo: "Internal compliance memo",
} as const;
export type BsaDocKind = keyof typeof BSA_DOC_KINDS;

/** Default next review: high yearly, medium every 2 years, low every 3 years. */
export const REVIEW_MONTHS: Record<BsaRisk, number> = { high: 12, medium: 24, low: 36 };

export function defaultNextReview(risk: BsaRisk, from: Date): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + REVIEW_MONTHS[risk], from.getUTCDate()));
  return d.toISOString().slice(0, 10);
}

/** A risk rating always needs a written reason. */
export function validateRisk(risk: string | null | undefined, reason: string | null | undefined): string | null {
  if (!risk) return null;
  if (!(BSA_RISK as readonly string[]).includes(risk)) return "Choose low, medium or high.";
  if (!reason || reason.trim().length < 5) return "Give a reason for the risk rating.";
  return null;
}

export function isReviewOverdue(nextReview: string | null | undefined, today: Date): boolean {
  return !!nextReview && nextReview < today.toISOString().slice(0, 10);
}

export function safeBsaFileName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-120) || "file";
}
