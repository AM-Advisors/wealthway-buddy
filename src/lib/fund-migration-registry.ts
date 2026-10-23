/**
 * Fund Migration registry - pure model (client-safe).
 * Discovered Drive inventory + append-only staff decisions + verified facts from canonical records.
 * Nothing here creates or changes a production fund, entity, investor or investment.
 */

export type Classification = "matched" | "missing" | "archived" | "duplicate" | "review";
export type InventoryEntry = {
  key: string; name: string; classification: Classification; matchedName: string | null;
  hasTaxFolder: boolean; fileCount: number; parent: string | null; isTest: boolean;
  sources: { root: string; folder: string }[];
};
export type Decision = {
  registry_key: string; decision: DecisionKind; offering_id: string | null; parent_key: string | null;
  reason: string; actor_user_id: string; created_at: string;
};
export type DecisionKind =
  | "approve_match" | "reject_match" | "confirm_duplicate" | "not_duplicate" | "confirm_archived"
  | "set_parent" | "not_a_fund" | "queue_for_import" | "needs_review";

/** Facts read from canonical Harmonious records for a matched fund. Unknown = not verified. */
export type FundFacts = {
  offeringId: string; legalName: string | null; investorCount: number; managerCount: number;
  formationDocs: number; signingTemplates: number;
};

export const DIMENSIONS = [
  ["identity", "Fund identity"],
  ["formation", "Formation documents"],
  ["roster", "Investor roster"],
  ["manager", "Manager relationship"],
  ["k1", "Box K-1 location"],
  ["signing", "Signing templates"],
  ["didit", "Identity verification flow"],
] as const;
export type Dimension = (typeof DIMENSIONS)[number][0];
export type DimensionState = { status: "verified" | "missing" | "blocked"; note: string };

export type RegistryRow = InventoryEntry & {
  status: Classification | "not_a_fund";
  latest: Decision | null;
  offeringId: string | null;
  matchApproved: boolean;
  dims: Record<Dimension, DimensionState>;
  score: number;
  blockers: string[];
  priority: number;
};

const ALLOWED_PER_STATUS: Record<string, DecisionKind[]> = {
  matched: ["approve_match", "reject_match", "set_parent", "needs_review"],
  missing: ["queue_for_import", "set_parent", "not_a_fund", "needs_review"],
  archived: ["confirm_archived", "queue_for_import", "not_a_fund", "needs_review"],
  duplicate: ["confirm_duplicate", "not_duplicate", "set_parent", "needs_review"],
  review: ["set_parent", "not_a_fund", "queue_for_import", "needs_review"],
  not_a_fund: ["needs_review", "set_parent"],
};
export function allowedDecisions(status: RegistryRow["status"]): DecisionKind[] {
  return ALLOWED_PER_STATUS[status] ?? ["needs_review"];
}

export const DECISION_LABELS: Record<DecisionKind, string> = {
  approve_match: "Approve match",
  reject_match: "Reject match",
  confirm_duplicate: "Confirm duplicate",
  not_duplicate: "Not a duplicate",
  confirm_archived: "Confirm archived",
  set_parent: "Set parent / series relationship",
  not_a_fund: "Not a fund (company or entity)",
  queue_for_import: "Add to import queue",
  needs_review: "Send back to review",
};

/** Latest decision per key; decisions are append-only so newest wins. */
export function latestByKey(decisions: Decision[]): Map<string, Decision> {
  const m = new Map<string, Decision>();
  for (const d of [...decisions].sort((a, b) => a.created_at.localeCompare(b.created_at))) m.set(d.registry_key, d);
  return m;
}

export function buildRow(e: InventoryEntry, latest: Decision | null, facts: FundFacts | null): RegistryRow {
  let status: RegistryRow["status"] = e.classification;
  if (latest?.decision === "reject_match") status = "missing";
  if (latest?.decision === "not_a_fund") status = "not_a_fund";
  if (latest?.decision === "not_duplicate") status = e.matchedName ? "matched" : "missing";
  if (latest?.decision === "needs_review") status = "review";
  const matchApproved = status === "matched" && latest?.decision === "approve_match" && !!facts;
  const f = matchApproved ? facts : null;
  const v = (ok: boolean, yes: string, no: string): DimensionState => ({ status: ok ? "verified" : "missing", note: ok ? yes : no });
  const dims: Record<Dimension, DimensionState> = {
    identity: f ? v(!!f.legalName, `Matched to Harmonious fund; legal name on record`, "Matched, but no legal name on the Harmonious fund") : { status: "missing", note: status === "matched" ? "Match not yet approved by staff" : "No approved Harmonious fund" },
    formation: f ? v(f.formationDocs > 0, `${f.formationDocs} formation/governing document(s) on file`, "No formation documents on file") : { status: "missing", note: "Not verified: folder names are not evidence" },
    roster: f ? v(f.investorCount > 0, `${f.investorCount} investor record(s)`, "No investor records") : { status: "missing", note: "No verified roster" },
    manager: f ? v(f.managerCount > 0, `${f.managerCount} fund manager(s) linked`, "No fund manager linked") : { status: "missing", note: "No manager relationship" },
    k1: { status: "blocked", note: "Dedicated read-only Box connection not set up" },
    signing: f ? v(f.signingTemplates > 0, `${f.signingTemplates} signing template(s)`, "No signing template mapped") : { status: "missing", note: "No signing template mapped" },
    didit: { status: "blocked", note: "Identity verification flow mapping not yet approved (Step E)" },
  };
  const verified = Object.values(dims).filter((d) => d.status === "verified").length;
  const score = Math.round((verified / DIMENSIONS.length) * 100);
  const blockers = DIMENSIONS.filter(([k]) => dims[k].status !== "verified").map(([k, l]) => `${l}: ${dims[k].note}`);
  const priority = priorityOf({ ...e, status, score });
  return { ...e, status, latest, offeringId: facts?.offeringId ?? null, matchApproved, dims, score, blockers, priority };
}

/** Lower number = sooner. Test funds always last; real funds with tax folders first. */
export function priorityOf(r: { status: RegistryRow["status"]; hasTaxFolder: boolean; isTest: boolean; score: number }): number {
  if (r.isTest) return 900;
  const base = { matched: 100, duplicate: 200, missing: 300, review: 500, archived: 700, not_a_fund: 800 }[r.status];
  return base - (r.hasTaxFolder ? 50 : 0) - Math.floor(r.score / 10);
}

export type Metrics = {
  total: number; matched: number; missing: number; missingWithTax: number; archived: number;
  duplicates: number; review: number; notAFund: number; test: number; harmoniousDuplicates: number;
};
export function metrics(rows: RegistryRow[], harmoniousDuplicates: number): Metrics {
  const c = (s: RegistryRow["status"]) => rows.filter((r) => r.status === s).length;
  return {
    total: rows.length, matched: c("matched"), missing: c("missing"),
    missingWithTax: rows.filter((r) => r.status === "missing" && r.hasTaxFolder).length,
    archived: c("archived"), duplicates: c("duplicate"), review: c("review"), notAFund: c("not_a_fund"),
    test: rows.filter((r) => r.isTest).length, harmoniousDuplicates,
  };
}

export function sortQueue(rows: RegistryRow[]): RegistryRow[] {
  return [...rows].sort((a, b) => a.priority - b.priority || b.score - a.score || a.name.localeCompare(b.name));
}

/** Normalized fund name key for Harmonious-side duplicate detection. */
export function normalizeFundName(n: string): string {
  return n.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\b(llc|lp|inc|ltd)\b/g, " ").replace(/\s+/g, " ").trim();
}
