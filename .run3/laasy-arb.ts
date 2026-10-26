import { supabaseAdmin } from "@/integrations/supabase/client.server";
const { data, error } = await supabaseAdmin.from("offerings").update({ arbitration_city: "Dallas", arbitration_state: "Texas" }).eq("id","92252b98-c5d2-444a-8620-fb29436a87cf").select("arbitration_city,arbitration_state");
console.log(JSON.stringify({ data, error }));
