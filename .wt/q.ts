import { guard, N } from "/dev-server/.wt/lib";
const d = await guard();
const { data } = await d.from("investor_takeover_admissions").select("investor_name,status,remediation,compliance").eq("offering_id", N).ilike("investor_name","Erik%");
console.log(JSON.stringify(data));
const { data: t } = await d.from("bank_transactions").select("*").limit(1); console.log(Object.keys(t?.[0]??{}).join(","));
const { data: ba } = await d.from("bank_accounts").select("id,name,offering_id").eq("offering_id", N); console.log(JSON.stringify(ba));
