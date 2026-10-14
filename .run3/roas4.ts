const A = "fcf83359-0486-402d-83b4-fd5484fb663d";
const F = "acb8193f-35fc-41cc-9ee5-629bde3e11b2";
const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server") as any;
const { questionsFromDidit, answersFromDidit } = await import("@/lib/didit-questionnaire");
async function qr(session: string) {
  const { data } = await db.from("didit_webhook_events").select("payload, received_at").eq("session_id", session).order("received_at", { ascending: false });
  return data.find((r: any) => r.payload?.decision?.questionnaire_responses?.length)?.payload.decision.questionnaire_responses;
}
const ex = await db.from("offering_questionnaires").select("id").eq("offering_id", F);
if (ex.data?.length) throw new Error("questionnaire exists");
const questions = questionsFromDidit(await qr("a4807639-c3f7-4632-833e-ccc25502a28d"));
const q = await db.from("offering_questionnaires").insert({ offering_id: F, version: 1, status: "published", questions, created_by: A, published_by: A, published_at: new Date().toISOString() }).select("id").single();
if (q.error) throw q.error;
const links = [["abd41c5a-0d70-445c-9fb7-ba8bbe5e4252", "a4807639-c3f7-4632-833e-ccc25502a28d"], ["fbe9914e-f63b-477f-8494-aa540d3b1c28", "00d5655c-e758-4e61-88fa-f7307d476d97"]];
const out: any[] = [];
for (const [ob, s] of links) {
  const { data: ev } = await db.from("didit_webhook_events").select("received_at").eq("session_id", s).order("received_at", { ascending: false }).limit(1);
  const answers = answersFromDidit(await qr(s));
  const u = await db.from("investor_onboardings").update({ questionnaire_responses: answers, questionnaire_version: 1, questionnaire_source: "didit", questionnaire_didit_session_id: s, questionnaire_submitted_at: ev[0].received_at }).eq("id", ob);
  if (u.error) throw u.error;
  await db.from("investor_record_changes").insert({ offering_id: F, onboarding_id: ob, subject_table: "investor_onboardings", subject_id: ob, field: "questionnaire_responses", old_value: null, new_value: { source: "didit", answered: Object.keys(answers).length }, source: "staff", actor_user_id: A, manager_visible: true });
  out.push({ ob, answered: Object.keys(answers).length });
}
console.log(JSON.stringify({ questions: questions.length, out }));
