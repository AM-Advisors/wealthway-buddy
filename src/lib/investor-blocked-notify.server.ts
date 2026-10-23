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
      title: `Investor blocked at ${n.step} | ${investor}`,
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

/** High-risk (bad-actor) "Yes" answers: #operations + fund managers. Question numbers only, never answers text. */
export async function notifyHighRiskDisclosure(n: { onboardingId: string; offeringId: string; investorUserId: string | null; questions: string; ref: string }) {
  try {
    const { supabaseAdmin: db } = (await import("@/integrations/supabase/client.server")) as any;
    const [{ data: fund }, { data: prof }] = await Promise.all([
      db.from("offerings").select("name").eq("id", n.offeringId).maybeSingle(),
      n.investorUserId ? db.from("profiles").select("legal_name").eq("user_id", n.investorUserId).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const investor = prof?.legal_name || "An investor";
    const { notifySubmission } = await import("@/lib/ops-slack-notify.server");
    await notifySubmission({
      kind: "high_risk_disclosure",
      title: `High-risk answer (question ${n.questions}) | ${investor}. May not be eligible; review before signing.`,
      offeringId: n.offeringId,
      ref: n.ref,
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
          idempotencyKey: `high-risk:${n.ref}:${String(p.email).toLowerCase()}`,
          templateData: {
            managerName: p.legal_name || "there",
            headline: "An investor marked Yes on a high-risk question",
            intro: `${investor} answered Yes to a high-risk eligibility question on the Subscription Agreement. This may make them ineligible to invest. Harmonious is reviewing, and signing and funding are paused until then.`,
            offeringName: fund?.name ?? "your fund",
            details: [{ label: "Investor", value: investor }, { label: "Question", value: n.questions }],
            portalUrl: `https://app.harmonious.co/client/funds/${n.offeringId}?tab=investors`,
          },
        });
      } catch (e) { console.error("high-risk email", e); }
    }
  } catch (e) {
    console.error("high-risk notify", e);
  }
}

/** Shared: email every manager of the fund once per idempotency ref. */
async function emailFundManagers(db: any, offeringId: string, ref: string, data: { headline: string; intro: string; details: { label: string; value: string }[] }) {
  const [{ data: fund }, { data: mgrs }] = await Promise.all([
    db.from("offerings").select("name").eq("id", offeringId).maybeSingle(),
    db.from("fund_managers").select("user_id").eq("offering_id", offeringId),
  ]);
  const ids = ((mgrs ?? []) as any[]).map((m) => m.user_id).filter(Boolean);
  if (!ids.length) return;
  const { data: people } = await db.from("profiles").select("legal_name, email").in("user_id", ids);
  const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
  for (const p of (people ?? []) as any[]) {
    if (!p.email) continue;
    try {
      await sendTemplateEmail("manager-alert", p.email, {
        idempotencyKey: `${ref}:${String(p.email).toLowerCase()}`,
        templateData: { managerName: p.legal_name || "there", ...data, offeringName: fund?.name ?? "your fund", portalUrl: `https://app.harmonious.co/manager/fund/${offeringId}/approvals` },
      });
    } catch (e) { console.error("manager email", e); }
  }
}

async function investorName(db: any, userId: string | null) {
  if (!userId) return "An investor";
  const { data } = await db.from("profiles").select("legal_name").eq("user_id", userId).maybeSingle();
  return data?.legal_name || "An investor";
}

/** One notice per signature: the investor finished signing; the manager can now approve or decline. */
export async function notifyInvestorSignedForReview(n: { offeringId: string; investorUserId: string | null; documentTitle: string; signatureId: string }) {
  try {
    const { supabaseAdmin: db } = (await import("@/integrations/supabase/client.server")) as any;
    const { data: sig } = await db.from('document_signatures').select('application_id').eq('id', n.signatureId).maybeSingle();
    if (!sig?.application_id) return;
    const { data: ob } = await db.from('investor_onboardings').select('id').eq('application_id', sig.application_id).eq('offering_id', n.offeringId).is('removed_at', null).maybeSingle();
    if (!ob) return;
    const { notifyInvestorApproval } = await import('@/lib/investor-approval-notify.server');
    await notifyInvestorApproval({ onboardingId: ob.id, action: 'review', ref: `signature:${n.signatureId}` });
  } catch (e) { console.error("investor signed notify", e); }
}

/** Manager declined signed documents: tell Harmonious once. */
export async function notifyDocumentsDeclined(n: { onboardingId: string; offeringId: string; investorUserId: string | null; documentTitle: string; ref: string }) {
  try {
    const { supabaseAdmin: db } = (await import("@/integrations/supabase/client.server")) as any;
    const investor = await investorName(db, n.investorUserId);
    const { notifySubmission } = await import("@/lib/ops-slack-notify.server");
    await notifySubmission({ kind: "manager_declined_documents", title: `Fund manager declined ${n.documentTitle} | ${investor}. Investment paused.`, offeringId: n.offeringId, ref: n.ref, once: true, path: `/ops/fund/${n.offeringId}` });
  } catch (e) { console.error("decline notify", e); }
}

/** Commitment below the fund minimum: Harmonious and the fund team learn a side letter is required. */
export async function notifySideLetterRequired(n: { onboardingId: string; offeringId: string; investorUserId: string | null; commitment: string; minimum: string }) {
  try {
    const { supabaseAdmin: db } = (await import("@/integrations/supabase/client.server")) as any;
    const investor = await investorName(db, n.investorUserId);
    const { notifySubmission } = await import("@/lib/ops-slack-notify.server");
    await notifySubmission({ kind: "side_letter_required", title: `Side letter required | ${investor} committed ${n.commitment}, below the ${n.minimum} minimum.`, offeringId: n.offeringId, ref: n.onboardingId, once: true, path: `/ops/fund/${n.offeringId}` });
    await emailFundManagers(db, n.offeringId, `side-letter:${n.onboardingId}`, {
      headline: "A side letter is required",
      intro: `${investor} committed ${n.commitment}, below this fund's ${n.minimum} minimum. A side letter is required to accept it. The side letter costs $1,500: pay it under Approvals and the side letter is generated as soon as payment is confirmed.`,
      details: [{ label: "Investor", value: investor }, { label: "Commitment", value: n.commitment }, { label: "Minimum", value: n.minimum }],
    });
  } catch (e) { console.error("side letter notify", e); }
}
