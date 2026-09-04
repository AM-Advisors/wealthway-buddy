import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertReviewer(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "fund_manager"]);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Forbidden: reviewer access required.");
  return (data as any[]).map((r) => r.role as string);
}

/** Funds the signed-in reviewer can work in: assigned funds, or all funds for admins. */
export const getManagerFunds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const roles = await assertReviewer(supabase, userId);
    const isAdmin = roles.includes("admin");

    let offeringIds: string[] | null = null;
    if (!isAdmin) {
      const { data: assignments, error } = await supabase
        .from("fund_managers")
        .select("offering_id")
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
      offeringIds = [...new Set((assignments ?? []).map((a: any) => a.offering_id as string))];
      if (offeringIds.length === 0) return { isAdmin, funds: [] as any[] };
    }

    let query = supabase
      .from("offerings")
      .select("id, name, slug, reg_type, is_open, min_investment_cents, target_raise_cents")
      .order("name");
    if (offeringIds) query = query.in("id", offeringIds);

    const { data: funds, error: fundsError } = await query;
    if (fundsError) throw new Error(fundsError.message);
    return { isAdmin, funds: funds ?? [] };
  });

const overviewSchema = z.object({ offeringId: z.string().uuid() });

/** Investor roster plus stage counts for one fund. */
export const getFundOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => overviewSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertReviewer(supabase, userId);

    const { data: offering, error: offeringError } = await supabase
      .from("offerings")
      .select("id, name, reg_type, is_open, min_investment_cents, target_raise_cents")
      .eq("id", data.offeringId)
      .maybeSingle();
    if (offeringError) throw new Error(offeringError.message);
    if (!offering) throw new Error("Fund not found, or you do not have access to it.");

    const { data: rows, error } = await supabase
      .from("investor_applications")
      .select(
        "id, user_id, status, current_step, kyc_status, aml_status, accreditation_status, documents_status, funding_status, commitment_cents, submitted_at, created_at, updated_at",
      )
      .eq("offering_id", data.offeringId)
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const applications = rows ?? [];
    const userIds = [...new Set(applications.map((r: any) => r.user_id as string))];
    const { data: profiles } = userIds.length
      ? await supabase
          .from("profiles")
          .select("user_id, legal_name, email, investor_type")
          .in("user_id", userIds)
      : { data: [] as any[] };
    const profileMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));

    const counts = {
      total: applications.length,
      identity: 0,
      accreditation: 0,
      documents: 0,
      funding: 0,
      complete: 0,
    };
    let committedCents = 0;
    let settledCents = 0;

    for (const app of applications as any[]) {
      committedCents += app.commitment_cents ?? 0;
      if (app.funding_status === "settled") {
        counts.complete += 1;
        settledCents += app.commitment_cents ?? 0;
        continue;
      }
      if (app.kyc_status !== "approved" || app.aml_status !== "approved") counts.identity += 1;
      else if (app.accreditation_status !== "approved") counts.accreditation += 1;
      else if (app.documents_status !== "approved") counts.documents += 1;
      else counts.funding += 1;
    }

    return {
      offering,
      counts,
      committedCents,
      settledCents,
      investors: (applications as any[]).map((app) => ({
        ...app,
        profile: profileMap.get(app.user_id) ?? null,
      })),
    };
  });
