import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

/** Safe verification summary for one investor login across funds the caller may review. */
export const getInvestorVerificationSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ investorUserId: z.string().uuid().optional(), applicationId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { checkState, matchCount, reviewReason } = await import("@/lib/investor-verification-model");
    const [{ data: roles }, { data: managed }] = await Promise.all([
      db.from("user_roles").select("role").eq("user_id", context.userId),
      db.from("fund_managers").select("offering_id").eq("user_id", context.userId),
    ]);
    const isAdmin = ((roles ?? []) as any[]).some((r) => r.role === "admin");
    const managedIds = new Set(((managed ?? []) as any[]).map((m) => String(m.offering_id)));
    if (!isAdmin && !managedIds.size) throw new Error("Forbidden: reviewer access required.");
    if (!data.investorUserId && !data.applicationId) return { items: [] };

    let q = db.from("investor_applications").select("id, user_id, offering_id, kyc_status, aml_status, updated_at, offerings(name)");
    q = data.applicationId ? q.eq("id", data.applicationId) : q.eq("user_id", data.investorUserId);
    const { data: apps } = await q;
    const visible = ((apps ?? []) as any[]).filter((a) => isAdmin || managedIds.has(String(a.offering_id)));
    const ids = visible.map((a) => a.id);
    const [{ data: kyc }, { data: aml }] = ids.length
      ? await Promise.all([
          db.from("kyc_verifications").select("application_id, status, completed_at, updated_at").in("application_id", ids),
          db.from("aml_screenings").select("application_id, status, matches, completed_at, updated_at").in("application_id", ids),
        ])
      : [{ data: [] }, { data: [] }];
    const kBy = new Map(((kyc ?? []) as any[]).map((k) => [k.application_id, k]));
    const aBy = new Map(((aml ?? []) as any[]).map((k) => [k.application_id, k]));
    return {
      items: visible.map((a) => {
        const k = kBy.get(a.id); const s = aBy.get(a.id);
        const kState = checkState(a.kyc_status ?? k?.status);
        const aState = checkState(a.aml_status ?? s?.status);
        const n = matchCount(s?.matches);
        return {
          applicationId: a.id as string, offeringId: a.offering_id as string, fund: a.offerings?.name ?? "Fund",
          ownRecord: String(a.user_id) === context.userId,
          kyc: { state: kState, at: k?.completed_at ?? k?.updated_at ?? null, reason: reviewReason("kyc", kState, 0) },
          aml: { state: aState, at: s?.completed_at ?? s?.updated_at ?? null, matches: n, reason: reviewReason("aml", aState, n) },
        };
      }),
    };
  });
