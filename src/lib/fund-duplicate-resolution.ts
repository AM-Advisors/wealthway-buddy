/**
 * Existing Fund duplicate resolution (pure). No I/O.
 *
 * Harmonious decides whether two same-named Funds are the same Fund. Nothing
 * here picks a canonical Fund, merges values, or resolves a conflict — it only
 * compares facts, lists conflicts, and describes what a confirmed
 * consolidation would keep, move and preserve.
 */
import { normalizeFundName } from "@/lib/fund-integrity";

export type FundSnapshot = {
  id: string;
  name: string | null;
  legalName: string | null;
  clientId: string | null;
  clientName: string | null;
  fundType: string | null;
  createdAt: string | null;
  createdBy: string | null;
  status: "open" | "closed" | "consolidated";
  entity: { entityType: string | null; jurisdiction: string | null; dateFormed: string | null; einOnFile: boolean; einLetterOnFile: boolean; formationStep: string | null };
  investors: { persons: number; investments: number; active: number; removed: number; funded: number; closed: number };
  capital: { subscribedCents: number; reconciledFundedCents: number };
  documents: { offeringDocuments: number; versions: number; executed: number; historical: number };
  banking: { exists: boolean; currentVersion: number | null; verification: string | null };
  operations: { readinessRecords: number; workItems: number; regulatoryConfig: boolean; formD: string | null; blueSky: string | null; taxClassification: string | null };
  external: { driveFolders: number; eSignReferences: number; providerReferences: number; integrationEvents: number };
  managers: string[];
  economicsVersions: number;
  investments: { onboardingId: string; personId: string | null; profileId: string | null; stage: string | null; removed: boolean }[];
  dependencies: { table: string; column: string; count: number; preserved: boolean }[];
};

/** Facts only the server can compare without exposing values (EIN, bank fingerprints). */
export type PairFacts = { einDiffers: boolean; bankingDiffers: boolean };

export type Decision = "same_fund" | "different_funds" | "needs_review";
export const DECISION_LABELS: Record<Decision, string> = {
  same_fund: "Same Fund — Consolidate",
  different_funds: "Different Funds — Keep Separate",
  needs_review: "Needs Further Review",
};

export type ConflictKind =
  | "legal_name" | "ein" | "entity" | "banking" | "economics" | "duplicate_investment"
  | "documents" | "managers" | "regulatory" | "drive" | "client";

export type Conflict = { kind: ConflictKind; label: string; detail: string; blocking: boolean };

const norm = (v: string | null | undefined) => normalizeFundName(v);
const differs = (a: string | null | undefined, b: string | null | undefined) => !!norm(a) && !!norm(b) && norm(a) !== norm(b);

/**
 * Every conflict is "Conflict — Harmonious Decision Required". Blocking
 * conflicts cannot be acknowledged away: they must be fixed at the source
 * (for example, retire one banking version) before consolidation can run.
 */
export function detectConflicts(a: FundSnapshot, b: FundSnapshot, facts: PairFacts): Conflict[] {
  const out: Conflict[] = [];
  if (differs(a.legalName, b.legalName)) out.push({ kind: "legal_name", label: "Different Legal Names", detail: "The two records carry different Legal Names.", blocking: false });
  if (facts.einDiffers) out.push({ kind: "ein", label: "Different EINs", detail: "The EINs on file do not match.", blocking: true });
  if (differs(a.entity.jurisdiction, b.entity.jurisdiction) || differs(a.entity.entityType, b.entity.entityType))
    out.push({ kind: "entity", label: "Different entity details", detail: "Jurisdiction or entity type differs.", blocking: false });
  if (a.clientId && b.clientId && a.clientId !== b.clientId) out.push({ kind: "client", label: "Different Clients", detail: "The records belong to different Clients.", blocking: true });
  if (a.banking.exists && b.banking.exists)
    out.push({ kind: "banking", label: "Both records have banking", detail: facts.bankingDiffers ? "Current banking instructions differ." : "Both records hold banking configurations; they are never combined automatically.", blocking: true });
  if (a.economicsVersions > 0 && b.economicsVersions > 0) out.push({ kind: "economics", label: "Both records have economics", detail: "Economics versions exist on both records.", blocking: true });
  const dup = duplicateInvestments(a, b);
  if (dup.length) out.push({ kind: "duplicate_investment", label: "Same investor in both Funds", detail: `${dup.length} Person/Profile pair(s) have an Investment in each record. They are not assumed to be duplicates.`, blocking: true });
  if (a.documents.offeringDocuments > 0 && b.documents.offeringDocuments > 0) out.push({ kind: "documents", label: "Offering Documents on both records", detail: "Document versions exist on both records.", blocking: false });
  const ma = [...a.managers].sort().join(","), mb = [...b.managers].sort().join(",");
  if (ma && mb && ma !== mb) out.push({ kind: "managers", label: "Different Fund Managers", detail: "Assigned Fund Managers differ.", blocking: false });
  if (a.operations.regulatoryConfig && b.operations.regulatoryConfig) out.push({ kind: "regulatory", label: "Regulatory configuration on both", detail: "Both records have a regulatory configuration.", blocking: true });
  if (a.external.driveFolders > 0 && b.external.driveFolders > 0) out.push({ kind: "drive", label: "Drive Consolidation Review", detail: "Both records have Drive folders. Both are preserved until reviewed; folders are never merged or deleted.", blocking: true });
  return out;
}

export function duplicateInvestments(a: FundSnapshot, b: FundSnapshot) {
  const key = (i: FundSnapshot["investments"][number]) => (i.profileId ? `p:${i.profileId}` : i.personId ? `u:${i.personId}` : null);
  const bKeys = new Map(b.investments.filter((i) => !i.removed).map((i) => [key(i), i]));
  return a.investments.filter((i) => !i.removed && key(i) && bKeys.has(key(i))).map((i) => ({ a: i.onboardingId, b: bKeys.get(key(i))!.onboardingId }));
}

/** Plain factual sentence. Never a pick. */
export function factualSummary(s: FundSnapshot, label: string): string {
  const parts = [
    `${s.investors.investments} Investment${s.investors.investments === 1 ? "" : "s"}`,
    s.banking.exists ? "banking" : "no banking",
    s.documents.executed ? `${s.documents.executed} executed document${s.documents.executed === 1 ? "" : "s"}` : "no executed documents",
  ];
  return `${label} contains ${parts.join(", ")}.`;
}

export type ImpactReport = {
  keep: { canonicalId: string };
  move: { table: string; column: string; count: number }[];
  preserve: { table: string; column: string; count: number }[];
  conflicts: Conflict[];
  totals: { move: number; preserve: number };
  protectedInvestments: number;
};

/** What Confirm Consolidation would do. Moves re-associate rows; nothing is recreated or deleted. */
export function buildImpactReport(canonical: FundSnapshot, duplicate: FundSnapshot, facts: PairFacts): ImpactReport {
  const move = duplicate.dependencies.filter((d) => !d.preserved).map(({ table, column, count }) => ({ table, column, count }));
  const preserve = duplicate.dependencies.filter((d) => d.preserved).map(({ table, column, count }) => ({ table, column, count }));
  return {
    keep: { canonicalId: canonical.id },
    move,
    preserve,
    conflicts: detectConflicts(canonical, duplicate, facts),
    totals: { move: move.reduce((n, m) => n + m.count, 0), preserve: preserve.reduce((n, m) => n + m.count, 0) },
    protectedInvestments: duplicate.investments.filter((i) => ["funded", "closed"].includes(String(i.stage ?? ""))).length,
  };
}

export type ReviewState = {
  status: string;
  decision: Decision | null;
  canonicalId: string | null;
  duplicateId: string | null;
  acknowledged: ConflictKind[];
  fundIds: string[];
};

/** Reasons Confirm Consolidation is unavailable. Empty array = allowed. */
export function consolidationBlockers(review: ReviewState, report: ImpactReport | null, input: { canonicalId: string; duplicateId: string; confirmed: boolean; reason: string }): string[] {
  const out: string[] = [];
  if (review.status === "consolidated") out.push("This pair has already been consolidated.");
  if (review.decision !== "same_fund") out.push("Harmonious has not decided these are the same Fund.");
  if (!review.canonicalId) out.push("Harmonious must explicitly select the Canonical Fund.");
  if (review.canonicalId && review.canonicalId !== input.canonicalId) out.push("Selected Canonical Fund does not match the recorded decision.");
  if (input.canonicalId === input.duplicateId) out.push("Canonical and duplicate Fund must differ.");
  if (!review.fundIds.includes(input.canonicalId) || !review.fundIds.includes(input.duplicateId)) out.push("Both Funds must belong to this duplicate pair.");
  if (!report) out.push("Review the impact report first.");
  for (const c of report?.conflicts ?? []) {
    if (c.blocking) out.push(`Conflict — Harmonious Decision Required: ${c.label}. Resolve it at the source first.`);
    else if (!review.acknowledged.includes(c.kind)) out.push(`Conflict — Harmonious Decision Required: ${c.label}.`);
  }
  if (!input.confirmed) out.push("Confirm Consolidation must be ticked.");
  if (input.reason.trim().length < 5) out.push("A reason is required.");
  return out;
}

/** Keep Separate is complete only once the names are genuinely unique. */
export function keepSeparateComplete(a: { name: string | null }, b: { name: string | null }): boolean {
  return norm(a.name) !== norm(b.name);
}

export function pairKey(ids: string[]): string {
  return `fund-dup:${[...ids].sort().join(":")}`;
}

/** Follow alias hops to the surviving Fund. Cycles and long chains stop safely. */
export function resolveAlias(id: string, aliases: Map<string, string>): string {
  let cur = id;
  for (let i = 0; i < 10; i++) {
    const next = aliases.get(cur);
    if (!next || next === id) return cur;
    cur = next;
  }
  return cur;
}

/* ------------------------------------------------------ legal name gates */

export type LegalNameGatedAction = "ein_completion" | "offering_document_approval" | "banking_verification" | "investor_signing" | "regulatory_configuration" | "funding_instruction_release";
const ACTION_LABELS: Record<LegalNameGatedAction, string> = {
  ein_completion: "completing EIN/SS-4",
  offering_document_approval: "approving Offering Documents",
  banking_verification: "verifying or releasing banking",
  investor_signing: "investor signing",
  regulatory_configuration: "regulatory configuration",
  funding_instruction_release: "releasing funding instructions",
};

/** Draft Funds need only Fund Name + Client. Legal Name is required before entity-dependent actions. */
export function legalNameRequired(action: LegalNameGatedAction, legalName: string | null | undefined): string | null {
  return String(legalName ?? "").trim() ? null : `Legal Name Required before ${ACTION_LABELS[action]}.`;
}

/* ------------------------------------------------ historical name check */

export type HistoricalName = { offeringId: string; previousName: string | null };
/** A name previously used by another Fund is never silently reused. */
export function historicalNameCollision(proposed: string, history: HistoricalName[], excludeId?: string | null): HistoricalName | null {
  const n = norm(proposed);
  if (!n) return null;
  return history.find((h) => h.offeringId !== excludeId && norm(h.previousName) === n) ?? null;
}
export const HISTORICAL_NAME_MESSAGE = "This name was previously associated with another Harmonious Fund.";

/** Scope decision: Fund-name uniqueness is global across Harmonious (unchanged). */
export const FUND_NAME_UNIQUENESS_SCOPE = "global" as const;
