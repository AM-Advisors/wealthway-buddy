const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server") as any;
const id = "acb8193f-35fc-41cc-9ee5-629bde3e11b2";
const u = await db.from("fund_setups").update({ structure: "hedge_fund" }).eq("id", "7787e8e7-39eb-438d-92d1-dda85b038ea8").eq("structure", "pe_fund").select("structure");
if (u.error) throw u.error;
const a = await db.from("offering_audit_events").insert({ offering_id: id, actor_id: "fcf83359-0486-402d-83b4-fd5484fb663d", event_type: "offering_updated", changes: [{ field: "setup_structure", from: "pe_fund", to: "hedge_fund" }], summary: "Corrected setup layout to Hedge fund (no setup work had been recorded; same checklist)" });
if (a.error) throw a.error;
console.log(JSON.stringify(u.data));
