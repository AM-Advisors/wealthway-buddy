import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
const { encryptTin } = await import("@/lib/irs-forms.server");
const db = supabaseAdmin as any;
const OFFERING = "794506cb-9edb-4a51-bd46-0bb686e43426";
const ACTOR = "c07a27c8-170d-49b1-a8d4-2e53b8ab60d1"; // Alyssa (Super Admin)
const BOX_ROOT = "391643680676";
const rows = JSON.parse(readFileSync("/tmp/ff/k1rows.json", "utf8"));
const num = (s: string | null) => (s ? Number(s.replace(/[,()]/g, "")) : 0);
const title = (s: string) => s.toLowerCase().replace(/(^|[\s'-])\S/g, (c) => c.toUpperCase());

// 1. Approved, read-only live Box source scoped to the Founders Fund folder.
let { data: src } = await db.from("document_sources").select("id").eq("connection_reference", "box-shared:https://app.box.com/s/93lnemz597wwwdco5sdkrytbv3w4xcvy").maybeSingle();
if (!src) {
  const r = await db.from("document_sources").insert({
    provider: "box", label: "Founders Fund 2025 K-1s (Box)", connection_reference: "box-shared:https://app.box.com/s/93lnemz597wwwdco5sdkrytbv3w4xcvy",
    purpose: "historical_documents", read_only: true, allowed_root_ids: [BOX_ROOT], folder_mappings: [{ folder_id: BOX_ROOT, offering_id: OFFERING }],
    status: "approved", approved_by: ACTOR, approved_at: new Date().toISOString(), is_test_demo: false, created_by: ACTOR,
  }).select("id").single();
  if (r.error) throw r.error; src = r.data;
}

for (const r of rows) {
  const n: string = r.name;
  const isTrust = /TRUST/.test(n);
  const isEntity = !isTrust && (r.entity !== "Individual");
  const dbType = isTrust ? "trust" : !isEntity ? "individual" : /LLC/.test(n) ? "llc" : r.entity === "Partnership" && !/LTD|LIMITED/.test(n) ? "partnership" : "other_entity";
  const legalName = n === "ELKSTONE CAPITAL INTERNATION" ? "Elkstone Capital International" : title(n).replace(/\bLlc\b/, "LLC").replace(/\bLtd\b/, "Ltd");
  const [first, ...rest] = n.split(" ");
  const foreign = r.country !== "US";
  const address = { address_line1: r.street ? title(r.street) : null, city: foreign && n.startsWith("HEHIR") ? null : r.city ? title(r.city) : null,
    region: foreign ? null : r.region, postal_code: foreign ? null : r.postal, country: r.country };

  const { data: existing } = await db.from("investment_profiles").select("id").eq("legal_name", legalName).eq("created_by", ACTOR).maybeSingle();
  if (existing) { console.log("skip existing", legalName); continue; }

  const { data: person, error: pe } = await db.from("persons").insert({
    legal_first_name: isEntity || isTrust ? null : title(first!), legal_last_name: isEntity || isTrust ? null : title(rest.join(" ")),
    ...address, residence_country: r.country, user_id: null, entry_source: "document", created_by: ACTOR, onboarding_state: "account_created",
  }).select("id").single();
  if (pe) throw pe;
  const { data: prof, error: pre } = await db.from("investment_profiles").insert({
    owner_user_id: null, person_id: person.id, profile_type: dbType, display_label: legalName, legal_name: legalName,
    details: { source: "2025 Schedule K-1 (Box)", k1_partner_number: r.partner_no, foreign_partner: foreign }, status: "active", entry_source: "document", created_by: ACTOR,
  }).select("id").single();
  if (pre) throw pre;
  if (r.tin && /^\d{9}$/.test(r.tin)) {
    const enc = await encryptTin(r.tin);
    const { error: te } = await db.rpc("store_profile_tax_id", { _profile: prof.id, _ciphertext: enc.ciphertext, _iv: enc.iv, _key_version: enc.keyVersion, _actor: ACTOR });
    if (te) console.log("tin store failed", legalName, te.message);
    else await db.from("investment_profiles").update({ tax_id_type: isEntity || isTrust ? "ein" : r.tin.startsWith("9") ? "itin" : "ssn", tax_id_last4: r.tin.slice(-4) }).eq("id", prof.id);
  }
  const invested = Math.round((num(r.beg) + num(r.contrib)) * 100);
  const { data: ob, error: oe } = await db.from("investor_onboardings").insert({
    offering_id: OFFERING, investor_user_id: null, person_id: person.id, investment_profile_id: prof.id, stage: "profile_selected",
    entry_source: "document", created_by: ACTOR, requested_amount_cents: invested || null, funding_status: "received",
    internal_notes: `From 2025 K-1 (partner #${r.partner_no}): ownership ${r.capital_pct}%; capital account beginning $${r.beg ?? 0}, 2025 contributions $${r.contrib ?? 0}, ending $${r.end ?? 0}. Amount shown = beginning capital + 2025 contributions; original commitment not in files.`,
  }).select("id").single();
  if (oe) { console.log("onboarding insert failed", legalName, oe.message); continue; }
  await db.from("investor_record_changes").insert({ offering_id: OFFERING, onboarding_id: ob.id, subject_table: "investor_onboardings", subject_id: ob.id, field: "added_to_fund", old_value: null, new_value: { profileId: prof.id, source: "2025 K-1" }, source: "document", actor_user_id: ACTOR, manager_visible: true });

  // K-1: catalog + publish + entitle the investment profile.
  const bytes = readFileSync(r.file);
  const { data: doc, error: de } = await db.from("document_catalog").insert({
    source_id: src.id, external_file_id: r.box_id, parent_folder_id: BOX_ROOT, file_name: `2025 Schedule K-1 - ${legalName}.pdf`, mime_type: "application/pdf",
    size_bytes: bytes.length, checksum: createHash("sha256").update(bytes).digest("hex"), document_type: "k1", tax_year: 2025, offering_id: OFFERING,
    recipient_profile_id: prof.id, status: "published", status_reason: "Matched by partner name on K-1; approved by Alyssa Pettit", published_at: new Date().toISOString(), published_by: ACTOR, is_test_demo: false,
  }).select("id").single();
  if (de) { console.log("doc insert failed", legalName, de.message); continue; }
  await db.from("document_entitlements").insert({ document_id: doc.id, principal_type: "investment_profile", principal_id: prof.id, action: "grant", reason: "2025 K-1 published to its partner (Super Admin request)", decided_by: ACTOR });
  console.log("ok", legalName, dbType, invested / 100);
}
try {
  const { reconcileReadinessForSubjects } = await import("@/lib/investor-onboarding.server");
  void reconcileReadinessForSubjects;
} catch {}
process.exit(0);
