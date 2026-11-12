/**
 * Whether the caller's own investment behind one application is already closed (admitted), and
 * what the outside-signature record says about its Subscription Agreement. Reads only the
 * caller's own records: the investment linked to this application, otherwise their single
 * unlinked investment in the fund, and holdings tied to that investment or application.
 * Read-only: never changes a stage, signature or document.
 */
import type { OutsideSubscription } from "@/lib/outside-subscription-document";

export type ClosedInvestment = {
  onboardingId: string | null;
  closed: boolean;
  closedOn: string | null;
  outside: OutsideSubscription | null;
};

export async function closedInvestmentFor(
  admin: any,
  userId: string,
  input: { offeringId: string; applicationId: string },
): Promise<ClosedInvestment> {
  const { data: obs, error } = await admin
    .from("investor_onboardings")
    .select("id, application_id, stage, closed_at, position_id")
    .eq("investor_user_id", userId)
    .eq("offering_id", input.offeringId)
    .is("removed_at", null);
  if (error) throw new Error("Your investment status could not be loaded. Please try again.");
  const list = (obs ?? []) as { id: string; application_id: string | null; stage: string; closed_at: string | null; position_id: string | null }[];
  const match =
    list.find((o) => o.application_id === input.applicationId) ??
    (list.length === 1 && !list[0]!.application_id ? list[0]! : null);

  let positionQuery = admin
    .from("investor_positions")
    .select("id, status, admitted_on")
    .eq("investor_user_id", userId)
    .eq("offering_id", input.offeringId)
    .eq("status", "active");
  positionQuery = match?.position_id
    ? positionQuery.or(`id.eq.${match.position_id},application_id.eq.${input.applicationId}`)
    : positionQuery.eq("application_id", input.applicationId);
  const { data: positions, error: posError } = await positionQuery.limit(1);
  if (posError) throw new Error("Your investment status could not be loaded. Please try again.");
  const position = ((positions ?? []) as { admitted_on: string | null }[])[0] ?? null;

  const closed = match?.stage === "closed" || Boolean(position);
  const closedOn = (match?.closed_at ? match.closed_at.slice(0, 10) : null) ?? position?.admitted_on ?? null;

  let outside: OutsideSubscription | null = null;
  if (match) {
    const { outsideSubscriptionStates } = await import("@/lib/prior-signed-documents.server");
    outside = (await outsideSubscriptionStates(admin, [match.id])).get(match.id) ?? null;
  }
  return { onboardingId: match?.id ?? null, closed, closedOn, outside };
}
