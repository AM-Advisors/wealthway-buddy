/**
 * Investor sign-off: before Harmonious records capital for an investor, the
 * investor confirms in the portal which fund they are investing in and the
 * commitment amount. Sign-offs are versioned snapshots and are never edited —
 * if the commitment changes, the investor signs again.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** The statements an investor confirms when they sign. */
export const SIGNOFF_ACKNOWLEDGEMENTS = [
  "I confirm the fund named below is the fund I intend to invest in.",
  "I confirm the commitment amount shown below is correct.",
  "I understand Harmonious provides fund administration and recordkeeping only, and is not my investment adviser, broker-dealer, custodian or legal counsel.",
  "I understand my capital is recorded once my funds are received and my closing is confirmed.",
  "I agree that my typed name below is my electronic signature.",
] as const;

export type InvestorSignoffRecord = {
  id: string;
  version: number;
  fundName: string;
  commitmentCents: number;
  sharePriceCents: number | null;
  signerName: string;
  signerTitle: string | null;
  signedAt: string;
  acknowledgements: string[];
};

export type InvestorSignoffView = {
  applicationId: string | null;
  offeringId: string | null;
  fundName: string | null;
  commitmentCents: number;
  sharePriceCents: number | null;
  status: "no_application" | "no_commitment" | "unsigned" | "outdated" | "signed";
  latest: InvestorSignoffRecord | null;
  history: InvestorSignoffRecord[];
  acknowledgements: string[];
};

function toRecord(row: any): InvestorSignoffRecord {
  return {
    id: row.id,
    version: Number(row.version ?? 1),
    fundName: row.fund_name,
    commitmentCents: Number(row.commitment_cents ?? 0),
    sharePriceCents: row.share_price_cents == null ? null : Number(row.share_price_cents),
    signerName: row.signer_name,
    signerTitle: row.signer_title ?? null,
    signedAt: row.signed_at,
    acknowledgements: Array.isArray(row.acknowledgements) ? (row.acknowledgements as string[]) : [],
  };
}

/** What the investor sees: their fund, commitment and where the sign-off stands. */
export const getMyInvestorSignoff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InvestorSignoffView> => {
    const { supabase, userId } = context;
    const { activeApplicationId, NO_APPLICATION } = await import("@/lib/active-application");
    const applicationId = await activeApplicationId(supabase, userId);

    const empty: InvestorSignoffView = {
      applicationId: null,
      offeringId: null,
      fundName: null,
      commitmentCents: 0,
      sharePriceCents: null,
      status: "no_application",
      latest: null,
      history: [],
      acknowledgements: [...SIGNOFF_ACKNOWLEDGEMENTS],
    };
    if (applicationId === NO_APPLICATION) return empty;

    const { data: app } = await supabase
      .from("investor_applications")
      .select("id, offering_id, commitment_cents")
      .eq("id", applicationId)
      .maybeSingle();
    if (!app) return empty;

    const [{ data: offering }, { data: rows }] = await Promise.all([
      supabase
        .from("offerings")
        .select("id, name, share_price_cents")
        .eq("id", app.offering_id)
        .maybeSingle(),
      supabase
        .from("investor_signoffs")
        .select("*")
        .eq("application_id", app.id)
        .order("version", { ascending: false }),
    ]);

    const history = ((rows ?? []) as any[]).map(toRecord);
    const latest = history[0] ?? null;
    const commitmentCents = Number(app.commitment_cents ?? 0);

    let status: InvestorSignoffView["status"];
    if (commitmentCents <= 0) status = "no_commitment";
    else if (!latest) status = "unsigned";
    else if (latest.commitmentCents !== commitmentCents) status = "outdated";
    else status = "signed";

    return {
      applicationId: app.id,
      offeringId: app.offering_id,
      fundName: offering?.name ?? "Your fund",
      commitmentCents,
      sharePriceCents: offering?.share_price_cents == null ? null : Number(offering.share_price_cents),
      status,
      latest,
      history,
      acknowledgements: [...SIGNOFF_ACKNOWLEDGEMENTS],
    };
  });

/** The investor signs off on their fund and commitment. */
export const signInvestorCommitment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        application_id: z.string().uuid(),
        signer_name: z.string().min(2).max(120),
        signer_title: z.string().max(120).optional().nullable(),
        confirmed_commitment_cents: z.number().int().nonnegative(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: app } = await supabase
      .from("investor_applications")
      .select("id, user_id, offering_id, commitment_cents")
      .eq("id", data.application_id)
      .maybeSingle();
    if (!app || app.user_id !== userId) {
      throw new Error("That subscription was not found on your account.");
    }

    const commitmentCents = Number(app.commitment_cents ?? 0);
    if (commitmentCents <= 0) {
      throw new Error("Your commitment amount has not been set yet, so there is nothing to approve.");
    }
    if (commitmentCents !== data.confirmed_commitment_cents) {
      throw new Error("Your commitment amount changed while you were signing. Please review it again.");
    }

    const { data: offering } = await supabase
      .from("offerings")
      .select("name, share_price_cents")
      .eq("id", app.offering_id)
      .maybeSingle();

    const { data: existing } = await supabase
      .from("investor_signoffs")
      .select("version, commitment_cents")
      .eq("application_id", app.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing && Number(existing.commitment_cents ?? 0) === commitmentCents) {
      return { ok: true, alreadySigned: true };
    }

    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const ip =
      getRequestHeader("cf-connecting-ip") ??
      getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ??
      null;

    const { error } = await supabase.from("investor_signoffs").insert({
      application_id: app.id,
      offering_id: app.offering_id,
      user_id: userId,
      version: Number(existing?.version ?? 0) + 1,
      fund_name: offering?.name ?? "Fund",
      commitment_cents: commitmentCents,
      share_price_cents: offering?.share_price_cents ?? null,
      acknowledgements: SIGNOFF_ACKNOWLEDGEMENTS,
      signer_name: data.signer_name.trim(),
      signer_title: data.signer_title?.trim() ? data.signer_title.trim() : null,
      ip_address: ip,
      user_agent: getRequestHeader("user-agent") ?? null,
    });
    if (error) throw new Error(error.message);

    try {
      const activity = await import("@/lib/reviewer-activity.server");
      await activity.logReviewerActivity(supabase, {
        actorId: userId,
        applicationId: app.id,
        offeringId: app.offering_id,
        action: "investor_signoff_signed",
        area: "closing",
        outcome: "completed",
        summary: `Investor approved their fund and commitment`,
        note: null,
        metadata: { commitment_cents: commitmentCents },
      });
    } catch (e) {
      console.error("[investor signoff] activity not logged", e);
    }

    return { ok: true, alreadySigned: false };
  });
