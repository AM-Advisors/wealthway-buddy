const { supabaseAdmin: db } = (await import("@/integrations/supabase/client.server")) as any;
const { data: p, error } = await db.from("persons").select("id, legal_first_name, legal_middle_name, legal_last_name, date_of_birth, kyc_status, aml_status, aml_screened_at, user_id").eq("id", "283e50a6-b817-474d-accb-d6ee3087417c").maybeSingle();
console.log("person:", JSON.stringify(p), error?.message ?? "");
const { data: obs } = await db.from("investor_onboardings").select("id, person_id, status, offering_id").eq("person_id", "283e50a6-b817-474d-accb-d6ee3087417c");
console.log("onboardings:", JSON.stringify(obs));
