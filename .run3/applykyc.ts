const { supabaseAdmin: db } = (await import("@/integrations/supabase/client.server")) as any;
const { syncVerification } = await import("@/lib/kyc-verification.server");
const { data: v, error } = await db.from("kyc_verifications").select("*").eq("id", "2b221f3e-d846-4589-b681-de76ac53346b").single();
if (error || !v) { console.log("verification not found", error?.message); process.exit(1); }
const res = await syncVerification({
  verification: v,
  sessionId: "60327733-1d91-4cd5-b8a5-a3f1b7b89464",
  trigger: "manual",
  actorUserId: "fcf83359-0486-402d-83b4-fd5484fb663d",
});
console.log("sync result:", JSON.stringify(res));
const { data: after } = await db.from("kyc_verifications").select("status, provider_decision, harmonious_decision, harmonious_decision_reason, verified_full_name, verified_date_of_birth, liveness_status, face_match_status, face_match_score, completed_at").eq("id", v.id).single();
console.log("after:", JSON.stringify(after, null, 1));
