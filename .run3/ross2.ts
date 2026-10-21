const { supabaseAdmin: d } = (await import("@/integrations/supabase/client.server")) as any;
const U="82774bb0-3731-40d0-a922-028aa4e0def9";
for (const t of ["kyc_verifications","account_identity_checks","person_kyc_requests"]) {
  const col = t==="person_kyc_requests"?"person_id":"user_id"; const v = t==="person_kyc_requests"?"1abe97b5-fc53-45db-a583-5f63a1c629e6":U;
  const r = await d.from(t).select("*").eq(col,v); console.log(t, r.error?.message ?? JSON.stringify((r.data??[]).map((x:any)=>({id:x.id,session_id:x.session_id,status:x.status,created_at:x.created_at}))));
}
const key=process.env.DIDIT_API_KEY!.trim();
const r=await d.from("kyc_verifications").select("session_id").eq("user_id",U);
const r2=await d.from("account_identity_checks").select("session_id").eq("user_id",U);
for (const s of [...(r.data??[]),...(r2.data??[])].map((x:any)=>x.session_id).filter(Boolean)) {
  const x=await fetch(`https://verification.didit.me/v2/session/${s}/decision/`,{headers:{"x-api-key":key}}); const j:any=await x.json();
  const idv=j.id_verification ?? j.id_verifications?.[0];
  console.log(s, j.status, JSON.stringify({first:idv?.first_name,last:idv?.last_name,dob:idv?.date_of_birth,nat:idv?.nationality,st:idv?.status,aml:j.aml??j.aml_screenings??null}).slice(0,500));
}
