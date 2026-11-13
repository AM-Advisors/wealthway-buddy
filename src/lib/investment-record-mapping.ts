/**
 * One rule for joining an investor's current investment record
 * (investor_onboardings) with the older application rows
 * (investor_applications) that some signing, funding, roster and ownership
 * readers still use. Pure: nothing here reads or writes the database.
 *
 * - An open, live investment owns its fund for that login: its exactly
 *   linked application is the one older readers act on.
 * - Older application rows in the same fund that are not linked to it are
 *   frozen history. They are never relinked or deleted, and never shown as a
 *   second, separate investor while they hold no money or units.
 * - Investments with no linked application are still listed on their own,
 *   so rosters and ownership tables never drop modern investors.
 */
import { isLiveInvestment } from "@/lib/investment-amounts";
import { isOpenOnboarding, preferredOnboarding } from "@/lib/legacy-application-supersede";

export type InvestmentRef = {
  id: string;
  offering_id?: string | null;
  investor_user_id?: string | null;
  application_id?: string | null;
  stage?: string | null;
  closed_at?: string | null;
  updated_at?: string | null;
  removed_at?: string | null;
  merged_into_onboarding_id?: string | null;
};

export type ApplicationRef = { id: string; user_id?: string | null; offering_id?: string | null; persona_id?: string | null };

export type FundApplicationChoice =
  | { kind: "linked"; applicationId: string; onboardingId: string }
  | { kind: "unlinked"; onboardingId: string }
  | { kind: "legacy" };

/**
 * Which application the older fund-scoped readers should use for one login in
 * one fund. "legacy" keeps the previous behavior (only older records exist,
 * or several open investments make the choice ambiguous).
 */
export function currentFundApplication(
  investments: readonly InvestmentRef[],
  applications: readonly ApplicationRef[],
  personaId: string | null,
): FundApplicationChoice {
  const open = investments.filter((o) => isLiveInvestment(o) && isOpenOnboarding(o));
  if (!open.length) return { kind: "legacy" };
  const apps = new Map(applications.map((a) => [a.id, a]));
  const linked = open.filter((o) => o.application_id && apps.has(o.application_id));
  if (linked.length === 1) {
    const only = linked[0]!;
    return { kind: "linked", applicationId: only.application_id!, onboardingId: only.id };
  }
  if (linked.length > 1) {
    const mine = linked.filter((o) => personaId && apps.get(o.application_id!)?.persona_id === personaId);
    if (mine.length === 1) return { kind: "linked", applicationId: mine[0]!.application_id!, onboardingId: mine[0]!.id };
    return { kind: "legacy" };
  }
  const pick = preferredOnboarding(open);
  return pick ? { kind: "unlinked", onboardingId: pick.id } : { kind: "legacy" };
}

/**
 * The investment the older identity page should hand the investor to, so it
 * never starts a second, unconnected application. A matching fund wins; with
 * no older application at all, any open investment is used.
 */
export function investmentToOpen(
  investments: readonly InvestmentRef[],
  offeringId: string | null,
  hasApplication: boolean,
): string | null {
  const open = investments.filter((o) => isLiveInvestment(o) && isOpenOnboarding(o));
  if (!open.length) return null;
  const sameFund = offeringId ? open.filter((o) => o.offering_id === offeringId) : [];
  if (sameFund.length) return preferredOnboarding(sameFund)?.id ?? null;
  if (hasApplication) return null;
  return preferredOnboarding(open)?.id ?? null;
}

/**
 * Joins one fund's applications and investments into a single roster.
 * Each live investment appears once; its linked application is folded into
 * it. Unlinked applications stay listed unless the same login has a live
 * investment in this fund and the application holds nothing, in which case it
 * is marked as replaced (kept for history, left out of totals).
 */
export function joinFundRecords<A extends ApplicationRef, I extends InvestmentRef>(
  applications: readonly A[],
  investments: readonly I[],
  holdsValue: (app: A) => boolean,
): {
  linked: { application: A; investment: I }[];
  applicationsOnly: A[];
  replaced: A[];
  investmentsOnly: I[];
} {
  const live = investments.filter(isLiveInvestment);
  const appById = new Map(applications.map((a) => [a.id, a]));
  const linked: { application: A; investment: I }[] = [];
  const used = new Set<string>();
  const investmentsOnly: I[] = [];
  for (const inv of live) {
    const app = inv.application_id ? appById.get(inv.application_id) : undefined;
    if (app && !used.has(app.id)) {
      linked.push({ application: app, investment: inv });
      used.add(app.id);
    } else investmentsOnly.push(inv);
  }
  const usersWithInvestment = new Set(live.map((o) => o.investor_user_id).filter(Boolean) as string[]);
  const applicationsOnly: A[] = [];
  const replaced: A[] = [];
  for (const app of applications) {
    if (used.has(app.id)) continue;
    if (app.user_id && usersWithInvestment.has(app.user_id) && !holdsValue(app)) replaced.push(app);
    else applicationsOnly.push(app);
  }
  return { linked, applicationsOnly, replaced, investmentsOnly };
}

export type OverviewStage = "identity" | "accreditation" | "documents" | "funding" | "complete";

/** Places a current investment in the older manager roster's stage groups from its four canonical steps. */
export function overviewStageForSteps(steps: readonly { key: string; state: string }[]): OverviewStage {
  const current = steps.find((s) => s.state !== "complete");
  if (!current) return "complete";
  if (current.key === "about_you" || current.key === "verification") return "identity";
  if (current.key === "sign") return "documents";
  return "funding";
}

/** An older application with any funding activity still holds value and is never hidden. */
export function applicationHoldsValue(app: { funding_status?: string | null }): boolean {
  return Boolean(app.funding_status) && app.funding_status !== "not_started";
}
