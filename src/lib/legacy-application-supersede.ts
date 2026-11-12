/**
 * Display-only rule shared by every investor-facing reader that still looks at
 * the older investor_applications rows (home setup card, Action Center,
 * delegated professional view).
 *
 * When the same login account has a current investment record
 * (investor_onboardings) for the same fund, that record is the one Operations
 * shows, so it owns every status for that fund. The older application row is
 * frozen history and must not produce its own "accreditation needed" or
 * "funding not started" prompts. Nothing here writes or deletes anything.
 */

export type OnboardingRef = { offering_id: string | null | undefined };
export type ApplicationRef = { offering_id?: string | null };

/** Funds for which a current investment record exists for this person. */
export function canonicalFundIds(onboardings: readonly OnboardingRef[] | null | undefined): Set<string> {
  const ids = new Set<string>();
  for (const o of onboardings ?? []) if (o?.offering_id) ids.add(String(o.offering_id));
  return ids;
}

/** Older application rows that are not covered by a current investment record. */
export function liveLegacyApplications<T extends ApplicationRef>(
  applications: readonly T[] | null | undefined,
  onboardings: readonly OnboardingRef[] | null | undefined,
): T[] {
  const owned = canonicalFundIds(onboardings);
  return (applications ?? []).filter((a) => !a?.offering_id || !owned.has(String(a.offering_id)));
}

const TERMINAL = new Set(["closed", "complete", "declined", "cancelled"]);

/** An investment that is still being worked on (not closed, completed, declined or cancelled). */
export function isOpenOnboarding(o: { stage?: string | null; closed_at?: string | null }): boolean {
  return !o.closed_at && !TERMINAL.has(String(o.stage ?? ""));
}

/** The investment record to open for a fund: an open one first, otherwise the most recent. */
export function preferredOnboarding<T extends { id: string; stage?: string | null; closed_at?: string | null; updated_at?: string | null }>(
  onboardings: readonly T[] | null | undefined,
): T | null {
  const list = [...(onboardings ?? [])];
  if (!list.length) return null;
  const newest = (a: T, b: T) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? ""));
  const open = list.filter(isOpenOnboarding).sort(newest);
  return open[0] ?? list.sort(newest)[0] ?? null;
}

/** A finished investment: closed or completed (declined/cancelled are not "invested"). */
export function isCompletedOnboarding(o: { stage?: string | null; closed_at?: string | null }): boolean {
  const s = String(o.stage ?? "");
  return s === "closed" || s === "complete" || (Boolean(o.closed_at) && s !== "declined" && s !== "cancelled");
}

/**
 * "Funds you're invited to" card for one fund. An open investment continues;
 * a closed/completed one means the invitation is already used, so the card is
 * hidden instead of offering "Start investing" again. Display only.
 */
export function invitedFundState<T extends { id: string; stage?: string | null; closed_at?: string | null; updated_at?: string | null }>(
  onboardings: readonly T[] | null | undefined,
): { show: boolean; onboardingId: string | null } {
  const list = onboardings ?? [];
  const open = list.filter(isOpenOnboarding);
  if (open.length) return { show: true, onboardingId: preferredOnboarding(open)?.id ?? null };
  if (list.some(isCompletedOnboarding)) return { show: false, onboardingId: null };
  return { show: true, onboardingId: null };
}

export type SubscriptionBadge = { label: string; status: string };
const STEP_KEYS = ["about_you", "verification", "sign", "fund"] as const;

/**
 * "Your subscriptions" badges for a current investment record, from the same
 * canonical progress the investor dashboard uses (About You, Verification,
 * Sign, Fund). Never reads the older application row.
 */
export function investmentSubscriptionBadges(inv: { step: number; complete: boolean; fundingState: string }): SubscriptionBadge[] {
  const progress = inv.complete ? "complete" : STEP_KEYS[inv.step] ?? "in_progress";
  const funding = inv.fundingState === "not_ready" ? "not_ready_to_fund" : inv.fundingState;
  return [
    { label: inv.complete ? "Investment" : "Current step", status: progress },
    { label: "Funding", status: funding },
  ];
}
