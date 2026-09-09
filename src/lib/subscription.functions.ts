import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const subscriptionSchema = z.object({
  amount: z
    .string()
    .trim()
    .regex(/^\d{1,12}(\.\d{1,2})?$/, "Enter your commitment amount, for example 250000"),
  ownership_title: z.string().trim().min(2, "Enter how the investment should be titled").max(160),
  tax_classification: z.enum([
    "individual",
    "joint",
    "entity",
    "trust",
    "ira",
  ]),
  payment_method: z.enum(["wire", "ach"]),
  signed_name: z.string().trim().min(2, "Type your full legal name").max(160),
  agree: z.literal(true),
});

/** The single application this investor is working through. */
async function loadApplication(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("investor_applications")
    .select("id, offering_id, status, funding_status, commitment_cents, accreditation_status")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

/** Once money is moving the commitment is locked — changes go through the fund team. */
function isLocked(app: { funding_status?: string | null }, payment: { status?: string } | null) {
  const fundingLocked = ["processing", "settled"].includes(String(app.funding_status ?? ""));
  const paymentLocked = ["processing", "settled"].includes(String(payment?.status ?? ""));
  return fundingLocked || paymentLocked;
}

export const getMySubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const application = await loadApplication(supabase, userId);
    if (!application) {
      return { application: null, offering: null, subscription: null, payment: null, locked: false };
    }

    const [{ data: offering }, { data: subscription }, { data: payment }] = await Promise.all([
      supabase
        .from("offerings")
        .select("id, name, reg_type, min_investment_cents, target_raise_cents, is_open")
        .eq("id", application.offering_id)
        .maybeSingle(),
      supabase
        .from("subscriptions")
        .select("*")
        .eq("application_id", application.id)
        .maybeSingle(),
      supabase
        .from("payments")
        .select("id, status, amount_cents")
        .eq("application_id", application.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    return {
      application,
      offering: offering ?? null,
      subscription: subscription ?? null,
      payment: payment ?? null,
      locked: isLocked(application, (payment as any) ?? null),
    };
  });

/**
 * The investor confirms the amount they are subscribing for and how they will
 * pay it. This is the record the fund team works from, so it also updates the
 * commitment on the application itself.
 */
export const confirmSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => subscriptionSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const application = await loadApplication(supabase, userId);
    if (!application) throw new Error("No application found.");

    const { data: payment } = await supabase
      .from("payments")
      .select("id, status")
      .eq("application_id", application.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (isLocked(application, (payment as any) ?? null)) {
      throw new Error(
        "Your payment is already in progress. Contact the fund team to change your commitment.",
      );
    }

    const { data: offering } = await supabase
      .from("offerings")
      .select("id, name, is_open, min_investment_cents")
      .eq("id", application.offering_id)
      .maybeSingle();
    if (!offering) throw new Error("That fund is no longer available.");
    if (offering.is_open === false) throw new Error("This fund is closed to new commitments.");

    const cents = Math.round(Number(data.amount) * 100);
    if (!Number.isFinite(cents) || cents <= 0) throw new Error("Enter a commitment amount.");
    const minimum = Number(offering.min_investment_cents ?? 0);
    if (minimum > 0 && cents < minimum) {
      throw new Error(
        `The minimum commitment for this fund is $${(minimum / 100).toLocaleString("en-US")}.`,
      );
    }

    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const forwarded = getRequestHeader("x-forwarded-for") ?? "";
    const ip = forwarded.split(",")[0]?.trim() || null;
    const userAgent = getRequestHeader("user-agent") ?? null;

    const row = {
      application_id: application.id,
      commitment_cents: cents,
      ownership_title: data.ownership_title,
      tax_classification: data.tax_classification,
      payment_method: data.payment_method,
      signed_name: data.signed_name,
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      confirmed_ip: ip,
      confirmed_user_agent: userAgent,
    };

    const { error: upsertError } = await supabase
      .from("subscriptions")
      .upsert(row, { onConflict: "application_id" });
    if (upsertError) throw new Error(upsertError.message);

    const { error: appError } = await supabase
      .from("investor_applications")
      .update({ commitment_cents: cents })
      .eq("id", application.id);
    if (appError) throw new Error(appError.message);

    return { ok: true, commitment_cents: cents };
  });

/** Reviewers are admins (all funds) and fund managers (their assigned funds). */
async function assertReviewer(supabase: any, userId: string, offeringId: string) {
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "fund_manager"]);
  const list = (roles ?? []).map((r: any) => r.role as string);
  if (list.includes("admin")) return;
  const { data: assignment } = await supabase
    .from("fund_managers")
    .select("id")
    .eq("user_id", userId)
    .eq("offering_id", offeringId)
    .maybeSingle();
  if (!assignment) throw new Error("Forbidden: you do not manage this fund.");
}

/** Live commitment balance for one fund: confirmed, received, still to come. */
export const getFundCommitmentBalance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ fundId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertReviewer(supabase, userId, data.fundId);

    const { data: offering } = await supabase
      .from("offerings")
      .select("id, name, target_raise_cents, min_investment_cents")
      .eq("id", data.fundId)
      .maybeSingle();

    const { data: apps } = await supabase
      .from("investor_applications")
      .select("id, user_id, funding_status, commitment_cents")
      .eq("offering_id", data.fundId);
    const rows = (apps ?? []) as any[];
    const ids = rows.map((r) => r.id);

    let subs: any[] = [];
    let payments: any[] = [];
    let profiles: any[] = [];
    if (ids.length) {
      const [{ data: s }, { data: p }, { data: pr }] = await Promise.all([
        supabase
          .from("subscriptions")
          .select("application_id, commitment_cents, status, payment_method, confirmed_at, ownership_title")
          .in("application_id", ids),
        supabase.from("payments").select("application_id, amount_cents, status").in("application_id", ids),
        supabase
          .from("profiles")
          .select("user_id, legal_name, email")
          .in("user_id", rows.map((r) => r.user_id)),
      ]);
      subs = (s ?? []) as any[];
      payments = (p ?? []) as any[];
      profiles = (pr ?? []) as any[];
    }

    const subByApp = new Map(subs.map((s) => [s.application_id, s]));
    const profileByUser = new Map(profiles.map((p) => [p.user_id, p]));

    const confirmedCents = subs
      .filter((s) => s.status === "confirmed")
      .reduce((sum, s) => sum + Number(s.commitment_cents ?? 0), 0);
    const committedCents = rows.reduce((sum, r) => sum + Number(r.commitment_cents ?? 0), 0);
    const receivedCents = payments
      .filter((p) => p.status === "settled")
      .reduce((sum, p) => sum + Number(p.amount_cents ?? 0), 0);
    const inFlightCents = payments
      .filter((p) => p.status === "processing" || p.status === "awaiting_wire")
      .reduce((sum, p) => sum + Number(p.amount_cents ?? 0), 0);

    const targetCents = Number(offering?.target_raise_cents ?? 0) || null;

    const investors = rows
      .map((r) => {
        const sub = subByApp.get(r.id);
        const profile = profileByUser.get(r.user_id);
        const paid = payments
          .filter((p) => p.application_id === r.id && p.status === "settled")
          .reduce((sum, p) => sum + Number(p.amount_cents ?? 0), 0);
        return {
          applicationId: r.id as string,
          name: (profile?.legal_name as string) ?? (profile?.email as string) ?? "Investor",
          commitmentCents: Number(sub?.commitment_cents ?? r.commitment_cents ?? 0),
          confirmed: sub?.status === "confirmed",
          confirmedAt: (sub?.confirmed_at as string) ?? null,
          paymentMethod: (sub?.payment_method as string) ?? null,
          ownershipTitle: (sub?.ownership_title as string) ?? null,
          fundingStatus: (r.funding_status as string) ?? "not_started",
          receivedCents: paid,
        };
      })
      .sort((a, b) => b.commitmentCents - a.commitmentCents);

    return {
      offering: offering ?? null,
      totals: {
        investors: rows.length,
        confirmedSubscriptions: subs.filter((s) => s.status === "confirmed").length,
        confirmedCents,
        committedCents,
        receivedCents,
        inFlightCents,
        outstandingCents: Math.max(0, committedCents - receivedCents),
        targetCents,
        remainingToTargetCents: targetCents ? Math.max(0, targetCents - receivedCents) : null,
        percentOfTarget:
          targetCents && targetCents > 0 ? Math.min(100, Math.round((receivedCents / targetCents) * 100)) : null,
        percentCommittedOfTarget:
          targetCents && targetCents > 0
            ? Math.min(100, Math.round((committedCents / targetCents) * 100))
            : null,
      },
      investors,
    };
  });
