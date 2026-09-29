/**
 * Fund & investor record integrity (pure). No I/O.
 *
 * - Fund identity comes from the canonical Fund (offering) record, never a
 *   Drive folder. Names are compared in normalized form.
 * - Investor Records Sync is reconciliation, not import: it classifies what it
 *   finds and hands every non-exact result to Harmonious for an explicit choice.
 */

/** Mirrors public.normalize_fund_name in the database. */
export function normalizeFundName(v: string | null | undefined): string {
  return String(v ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ENTITY_SUFFIXES = new Set(["llc", "lp", "llp", "inc", "ltd", "l", "p", "co", "corp", "the", "a", "series", "of"]);
/** Looser key for "similar" warnings only — never for blocking. */
export function looseFundKey(v: string | null | undefined): string {
  return normalizeFundName(v)
    .split(" ")
    .filter((w) => w && !ENTITY_SUFFIXES.has(w))
    .join(" ");
}

export type FundRef = { id: string; name: string | null; legalName: string | null };
export type FundMatchKind = "same_name" | "same_legal_name" | "similar";
export type FundMatch = FundRef & { kind: FundMatchKind };

export function findFundMatches(proposed: { name?: string | null | undefined; legalName?: string | null | undefined }, funds: FundRef[], excludeId?: string | null): FundMatch[] {
  const n = normalizeFundName(proposed.name);
  const l = normalizeFundName(proposed.legalName);
  const loose = looseFundKey(proposed.name);
  const out: FundMatch[] = [];
  for (const f of funds) {
    if (f.id === excludeId) continue;
    if (n && normalizeFundName(f.name) === n) out.push({ ...f, kind: "same_name" });
    else if (l && (normalizeFundName(f.legalName) === l || normalizeFundName(f.name) === l)) out.push({ ...f, kind: "same_legal_name" });
    else if (loose.length >= 4 && (looseFundKey(f.name) === loose || looseFundKey(f.legalName) === loose)) out.push({ ...f, kind: "similar" });
  }
  const rank: Record<FundMatchKind, number> = { same_name: 0, same_legal_name: 1, similar: 2 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind]);
}

/** Blocking message for a create/rename, or null when the name is free. */
export function fundCreationBlocker(matches: FundMatch[], opts: { distinctConfirmed?: boolean } = {}): string | null {
  const same = matches.find((m) => m.kind === "same_name");
  if (same) return `A Fund named "${same.name}" already exists. Open the existing Fund instead.`;
  const legal = matches.find((m) => m.kind === "same_legal_name");
  if (legal) return `The Legal Name already belongs to "${legal.name}". Open the existing Fund, or ask Harmonious to review before creating another.`;
  if (matches.some((m) => m.kind === "similar") && !opts.distinctConfirmed) {
    return "A similar Fund already exists. Open it, or confirm this is a genuinely distinct Fund.";
  }
  return null;
}

/** Postgres raises `duplicate_fund_name:<id>` when a concurrent request won. */
export function duplicateFundIdFromError(message: string | null | undefined): string | null {
  const m = /duplicate_fund_name:([0-9a-f-]{36})/i.exec(String(message ?? ""));
  return m ? m[1]! : null;
}

/* ------------------------------------------------------------ investor sync */

export const SYNC_CATEGORIES = {
  matched: "Matched",
  existing_person_missing_investment: "Existing Person — Missing Investment",
  new_investor_candidate: "New Investor Candidate",
  suggested_update: "Suggested Update",
  conflict: "Conflict",
  unmatched_folder: "Unmatched Investor Records",
  missing_folder: "Investor Records Folder Missing",
  duplicate_candidate: "Possible Duplicate Investor Folders",
  restricted_document: "Restricted Document Review Required",
  historical_document: "Historical / Imported Document",
  removed_investor: "Folder for Removed Investor",
  fund_duplicate: "Fund Records Review Required",
} as const;
export type SyncCategory = keyof typeof SYNC_CATEGORIES;

export const CONFIDENCE_LABELS = {
  exact: "Exact Match",
  likely: "Likely Match — Review Required",
  none: "No Match",
  conflict: "Conflict",
  duplicate: "Duplicate Candidate",
} as const;
export type Confidence = keyof typeof CONFIDENCE_LABELS;

export const QUEUE_KINDS = {
  match: "Investor Record Match Review",
  duplicate: "Duplicate Investor Review",
  document: "Investor Document Review",
  fund_duplicate: "Fund Duplicate Review",
  restricted: "Restricted Document Review",
} as const;
export type QueueKind = keyof typeof QUEUE_KINDS;

export function queueKindFor(c: SyncCategory): QueueKind {
  if (c === "restricted_document") return "restricted";
  if (c === "fund_duplicate") return "fund_duplicate";
  if (c === "duplicate_candidate") return "duplicate";
  if (c === "historical_document") return "document";
  return "match";
}

/** Actions Harmonious may take per category. There is deliberately no "accept all". */
export function actionsFor(c: SyncCategory): SyncAction[] {
  switch (c) {
    case "new_investor_candidate":
    case "unmatched_folder":
      return ["create_investor", "link", "not_investor", "review_later"];
    case "existing_person_missing_investment":
      return ["add_to_fund", "link", "not_investor", "review_later"];
    case "missing_folder":
      return ["create_folder", "review_later", "dismiss"];
    case "matched":
      return ["open"];
    default:
      return ["mark_reviewed", "review_later"];
  }
}
export type SyncAction = "open" | "create_investor" | "link" | "add_to_fund" | "not_investor" | "review_later" | "create_folder" | "mark_reviewed" | "dismiss";

/** Folder names are written as "Name (Profile Type)" by drive-structure. */
export function parseInvestorFolderName(name: string): { displayName: string; profileHint: string | null } {
  const m = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(name.trim());
  return m ? { displayName: m[1]!.trim(), profileHint: m[2]!.trim().toLowerCase() } : { displayName: name.trim(), profileHint: null };
}

export type CanonicalInvestment = {
  onboardingId: string; profileId: string | null; personId: string | null; profileName: string | null;
  profileType: string | null; personName: string | null; stage: string | null; removed: boolean;
};
export type PersonHit = { personId: string; profileIds: string[] };

export type FolderClassification =
  | { confidence: "exact"; category: "matched"; onboardingId: string; profileId: string | null }
  | { confidence: "likely"; category: "matched" | "conflict"; onboardingIds: string[] }
  | { confidence: "none"; category: "removed_investor"; onboardingId: string }
  | { confidence: "likely"; category: "existing_person_missing_investment"; personIds: string[] }
  | { confidence: "duplicate"; category: "duplicate_candidate"; personIds: string[] }
  | { confidence: "none"; category: "new_investor_candidate" };

const nameKey = (v: string | null | undefined) => normalizeFundName(v);

/**
 * Classify one Drive investor folder. `linkedProfileId` is set when the folder is
 * already mapped (canonical link) — the only path to an Exact Match. A name
 * match is never better than "likely".
 */
export function classifyFolder(
  folder: { name: string; linkedProfileId: string | null },
  investments: CanonicalInvestment[],
  personHits: PersonHit[],
): FolderClassification {
  if (folder.linkedProfileId) {
    const inv = investments.find((i) => i.profileId === folder.linkedProfileId && !i.removed);
    if (inv) return { confidence: "exact", category: "matched", onboardingId: inv.onboardingId, profileId: inv.profileId };
    const gone = investments.find((i) => i.profileId === folder.linkedProfileId && i.removed);
    if (gone) return { confidence: "none", category: "removed_investor", onboardingId: gone.onboardingId };
  }
  const { displayName } = parseInvestorFolderName(folder.name);
  const k = nameKey(displayName);
  const byName = investments.filter((i) => k && (nameKey(i.profileName) === k || nameKey(i.personName) === k));
  const live = byName.filter((i) => !i.removed);
  if (live.length === 1) return { confidence: "likely", category: "matched", onboardingIds: [live[0]!.onboardingId] };
  if (live.length > 1) return { confidence: "likely", category: "conflict", onboardingIds: live.map((i) => i.onboardingId) };
  if (byName.length) return { confidence: "none", category: "removed_investor", onboardingId: byName[0]!.onboardingId };
  if (personHits.length === 1) return { confidence: "likely", category: "existing_person_missing_investment", personIds: [personHits[0]!.personId] };
  if (personHits.length > 1) return { confidence: "duplicate", category: "duplicate_candidate", personIds: personHits.map((p) => p.personId) };
  return { confidence: "none", category: "new_investor_candidate" };
}

/** Investments are protected from any sync-driven change once money or closing is involved. */
export function syncProtected(stage: string | null | undefined): boolean {
  return ["funded", "closed"].includes(String(stage ?? ""));
}

/** Stable key: re-running with unchanged sources converges onto the same row. */
export function syncItemKey(offeringId: string, category: SyncCategory, ref: string): string {
  return `sync:${offeringId}:${category}:${ref}`;
}

export type SyncSummary = { matched: number; needsReview: number; unmatched: number };
export function summarize(items: { category: SyncCategory; status: string }[]): SyncSummary {
  const open = items.filter((i) => i.status === "open" || i.status === "later" || i.status === "in_progress");
  return {
    matched: items.filter((i) => i.category === "matched").length,
    needsReview: open.filter((i) => i.category !== "matched" && i.category !== "unmatched_folder" && i.category !== "new_investor_candidate").length,
    unmatched: open.filter((i) => i.category === "unmatched_folder" || i.category === "new_investor_candidate").length,
  };
}
