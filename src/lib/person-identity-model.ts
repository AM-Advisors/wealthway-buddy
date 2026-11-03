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
