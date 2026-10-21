const { supabaseAdmin: d } = (await import("@/integrations/supabase/client.server")) as any;
const { data: p } = await d.from("persons").select("id,*").ilike("email","ross@roasfinancial.com");
console.log(JSON.stringify(p));
const { data: c } = await d.from("account_identity_checks").select("*").limit(50);
console.log(JSON.stringify((c??[]).filter((x:any)=>JSON.stringify(x).toLowerCase().includes("mahoney")).map((x:any)=>({id:x.id,session_id:x.session_id,status:x.status,created_at:x.created_at}))));
