import { reusableProfileAccreditation } from "@/lib/profile-document-requirements";

export type AccreditationPick = {
  source: "investing_party" | "investment";
  status: string | null;
  method: string | null;
  verified_at: string | null;
  expires_at: string | null;
  record: Record<string, any>;
};

/**
 * The one accreditation rule (same as investment readiness): the investing party's
 * accreditation for this fund, then its general one, then the investment's own record.
 */
export function pickAccreditation(partyRows: any[], offeringId: string | null, investmentRecord: any | null): AccreditationPick | null {
  const party = offeringId != null || partyRows.length ? reusableProfileAccreditation(partyRows, offeringId ?? "") : null;
  if (party) return { source: "investing_party", status: party.status ?? null, method: party.verification_method ?? null, verified_at: party.verified_at ?? null, expires_at: party.expires_at ?? null, record: party };
  if (!investmentRecord) return null;
  return { source: "investment", status: investmentRecord.status ?? null, method: investmentRecord.method ?? null, verified_at: investmentRecord.verified_at ?? null, expires_at: investmentRecord.expires_at ?? null, record: investmentRecord };
}
