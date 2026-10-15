/**
 * Staff tools for people records: edit details and start a Didit ID check.
 * Any Harmonious staff member may use these (checked on the server every call).
 * Two kinds of check:
 *  - link: a Didit session emailed to the person (document + selfie = full KYC);
 *  - document: staff upload a license/passport; Didit checks the document and runs
 *    AML screening. That's marked "document only" and never sets KYC to approved.
 * ID images go straight to Didit and are never stored in Harmonious.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";
import { OPS_STAFF_ROLES } from "@/lib/ops-capabilities";

const SITE = "https://app.harmonious.co";
const DIDIT = "https://verification.didit.me/v2";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}
async function assertStaff(uid: string) {
  const { data } = await (await db()).from("user_roles").select("role").eq("user_id", uid);
  if (!((data ?? []) as any[]).some((r) => (OPS_STAFF_ROLES as readonly string[]).includes(r.role))) throw new Error("Only Harmonious staff can do this.");
}
function diditKey() {
  const k = process.env["DIDIT_API_KEY"]?.trim();
  if (!k) throw new Error("Identity checks aren't configured yet.");
  return k;
}
function logPerson(personId: string, uid: string, action: string, detail: Record<string, unknown>) {
  console.info("[person-records]", action, personId, uid, JSON.stringify(detail).slice(0, 300));
}
const nm = (p: any) => p.preferred_name || [p.legal_first_name, p.legal_last_name].filter(Boolean).join(" ") || p.email || "Unnamed";

const COLS = "id, legal_first_name, legal_middle_name, legal_last_name, preferred_name, email, phone, date_of_birth, citizenship_country, residence_country, address_line1, address_line2, city, region, postal_code, country, kyc_status, aml_status, kyc_verified_at, aml_screened_at, user_id, is_test_demo";

export const listPersonRecordsFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => z.object({ search: z.string().trim().max(100).default("") }).parse(x))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const d = await db();
    let q = d.from("persons").select(COLS).order("updated_at", { ascending: false }).limit(60);
    const s = data.search.replace(/[%,()]/g, " ").trim();
    if (s) q = q.or(`email.ilike.%${s}%,legal_first_name.ilike.%${s}%,legal_last_name.ilike.%${s}%,preferred_name.ilike.%${s}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const ids = ((rows ?? []) as any[]).map((r) => r.id);
    const { data: reqs } = ids.length ? await d.from("person_kyc_requests").select("id, person_id, mode, status, id_status, aml_status, session_url, created_at").in("person_id", ids).order("created_at", { ascending: false }) : { data: [] };
    return ((rows ?? []) as any[]).map((p) => ({ ...p, name: nm(p), checks: ((reqs ?? []) as any[]).filter((r) => r.person_id === p.id).slice(0, 5) }));
  });

const personFields = z.object({
  legal_first_name: z.string().trim().max(100).optional(), legal_middle_name: z.string().trim().max(100).optional(),
  legal_last_name: z.string().trim().max(100).optional(), preferred_name: z.string().trim().max(100).optional(),
  email: z.string().trim().max(200).optional(), phone: z.string().trim().max(40).optional(),
  date_of_birth: z.string().trim().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Use YYYY-MM-DD").optional(),
  citizenship_country: z.string().trim().max(60).optional(), residence_country: z.string().trim().max(60).optional(),
  address_line1: z.string().trim().max(200).optional(), address_line2: z.string().trim().max(200).optional(),
  city: z.string().trim().max(100).optional(), region: z.string().trim().max(60).optional(),
  postal_code: z.string().trim().max(20).optional(), country: z.string().trim().max(60).optional(),
});

export const savePersonRecordFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => z.object({ id: z.string().uuid().optional(), fields: personFields }).parse(x))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const d = await db();
    const f: Record<string, any> = {};
    for (const [k, v] of Object.entries(data.fields)) if (v !== undefined) f[k] = v === "" ? null : v;
    if (f["email"]) f["email"] = String(f["email"]).toLowerCase();
    if (data.id) {
      const { error } = await d.from("persons").update({ ...f, updated_at: new Date().toISOString() }).eq("id", data.id);
      if (error) throw new Error(error.message);
      await logPerson(data.id, context.userId, "person_updated", { fields: Object.keys(f) });
      return { id: data.id };
    }
    if (!f["legal_first_name"] && !f["email"]) throw new Error("Add at least a first name or an email.");
    const { data: row, error } = await d.from("persons").insert({ ...f, created_by: context.userId, entry_source: "staff" }).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

/** Full KYC: create a Didit session prefilled with the person's details and email them the link. */
export const sendKycLinkFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => z.object({ personId: z.string().uuid() }).parse(x))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const d = await db();
    const { data: p } = await d.from("persons").select(COLS).eq("id", data.personId).maybeSingle();
    if (!p) throw new Error("Person not found.");
    const { sendPersonKycLink } = await import("@/lib/person-kyc-link.server");
    return sendPersonKycLink(p, context.userId);
  });

/** Pull the latest Didit result for a link check; approved results apply to the person (Didit is the authority). */
export const refreshKycLinkFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => z.object({ requestId: z.string().uuid() }).parse(x))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const d = await db();
    const { data: r } = await d.from("person_kyc_requests").select("*").eq("id", data.requestId).maybeSingle();
    if (!r || r.mode !== "link" || !r.session_id) throw new Error("Nothing to refresh.");
    const { fetchDiditSessionDecision, mapDiditStatus, amlStatusFromDecision } = await import("@/lib/didit.server");
    const dec: any = await fetchDiditSessionDecision(r.session_id);
    if (!dec) throw new Error("Didit has no result yet.");
    const kyc = mapDiditStatus(dec.status)?.kyc ?? "pending";
    const aml = amlStatusFromDecision(dec)?.status ?? null;
    const now = new Date().toISOString();
    await d.from("person_kyc_requests").update({ status: kyc, id_status: dec.status ?? null, aml_status: aml, updated_at: now }).eq("id", r.id);
    if (kyc === "approved") {
      await d.from("persons").update({ kyc_status: "approved", kyc_verified_at: now, identity_verified_at: now, ...(aml ? { aml_status: aml, aml_screened_at: now } : {}) }).eq("id", r.person_id);
    } else if (kyc === "declined") {
      await d.from("persons").update({ kyc_status: "declined" }).eq("id", r.person_id);
    }
    await logPerson(r.person_id, context.userId, "kyc_link_refreshed", { status: dec.status });
    return { status: kyc, aml };
  });

/** Document-only: check an uploaded license/passport and run AML. Images are sent to Didit, never stored. */
export const runDocumentCheckFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => z.object({
    personId: z.string().uuid(), documentType: z.enum(["drivers_license", "passport"]),
    front: z.object({ base64: z.string().max(14_000_000), contentType: z.string().max(60), fileName: z.string().max(200) }),
    back: z.object({ base64: z.string().max(14_000_000), contentType: z.string().max(60), fileName: z.string().max(200) }).optional(),
  }).parse(x))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const d = await db();
    const { data: p } = await d.from("persons").select(COLS).eq("id", data.personId).maybeSingle();
    if (!p) throw new Error("Person not found.");
    const key = diditKey();
    const blob = (f: { base64: string; contentType: string }) => new Blob([Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0))], { type: f.contentType || "image/jpeg" });
    const form = new FormData();
    form.append("front_image", blob(data.front), data.front.fileName);
    if (data.back) form.append("back_image", blob(data.back), data.back.fileName);
    const idRes = await fetch(`${DIDIT}/id-verification/`, { method: "POST", headers: { "x-api-key": key }, body: form });
    const idText = await idRes.text();
    if (!idRes.ok) { console.error("[person-kyc] id check failed", idRes.status, idText.slice(0, 300)); throw new Error(`Didit couldn't check the document [${idRes.status}]: ${idText.slice(0, 200)}`); }
    const idj = JSON.parse(idText);
    const idv = idj.id_verification ?? idj;
    const idStatus = String(idv.status ?? "Unknown");
    const fullName = [idv.first_name, idv.last_name].filter(Boolean).join(" ") || idv.full_name || nm(p);
    const dob = idv.date_of_birth ?? p.date_of_birth ?? undefined;
    let amlStatus: string | null = null; let hits = 0;
    try {
      const amlRes = await fetch(`${DIDIT}/aml/`, { method: "POST", headers: { "content-type": "application/json", "x-api-key": key }, body: JSON.stringify({ full_name: fullName, ...(dob ? { date_of_birth: dob } : {}), ...(idv.nationality ? { nationality: idv.nationality } : {}) }) });
      const amlText = await amlRes.text();
      if (amlRes.ok) {
        const a = JSON.parse(amlText); const aml = a.aml ?? a;
        hits = Number(aml.total_hits ?? (Array.isArray(aml.hits) ? aml.hits.length : 0)) || 0;
        const st = String(aml.status ?? "").toLowerCase();
        amlStatus = st === "declined" ? "declined" : st === "in review" || hits > 0 ? "review" : st === "approved" ? "approved" : "pending";
      } else console.error("[person-kyc] aml failed", amlRes.status, amlText.slice(0, 300));
    } catch (e) { console.error("[person-kyc] aml error", e); }
    const now = new Date().toISOString();
    const summary = { documentType: data.documentType, idStatus, nameOnDocument: fullName, dateOfBirth: dob ?? null, nationality: idv.nationality ?? null, expiry: idv.expiration_date ?? null, documentNumberLast4: idv.document_number ? String(idv.document_number).slice(-4) : null, amlHits: hits, note: "Document only: no selfie or liveness check, so this is not full KYC." };
    const { data: row, error } = await d.from("person_kyc_requests").insert({ person_id: p.id, mode: "document", document_type: data.documentType, session_id: idj.request_id ?? null, status: "completed", id_status: idStatus, aml_status: amlStatus, result_summary: summary, created_by: context.userId }).select("id").single();
    if (error) throw new Error(error.message);
    if (amlStatus) await d.from("persons").update({ aml_status: amlStatus, aml_screened_at: now }).eq("id", p.id);
    await logPerson(p.id, context.userId, "document_check", { idStatus, amlStatus });
    return { id: row.id as string, idStatus, amlStatus, summary };
  });
