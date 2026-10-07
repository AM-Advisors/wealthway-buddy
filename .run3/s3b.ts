import { N, U, step, db } from "./lib";
const cc = await import("@/lib/capital-calls.server");
const d = await db();
const { data: ms } = await d.from("funding_matches").select("id,status").eq("offering_id", N).eq("status", "approved");
for (const m of ms ?? []) await step(`record contribution in ledger ${m.id.slice(0,6)} (preparer, 3rd person)`, () => cc.postFundingMatch(U.prep, m.id));
const { data: ce } = await d.from("commitment_events").select("event_type,amount_cents,effective_date").eq("offering_id", N).eq("event_type", "contribution");
console.log(JSON.stringify(ce));
