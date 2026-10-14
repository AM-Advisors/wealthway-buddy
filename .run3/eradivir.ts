import { readFileSync } from "node:fs";
const A = "fcf83359-0486-402d-83b4-fd5484fb663d"; // Alyssa Pettit
const DRIVE = "https://drive.google.com/drive/folders/1DJfO6XC8pkLDXg8zW0ASUgOWl7U66g0v";
const { supabaseAdmin: db } = (await import("@/integrations/supabase/client.server")) as any;
const { encryptTin } = await import("@/lib/irs-forms.server");
const { parseAddressParts } = await import("@/lib/address");

function parseCsv(t: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let f = ""; let q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (q) { if (c === '"' && t[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(f); f = ""; if (row.some(Boolean)) rows.push(row); row = []; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}
const cents = (s: string) => Math.round(Number(s.replace(/[$,]/g, "") || 0) * 100);
const dob = (s: string) => { const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[1]}-${m[2]}` : null; };

const ex = await db.from("offerings").select("id").ilike("name", "%eradivir%");
if (ex.data?.length) throw new Error("Eradivir already exists " + JSON.stringify(ex.data));

let { data: client } = await db.from("clients").select("id").ilike("name", "Ollin Ventures Prime LLC").maybeSingle();
if (!client) { const r = await db.from("clients").insert({ name: "Ollin Ventures Prime LLC" }).select("id").single(); if (r.error) throw r.error; client = r.data; }

const { assertFundIdentityFree } = await import("@/lib/fund-integrity.server");
await assertFundIdentityFree({ name: "Eradivir Investment Fund" }, A);
const { seedFundFeeColumns } = await import("@/lib/fee-rates.server");
const fees = await seedFundFeeColumns(db, client.id);
const name = "Eradivir Investment Fund";
const ins = await db.from("offerings").insert({
  name, slug: "eradivir-investment-fund-" + crypto.randomUUID().slice(0, 8), client_id: client.id,
  legal_entity_name: "Eradivir Investment Fund, LLC", fund_type: "SPV", entity_type: "LLC", state_formed: "UT",
  date_formed: "2023-05-28", reg_type: "506b", min_investment_cents: 1_000_000, max_offering_cents: 400_000_000,
  target_raise_cents: 400_000_000, gp_entity_name: "Ollin Ventures Prime LLC", signatory_entity_name: "Ollin Ventures Prime LLC",
  principal_address: "2327 N 4060 W, Lehi, UT 84043", tax_classification: "partnership", rolling_closes: true,
  is_open: false, public_page_enabled: false, drive_folder_url: DRIVE, ...fees,
}).select("id").single();
if (ins.error) throw ins.error;
const id = ins.data.id;
const { structureForFundType } = await import("@/lib/fund-setup-canonical");
const { bootstrapFundSetup } = await import("@/lib/fund-setup.server");
await bootstrapFundSetup(A, { offeringId: id, clientId: client.id, structure: structureForFundType("SPV" as any), displayName: name });
const ft = await db.from("fund_fee_terms").insert({ offering_id: id, management_fee_pct: 2, management_fee_basis: "committed", carry_pct: 20, hurdle_pct: 0, status: "active", requested_by: A, decided_by: A, decided_at: new Date().toISOString(),
  notes: "From PPM (Series B): 2%/yr of capital contributions, first five years due in full at closing; 20% of distributions after return of capital." });
if (ft.error) console.log("fee terms not saved:", ft.error.message);
await db.from("offering_audit_events").insert({ offering_id: id, actor_id: A, event_type: "offering_created", changes: [{ field: "name", from: null, to: name }],
  summary: "Created Eradivir Investment Fund (Utah LLC, manager Ollin Ventures Prime LLC) as a closed draft from Google Drive PPM and investor list; no invitations sent." });

const rows = parseCsv(readFileSync("/tmp/erad/inv.csv", "utf8"));
const h = rows.shift()!; const ix = (k: string) => h.indexOf(k);
let n = 0, tins = 0;
for (const r of rows) {
  const g = (k: string) => (r[ix(k)] ?? "").trim();
  const full = g("Name"); if (!full) continue;
  const parts = full.split(/\s+/); const first = parts[0]!; const last = parts.slice(1).join(" ");
  const addr = parseAddressParts([g("Address Line 1"), g("Address Line 2")].filter(Boolean).join(", "));
  const email = g("Email").toLowerCase() || null;
  const phone = g("Phone").replace(/^1-/, "+1 ") || null;
  const p = await db.from("persons").insert({
    legal_first_name: first, legal_last_name: last, email, phone, date_of_birth: dob(g("Date of Birth")),
    citizenship_country: "US", residence_country: "US", country: "US", tax_residency_country: "US",
    address_line1: addr.addressLine1 || null, address_line2: addr.addressLine2 || null, city: addr.addressCity || null,
    region: addr.addressState || null, postal_code: addr.addressZip || null,
    kyc_status: "not_started", aml_status: "not_started", entry_source: "document", created_by: A,
  }).select("id").single();
  if (p.error) throw new Error(full + ": " + p.error.message);
  const ip = await db.from("investment_profiles").insert({ person_id: p.data.id, profile_type: "individual", legal_name: full, display_label: full, status: "active",
    entry_source: "document", created_by: A, phone, address_line1: addr.addressLine1 || null, address_line2: addr.addressLine2 || null,
    city: addr.addressCity || null, region: addr.addressState || null, postal_code: addr.addressZip || null, country: "US",
    details: { source: "Eradivir investor list (Google Drive, 08-26-2026)" } }).select("id").single();
  if (ip.error) throw new Error(full + ": " + ip.error.message);
  const tin = g("Tax ID/SSN").replace(/\D/g, "");
  if (tin.length === 9) {
    const enc = await encryptTin(tin);
    const s = await db.rpc("store_profile_tax_id", { _profile: ip.data.id, _ciphertext: enc.ciphertext, _iv: enc.iv, _key_version: enc.keyVersion, _actor: A });
    if (s.error) console.log("TIN not stored for", full, s.error.message);
    else { await db.from("investment_profiles").update({ tax_id_type: tin.startsWith("9") ? "itin" : "ssn", tax_id_last4: tin.slice(-4) }).eq("id", ip.data.id);
      await db.from("persons").update({ tax_id_last4: tin.slice(-4) }).eq("id", p.data.id); tins++; }
  }
  const committed = cents(g("Committed")); const received = cents(g("Amount Received"));
  const note = `From Eradivir investor list (prior platform, 08-26-2026): KYC ${g("KYC Status") || "-"}, AML ${g("AML Status") || "-"}, accreditation ${g("Accreditation Status") || "-"}, fund docs ${g("Fund Doc Status") || "-"}, invite ${g("Invite Status") || "-"}. Prior-platform checks are not Didit results; re-verify in Harmonious.`;
  const o = await db.from("investor_onboardings").insert({ offering_id: id, person_id: p.data.id, investment_profile_id: ip.data.id, stage: "profile_selected",
    funding_status: received > 0 ? "received" : "not_funded", requested_amount_cents: committed, commitment_amount_cents: committed, funded_amount_cents: received,
    entry_source: "document", created_by: A, internal_notes: note });
  if (o.error) throw new Error(full + ": " + o.error.message);
  n++;
}
console.log(JSON.stringify({ client: client.id, fund: id, investors: n, tinsStored: tins }));
