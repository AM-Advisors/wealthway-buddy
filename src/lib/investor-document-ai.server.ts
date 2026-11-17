/**
 * Read an investor document (PDF or image) with AI and turn what it finds into
 * suggested updates on the investor record. Never writes the record directly;
 * Harmonious reviewers accept or reject each suggestion. Tax IDs are never extracted.
 */
import { assertOnboardingAccess, forbid } from "@/lib/investor-onboarding.server";
import { proposeUpdate } from "@/lib/investor-record.server";

type Target = { table: "persons" | "investment_profiles" | "investor_onboardings"; field: string; kind: "text" | "date" | "cents" };
const FIELDS: Record<string, Target> = {
  first_name: { table: "persons", field: "legal_first_name", kind: "text" },
  middle_name: { table: "persons", field: "legal_middle_name", kind: "text" },
  last_name: { table: "persons", field: "legal_last_name", kind: "text" },
  email: { table: "persons", field: "email", kind: "text" },
  phone: { table: "persons", field: "phone", kind: "text" },
  date_of_birth: { table: "persons", field: "date_of_birth", kind: "date" },
  citizenship_country: { table: "persons", field: "citizenship_country", kind: "text" },
  address_line1: { table: "persons", field: "address_line1", kind: "text" },
  address_line2: { table: "persons", field: "address_line2", kind: "text" },
  city: { table: "persons", field: "city", kind: "text" },
  region: { table: "persons", field: "region", kind: "text" },
  postal_code: { table: "persons", field: "postal_code", kind: "text" },
  country: { table: "persons", field: "country", kind: "text" },
  investing_entity_legal_name: { table: "investment_profiles", field: "legal_name", kind: "text" },
  commitment_amount_usd: { table: "investor_onboardings", field: "commitment_amount_cents", kind: "cents" },
  investment_date: { table: "investor_onboardings", field: "investment_date", kind: "date" },
};
const KEYS = Object.keys(FIELDS);

const TYPE_KEYS = ["tax_form", "accreditation_proof", "identification", "proof_of_address", "entity_formation", "operating_agreement", "ownership_list", "subscription_agreement", "side_letter", "other"];
async function ai(content: any[], extra = "") {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI isn't configured.");
  const schema = {
    type: "object", additionalProperties: false, required: ["document_kind", "summary", "detected_type", "names", "signed", "document_date", "expires_on", "tax_form", ...KEYS],
    properties: {
      document_kind: { type: "string" }, summary: { type: "string" },
      detected_type: { type: "string", enum: [...TYPE_KEYS, "unknown"] },
      names: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "role"], properties: { name: { type: "string" }, role: { type: "string", enum: ["person", "entity", "signer"] } } } },
      signed: { type: ["boolean", "null"] }, document_date: { type: ["string", "null"] }, expires_on: { type: ["string", "null"] }, tax_form: { type: ["string", "null"] },
      ...Object.fromEntries(KEYS.map((k) => [k, { type: ["string", "null"] }])),
    },
  };
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: "openai/gpt-6-astra", reasoning: { effort: "low" }, store: false,
      instructions: "You read investor documents for a fund administrator (subscription agreements, W-9s, IDs, accreditation letters, entity documents, statements). Return only values clearly printed in the document; use null when absent or unclear. Dates as YYYY-MM-DD. Amounts as plain numbers in US dollars. Never return SSNs, EINs, ITINs, account or ID numbers. document_kind: short label like 'Subscription agreement'. summary: one sentence. detected_type: the best matching type. names: every person, entity or trust the document is for or signed by (role signer for signatories). signed: whether a signature appears. document_date: the date on the document or signature date. expires_on: expiry for IDs. tax_form: e.g. 'W-9', 'W-8BEN', 'W-8BEN-E' for tax forms, else null." + extra,
      input: [{ role: "user", content }],
      text: { format: { type: "json_schema", name: "investor_doc", strict: true, schema } },
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.error(`investor document AI failed [${res.status}]: ${t}`);
    if (res.status === 429) throw new Error("The AI helper is busy. Try again in a minute.");
    if (res.status === 402) throw new Error("AI credits have run out. Add credits in Settings → Plans & credits.");
    throw new Error(`AI request failed [${res.status}].`);
  }
  const j: any = await res.json();
  const text = String(j?.output_text ?? (j?.output ?? []).flatMap((o: any) => o?.content ?? []).filter((c: any) => c?.type === "output_text").map((c: any) => c.text).join(""));
  try { return JSON.parse(text); } catch { throw new Error("The AI couldn't read that document."); }
}

function normalize(kind: Target["kind"], raw: string): unknown {
  const v = raw.trim();
  if (!v) return null;
  if (kind === "date") return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  if (kind === "cents") { const n = Number(v.replace(/[,$\s]/g, "")); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null; }
  // Defensive: drop anything that looks like a 9-digit tax number.
  if (/\b\d{3}-?\d{2}-?\d{4}\b/.test(v)) return null;
  return v.slice(0, 300);
}

type Values = Record<string, string>;

/** Investing party, person, joint investor, signers and owners of this investment. */
async function partiesFor(onboardingId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const d = supabaseAdmin as any;
  const { data: ob } = await d.from("investor_onboardings").select("id, offering_id, person_id, investment_profile_id").eq("id", onboardingId).maybeSingle();
  const parties: { name: string; role: "investing_party" | "person" | "joint" | "signer" | "owner" }[] = [];
  let profileType: string | null = null, country: string | null = null;
  const personName = (p: any) => [p?.legal_first_name, p?.legal_middle_name, p?.legal_last_name].filter(Boolean).join(" ");
  if (ob?.investment_profile_id) {
    const { data: prof } = await d.from("investment_profiles").select("legal_name, display_label, profile_type, country").eq("id", ob.investment_profile_id).maybeSingle();
    profileType = prof?.profile_type ?? null; country = prof?.country ?? null;
    for (const n of [prof?.legal_name, prof?.display_label]) if (n) parties.push({ name: String(n), role: "investing_party" });
    const { data: rel } = await d.from("investment_profile_relationships").select("role, is_authorized_signer, person_id, status").eq("profile_id", ob.investment_profile_id);
    const ids = ((rel ?? []) as any[]).map((r) => r.person_id).filter(Boolean);
    const { data: ps } = ids.length ? await d.from("persons").select("id, legal_first_name, legal_middle_name, legal_last_name").in("id", ids) : { data: [] };
    for (const r of (rel ?? []) as any[]) {
      const p = ((ps ?? []) as any[]).find((x) => x.id === r.person_id);
      if (p) parties.push({ name: personName(p), role: r.is_authorized_signer ? "signer" : /joint/i.test(String(r.role)) ? "joint" : "owner" });
    }
  }
  if (ob?.person_id) {
    const { data: p } = await d.from("persons").select("legal_first_name, legal_middle_name, legal_last_name, country, residence_country").eq("id", ob.person_id).maybeSingle();
    if (p) { parties.push({ name: personName(p), role: "person" }); country = country ?? p.residence_country ?? p.country ?? null; }
  }
  return { ob, parties: parties.filter((p) => p.name.trim()), profileType, country };
}

async function existingDocs(onboardingId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const d = supabaseAdmin as any;
  const [{ data: up }, { data: prior }] = await Promise.all([
    d.from("investor_documents").select("file_name, doc_kind, uploaded_at").eq("onboarding_id", onboardingId),
    d.from("prior_signed_documents").select("file_name, document_kind, created_at").eq("onboarding_id", onboardingId),
  ]);
  return [
    ...((up ?? []) as any[]).map((r) => ({ fileName: String(r.file_name ?? ""), kind: String(r.doc_kind), savedAt: String(r.uploaded_at ?? "").slice(0, 10) })),
    ...((prior ?? []) as any[]).map((r) => ({ fileName: String(r.file_name ?? ""), kind: String(r.document_kind), savedAt: String(r.created_at ?? "").slice(0, 10) })),
  ];
}

async function logRead(userId: string, onboardingId: string, event: string, detail: Record<string, unknown>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const d = supabaseAdmin as any;
  const { data: ob } = await d.from("investor_onboardings").select("offering_id").eq("id", onboardingId).maybeSingle();
  await d.from("investor_onboarding_events").insert({ onboarding_id: onboardingId, offering_id: ob?.offering_id ?? null, event, detail, actor_user_id: userId, actor_role: "harmonious" }).then(() => null, () => null);
}

/** Turns read values into suggested updates on the chosen investment (never applies them). */
async function propose(userId: string, onboardingId: string, name: string, values: Values) {
  const { editableSuggestionText } = await import("@/lib/investor-suggestion-edit");
  const found: { label: string; value: unknown; suggested: boolean; suggestionId: string | null; editValue: string }[] = [];
  for (const k of KEYS) {
    const raw = values[k];
    if (typeof raw !== "string") continue;
    const t = FIELDS[k]!;
    const value = normalize(t.kind, raw);
    if (value == null) continue;
    const r = await proposeUpdate(userId, { onboardingId, subjectTable: t.table, field: t.field, proposed: value, source: "document", sourceRef: name });
    found.push({ label: k.replace(/_/g, " "), value: t.kind === "cents" ? `$${((value as number) / 100).toLocaleString()}` : value, suggested: r.created, suggestionId: (r as { id?: string }).id ?? null, editValue: editableSuggestionText(t.field, value) });
  }
  return found;
}

export async function readInvestorDocument(userId: string, input: { onboardingId: string; fileName: string; mimeType: string; base64: string; expectedKind?: string | null | undefined }) {
  const { role } = await assertOnboardingAccess(userId, input.onboardingId);
  if (role !== "staff") forbid("only Harmonious can read documents with AI.");
  const m = await import("@/lib/investor-document-save-model");
  const name = input.fileName.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "document";
  const isPdf = input.mimeType === "application/pdf";
  const part = isPdf
    ? { type: "input_file", filename: name.endsWith(".pdf") ? name : `${name}.pdf`, file_data: `data:application/pdf;base64,${input.base64}` }
    : { type: "input_image", image_url: `data:${input.mimeType};base64,${input.base64}` };
  const expected = input.expectedKind && m.saveTarget(input.expectedKind) ? (input.expectedKind as import("@/lib/investor-document-save-model").SaveTargetKey) : null;
  const out = await ai([part, { type: "input_text", text: `File name: ${name}` }], expected ? ` The reviewer says this is: ${m.TARGET_HINT[expected]} Read the details that type contains. If it is clearly a different type, say so in detected_type.` : "");

  const values: Values = {};
  for (const k of KEYS) if (typeof out?.[k] === "string" && out[k].trim()) values[k] = String(out[k]).slice(0, 300);
  const clean = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const names = (Array.isArray(out?.names) ? out.names : []).slice(0, 10).map((n: any) => ({ name: String(n?.name ?? "").replace(/\d{5,}/g, "").slice(0, 200), role: ["person", "entity", "signer"].includes(n?.role) ? n.role : "person" }));
  const detected = TYPE_KEYS.includes(out?.detected_type) ? (out.detected_type as import("@/lib/investor-document-save-model").SaveTargetKey) : null;
  const target = expected ?? detected ?? m.guessSaveTarget(String(out?.document_kind ?? ""));
  const { parties, profileType, country } = await partiesFor(input.onboardingId);
  const owner = m.ownerMatch(names, parties);
  const documentDate = clean(out?.document_date), expiresOn = clean(out?.expires_on);
  const taxForm = typeof out?.tax_form === "string" ? out.tax_form.slice(0, 20) : null;
  const warnings = m.expiryWarnings({ target, documentDate, expiresOn, today: new Date().toISOString().slice(0, 10) });
  const fit = target === "tax_form" ? m.taxFormFit({ form: taxForm, profileType, country }) : null;
  if (fit) warnings.push(fit);
  const duplicate = m.duplicateOf(await existingDocs(input.onboardingId), name, target);
  // Suggestions are created only once the owner is a match; otherwise the reviewer confirms first.
  const found = owner.status === "match" ? await propose(userId, input.onboardingId, name, values) : [];
  await logRead(userId, input.onboardingId, "document_read_with_ai", { fileName: name, expectedType: expected, detectedType: detected, owner: owner.status, matchedRole: owner.matched?.role ?? null });
  return {
    documentKind: String(out?.document_kind ?? "Document"), summary: String(out?.summary ?? ""), found,
    values, detectedType: detected, typeMismatch: !!(expected && detected && expected !== detected && detected !== "other"),
    suggestedType: target, names, owner: { status: owner.status, matchedName: owner.matched?.name ?? null, matchedRole: owner.matched?.role ?? null },
    signed: typeof out?.signed === "boolean" ? out.signed : null, documentDate, expiresOn, taxForm, warnings,
    duplicate: duplicate ? { savedAt: duplicate.savedAt, kind: duplicate.kind } : null,
  };
}

/** Reviewer confirmed the owner (this investment) or moved the file to another investment in the same fund. */
export async function confirmDocumentOwner(userId: string, input: { onboardingId: string; targetOnboardingId: string; fileName: string; values: Values; within?: string | null | undefined }) {
  const { role, row } = await assertOnboardingAccess(userId, input.onboardingId);
  if (role !== "staff") forbid("only Harmonious can read documents with AI.");
  const target = await assertOnboardingAccess(userId, input.targetOnboardingId);
  if (target.role !== "staff") forbid("only Harmonious can read documents with AI.");
  if ((target.row as any).offering_id !== (row as any).offering_id) forbid("documents can only move to an investor in the same fund.");
  if ((target.row as any).removed_at) throw new Error("That investment was removed from the fund.");
  const name = input.fileName.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "document";
  const values: Values = {};
  for (const k of KEYS) if (typeof input.values[k] === "string") values[k] = String(input.values[k]).slice(0, 300);
  const found = await propose(userId, input.targetOnboardingId, name, values);
  const moved = input.targetOnboardingId !== input.onboardingId;
  await logRead(userId, input.onboardingId, moved ? "document_owner_moved" : "document_owner_confirmed", { fileName: name, toOnboardingId: moved ? input.targetOnboardingId : null, within: input.within ?? null });
  if (moved) await logRead(userId, input.targetOnboardingId, "document_owner_moved_here", { fileName: name, fromOnboardingId: input.onboardingId });
  return { found, onboardingId: input.targetOnboardingId };
}

/** Same-fund investments a document can be moved to (staff only). */
export async function documentOwnerOptions(userId: string, onboardingId: string) {
  const { role, row } = await assertOnboardingAccess(userId, onboardingId);
  if (role !== "staff") forbid("only Harmonious can read documents with AI.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const d = supabaseAdmin as any;
  const { data: obs } = await d.from("investor_onboardings").select("id, person_id, investment_profile_id").eq("offering_id", (row as any).offering_id).is("removed_at", null).is("merged_into_onboarding_id", null).limit(1000);
  const list = (obs ?? []) as any[];
  const pIds = [...new Set(list.map((o) => o.person_id).filter(Boolean))];
  const prIds = [...new Set(list.map((o) => o.investment_profile_id).filter(Boolean))];
  const [{ data: ps }, { data: prs }] = await Promise.all([
    pIds.length ? d.from("persons").select("id, legal_first_name, legal_last_name").in("id", pIds) : { data: [] },
    prIds.length ? d.from("investment_profiles").select("id, legal_name, display_label").in("id", prIds) : { data: [] },
  ]);
  const pn = new Map(((ps ?? []) as any[]).map((p) => [p.id, [p.legal_first_name, p.legal_last_name].filter(Boolean).join(" ")]));
  const pr = new Map(((prs ?? []) as any[]).map((p) => [p.id, p.legal_name || p.display_label || ""]));
  return list.map((o) => {
    const party = pr.get(o.investment_profile_id) || "", person = pn.get(o.person_id) || "";
    return { value: String(o.id), label: [party, person && person !== party ? person : ""].filter(Boolean).join(" · ") || "Unnamed investor" };
  }).sort((a, b) => a.label.localeCompare(b.label));
}

const READ_EVENTS = ["document_read_with_ai", "document_owner_confirmed", "document_owner_moved", "document_owner_moved_here", "document_saved_from_ai", "document_used_from_ai"];
export async function recentDocumentReads(userId: string, onboardingId: string) {
  const { role } = await assertOnboardingAccess(userId, onboardingId);
  if (role !== "staff") forbid("only Harmonious can read documents with AI.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any).from("investor_onboarding_events").select("event, detail, created_at").eq("onboarding_id", onboardingId).in("event", READ_EVENTS).order("created_at", { ascending: false }).limit(40);
  return ((data ?? []) as any[]).map((e) => ({ event: String(e.event), at: String(e.created_at), fileName: String(e.detail?.fileName ?? ""), detail: e.detail ?? {} }));
}

export async function recordDocumentStep(userId: string, input: { onboardingId: string; fileName: string; step: "saved" | "used"; type: string; use?: string | null | undefined }) {
  const { role } = await assertOnboardingAccess(userId, input.onboardingId);
  if (role !== "staff") forbid("only Harmonious can read documents with AI.");
  await logRead(userId, input.onboardingId, input.step === "saved" ? "document_saved_from_ai" : "document_used_from_ai", { fileName: input.fileName.slice(0, 120), type: input.type, use: input.use ?? null });
  return { ok: true };
}
