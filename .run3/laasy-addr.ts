import { supabaseAdmin } from "@/integrations/supabase/client.server";
const { data, error } = await supabaseAdmin.from("offerings").update({ principal_address: "1900 W. Kirkwood Blvd., Southlake, TX 76092" }).eq("id","92252b98-c5d2-444a-8620-fb29436a87cf").select("principal_address,arbitration_city,arbitration_state");
console.log(JSON.stringify({ data, error }));
