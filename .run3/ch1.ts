const A = "fcf83359-0486-402d-83b4-fd5484fb663d";
const F = "d4db1f1b-e4ac-43fb-898c-401a689f4f7f";
const { supabaseAdmin: db } = (await import("@/integrations/supabase/client.server")) as any;
const ex = await db.from("investor_onboardings").select("id").eq("offering_id", F);
if (ex.data?.length) throw new Error("already has investors");
const SRC = "Google Drive: Chapter 1, a series of Storybook Ventures LLC folder";
const rows = [
  { first: "Mathew", last: "Kiggins", email: "matt.kiggins@inspirafinancial.com", phone: "(630) 991-7667", a1: "15 Cambridge Street", city: "Chelmsford", st: "MA", zip: "01824", type: "individual", label: "Mathew Kiggins", amt: 50000, funded: 50000, date: "2024-04-17", note: "Capital account statement 2/12/2025: $50,000 contributed, 20.0% ownership, effective 4/17/2024. Updated subscription agreement in Drive." },
  { first: "Keith", last: "Elkins", email: "kc9syb@gmail.com", phone: "(920) 373-4096", a1: "1616 West Old Highway Road", city: "Morgan", st: "UT", zip: null, type: "individual", label: "Keith Elkins", amt: 100000, funded: 100000, date: "2024-08-08", note: "Capital account statement 2/12/2025: $100,000 contributed, 44.44% ownership, effective 8/08/2024. ZIP missing." },
  { first: "Robert", last: "Pettit", email: "chaunntelp@yahoo.com", phone: "(801) 580-6495", a1: "935 Canyon Crest Drive", city: "Bountiful", st: "UT", zip: "84010", type: "individual", label: "Robert Pettit", amt: 100000, funded: 100000, date: "2024-08-09", note: "Capital account statement 2/12/2025: $100,000 contributed, 44.44% ownership, effective 8/09/2024. Possible overlap with Canyon Crest Investments LLC ($100,000, same address) - confirm whether these are one investment." },
  { first: "Chaunntel", last: "Pettit", email: null, phone: null, a1: "935 Canyon Crest Drive", city: "Bountiful", st: "UT", zip: "84010", type: "llc", label: "Canyon Crest Investments LLC", amt: 100000, funded: 0, date: "2025-03-26", note: "Signed subscription agreement 3/26/2025: $100,000, signed by Chaunntel S. Pettit, Owner. Funding not evidenced in Drive. Possible overlap with Robert Pettit's $100,000 - confirm." },
  { first: "Jacob", last: "Murphy", email: null, phone: null, a1: null, city: null, st: null, zip: null, type: "llc", label: "Blue Wave Acquisition LLC", amt: 50000, funded: 0, date: "2025-07-23", note: "Signed subscription agreement 7/23/2025: $50,000, signed by Jacob Murphy for Blue Wave Acquisition LLC. Funding not evidenced in Drive; contact details missing." },
];
let n = 0;
for (const r of rows) {
  const p = await db.from("persons").insert({ legal_first_name: r.first, legal_last_name: r.last, email: r.email, phone: r.phone, address_line1: r.a1, city: r.city, region: r.st, postal_code: r.zip, country: "US", residence_country: "US", kyc_status: "not_started", aml_status: "not_started", entry_source: "document", created_by: A }).select("id").single();
  if (p.error) throw new Error(r.label + p.error.message);
  const ip = await db.from("investment_profiles").insert({ person_id: p.data.id, profile_type: r.type, legal_name: r.label, display_label: r.label, status: "active", entry_source: "document", created_by: A, phone: r.phone, address_line1: r.a1, city: r.city, region: r.st, postal_code: r.zip, country: "US", details: { source: SRC } }).select("id").single();
  if (ip.error) throw new Error(r.label + ip.error.message);
  const o = await db.from("investor_onboardings").insert({ offering_id: F, person_id: p.data.id, investment_profile_id: ip.data.id, stage: "profile_selected", funding_status: r.funded ? "received" : "not_funded", requested_amount_cents: r.amt * 100, commitment_amount_cents: r.amt * 100, funded_amount_cents: r.funded * 100, investment_date: r.date, entry_source: "document", created_by: A, internal_notes: `From ${SRC}. ${r.note} Identity verification not run; prior records are not verification results.` });
  if (o.error) throw new Error(r.label + o.error.message);
  n++;
}
await db.from("offering_audit_events").insert({ offering_id: F, actor_id: A, event_type: "investors_imported", changes: [{ field: "investors", from: 0, to: n }], summary: `Imported ${n} investors from the Chapter 1 Google Drive folder (capital account statements and signed subscription agreements). No invitations sent.` });
console.log("done", n);
