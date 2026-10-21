const { supabaseAdmin: d } = (await import("@/integrations/supabase/client.server")) as any;
const r = await d.from("kyc_verifications").select("*").or("vendor_data.ilike.%82774bb0%,decision::text.ilike.%Mahoney%").limit(5);
console.log(r.error?.message, JSON.stringify((r.data??[]).map((x:any)=>({id:x.id,s:x.session_id,st:x.status,app:x.application_id}))));
const key=process.env.DIDIT_API_KEY!.trim();
const l=await fetch("https://verification.didit.me/v2/sessions/?search=ross%40roasfinancial.com",{headers:{"x-api-key":key}}); console.log(l.status,(await l.text()).slice(0,1500));
