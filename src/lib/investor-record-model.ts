/**
 * Canonical investor record entry & sync — pure rules only.
 * Person → Investment Profile → Investment → Fund. Nothing here writes data,
 * approves compliance, or moves money; the server applies these decisions.
 */

export type EntrySource = "investor" | "fund_manager" | "harmonious" | "document" | "provider" | "bulk";
export const SOURCE_LABELS: Record<EntrySource, string> = {
  investor: "Investor", fund_manager: "Fund Manager", harmonious: "Harmonious",
  document: "Imported document", provider: "Provider", bulk: "Bulk import",
};

export const PROFILE_TYPES = ["individual", "joint", "entity", "trust", "ira"] as const;
export type ProfileType = (typeof PROFILE_TYPES)[number];
export const PROFILE_TYPE_LABELS: Record<ProfileType, string> = {
  individual: "Individual", joint: "Joint", entity: "Entity", trust: "Trust", ira: "IRA / Retirement",
};
export function isProfileType(v: unknown): v is ProfileType { return PROFILE_TYPES.includes(v as ProfileType); }

/** Fields that must never be accepted from manual entry, bulk import, or fund managers. */
export const FORBIDDEN_ENTRY_KEYS = [
  "tax_id", "ssn", "tin", "tax_id_reference", "government_id", "passport", "license", "biometric",
  "kyc_status", "aml_status", "identity_verified_at", "kyc_verified_at", "aml_screened_at",
  "accreditation_evidence", "bank_account", "routing_number", "account_number", "provider_secret",
] as const;

/** Material fields: never overwritten blindly by bulk/document/provider sources. */
export const MATERIAL_FIELDS = new Set([
  "legal_first_name", "legal_last_name", "legal_name", "address", "mailing_address",
  "entity_name", "entity_type", "jurisdiction", "requested_amount_cents", "commitment_amount_cents",
  "accepted_amount_cents", "ownership",
]);
export function isMaterial(field: string) { return MATERIAL_FIELDS.has(field); }

/** Staff-only investment fields a fund manager may not set or see. */
export const STAFF_ONLY_FIELDS = new Set(["accepted_amount_cents", "internal_notes"]);

export type Actor = { isStaff: boolean; managedOfferingIds: string[] };
export function canManageFundRecords(actor: Actor, offeringId: string) {
  return actor.isStaff || actor.managedOfferingIds.includes(offeringId);
}

/** Strip anything forbidden or staff-only (for managers) from an input patch. */
export function sanitizePatch<T extends Record<string, unknown>>(patch: T, actor: Actor): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if ((FORBIDDEN_ENTRY_KEYS as readonly string[]).includes(k)) continue;
    if (!actor.isStaff && STAFF_ONLY_FIELDS.has(k)) continue;
    if (v === undefined) continue;
    out[k] = v;
  }
  return out as Partial<T>;
}

export function sourceFor(actor: Actor): EntrySource { return actor.isStaff ? "harmonious" : "fund_manager"; }

/* ---------------- search before create ---------------- */

export function normEmail(e: string | null | undefined) { return String(e ?? "").trim().toLowerCase(); }
export function normName(n: string | null | undefined) { return String(n ?? "").trim().toLowerCase().replace(/\s+/g, " "); }
export function isEmail(e: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim()); }

/** a•••••@example.com — never reveals the full address. */
export function maskEmail(email: string | null | undefined): string {
  const e = normEmail(email);
  const at = e.indexOf("@");
  if (at < 1) return "•••••";
  return `${e[0]}•••••${e.slice(at)}`;
}

export type PersonCandidate = {
  personId: string; email: string | null; firstName: string | null; lastName: string | null;
  profiles: { id: string; type: string; legalName: string | null }[];
  inFund: boolean;
};
export type MatchStrength = "email" | "name" | "entity";
export type SafeMatch = {
  personId: string; displayName: string; maskedEmail: string; strength: MatchStrength;
  profiles: { id: string; label: string }[]; alreadyInFund: boolean;
};

/** Likely matches, strongest first. Returns only masked, non-restricted facts. */
export function rankMatches(q: { email?: string | null; name?: string | null; entityName?: string | null }, people: PersonCandidate[]): SafeMatch[] {
  const email = normEmail(q.email), name = normName(q.name), entity = normName(q.entityName);
  const out: SafeMatch[] = [];
  for (const p of people) {
    const full = normName(`${p.firstName ?? ""} ${p.lastName ?? ""}`);
    let strength: MatchStrength | null = null;
    if (email && normEmail(p.email) === email) strength = "email";
    else if (entity && p.profiles.some((pr) => normName(pr.legalName) === entity)) strength = "entity";
    else if (name && full && full === name) strength = "name";
    if (!strength) continue;
    out.push({
      personId: p.personId,
      displayName: full ? `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() : "Existing investor",
      maskedEmail: maskEmail(p.email), strength,
      profiles: p.profiles.map((pr) => ({ id: pr.id, label: `Existing ${PROFILE_TYPE_LABELS[pr.type as ProfileType] ?? "Investor"} Profile` })),
      alreadyInFund: p.inFund,
    });
  }
  const rank: Record<MatchStrength, number> = { email: 0, entity: 1, name: 2 };
  return out.sort((a, b) => rank[a.strength] - rank[b.strength]);
}

/** Creating a new Person when an exact email match exists requires explicit confirmation. */
export function createNewBlocker(matches: SafeMatch[], confirmedNew: boolean): string | null {
  if (matches.some((m) => m.strength === "email") && !confirmedNew) {
    return "An investor with this email already exists. Use the existing record or confirm you are creating a separate person.";
  }
  return null;
}

/* ---------------- quick add ---------------- */

export type QuickAdd = { firstName: string; lastName: string; email: string; profileType: string; amountCents: number };
export function validateQuickAdd(q: Partial<QuickAdd>): string[] {
  const e: string[] = [];
  if (!String(q.firstName ?? "").trim() || !String(q.lastName ?? "").trim()) e.push("Enter the investor's first and last name.");
  if (!isEmail(String(q.email ?? ""))) e.push("Enter a valid email address.");
  if (!isProfileType(q.profileType)) e.push("Choose how they are investing.");
  if (!(Number(q.amountCents) > 0)) e.push("Enter the investment amount.");
  return e;
}

export function profileLabelFor(type: ProfileType, legalName: string | null, personName: string) {
  if (type === "individual") return personName;
  return legalName?.trim() || `${personName} — ${PROFILE_TYPE_LABELS[type]}`;
}

/* ---------------- record status (separate from readiness) ---------------- */

export type RecordStatus = "complete" | "missing_information" | "investor_confirmation_needed" | "conflict_detected" | "needs_harmonious_review";
export const RECORD_STATUS_LABELS: Record<RecordStatus, string> = {
  complete: "Complete", missing_information: "Missing information",
  investor_confirmation_needed: "Investor confirmation needed", conflict_detected: "Conflict detected",
  needs_harmonious_review: "Needs Harmonious review",
};

export function recordStatus(r: {
  hasEmail: boolean; hasName: boolean; hasProfile: boolean; hasAmount: boolean; hasAddress: boolean;
  entrySource: string; investorConfirmed: boolean; openConflicts: number; openReviews: number;
}): RecordStatus {
  if (r.openConflicts > 0) return "conflict_detected";
  if (r.openReviews > 0) return "needs_harmonious_review";
  if (!r.hasEmail || !r.hasName || !r.hasProfile || !r.hasAmount || !r.hasAddress) return "missing_information";
  if (r.entrySource !== "investor" && !r.investorConfirmed) return "investor_confirmation_needed";
  return "complete";
}

/* ---------------- conflicts ---------------- */

export function sameValue(a: unknown, b: unknown) {
  const n = (v: unknown) => (v == null || v === "" ? null : typeof v === "string" ? v.trim().toLowerCase() : JSON.stringify(v));
  return n(a) === n(b);
}

/**
 * Incoming values from a non-authoritative source (bulk/document/provider):
 * fill empty canonical fields; material differences become suggestions; never overwrite.
 */
export function planIncoming(current: Record<string, unknown>, incoming: Record<string, unknown>) {
  const fill: Record<string, unknown> = {};
  const conflicts: { field: string; current: unknown; proposed: unknown }[] = [];
  for (const [k, v] of Object.entries(incoming)) {
    if (v == null || v === "") continue;
    const cur = current[k];
    if (cur == null || cur === "") fill[k] = v;
    else if (!sameValue(cur, v)) conflicts.push({ field: k, current: cur, proposed: v });
  }
  return { fill, conflicts };
}

/* ---------------- bulk import ---------------- */

export const BULK_COLUMNS = ["first_name", "last_name", "email", "profile_type", "amount", "commitment", "phone", "entity_name", "address"] as const;
export type BulkRowInput = Partial<Record<(typeof BULK_COLUMNS)[number], string>>;
export type BulkClass = "create_new" | "match_existing" | "already_in_fund" | "needs_review" | "invalid";
export const BULK_CLASS_LABELS: Record<BulkClass, string> = {
  create_new: "Create new", match_existing: "Match existing", already_in_fund: "Already in Fund",
  needs_review: "Needs review", invalid: "Invalid",
};

export function parseCsv(text: string): BulkRowInput[] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (!lines.length) return [];
  const split = (l: string) => {
    const out: string[] = []; let cur = ""; let q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (c === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (c === "," && !q) { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur); return out.map((s) => s.trim());
  };
  const header = split(lines[0]!).map((h) => h.toLowerCase().replace(/[\s-]+/g, "_"));
  return lines.slice(1).map((l) => {
    const cells = split(l); const row: BulkRowInput = {};
    header.forEach((h, i) => { if ((BULK_COLUMNS as readonly string[]).includes(h)) (row as any)[h] = cells[i] ?? ""; });
    return row;
  });
}

export function parseAmountCents(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

export type BulkPreviewRow = {
  index: number; input: BulkRowInput; cls: BulkClass; errors: string[];
  personId: string | null; conflicts: { field: string; current: unknown; proposed: unknown }[];
};

/**
 * Classify rows against existing people. Duplicate emails within the file,
 * multiple people sharing an email, and material differences need review.
 */
export function classifyBulk(rows: BulkRowInput[], people: (PersonCandidate & { phone?: string | null; address?: string | null })[]): BulkPreviewRow[] {
  const seen = new Map<string, number>();
  return rows.map((input, index) => {
    const errors = validateQuickAdd({
      firstName: input.first_name, lastName: input.last_name, email: input.email,
      profileType: (input.profile_type || "individual").toLowerCase(), amountCents: parseAmountCents(input.amount) ?? 0,
    });
    const email = normEmail(input.email);
    if (email) { if (seen.has(email)) errors.push(`Duplicate of row ${seen.get(email)! + 1} in this file.`); else seen.set(email, index); }
    if (errors.length) return { index, input, cls: "invalid", errors, personId: null, conflicts: [] };
    const matches = people.filter((p) => normEmail(p.email) === email);
    if (matches.length > 1) return { index, input, cls: "needs_review", errors: ["More than one existing person uses this email."], personId: null, conflicts: [] };
    const m = matches[0];
    if (!m) return { index, input, cls: "create_new", errors: [], personId: null, conflicts: [] };
    if (m.inFund) return { index, input, cls: "already_in_fund", errors: [], personId: m.personId, conflicts: [] };
    const { conflicts } = planIncoming(
      { legal_first_name: m.firstName, legal_last_name: m.lastName, address: m.address ?? null },
      { legal_first_name: input.first_name, legal_last_name: input.last_name, address: input.address },
    );
    return { index, input, cls: conflicts.length ? "needs_review" : "match_existing", errors: [], personId: m.personId, conflicts };
  });
}

export function bulkSummary(rows: BulkPreviewRow[]): Record<BulkClass, number> {
  const s: Record<BulkClass, number> = { create_new: 0, match_existing: 0, already_in_fund: 0, needs_review: 0, invalid: 0 };
  for (const r of rows) s[r.cls]++;
  return s;
}

/** Rows that commit on confirm. Review/invalid/already-in-fund rows never commit. */
export function committable(rows: BulkPreviewRow[]) { return rows.filter((r) => r.cls === "create_new" || r.cls === "match_existing"); }

/* ---------------- activity ---------------- */

export type ChangeRow = { field: string; source: string; subject_table: string; created_at: string; manager_visible: boolean; old_value?: unknown; new_value?: unknown };

const FIELD_ACTIVITY: Record<string, string> = {
  added_to_fund: "Added to Fund", invited: "Invited", onboarding_started: "Onboarding started",
  requested_amount_cents: "Investment amount changed", commitment_amount_cents: "Commitment changed",
  investment_profile_id: "Profile changed", investor_confirmed: "Information confirmed by Investor",
  removed_from_fund: "Removed from Fund", claimed: "Investor signed in and continued this record",
  document_received: "Document received",
};

export function activityLabel(c: ChangeRow): string {
  if (FIELD_ACTIVITY[c.field]) return FIELD_ACTIVITY[c.field]!;
  const who = SOURCE_LABELS[c.source as EntrySource] ?? "Harmonious";
  return c.source === "investor" ? "Information confirmed by Investor" : `Information updated by ${who}`;
}

/** Managers see labels only for manager-visible rows; no values, no internal detail. */
export function activityFor(changes: ChangeRow[], viewer: "staff" | "manager") {
  return changes
    .filter((c) => viewer === "staff" || c.manager_visible)
    .map((c) => ({
      at: c.created_at, label: activityLabel(c), source: SOURCE_LABELS[c.source as EntrySource] ?? c.source,
      ...(viewer === "staff" ? { field: c.field, from: c.old_value ?? null, to: c.new_value ?? null } : {}),
    }));
}

/** Removal only disables the Fund relationship; closed investments need a different process. */
export function removalBlocker(stage: string, fundedCents: number): string | null {
  if (stage === "closed") return "A closed investment cannot be removed from the Fund here.";
  if (fundedCents > 0) return "Money has been received for this investment; Harmonious must handle it.";
  return null;
}
