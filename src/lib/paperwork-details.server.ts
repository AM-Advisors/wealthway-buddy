import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { blankOnlyFills } from "@/lib/person-id-cards";

/**
 * Reads investor facts from paperwork already loaded for an investment (signed
 * subscription agreements, accreditation files) and fills BLANK fields only.
 * Never overwrites, never marks KYC/AML, and logs every fill as from signed paperwork.
 */
const db = () => supabaseAdmin as any;
const BUCKET = "signed-documents";

type Found = {
  tax_id: string | null; tax_id_kind: "ssn" | "ein" | null; date_of_birth: string | null; phone: string | null;
  address_line1: string | null; city: string | null; region: string | null; postal_code: string | null;
  people: { name: string; role: string }[];
};

async function readPaper(bytes: ArrayBuffer, fileName: string): Promise<Found | null> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return null;
  const b64 = Buffer.from(bytes).toString("base64");
  const isPdf = /\.pdf$/i.test(fileName);
  const part = isPdf ? { type: "input_file", filename: "paper.pdf", file_data: `data:application/pdf;base64,${b64}` }
    : { type: "input_image", image_url: `data:${/\.png$/i.test(fileName) ? "image/png" : "image/jpeg"};base64,${b64}` };
  const s = (d?: string) => ({ type: ["string", "null"], ...(d ? { description: d } : {}) });
  const schema = { type: "object", additionalProperties: false,
    required: ["tax_id", "tax_id_kind", "date_of_birth", "phone", "address_line1", "city", "region", "postal_code", "people"],
    properties: { tax_id: s("SSN or EIN digits exactly as written"), tax_id_kind: { type: ["string", "null"], enum: ["ssn", "ein", null] },
      date_of_birth: s("YYYY-MM-DD"), phone: s(), address_line1: s(), city: s(), region: s("state"), postal_code: s(),
      people: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "role"], properties: { name: { type: "string" }, role: { type: "string" } } } } } };
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({ model: "openai/gpt-6-astra", reasoning: { effort: "low" }, store: false,
        instructions: "This is an investor's completed fund paperwork. Read the investor's (subscriber or K-1 partner's) own details: SSN (individual) or EIN (trust/company), birth date, phone, residence address, and for trusts/companies the named trustees, owners or signers. Use null when a value is blank, illegible or not written. Never use fund, manager or sample values.",
        input: [{ role: "user", content: [part, { type: "input_text", text: "Read the investor details." }] }],
        text: { format: { type: "json_schema", name: "investor_details", strict: true, schema } } }),
    });
    if (!res.ok) return null;
    const j: any = await res.json();
    const txt = j.output_text ?? (j.output ?? []).flatMap((o: any) => o.content ?? []).find((c: any) => c.type === "output_text")?.text;
    return txt ? JSON.parse(txt) as Found : null;
  } catch { return null; }
}

const date = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(v) < new Date() ? v : null);

export async function extractPaperworkDetails(onboardingId: string, actorUserId: string | null) {
  const { data: ob } = await db().from("investor_onboardings").select("id, offering_id, investment_profile_id").eq("id", onboardingId).maybeSingle();
  if (!ob) return null;
  const { data: ip } = await db().from("investment_profiles").select("id, person_id, profile_type, legal_name, tax_id_last4").eq("id", ob.investment_profile_id).maybeSingle();
  const { data: docs } = await db().from("prior_signed_documents").select("id, document_kind, storage_path, file_name")
    .eq("onboarding_id", onboardingId).in("document_kind", ["subscription_agreement", "accreditation", "schedule_k1"]);
  const merged: Found = { tax_id: null, tax_id_kind: null, date_of_birth: null, phone: null, address_line1: null, city: null, region: null, postal_code: null, people: [] };
  const ordered = ((docs ?? []) as any[]).sort((a) => (a.document_kind === "subscription_agreement" ? -1 : 1));
  for (const d of ordered) {
    const { data: blob } = await db().storage.from(BUCKET).download(d.storage_path);
    if (!blob) continue;
    const f = await readPaper(await blob.arrayBuffer(), String(d.file_name ?? "paper.pdf"));
    if (!f) continue;
    for (const k of Object.keys(merged) as (keyof Found)[]) {
      if (k === "people") { if (!merged.people.length && f.people?.length) merged.people = f.people; continue; }
      if (merged[k] == null && f[k] != null) (merged as any)[k] = f[k];
    }
  }
  const isEntity = ip && ip.profile_type !== "individual";
  const filled: string[] = [];
  const now = new Date().toISOString();
  const log = (table: string, id: string, field: string, to: string, managerVisible = true) =>
    db().from("investor_record_changes").insert({ offering_id: ob.offering_id, onboarding_id: ob.id, subject_table: table, subject_id: id, field, old_value: null, new_value: `${to} (from signed paperwork)`, source: "document", actor_user_id: actorUserId, manager_visible: managerVisible });
  const { encryptTin } = await import("@/lib/irs-forms.server");
  const digits = String(merged.tax_id ?? "").replace(/\D/g, "");

  if (ip?.person_id) {
    const { data: p } = await db().from("persons").select("id, date_of_birth, phone, address_line1, city, region, postal_code, tax_id_last4").eq("id", ip.person_id).maybeSingle();
    if (p) {
      const fills = blankOnlyFills(p, { date_of_birth: isEntity ? null : date(merged.date_of_birth), phone: merged.phone,
        ...(p.address_line1 ? {} : { address_line1: merged.address_line1, city: merged.city, region: merged.region, postal_code: merged.postal_code }) });
      if (Object.keys(fills).length) {
        await db().from("persons").update({ ...fills, updated_at: now }).eq("id", p.id);
        for (const k of Object.keys(fills)) { filled.push(k === "date_of_birth" ? "birthday" : k.replace(/_/g, " ")); await log("persons", p.id, k, k === "date_of_birth" ? "on file" : String((fills as any)[k]), k !== "date_of_birth"); }
      }
      if (!isEntity && !p.tax_id_last4 && digits.length === 9 && merged.tax_id_kind !== "ein") {
        const enc = await encryptTin(digits);
        const { error } = await db().rpc("store_person_tax_id", { _person: p.id, _ciphertext: enc.ciphertext, _iv: enc.iv, _key_version: enc.keyVersion, _actor: actorUserId });
        if (!error) { await db().from("persons").update({ tax_id_last4: digits.slice(-4), updated_at: now }).eq("id", p.id); await log("persons", p.id, "tax_id", `•••${digits.slice(-4)}`); filled.push("SSN"); }
      }
    }
  }
  if (isEntity && ip && !ip.tax_id_last4 && digits.length === 9 && merged.tax_id_kind !== "ssn") {
    const enc = await encryptTin(digits);
    const { error } = await db().rpc("store_profile_tax_id", { _profile: ip.id, _ciphertext: enc.ciphertext, _iv: enc.iv, _key_version: enc.keyVersion, _actor: actorUserId });
    if (!error) { await db().from("investment_profiles").update({ tax_id_last4: digits.slice(-4) }).eq("id", ip.id); await log("investment_profiles", ip.id, "tax_id", `•••${digits.slice(-4)}`); filled.push("EIN"); }
  }
  if (filled.length) {
    const { reconcileAfter } = await import("@/lib/investor-onboarding.server");
    await reconcileAfter([ob.id], { actorUserId, trigger: "paperwork_details" });
  }
  return { onboardingId, investor: String(ip?.legal_name ?? ""), entity: Boolean(isEntity), filled, peopleNamed: merged.people, papersRead: ordered.length };
}
