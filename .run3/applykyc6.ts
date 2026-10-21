const { supabaseAdmin: db } = (await import("@/integrations/supabase/client.server")) as any;
const { data: s } = await db.from("onboarding_readiness_summaries").select("*").eq("onboarding_id", "8e8465ff-8ccd-41a3-ba56-54345158ef9a").maybeSingle();
console.log("readiness:", JSON.stringify(s, null, 1)?.slice(0, 1200));
const { data: v } = await db.from("kyc_verifications").select("status, harmonious_decision, completed_at").eq("application_id", "013f4c52-a386-451f-a2e3-c159e66931c8");
console.log("verifications:", JSON.stringify(v));
