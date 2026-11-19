/** Staff-only label change for test investors; logged on the investment's event history. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertStaff } from "@/lib/investor-onboarding.server";
import { testInvestorChangeError } from "@/lib/test-investor";

const db = () => supabaseAdmin as any;

export async function setTestInvestor(userId: string, input: { onboardingId: string; isTest: boolean; reason: string }) {
  const actor = await assertStaff(userId);
  const reason = input.reason.trim();
  if (reason.length < 3) throw new Error("Add a short reason.");
  const { data: row } = await db().from("investor_onboardings").select("id, offering_id, person_id, investor_user_id, is_test_investor").eq("id", input.onboardingId).maybeSingle();
  if (!row) throw new Error("That investment was not found.");
  const [{ data: person }, { data: login }] = await Promise.all([
    row.person_id ? db().from("persons").select("email").eq("id", row.person_id).maybeSingle() : { data: null },
    row.investor_user_id ? db().from("profiles").select("email").eq("user_id", row.investor_user_id).maybeSingle() : { data: null },
  ]);
  const problem = testInvestorChangeError(input.isTest, [person?.email, login?.email]);
  if (problem) throw new Error(problem);
  if (!!row.is_test_investor === input.isTest) return { isTest: input.isTest, changed: false };
  const { error } = await db().from("investor_onboardings").update({ is_test_investor: input.isTest }).eq("id", row.id);
  if (error) throw new Error("The label could not be saved. Please try again.");
  await db().from("investor_onboarding_events").insert({
    onboarding_id: row.id, offering_id: row.offering_id, event: input.isTest ? "test_investor_marked" : "test_investor_unmarked",
    detail: { reason }, actor_user_id: actor.userId, actor_role: "harmonious",
  });
  return { isTest: input.isTest, changed: true };
}
