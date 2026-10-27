import type { NormalizedVerification } from "@/lib/kyc-verification";

/**
 * Verified-detail write-back: the single rule set for copying identity-check
 * results onto the person record.
 *
 * Two modes, one field list:
 * - "fill-blank": only fields the investor has not supplied are filled.
 *   Anything they typed stays untouched. Used by the standard approval path.
 * - "verified-wins": approved verified facts replace differing values, and
 *   every change is returned so the caller can log it. Used by the automatic
 *   acceptance path for questionnaire-linked identity sessions.
 *
 * Address fields move as a group and only when the verified address has at
 * least a street line and a city, so a partial address never lands.
 */

export interface PersonBackfillRow {
  [key: string]: unknown;
}

export interface VerifiedFieldChange {
  field: string;
  from: string | null;
  to: string;
}

export interface PersonBackfillResult {
  update: Record<string, string>;
  filledFields: string[];
  changes: VerifiedFieldChange[];
}

export type VerifiedWriteMode = "fill-blank" | "verified-wins";

const ADDRESS_GROUP = new Set([
  "address_line1",
  "address_line2",
  "city",
  "region",
  "postal_code",
  "country",
  "residence_country",
]);

const blank = (v: unknown) => v == null || !String(v).trim();

/**
 * Merge verified fields into a person row under the given mode.
 * `fields` maps person columns to verified values; null/empty values are
 * skipped. In "verified-wins" mode every differing value is applied and
 * reported in `changes`; in "fill-blank" mode only blank targets are set.
 */
export function mergeVerifiedPersonFields(
  person: PersonBackfillRow,
  fields: Record<string, string | null>,
  mode: VerifiedWriteMode,
): PersonBackfillResult {
  const update: Record<string, string> = {};
  const filledFields: string[] = [];
  const changes: VerifiedFieldChange[] = [];

  const hasAddress = !blank(fields["address_line1"]) && !blank(fields["city"]);

  for (const [field, raw] of Object.entries(fields)) {
    if (blank(raw)) continue;
    const value = String(raw).trim();
    if (ADDRESS_GROUP.has(field) && !hasAddress) continue;
    const current = person[field];
    if (!blank(current) && String(current).trim() === value) continue;
    if (mode === "fill-blank" && !blank(current)) continue;
    update[field] = value;
    filledFields.push(field);
    if (!blank(current)) changes.push({ field, from: String(current), to: value });
  }

  return { update, filledFields, changes };
}

/** Flat verified fields from a normalized identity-check decision. */
export function verifiedFieldsFromDecision(normalized: NormalizedVerification): Record<string, string | null> {
  const doc = normalized.document;
  const poa = normalized.proofOfAddress;
  const a = poa.status === "approved" ? poa.extracted : null;
  return {
    date_of_birth: doc.dateOfBirth,
    citizenship_country: doc.issuingCountry,
    address_line1: a?.line1 ?? a?.formatted ?? null,
    city: a?.city ?? null,
    region: a?.region ?? null,
    postal_code: a?.postalCode ?? null,
    country: a?.country ?? null,
  };
}

/** Standard approval path: fill still-blank About You fields only. */
export function verifiedPersonBackfill(
  person: PersonBackfillRow,
  normalized: NormalizedVerification,
  kycApproved: boolean,
): PersonBackfillResult {
  if (!kycApproved) return { update: {}, filledFields: [], changes: [] };
  return mergeVerifiedPersonFields(person, verifiedFieldsFromDecision(normalized), "fill-blank");
}
