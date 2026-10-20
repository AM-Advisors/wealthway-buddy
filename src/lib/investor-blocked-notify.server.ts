/**
 * Alerts Harmonious (#operations Slack) and the fund's managers (email) when an
 * investor hits a step that cannot start. Best-effort: never throws, never
 * blocks the investor. Carries only investor name, fund, step and a link.
 */
export type BlockedStep = "Verification" | "Signing" | "Funding instructions";

export function blockedEmailKey(onboardingId: string, step: BlockedStep, at = Date.now()) {
  return `investor-blocked:${onboardingId}:${step}:${Math.floor(at / 3_600_000)}`;
}

export async function notifyInvestorBlocked(n: { onboardingId: string; offeringId: string; investorUserId: string | null; step: BlockedStep }) {
  try {
    const { supabaseAdmin: db } = (await import("@/integrations/supabase/client.server")) as any;
    const [{ data: fund }, { data: prof }] = await Promise.all([
      db.from("offerings").select("name").eq("id", n.offeringId).maybeSingle(),
      n.investorUserId ? db.from("profiles").select("legal_name, email").eq("user_id", n.investorUserId).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const investor = prof?.legal_name || "An investor";
    const { notifySubmission } = await import("@/lib/ops-slack-notify.server");
    await notifySubmission({
      kind: "investor_blocked",
      title: `Investor blocked at ${n.step} - ${investor}`,
      offeringId: n.offeringId,
      ref: `${n.onboardingId}:${n.step}:${Math.floor(Date.now() / 3_600_000)}`,
      once: true,
      path: `/ops/fund/${n.offeringId}`,
    });
    const { data: mgrs } = await db.from("fund_managers").select("user_id").eq("offering_id", n.offeringId);
    const ids = ((mgrs ?? []) as any[]).map((m) => m.user_id).filter(Boolean);
    if (!ids.length) return;
    const { data: people } = await db.from("profiles").select("legal_name, email").in("user_id", ids);
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    for (const p of (people ?? []) as any[]) {
      if (!p.email) continue;
      try {
        await sendTemplateEmail("manager-alert", p.email, {
          idempotencyKey: `${blockedEmailKey(n.onboardingId, n.step)}:${String(p.email).toLowerCase()}`,
          templateData: {
            managerName: p.legal_name || "there",
            headline: `An investor needs help with ${n.step}`,
            intro: `${investor} couldn't continue past ${n.step}. Harmonious has been notified and is following up.`,
            offeringName: fund?.name ?? "your fund",
            details: [{ label: "Investor", value: investor }, { label: "Step", value: n.step }],
            portalUrl: `https://app.harmonious.co/client/funds/${n.offeringId}?tab=investors`,
          },
        });
      } catch (e) { console.error("investor blocked email", e); }
    }
  } catch (e) {
    console.error("investor blocked notify", e);
  }
}
