/**
 * Portal document catalog — pure rules (no I/O).
 *
 * Default deny. A historical tax document is released only when:
 *  - the person is signed in with two-step verification (aal2),
 *  - no emergency freeze covers the document, its fund, its recipient or the person,
 *  - the document is published,
 *  - an explicit, current entitlement exists (to the recipient investment profile the
 *    person is verified to act for, or to the person directly), and
 *  - for downloads, a fresh step-up verification is presented.
 * Fund manager or staff status never grants access on its own.
 */

export type DocStatus = "discovered" | "quarantined" | "matched" | "published" | "withdrawn" | "source_missing";

export type EntitlementRow = {
  principal_type: "investment_profile" | "user";
  principal_id: string;
  action: "grant" | "revoke";
  created_at: string;
};

export type FreezeRow = { scope: "all" | "offering" | "investment_profile" | "user" | "document"; scope_id: string | null; lifted_at: string | null };

export type AccessFacts = {
  userId: string | null;
  aal2: boolean;
  doc: { id: string; status: DocStatus; recipient_profile_id: string | null; offering_id: string | null };
  entitlements: EntitlementRow[];
  authorizedProfileIds: string[];
  freezes: FreezeRow[];
  intent: "list" | "download";
  stepUpVerified?: boolean;
};

export type AccessDecision = { allow: boolean; reason: string };

export const DENY_MESSAGES: Record<string, string> = {
  not_signed_in: "Please sign in.",
  mfa_required: "Two-step verification is required for tax documents.",
  frozen: "Access to this document is temporarily paused by Harmonious.",
  not_published: "This document is not available.",
  no_entitlement: "This document is not available to you.",
  step_up_required: "Please confirm it's you before downloading.",
  not_found: "This document is not available.",
};

/** Latest decision per principal wins; anything never granted is denied. */
export function currentGrants(rows: EntitlementRow[]): { profiles: Set<string>; users: Set<string> } {
  const latest = new Map<string, EntitlementRow>();
  for (const r of [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    latest.set(`${r.principal_type}:${r.principal_id}`, r);
  }
  const profiles = new Set<string>();
  const users = new Set<string>();
  for (const r of latest.values()) {
    if (r.action !== "grant") continue;
    (r.principal_type === "user" ? users : profiles).add(r.principal_id);
  }
  return { profiles, users };
}

export function isFrozen(freezes: FreezeRow[], f: { userId: string | null; doc: AccessFacts["doc"] }): boolean {
  return freezes.some((z) => {
    if (z.lifted_at) return false;
    switch (z.scope) {
      case "all": return true;
      case "document": return z.scope_id === f.doc.id;
      case "offering": return !!f.doc.offering_id && z.scope_id === f.doc.offering_id;
      case "investment_profile": return !!f.doc.recipient_profile_id && z.scope_id === f.doc.recipient_profile_id;
      case "user": return !!f.userId && z.scope_id === f.userId;
      default: return true; // unknown scope fails closed
    }
  });
}

export function decideAccess(f: AccessFacts): AccessDecision {
  if (!f.userId) return { allow: false, reason: "not_signed_in" };
  if (!f.aal2) return { allow: false, reason: "mfa_required" };
  if (isFrozen(f.freezes, f)) return { allow: false, reason: "frozen" };
  if (f.doc.status !== "published") return { allow: false, reason: "not_published" };
  const grants = currentGrants(f.entitlements);
  const viaProfile =
    !!f.doc.recipient_profile_id &&
    grants.profiles.has(f.doc.recipient_profile_id) &&
    f.authorizedProfileIds.includes(f.doc.recipient_profile_id);
  const viaUser = grants.users.has(f.userId);
  if (!viaProfile && !viaUser) return { allow: false, reason: "no_entitlement" };
  if (f.intent === "download" && !f.stepUpVerified) return { allow: false, reason: "step_up_required" };
  return { allow: true, reason: viaProfile ? "profile_entitlement" : "user_entitlement" };
}

// ------------------------------------------------------------ MFA freshness --

const MFA_METHODS = new Set(["totp", "webauthn", "phone", "mfa/totp", "mfa/webauthn", "mfa/phone"]);
export const STEP_UP_WINDOW_MS = 5 * 60_000;

type Claims = { aal?: unknown; amr?: unknown } | null | undefined;

export function hasAal2(claims: Claims): boolean {
  return (claims as any)?.aal === "aal2";
}

/** Step-up = a second-factor verification within the last five minutes on this session. */
export function freshSecondFactor(claims: Claims, now = Date.now(), windowMs = STEP_UP_WINDOW_MS): boolean {
  if (!hasAal2(claims)) return false;
  const amr = Array.isArray((claims as any)?.amr) ? ((claims as any).amr as any[]) : [];
  return amr.some((m) => MFA_METHODS.has(String(m?.method)) && Number(m?.timestamp) * 1000 >= now - windowMs);
}

// -------------------------------------------------------- profile authority --

export type ProfileFact = { id: string; profile_type: string; owner_user_id: string | null; person_id: string | null };
export type RelationshipFact = { profile_id: string; person_id: string; status: string; verification_status: string; is_authorized_signer: boolean };

const SELF_PROFILE_TYPES = new Set(["individual", "joint", "ira"]);

/**
 * Which investment profiles may this person receive tax documents for?
 * Individuals: their own canonical Person. Entities: explicit owner account or a verified,
 * active authorized-signer relationship. Email or name similarity is never evidence.
 */
export function authorizedProfiles(userId: string, myPersonIds: string[], profiles: ProfileFact[], rels: RelationshipFact[]): string[] {
  const persons = new Set(myPersonIds);
  const out = new Set<string>();
  for (const p of profiles) {
    if (p.owner_user_id === userId) out.add(p.id);
    else if (SELF_PROFILE_TYPES.has(p.profile_type) && p.person_id && persons.has(p.person_id)) out.add(p.id);
  }
  for (const r of rels) {
    if (persons.has(r.person_id) && r.status === "active" && r.verification_status === "verified" && r.is_authorized_signer) out.add(r.profile_id);
  }
  return [...out];
}

// --------------------------------------------------------------- matching --

export type FolderMapping = { folder_id: string; offering_id: string; profile_id?: string | undefined };
export type SourceFile = { id: string; name: string; parent_folder_id: string; checksum?: string | null | undefined };
export type MatchContext = {
  mappings: FolderMapping[];
  /** offering_id → investment profile ids that hold an investment there. */
  investorsByOffering: Record<string, string[]>;
  profileNames: Record<string, string>;
  /** checksums already held by another catalog entry → that entry's id */
  knownChecksums: Record<string, string>;
};

export type MatchResult = {
  documentType: string;
  taxYear: number | null;
  offeringId: string | null;
  status: "matched" | "quarantined";
  recipientProfileId: string | null;
  reason: string;
  candidateProfileId: string | null;
  duplicateOf: string | null;
};

export function taxYearFrom(name: string): number | null {
  const m = name.match(/(?:^|[^0-9])(20[0-9]{2})(?:[^0-9]|$)/);
  return m ? Number(m[1]) : null;
}

export function documentTypeFrom(name: string): string {
  return /\bk[\s-]?1\b/i.test(name) ? "k1" : "other";
}

function tokens(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((t) => t.length >= 4 && !["family", "trust", "holdings", "test", "partners", "corp"].includes(t));
}

/** Filename suggestion only: never enough to publish. */
export function suggestRecipient(fileName: string, candidates: string[], names: Record<string, string>): string | null {
  const ft = new Set(tokens(fileName));
  const hits = candidates.filter((id) => {
    const nt = tokens(names[id] ?? "");
    return nt.length > 0 && nt.every((t) => ft.has(t));
  });
  return hits.length === 1 ? (hits[0] ?? null) : null;
}

export function matchDocument(file: SourceFile, ctx: MatchContext): MatchResult {
  const documentType = documentTypeFrom(file.name);
  const taxYear = taxYearFrom(file.name);
  const mapping = ctx.mappings.find((m) => m.folder_id === file.parent_folder_id) ?? null;
  const base = { documentType, taxYear, offeringId: mapping?.offering_id ?? null, recipientProfileId: null, candidateProfileId: null, duplicateOf: null };
  const q = (reason: string, extra: Partial<MatchResult> = {}): MatchResult => ({ ...base, status: "quarantined", reason, ...extra });

  const dup = file.checksum ? ctx.knownChecksums[file.checksum] : undefined;
  if (dup) return q("duplicate_checksum", { duplicateOf: dup });
  if (!mapping) return q("outside_mapped_folders");
  if (documentType !== "k1") return q("not_a_k1");
  const investors = ctx.investorsByOffering[mapping.offering_id] ?? [];
  if (!mapping.profile_id) {
    return q(taxYear ? "no_trusted_recipient" : "tax_year_unknown", { candidateProfileId: suggestRecipient(file.name, investors, ctx.profileNames) });
  }
  if (!investors.includes(mapping.profile_id)) return q("mapping_conflict", { candidateProfileId: mapping.profile_id });
  if (!taxYear) return q("tax_year_unknown", { candidateProfileId: mapping.profile_id });
  return { ...base, status: "matched", reason: "trusted_folder_mapping", recipientProfileId: mapping.profile_id };
}

export const REASON_LABELS: Record<string, string> = {
  duplicate_checksum: "Same file already in the catalog",
  outside_mapped_folders: "Folder not mapped to a fund",
  not_a_k1: "Not recognized as a K-1",
  no_trusted_recipient: "Fund known, recipient not verified",
  tax_year_unknown: "Tax year not identified",
  mapping_conflict: "Folder mapping conflicts with fund records",
  trusted_folder_mapping: "Matched by approved folder mapping",
};
