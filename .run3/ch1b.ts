const A = "fcf83359-0486-402d-83b4-fd5484fb663d", F = "d4db1f1b-e4ac-43fb-898c-401a689f4f7f", SRCID = "fdb4ef25-beb7-4bbd-9949-e0f8343b64b5";
const { supabaseAdmin: db } = (await import("@/integrations/supabase/client.server")) as any;
const { readFileSync } = await import("node:fs");
const { createHash } = await import("node:crypto");
const SRC = "Box: Chapter 1 2025 K-1 folder (shared link)";
const ons = (await db.from("investor_onboardings").select("id, person_id, investment_profile_id, investment_profiles(legal_name)").eq("offering_id", F).is("removed_at", null)).data as any[];
const byName = (n: string) => ons.find((o) => o.investment_profiles.legal_name === n);
const fix = async (n: string, pa: any, extra: any = {}) => { const o = byName(n); await db.from("investment_profiles").update(pa).eq("id", o.investment_profile_id); if (o.person_id && pa.address_line1) await db.from("persons").update(pa).eq("id", o.person_id); if (Object.keys(extra).length) await db.from("investor_onboardings").update(extra).eq("id", o.id); return o; };
const ex = await db.from("investor_onboardings").select("id").eq("offering_id", F).eq("investment_profile_id", "6ec4446d-dde3-4379-a3cc-22f8b9823703");
if (!ex.data.length) { const o = await db.from("investor_onboardings").insert({ offering_id: F, person_id: "dc41f245-1767-491d-8a97-a53704dc6525", investment_profile_id: "6ec4446d-dde3-4379-a3cc-22f8b9823703", stage: "profile_selected", funding_status: "received", requested_amount_cents: 20000000, commitment_amount_cents: 20000000, funded_amount_cents: 20000000, entry_source: "document", created_by: A, internal_notes: "From Box: Chapter 1 2025 K-1 folder: $200,000 capital contributed in 2025, 23.042146% capital (K-1 address 2327 N 4060 W, Lehi, UT 84043). Linked to the existing Ollin Ventures Atom Fund profile. No subscription agreement found in Drive." }).select("id").single(); if (o.error) throw o.error; ons.push({ id: o.data.id, investment_profile_id: "6ec4446d-dde3-4379-a3cc-22f8b9823703", investment_profiles: { legal_name: "Ollin Ventures Atom Fund LP" } }); }
// K-1 files
const src = (await db.from("document_sources").select("allowed_root_ids").eq("id", SRCID).single()).data;
if (!src.allowed_root_ids.includes("chapter-1")) await db.from("document_sources").update({ allowed_root_ids: [...src.allowed_root_ids, "chapter-1"] }).eq("id", SRCID);
const k1: [string, string][] = [["blue", "Blue Wave Acquisition LLC"], ["canyon", "Canyon Crest Investments LLC"], ["jeremy", "Jeremy Christensen"], ["keith", "Keith Elkins"], ["marco", "Marco Juarez"], ["matt", "Mathew Kiggins"], ["michael", "Michael Kiggins"], ["ollin", "Ollin Ventures Atom Fund LP"]];
const byName2 = (n: string) => byName(n) ?? ons.find((o) => o.investment_profiles.legal_name === n.replace(" LP",""));
let up = 0;
for (const [k, n] of k1) {
  const o = byName2(n); const buf = readFileSync(`/tmp/ch1/k1_${k}.pdf`);
  const path = `chapter-1/2025/${crypto.randomUUID()}.pdf`;
  const s = await db.storage.from("portal-tax-documents").upload(path, buf, { contentType: "application/pdf" }); if (s.error) throw new Error(n + s.error.message);
  const d = await db.from("document_catalog").insert({ source_id: SRCID, external_file_id: path, parent_folder_id: "chapter-1/2025", file_name: `2025 Schedule K-1 - ${n}.pdf`, mime_type: "application/pdf", size_bytes: buf.length, checksum: createHash("sha256").update(buf).digest("hex"), document_type: "k1", tax_year: 2025, offering_id: F, recipient_profile_id: o.investment_profile_id, status: "matched", status_reason: "Copied from Box Chapter 1 2025 K-1 folder; matched by partner name. Held for review before release to the investor." }).select("id").single();
  if (d.error) throw new Error(n + d.error.message); up++;
}
await db.from("offering_audit_events").insert({ offering_id: F, actor_id: A, event_type: "investors_imported", changes: [{ field: "investors", from: 4, to: 8 }], summary: `From Box 2025 K-1s: added Jeremy Christensen, Marco Juarez, Michael Kiggins and Ollin Ventures Atom Fund LP; confirmed Blue Wave $50,000 funded; filled addresses; stored ${up} K-1s held for review (tax return and e-file authorization not imported).` });
console.log("ok", up);
