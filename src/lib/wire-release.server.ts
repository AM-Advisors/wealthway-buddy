import { EMPTY_WIRE_RELEASE, parseWireReleaseState, type WireReleaseState } from "@/lib/wire-release";

/** Server-only read of the single wire-release rule for one fund. */
export async function wireReleaseState(offeringId: string): Promise<WireReleaseState> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any).rpc("offering_wire_release_state", { p_offering_id: offeringId });
  if (error) throw new Error("Funding instruction status is unavailable.");
  return data ? parseWireReleaseState(data) : EMPTY_WIRE_RELEASE;
}

export async function wireReleaseStates(offeringIds: string[]): Promise<Map<string, WireReleaseState>> {
  const unique = [...new Set(offeringIds.filter(Boolean))];
  const entries = await Promise.all(unique.map(async (id) => [id, await wireReleaseState(id).catch(() => EMPTY_WIRE_RELEASE)] as const));
  return new Map(entries);
}

/**
 * After the instructions become available, tell each approved investor once.
 * One email per investor's own investment; the idempotency key is tied to the
 * released version so a retry never duplicates it.
 */
export async function notifyInvestorsInstructionsAvailable(offeringId: string, version: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any).from("investor_onboardings")
    .select("id, stage, funding_status")
    .eq("offering_id", offeringId).not("approved_to_fund_at", "is", null).is("removed_at", null);
  const { isReconciledFunding } = await import("@/lib/funding-status");
  const { notifyInvestorApproval } = await import("@/lib/investor-approval-notify.server");
  for (const ob of (data ?? []) as any[]) {
    if (["closed", "declined", "cancelled"].includes(ob.stage) || isReconciledFunding(ob.funding_status)) continue;
    await notifyInvestorApproval({ onboardingId: ob.id, action: "fund", ref: `released:${offeringId}:v${version}:${ob.id}` });
  }
}
