const key=process.env.DIDIT_API_KEY!.trim();
const l=await fetch("https://verification.didit.me/v2/sessions/?search=Mahoney",{headers:{"x-api-key":key}}); const j:any=await l.json();
for (const s of j.results??[]) { console.log(s.session_id,s.status,s.created_at,s.vendor_data);
 const x:any=await (await fetch(`https://verification.didit.me/v2/session/${s.session_id}/decision/`,{headers:{"x-api-key":key}})).json();
 const v=x.id_verification ?? x.id_verifications?.[0]; console.log(JSON.stringify({f:v?.first_name,l:v?.last_name,dob:v?.date_of_birth,nat:v?.nationality,st:v?.status}));}
