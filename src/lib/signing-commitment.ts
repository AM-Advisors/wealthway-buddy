/**
 * Pure rules for the signing record that older signing code still reads.
 * The onboarding journey records the commitment on the investment itself; signing
 * reuses that recorded amount instead of asking the investor to enter it again.
 */
import type { SignerCapacity } from "@/lib/document-signing";

/** The recorded commitment for signing: the investment's requested amount first, then the application's. */
export function recordedCommitmentCents(input: {
  onboardingRequestedCents?: number | string | null;
  applicationCommitmentCents?: number | string | null;
}): number | null {
  for (const raw of [input.onboardingRequestedCents, input.applicationCommitmentCents]) {
    const n = Number(raw);
    if (raw !== null && raw !== undefined && Number.isFinite(n) && n > 0) return Math.round(n);
  }
  return null;
}

/** Signer capacity from the investing party's recorded type, used only when no tax classification is recorded. */
export function capacityForProfileType(profileType: string | null | undefined): SignerCapacity | null {
  switch (String(profileType ?? "")) {
    case "individual":
      return "individual";
    case "joint":
      return "joint_owner";
    case "trust":
      return "trustee";
    case "ira":
      return "authorized_representative";
    case "llc":
    case "partnership":
    case "corporation":
    case "family_office":
    case "other_entity":
      return "authorized_signatory";
    default:
      return null;
  }
}
