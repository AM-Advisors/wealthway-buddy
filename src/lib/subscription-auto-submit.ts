import type { RequirementResult } from "./investor-onboarding-model";

/** Stages where the investor's signing can already be complete. Never funded, closed, cancelled or declined
 *  investments: earlier and imported investments keep their own history and get no new executed record. */
const AUTO_SUBMIT_STAGES = new Set(["signature", "harmonious_review", "accepted", "approved_to_fund", "awaiting_funds"]);

/**
 * Submit subscription happens on its own once the signing service has confirmed every
 * investor signature (user decision: investors signing from email links never see the
 * Submit button). Only confirmed signatures count; nothing here can mark a document signed.
 */
export function shouldAutoSubmitSubscription(input: {
  stage: string; removed: boolean; executed: boolean; blockingExceptions: number; requirements: RequirementResult[];
  /** Signatures the signing service confirmed for this investment (whole papers, or the investor's part of them). */
  confirmedSignatures: number;
}): boolean {
  if (input.removed || input.executed || input.blockingExceptions > 0 || input.confirmedSignatures < 1) return false;
  if (!AUTO_SUBMIT_STAGES.has(input.stage)) return false;
  // Fully signed, or the investor signed everything and only the fund's countersignature is left.
  return input.requirements.some((r) => r.key === "signature" && (r.state === "valid" || r.awaitingCountersign === true));
}

type Sig = { signer_name?: string | null; signer_capacity?: string | null; signed_at?: string | null; provider_completed_at?: string | null };

/** The name recorded by the signing service on the investor's latest confirmed signature, else the investing party's legal name. */
export function autoSubmitSigner(input: { signatures: Sig[]; isEntity: boolean; profileLegalName?: string | null; personName?: string | null }): { signerName: string; capacity: string | null } | null {
  const latest = [...input.signatures].filter((s) => (s.signer_name ?? "").trim().length >= 2).sort((a, b) => when(b) - when(a))[0];
  if (latest) return { signerName: latest.signer_name!.trim(), capacity: latest.signer_capacity?.trim() || null };
  const fallback = (input.isEntity ? input.personName : input.profileLegalName ?? input.personName)?.trim();
  return fallback && fallback.length >= 2 ? { signerName: fallback, capacity: null } : null;
}

const when = (s: Sig) => Date.parse(s.provider_completed_at ?? s.signed_at ?? "") || 0;

/** When the investor actually finished signing (latest confirmed signature), not when the platform noticed. */
export function lastSignedAt(signatures: Sig[]): string | null {
  const t = Math.max(0, ...signatures.map(when));
  return t > 0 ? new Date(t).toISOString() : null;
}
