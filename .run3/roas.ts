const A = "fcf83359-0486-402d-83b4-fd5484fb663d";
const WF = "5e5e3a14-fcd5-4138-bd9a-bbc9abb4fdc9";
const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server") as any;
const ex = await db.from("offerings").select("id").ilike("name", "%roas%");
if (ex.data?.length) throw new Error("ROAS fund already exists " + JSON.stringify(ex.data));
let { data: client } = await db.from("clients").select("id").ilike("name", "Roas Capital Management").maybeSingle();
if (!client) {
  const r = await db.from("clients").insert({ name: "Roas Capital Management", slug: "roas-capital-management-" + crypto.randomUUID().slice(0, 8) }).select("id").single();
  if (r.error) throw r.error; client = r.data;
}
const { assertFundIdentityFree } = await import("@/lib/fund-integrity.server");
await assertFundIdentityFree({ name: "ROAS Hedge LP" }, A);
const { seedFundFeeColumns } = await import("@/lib/fee-rates.server");
const fees = await seedFundFeeColumns(db, client.id);
const name = "ROAS Hedge LP";
const ins = await db.from("offerings").insert({ name, slug: "roas-hedge-lp-" + crypto.randomUUID().slice(0, 8), client_id: client.id, fund_type: "Hedge Fund", reg_type: "506b", is_open: false, public_page_enabled: false, didit_workflow_id: WF, ...fees }).select("id").single();
if (ins.error) throw ins.error;
const id = ins.data.id;
const { structureForFundType } = await import("@/lib/fund-setup-canonical");
const { bootstrapFundSetup } = await import("@/lib/fund-setup.server");
await bootstrapFundSetup(A, { offeringId: id, clientId: client.id, structure: structureForFundType("Private Equity" as any), displayName: name });
const au = await db.from("offering_audit_events").insert({ offering_id: id, actor_id: A, event_type: "offering_created", changes: [{ field: "name", from: null, to: name }, { field: "didit_workflow_id", from: null, to: WF }], summary: "Created ROAS Hedge LP draft fund under Roas Capital Management (approved by Alyssa Pettit, ROAS only); fund-specific Didit flow assigned" });
if (au.error) throw au.error;
console.log(JSON.stringify({ client: client.id, fund: id }));
