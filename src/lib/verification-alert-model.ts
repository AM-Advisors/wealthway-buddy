import { appUrl, safeInternalPath } from "@/lib/app-origins";

export type VerificationCheck = "KYC" | "KYB" | "AML";

/** Processing is not a request for human confirmation. */
export function verificationNeedsConfirmation(status: string | null | undefined): boolean {
  return ["review", "in_review", "requires_review", "needs_review", "flagged", "failed", "declined", "rejected"].includes(String(status ?? "").trim().toLowerCase().replace(/\s+/g, "_"));
}

/** Staff alerts land directly on Operations, independent of team ownership. */
export function operationsNoticeUrl(path?: string | null, offeringId?: string | null): string {
  const fallback = offeringId ? `/ops/fund/${encodeURIComponent(offeringId)}` : "/ops/queue";
  const safe = safeInternalPath(path, fallback);
  return appUrl("ops", safe === "/ops" || safe.startsWith("/ops/") ? safe : fallback);
}

export function verificationNotice(input: { check: VerificationCheck; status?: string | null; ref: string; offeringId?: string | null; path?: string | null }) {
  if (!verificationNeedsConfirmation(input.status)) return null;
  return {
    kind: "verification_confirmation",
    title: `${input.check} requires confirmation`,
    ref: `${input.check}:${input.ref}:${input.status}`,
    offeringId: input.offeringId ?? null,
    path: input.path ?? "/ops/queue",
    once: true,
  };
}