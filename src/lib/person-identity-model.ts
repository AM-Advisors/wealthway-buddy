// Pure: what an investment's Verification step does with the person's single identity check.
export type PersonCheckState = "not_started" | "pending" | "review" | "approved" | "declined" | "sent_back" | "expired";

export type PersonIdentityAction =
  | { kind: "reuse" } // passed: apply it, never start another check
  | { kind: "resume"; url: string } // in progress: reopen the same link
  | { kind: "wait" } // being reviewed: nothing for the investor to do
  | { kind: "blocked" } // declined: Harmonious follows up
  | { kind: "start" }; // no usable check: start the person's one check

export function personIdentityAction(c: { status: PersonCheckState; sessionUrl: string | null } | null): PersonIdentityAction {
  if (!c) return { kind: "start" };
  if (c.status === "approved") return { kind: "reuse" };
  if (c.status === "review") return { kind: "wait" };
  if (c.status === "declined") return { kind: "blocked" };
  if ((c.status === "pending" || c.status === "not_started") && c.sessionUrl) return { kind: "resume", url: c.sessionUrl };
  return { kind: "start" }; // sent back, expired, or never opened
}

// Same person, separate accounts: the provider flags a second login of an already-verified
// person as a "duplicate". That alone is not a reason to stop them; accounts stay separate.
const SELF_DUPLICATE = [/possible duplicated user/i, /duplicated face from other approved session/i, /may match an approved user/i, /duplicated ip address/i];
const NAME_MISMATCH = /full name mismatch with provided information/i;
const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z]/g, "");

export interface SelfDuplicateInput {
  warnings: string[];
  livenessStatus: string | null;
  faceMatchStatus: string | null;
  amlHits: number;
  documentExpired: boolean;
  idFullName: string | null;
  personLegalName: string | null; // the person's recorded legal name for this account
}

/** True only when every reason for review is "this person is already verified elsewhere" (and, for a name
 *  warning, the ID name matches the person's recorded legal name). Anything else stays in review. */
export function isBenignSelfDuplicate(i: SelfDuplicateInput): boolean {
  if (i.livenessStatus !== "pass" || i.faceMatchStatus !== "pass" || i.amlHits > 0 || i.documentExpired) return false;
  const ws = [...new Set(i.warnings.map((w) => w.trim()).filter(Boolean))];
  if (!ws.some((w) => SELF_DUPLICATE.some((r) => r.test(w)))) return false;
  return ws.every((w) => {
    if (SELF_DUPLICATE.some((r) => r.test(w))) return true;
    if (NAME_MISMATCH.test(w)) return !!i.idFullName && norm(i.idFullName) === norm(i.personLegalName);
    return false;
  });
}

export interface CheckFingerprint { dateOfBirth: string | null; idLast4: string | null; livenessStatus: string | null; faceMatchStatus: string | null }

/** Staff hint only: two checks may be the same person when date of birth AND ID last-4 match and both
 *  passed liveness and face match. Names are never compared; same name means different people. Never merges. */
export function samePersonCandidate(a: CheckFingerprint, b: CheckFingerprint): boolean {
  const ok = (c: CheckFingerprint) => c.livenessStatus === "pass" && c.faceMatchStatus === "pass" && !!c.dateOfBirth && !!c.idLast4;
  return ok(a) && ok(b) && a.dateOfBirth === b.dateOfBirth && a.idLast4 === b.idLast4;
}

export interface PrefillSession {
  status: string | null;
  provider_decision: string | null;
  completed_at: string | null;
  verified_full_name: string | null;
  document_issuing_country: string | null;
}

/**
 * Verified facts for questionnaire prefill and tax-form routing only (never an approval):
 * an approved, completed investment check wins; otherwise, when the person record is already
 * identity-approved, the provider-approved check that produced it supplies the ID name and country.
 * Declined, sent-back or expired checks never supply facts. Sessions are newest first.
 */
export function prefillFactsFrom(personKycStatus: string | null, sessions: PrefillSession[]): null | { fullName: string | null; documentCountry: string | null } {
  const pick = (s: PrefillSession) => ({ fullName: s.verified_full_name ?? null, documentCountry: s.document_issuing_country ?? null });
  const done = sessions.find((s) => s.status === "approved" && !!s.completed_at);
  if (done) return pick(done);
  if (personKycStatus !== "approved") return null;
  const held = sessions.find((s) =>
    !["declined", "sent_back", "expired"].includes(String(s.status ?? "")) &&
    String(s.provider_decision ?? "").trim().toLowerCase() === "approved" && !!s.verified_full_name);
  return held ? pick(held) : null;
}
