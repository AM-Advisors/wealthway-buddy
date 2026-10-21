const { supabaseAdmin: db } = (await import("@/integrations/supabase/client.server")) as any;
const PID = "283e50a6-b817-474d-accb-d6ee3087417c";
const { data: kyc } = await db.from("kyc_verifications").select("*").eq("person_id", PID);
console.log("kyc rows:", JSON.stringify(kyc, null, 1));
const { data: req } = await db.from("person_kyc_requests").select("id, session_id, status, id_status, aml_status, created_at").eq("person_id", PID);
console.log("requests:", JSON.stringify(req, null, 1));
const { data: p } = await db.from("persons").select("id, first_name, last_name, kyc_status, aml_status").eq("id", PID).single();
console.log("person:", JSON.stringify(p));
