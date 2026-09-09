import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const INVESTOR_TYPES = ["individual", "joint", "entity", "trust", "ira"] as const;

/**
 * Funds this investor has been invited to, whether they have already applied,
 * and everything the apply form needs to prefill itself.
 */
export const listFundsToJoin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const [{ data: access }, { data: applications }, { data: profile }] = await Promise.all([
      supabase.from("investor_fund_access").select("offering_id").eq("user_id", userId),
      supabase
        .from("investor_applications")
        .select("id, offering_id, status, current_step, commitment_cents, created_at, manager_review_status")
        .eq("user_id", userId),
      supabase
        .from("profiles")
        .select("legal_name, email, investor_type, entity_name")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    const applicationByOffering = new Map<string, any>(
      ((applications ?? []) as any[]).map((a) => [a.offering_id as string, a]),
    );
    const offeringIds = Array.from(
      new Set([
        ...((access ?? []) as any[]).map((a) => a.offering_id as string),
        ...applicationByOffering.keys(),
      ]),
    );

    if (offeringIds.length === 0) {
      return { funds: [], profile: profile ?? null };
    }

    const [{ data: offerings }, { data: rooms }, { data: acceptances }] = await Promise.all([
      supabase
        .from("offerings")
        .select(
          "id, name, reg_type, summary, min_investment_cents, target_raise_cents, share_price_cents, is_open",
        )
        .in("id", offeringIds),
      supabase
        .from("diligence_rooms")
        .select("id, offering_id, nda_required, nda_version")
        .in("offering_id", offeringIds),
      supabase.from("diligence_nda_acceptances").select("room_id, nda_version").eq("user_id", userId),
    ]);

    const acceptedVersions = new Map<string, number>(
      ((acceptances ?? []) as any[]).map((a) => [a.room_id as string, Number(a.nda_version)]),
    );
    const roomByOffering = new Map<string, any>(
      ((rooms ?? []) as any[]).map((r) => [r.offering_id as string, r]),
    );

    const funds = ((offerings ?? []) as any[])
      .map((o) => {
        const room = roomByOffering.get(o.id);
        const ndaRequired = Boolean(room?.nda_required);
        const ndaAccepted =
          !ndaRequired ||
          (room ? acceptedVersions.get(room.id) === Number(room.nda_version) : false);
        const application = applicationByOffering.get(o.id) ?? null;
        return {
          id: o.id as string,
          name: o.name as string,
          reg_type: o.reg_type as string,
          summary: (o.summary as string) ?? null,
          min_investment_cents: Number(o.min_investment_cents ?? 0),
          target_raise_cents: Number(o.target_raise_cents ?? 0),
          share_price_cents: Number(o.share_price_cents ?? 0),
          is_open: Boolean(o.is_open),
          hasRoom: Boolean(room),
          ndaRequired,
          ndaAccepted,
          application,
        };
      })
      .sort((a, b) => Number(Boolean(a.application)) - Number(Boolean(b.application)));

    return { funds, profile: profile ?? null };
  });

/** Create this investor's application to join a fund and start the onboarding steps. */
export const applyToFund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        offering_id: z.string().uuid(),
        legal_name: z.string().trim().min(2).max(120),
        entity_name: z.string().trim().max(160).optional(),
        investor_type: z.enum(INVESTOR_TYPES),
        amount: z.string().trim().min(1).max(20),
        accredited: z.boolean(),
        agree: z.boolean(),
        signed_name: z.string().trim().min(2).max(120),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    if (!data.accredited) {
      throw new Error("Please confirm you meet the accredited investor standard.");
    }
    if (!data.agree) {
      throw new Error("Please agree to the application statement before submitting.");
    }
    if (data.signed_name.toLowerCase() !== data.legal_name.toLowerCase()) {
      throw new Error("Your signature must match the legal name you entered.");
    }

    const amount = Number(data.amount.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Enter the amount you intend to invest.");
    }
    const commitmentCents = Math.round(amount * 100);

    const { data: offering, error: offeringError } = await supabase
      .from("offerings")
      .select("id, name, min_investment_cents, is_open")
      .eq("id", data.offering_id)
      .maybeSingle();
    if (offeringError) throw new Error(offeringError.message);
    if (!offering) throw new Error("That fund is not available.");
    if (!offering.is_open) throw new Error("That fund is not accepting new investors right now.");

    const minimum = Number(offering.min_investment_cents ?? 0);
    if (minimum > 0 && commitmentCents < minimum) {
      throw new Error(
        `The minimum investment for ${offering.name} is $${(minimum / 100).toLocaleString("en-US")}.`,
      );
    }

    const { data: access } = await supabase
      .from("investor_fund_access")
      .select("offering_id")
      .eq("user_id", userId)
      .eq("offering_id", data.offering_id)
      .maybeSingle();
    if (!access) {
      throw new Error("You need an invitation to this fund before you can apply.");
    }

    // The confidentiality agreement, when the fund requires one, comes first.
    const { data: room } = await supabase
      .from("diligence_rooms")
      .select("id, nda_required, nda_version")
      .eq("offering_id", data.offering_id)
      .maybeSingle();
    if (room?.nda_required) {
      const { data: acceptance } = await supabase
        .from("diligence_nda_acceptances")
        .select("id")
        .eq("room_id", room.id)
        .eq("user_id", userId)
        .eq("nda_version", room.nda_version)
        .maybeSingle();
      if (!acceptance) {
        throw new Error("Please accept the confidentiality agreement for this fund first.");
      }
    }

    const { data: existing } = await supabase
      .from("investor_applications")
      .select("id")
      .eq("user_id", userId)
      .eq("offering_id", data.offering_id)
      .maybeSingle();
    if (existing) {
      return { application_id: existing.id as string, created: false };
    }

    await supabase.from("profiles").upsert(
      {
        user_id: userId,
        legal_name: data.legal_name,
        entity_name: data.entity_name?.trim() ? data.entity_name.trim() : null,
        investor_type: data.investor_type,
      },
      { onConflict: "user_id" },
    );

    const { data: application, error } = await supabase
      .from("investor_applications")
      .insert({
        user_id: userId,
        offering_id: data.offering_id,
        status: "in_progress",
        current_step: "kyc",
        source: "portal",
        commitment_cents: commitmentCents,
      })
      .select("id")
      .single();
    if (error || !application) {
      throw new Error(error?.message ?? "Could not start your application.");
    }

    return { application_id: application.id as string, created: true };
  });
