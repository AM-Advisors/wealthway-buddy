import { supabaseAdmin } from "@/integrations/supabase/client.server";
const { data, error } = await supabaseAdmin.from("fund_managers").upsert({ user_id: "3b2c3778-ba88-40e5-979c-019f865d5940", offering_id: "92252b98-c5d2-444a-8620-fb29436a87cf", granted_by: "a1387cfc-46e5-4dd4-b16b-d63730123794" }, { onConflict: "user_id,offering_id" }).select("id");
console.log(JSON.stringify({ data, error }));
