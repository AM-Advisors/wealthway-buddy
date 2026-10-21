const { supabaseAdmin: d } = (await import("@/integrations/supabase/client.server")) as any;
const PID="1abe97b5-fc53-45db-a583-5f63a1c629e6"; const key=process.env.DIDIT_API_KEY!.trim();
const a=await fetch("https://verification.didit.me/v2/aml/",{method:"POST",headers:{"content-type":"application/json","x-api-key":key},body:JSON.stringify({full_name:"Ross Vincent Mahoney",date_of_birth:"1996-03-26",nationality:"USA"})});
const t=await a.text(); if(!a.ok){console.log("FAIL",a.status,t.slice(0,400));process.exit(1);}
const x=JSON.parse(t); const m=x.aml??x; const hits=Number(m.total_hits??(m.hits?.length??0))||0; const s=String(m.status??"").toLowerCase();
const amlStatus = s==="declined"?"declined": (s==="in review"||hits>0)?"review": s==="approved"?"approved":"pending";
const { data: u } = await d.from("profiles").select("id").ilike("email","alyssa@harmonious.co").maybeSingle();
const ins=await d.from("person_kyc_requests").insert({person_id:PID,mode:"document",document_type:"aml_screen",session_id:x.request_id??null,status:"completed",id_status:"Approved",aml_status:amlStatus,result_summary:{amlProviderStatus:m.status,amlHits:hits,screenedName:"Ross Vincent Mahoney",dateOfBirth:"1996-03-26",nationality:"USA",note:"Standalone AML screen using details read from his ID photo (Sept 15, 2026). Not full KYC: no selfie or liveness."},created_by:u?.id??null}).select("id").single();
const now=new Date().toISOString();
const pu=await d.from("persons").update({aml_status:amlStatus,aml_screened_at:now,date_of_birth:"1996-03-26"}).eq("id",PID);
console.log(JSON.stringify({provider:m.status,hits,amlStatus,ins:ins.error?.message??ins.data,pu:pu.error?.message??"ok"}));
