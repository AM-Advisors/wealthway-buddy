import type { NormalizedVerification } from "@/lib/kyc-verification";

/**
 * Verified-detail backfill.
 *
 * When an identity check is approved, the provider has already confirmed the
 * investor's name, date of birth, ID issuing country and (with proof of
 * address) their residential address. To keep onboarding clean we copy those
 * verified facts onto the person record, but ONLY into fields that are still
 * blank. Anything the investor already typed stays untouched, and every field
 * we fill is listed so the change is auditable.
 */

export interface PersonBackfillRow {
  date_of_birth?: string | null;
  citizenship_country?: string | null;
  address_line1?: string | null;
  city?: string | null;
  region?: string | null;
  postal_code?: string | null;
  country?: string | null;
}

export interface PersonBackfillResult {
  update: Record<string, string>;
  filledFields: string[];
}

const blank = (v: string | null | undefined) => !v || !String(v).trim();

export function verifiedPersonBackfill(
  person: PersonBackfillRow,
  normalized: NormalizedVerification,
  kycApproved: boolean,
): PersonBackfillResult {
  const update: Record<string, string> = {};
  const filledFields: string[] = [];
  if (!kycApproved) return { update, filledFields };

  const doc = normalized.document;
  if (blank(person.date_of_birth) && doc.dateOfBirth) {
    update.date_of_birth = doc.dateOfBirth;
    filledFields.push("date_of_birth");
  }
  if (blank(person.citizenship_country) && doc.issuingCountry) {
    update.citizenship_country = doc.issuingCountry;
    filledFields.push("citizenship_country");
  }

  const poa = normalized.proofOfAddress;
  if (poa.status === "approved" && poa.extracted) {
    const a = poa.extracted;
    const pairs: Array<[keyof PersonBackfillRow, string | null]> = [
      ["address_line1", a.line1 ?? a.formatted],
      ["city", a.city],
      ["region", a.region],
      ["postal_code", a.postalCode],
      ["country", a.country],
    ];
    for (const [key, value] of pairs) {
      if (blank(person[key]) && value) {
        update[key] = value;
        filledFields.push(key);
      }
    }
  }

  return { update, filledFields };
}
