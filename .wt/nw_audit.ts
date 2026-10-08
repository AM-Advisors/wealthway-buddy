import { guard, N } from "./lib";
const d = await guard();
for (const t of ["side_letter_versions","side_letter_events","side_letter_audit_events"]) { const r = await d.from(t).select("*").limit(20); console.log(t, r.error?.message ?? JSON.stringify(r.data).slice(0,800)); }
const docs = await d.from("documents").select("id,name,title").eq("offering_id", N).ilike("name","%side%");
console.log("docs", docs.error?.message ?? JSON.stringify(docs.data));
