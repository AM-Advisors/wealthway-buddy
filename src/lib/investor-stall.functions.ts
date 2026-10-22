import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/require-auth";

/** Staff-only, read-only: who is stuck before verification and why. */
export const getInvestorStallReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertStaff } = await import("@/lib/investor-onboarding.server");
    await assertStaff(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { summarizeStalls } = await import("@/lib/investor-stall-model");
    const { data, error } = await supabaseAdmin
      .from("investor_onboardings")
      .select("stage, entry_source, investor_user_id, questionnaire_responses, last_activity_at, updated_at, offerings(name)")
      .in("stage", ["profile_selected", "started"])
      .is("removed_at", null)
      .is("merged_into_onboarding_id", null)
      .limit(5000);
    if (error) throw new Error("Could not load the report.");
    const rows = (data ?? []).map((r: any) => ({
      fundName: r.offerings?.name ?? "Unknown fund",
      stage: r.stage,
      entrySource: r.entry_source,
      hasLogin: !!r.investor_user_id,
      hasAnswers: !!r.questionnaire_responses && Object.keys(r.questionnaire_responses).length > 0,
      lastActivityAt: r.last_activity_at ?? r.updated_at,
    }));
    return { funds: summarizeStalls(rows), total: rows.length };
  });
