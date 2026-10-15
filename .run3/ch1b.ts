const A = "fcf83359-0486-402d-83b4-fd5484fb663d", F = "d4db1f1b-e4ac-43fb-898c-401a689f4f7f", SRCID = "fdb4ef25-beb7-4bbd-9949-e0f8343b64b5";
const { supabaseAdmin: db } = (await import("@/integrations/supabase/client.server")) as any;
const { readFileSync } = await import("node:fs");
const { createHash } = await import("node:crypto");
const SRC = "Box: Chapter 1 2025 K-1 folder (shared link)";
const ons = (await db.from("investor_onboardings").select("id, person_id, investment_profile_id, investment_profiles(legal_name)").eq("offering_id", F).is("removed_at", null)).data as any[];
const byName = (n: string) => ons.find((o) => o.investment_profiles.legal_name === n);
const fix = async (n: string, pa: any, extra: any = {}) => { const o = byName(n); await db.from("investment_profiles").update(pa).eq("id", o.investment_profile_id); if (o.person_id && pa.address_line1) await db.from("persons").update(pa).eq("id", o.person_id); if (Object.keys(extra).length) await db.from("investor_onboardings").update(extra).eq("id", o.id); return o; };
await fix("Keith Elkins", { postal_code: "84050-9301" });
await fix("Mathew Kiggins", { postal_code: "01824-4806" });
const bw = byName("Blue Wave Acquisition LLC");
await fix("Blue Wave Acquisition LLC", { address_line1: "225 W 970 S", city: "Midway", region: "UT", postal_code: "84049" }, { funded_amount_cents: 5000000, funding_status: "received" });
await db.from("investor_onboardings").update({ internal_notes: "From Google Drive signed subscription (7/23/2025, $50,000, signed by Jacob Murphy). Box 2025 K-1: $50,000 contributed in 2025, 5.760536% capital. Identity verification not run." }).eq("id", bw.id);
const neu = [
  { first: "Jeremy", last: "Christensen", label: "Jeremy Christensen", type: "individual", a1: "12220 Tuscany Ridge Rd", city: "Midwest City", st: "OK", zip: "73130", amt: 25000, pct: "2.880268" },
  { first: "Marco", last: "Juarez", label: "Marco Juarez", type: "individual", a1: "14610 Cindywood Dr", city: "Houston", st: "TX", zip: "77079", amt: 208000, pct: "23.963832" },
  { first: "Michael", last: "Kiggins", label: "Michael Kiggins", type: "individual", a1: "6958 Fire Opal Lane", city: "Castle Rock", st: "CO", zip: "80108", amt: 35000, pct: "4.032376" },
  { first: null, last: null, label: "Ollin Ventures Atom Fund LP", type: "partnership", a1: "2327 N 4060 W", city: "Lehi", st: "UT", zip: "84043", amt: 200000, pct: "23.042146" },
];
for (const r of neu) {
  let pid: string | null = null;
  if (r.first) { const p = await db.from("persons").insert({ legal_first_name: r.first, legal_last_name: r.last, address_line1: r.a1, city: r.city, region: r.st, postal_code: r.zip, country: "US", residence_country: "US", kyc_status: "not_started", aml_status: "not_started", entry_source: "document", created_by: A }).select("id").single(); if (p.error) throw p.error; pid = p.data.id; }
  const ip = await db.from("investment_profiles").insert({ person_id: pid, profile_type: r.type, legal_name: r.label, display_label: r.label, status: "active", entry_source: "document", created_by: A, address_line1: r.a1, city: r.city, region: r.st, postal_code: r.zip, country: "US", details: { source: SRC } }).select("id").single();
  if (ip.error) throw new Error(r.label + ip.error.message);
  const o = await db.from("investor_onboardings").insert({ offering_id: F, person_id: pid, investment_profile_id: ip.data.id, stage: "profile_selected", funding_status: "received", requested_amount_cents: r.amt * 100, commitment_amount_cents: r.amt * 100, funded_amount_cents: r.amt * 100, entry_source: "document", created_by: A, internal_notes: `From ${SRC}: $${r.amt.toLocaleString()} capital contributed in 2025, ${r.pct}% capital. No subscription agreement or contact details found in Drive; identity verification not run.${r.first ? "" : " Signer for this partnership is unknown."}` }).select("id").single();
  if (o.error) throw new Error(r.label + o.error.message);
  ons.push({ id: o.data.id, investment_profile_id: ip.data.id, investment_profiles: { legal_name: r.label } });
}
// K-1 files
const src = (await db.from("document_sources").select("allowed_root_ids").eq("id", SRCID).single()).data;
if (!src.allowed_root_ids.includes("chapter-1")) await db.from("document_sources").update({ allowed_root_ids: [...src.allowed_root_ids, "chapter-1"] }).eq("id", SRCID);
const k1: [string, string][] = [["blue", "Blue Wave Acquisition LLC"], ["canyon", "Canyon Crest Investments LLC"], ["jeremy", "Jeremy Christensen"], ["keith", "Keith Elkins"], ["marco", "Marco Juarez"], ["matt", "Mathew Kiggins"], ["michael", "Michael Kiggins"], ["ollin", "Ollin Ventures Atom Fund LP"]];
let up = 0;
for (const [k, n] of k1) {
  const o = byName(n); const buf = readFileSync(`/tmp/ch1/k1_${k}.pdf`);
  const path = `chapter-1/2025/${crypto.randomUUID()}.pdf`;
  const s = await db.storage.from("portal-tax-documents").upload(path, buf, { contentType: "application/pdf" }); if (s.error) throw new Error(n + s.error.message);
  const d = await db.from("document_catalog").insert({ source_id: SRCID, external_file_id: path, parent_folder_id: "chapter-1/2025", file_name: `2025 Schedule K-1 - ${n}.pdf`, mime_type: "application/pdf", size_bytes: buf.length, checksum: createHash("sha256").update(buf).digest("hex"), document_type: "k1", tax_year: 2025, offering_id: F, recipient_profile_id: o.investment_profile_id, status: "held", status_reason: "Copied from Box Chapter 1 2025 K-1 folder; matched by partner name. Held for review before release to the investor." }).select("id").single();
  if (d.error) throw new Error(n + d.error.message); up++;
}
await db.from("offering_audit_events").insert({ offering_id: F, actor_id: A, event_type: "investors_imported", changes: [{ field: "investors", from: 4, to: 8 }], summary: `From Box 2025 K-1s: added Jeremy Christensen, Marco Juarez, Michael Kiggins and Ollin Ventures Atom Fund LP; confirmed Blue Wave $50,000 funded; filled addresses; stored ${up} K-1s held for review (tax return and e-file authorization not imported).` });
console.log("ok", up);
