/**
 * One money-received path: older application-level confirmations (manual wire
 * approval, bank-feed matching) hand off to the investment's canonical receipt
 * posting, so "funded" means the same thing on every screen. Never moves money.
 */
export async function syncReceiptToInvestment(
  userId: string,
  input: { applicationId: string; bankTransactionId?: string | null },
): Promise<{ synced: boolean; note: string | null }> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ob } = await (supabaseAdmin as any).from("investor_onboardings")
      .select("id, funding_status").eq("application_id", input.applicationId).is("removed_at", null).maybeSingle();
    if (!ob) return { synced: false, note: null };
    const engine = await import("@/lib/investor-onboarding.server");
    if (input.bankTransactionId) {
      await engine.applyBankActivity(userId, { bankTransactionId: input.bankTransactionId, onboardingId: ob.id });
      return { synced: true, note: null };
    }
    if (ob.funding_status === "funded") return { synced: true, note: null };
    // No bank transaction to post: flag it so Operations matches the deposit, rather than inferring "funded".
    await engine.raiseException(userId, {
      onboardingId: ob.id,
      type: "receipt_needs_bank_match",
      severity: "warning",
      detail: "A wire was confirmed on the application. Match the bank deposit to finish recording funding.",
    });
    return { synced: false, note: "Match the bank deposit to finish recording funding on the investment." };
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (/already been applied/i.test(message)) return { synced: true, note: null };
    console.error("[receipt-sync] investment not updated", message);
    return { synced: false, note: "The investment's funding record needs a Harmonious review." };
  }
}
