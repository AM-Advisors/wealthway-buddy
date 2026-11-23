/** Pure rules for the "Sign now" link: our own address, never the signing service's link. */
export function signLinkPath(onboardingId: string, documentId: string): string {
  return `/investment/${onboardingId}?step=sign&sign=${documentId}`;
}

export type SignLinkFacts = {
  removed: boolean;
  email: string | null;
  requiresSignature: boolean;
  documentInFund: boolean;
  investorSigned: boolean;
  identityVerified: boolean;
  /** Unfinished signing requirements from the shared signing gate (business documents, owners and signers…). */
  signingBlockers?: string[];
};

/** Whether a Sign now link may be sent, and in plain words what is missing. */
export function signLinkReadiness(f: SignLinkFacts): { ready: boolean; reason: string | null } {
  if (f.removed) return { ready: false, reason: "This investor was removed from the fund." };
  if (!f.documentInFund || !f.requiresSignature) return { ready: false, reason: "This document doesn't need the investor's signature." };
  if (f.investorSigned) return { ready: false, reason: "The investor already signed this document." };
  if (!f.email) return { ready: false, reason: "Add the investor's email first." };
  if (!f.identityVerified) return { ready: false, reason: "Finish the investor's identity check first." };
  if (f.signingBlockers?.length) return { ready: false, reason: `Finish these before sending a signing link: ${f.signingBlockers.join("; ")}.` };
  return { ready: true, reason: null };
}

/** When the signing service already emailed an open copy, send it again; otherwise send a fresh one. */
export function providerEmailAction(s: { delivery: string | null; providerStatus: string | null; agreementId: string | null }): "resend" | "send" {
  return s.delivery === "provider_email" && s.providerStatus === "out_for_signature" && !!s.agreementId ? "resend" : "send";
}

/** One signing-service email per document a day; only a Super Admin with a reason may send another. */
export const PROVIDER_EMAIL_EVENTS = ["provider_email_sent", "provider_email_resent"] as const;
