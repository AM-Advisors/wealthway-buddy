export type SigningEvidence = { status: string; signed_at?: string | null };
export function signingTrackerState(signature?: SigningEvidence, reported?: string) {
  if (signature?.status === "signed" && signature.signed_at) return "Signed";
  if (reported === "signed") return "Reported signed";
  if (signature?.status === "sent") return "Pending signature";
  if (signature?.status === "waiting") return "Waiting";
  return "Pending";
}