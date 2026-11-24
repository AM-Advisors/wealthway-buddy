import { isEntityProfile } from "@/lib/profile-kind";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { canOpenIdentity, ID_KIND_LABELS, type IdKind } from "@/lib/person-id-cards";
import { extensionFor, isAllowedIdFile } from "@/lib/government-id";

const BUCKET = "government-ids";
const db = () => supabaseAdmin as any;
const fail = (m: string): never => { throw new Error(m); };

type Person = { personId: string; name: string; role: string; isPrimary: boolean };

/** Staff or a manager of this investment's exact fund; returns the investment's people. */
async function scope(userId: string, onboardingId: string) {
  const { onboardingActor } = await import("@/lib/investor-onboarding.server");
  const actor = await onboardingActor(userId);
  const { data: ob } = await db().from("investor_onboardings").select("id, offering_id, investment_profile_id, investor_user_id").eq("id", onboardingId).maybeSingle();
  if (!ob) fail("That investment couldn't be found.");
  if (!canOpenIdentity(actor, ob.offering_id)) fail("Only Harmonious or this fund's managers can open ID cards and full numbers.");
  const { data: ip } = await db().from("investment_profiles").select("id, person_id, profile_type, legal_name, tax_id_last4").eq("id", ob.investment_profile_id).maybeSingle();
  const people: Person[] = [];
  const seen = new Set<string>();
  const nameOf = (p: any) => `${p?.legal_first_name ?? ""} ${p?.legal_last_name ?? ""}`.trim() || p?.email || "Person";
  if (ip?.person_id) {
    const { data: p } = await db().from("persons").select("id, legal_first_name, legal_last_name, email").eq("id", ip.person_id).maybeSingle();
    if (p) { people.push({ personId: p.id, name: nameOf(p), role: ip.profile_type === "individual" ? "Investor" : "Account holder", isPrimary: true }); seen.add(p.id); }
  }
  if (ip) {
    const { data: rels } = await db().from("investment_profile_relationships").select("person_id, role, status, persons(id, legal_first_name, legal_last_name, email)").eq("profile_id", ip.id);
    for (const r of (rels ?? []) as any[]) {
      if (r.status === "removed" || !r.person_id || seen.has(r.person_id)) continue;
      seen.add(r.person_id);
      people.push({ personId: r.person_id, name: nameOf(r.persons), role: String(r.role ?? "").replace(/_/g, " "), isPrimary: false });
    }
  }
  return { actor, ob, ip, people, role: actor.isStaff ? "harmonious" : "manager" };
}

async function assertPerson(s: Awaited<ReturnType<typeof scope>>, personId: string) {
  if (!s.people.some((p) => p.personId === personId)) fail("That person isn't part of this investment.");
}

export async function listInvestmentIdentity(userId: string, onboardingId: string) {
  const s = await scope(userId, onboardingId);
  const ids = s.people.map((p) => p.personId);
  const [{ data: persons }, { data: docs }] = await Promise.all([
    ids.length ? db().from("persons").select("id, tax_id_last4, date_of_birth").in("id", ids) : { data: [] },
    ids.length ? db().from("person_id_documents").select("id, person_id, document_type, side, status, file_name, read_name, read_birth_date, id_number_last4, expires_on, issuing_region, confirmed_at").in("person_id", ids).eq("status", "active") : { data: [] },
  ]);
  const pm = new Map(((persons ?? []) as any[]).map((p) => [p.id, p]));
  const entity = Boolean(s.ip) && isEntityProfile(s.ip?.profile_type);
  return {
    entity: entity ? { name: String(s.ip.legal_name ?? ""), einLast4: (s.ip.tax_id_last4 as string) ?? null } : null,
    people: s.people.map((p) => ({
      ...p,
      ssnLast4: (pm.get(p.personId)?.tax_id_last4 as string) ?? null,
      cards: ((docs ?? []) as any[]).filter((d) => d.person_id === p.personId).map((d) => ({
        id: String(d.id), kind: String(d.document_type), label: ID_KIND_LABELS[(d.document_type as IdKind) ?? "unknown"] ?? "ID card",
        side: String(d.side), fileName: String(d.file_name), readName: d.read_name ?? null, idLast4: d.id_number_last4 ?? null,
        expiresOn: d.expires_on ?? null, region: d.issuing_region ?? null, uploadedAt: d.confirmed_at ?? null,
      })),
    })),
  };
}

export async function startPersonIdUpload(userId: string, input: { onboardingId: string; personId: string; side: string; documentType: string; fileName: string; mimeType: string; size: number }) {
  const s = await scope(userId, input.onboardingId);
  await assertPerson(s, input.personId);
  const bad = isAllowedIdFile(input.mimeType, input.size, input.fileName);
  if (bad) fail(bad);
  const path = `persons/${input.personId}/${crypto.randomUUID()}.${extensionFor(input.mimeType)}`;
  const { data: row, error } = await db().from("person_id_documents").insert({
    person_id: input.personId, document_type: input.documentType, side: input.side, storage_path: path, file_name: input.fileName,
    mime_type: input.mimeType, size_bytes: input.size, source: s.role === "harmonious" ? "staff_upload" : "manager_upload",
    onboarding_id: s.ob.id, offering_id: s.ob.offering_id, uploaded_by: userId,
  }).select("id").single();
  if (error) fail(error.message);
  const { data: signed, error: se } = await db().storage.from(BUCKET).createSignedUploadUrl(path);
  if (se || !signed) fail("Could not prepare the upload. Please try again.");
  return { id: String(row.id), path, token: String(signed.token) };
}

type IdRead = { document_type: IdKind; full_name: string | null; birth_date: string | null; id_number: string | null; expires_on: string | null; issuing_region: string | null; confidence: string };

async function readIdCard(bytes: ArrayBuffer, mime: string): Promise<IdRead | null> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return null;
  const b64 = Buffer.from(bytes).toString("base64");
  const part = mime === "application/pdf"
    ? { type: "input_file", filename: "id.pdf", file_data: `data:application/pdf;base64,${b64}` }
    : { type: "input_image", image_url: `data:${mime};base64,${b64}` };
  const schema = { type: "object", additionalProperties: false, required: ["document_type", "full_name", "birth_date", "id_number", "expires_on", "issuing_region", "confidence"], properties: {
    document_type: { type: "string", enum: ["passport", "drivers_license", "state_id", "unknown"] },
    full_name: { type: ["string", "null"] }, birth_date: { type: ["string", "null"], description: "YYYY-MM-DD" },
    id_number: { type: ["string", "null"] }, expires_on: { type: ["string", "null"], description: "YYYY-MM-DD" },
    issuing_region: { type: ["string", "null"] }, confidence: { type: "string", enum: ["high", "medium", "low"] } } };
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({ model: "openai/gpt-6-astra", reasoning: { effort: "low" }, store: false,
        instructions: "Identify this government identity document (passport, driver's license or state ID) and read its printed fields. Use null for anything not clearly printed. Never guess.",
        input: [{ role: "user", content: [part, { type: "input_text", text: "Read this ID." }] }],
        text: { format: { type: "json_schema", name: "id_card", strict: true, schema } } }),
    });
    if (!res.ok) return null;
    const j: any = await res.json();
    const txt = j.output_text ?? (j.output ?? []).flatMap((o: any) => o.content ?? []).find((c: any) => c.type === "output_text")?.text;
    return txt ? JSON.parse(txt) as IdRead : null;
  } catch { return null; }
}

const isoDate = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export async function confirmPersonIdUpload(userId: string, input: { onboardingId: string; id: string }) {
  const s = await scope(userId, input.onboardingId);
  const { data: row } = await db().from("person_id_documents").select("*").eq("id", input.id).maybeSingle();
  if (!row || row.status !== "pending" || row.uploaded_by !== userId) fail("That upload is not available.");
  await assertPerson(s, row.person_id);
  const { data: file, error: de } = await db().storage.from(BUCKET).download(row.storage_path);
  if (de || !file) fail("The file didn't finish uploading.");
  const read = await readIdCard(await file.arrayBuffer(), row.mime_type);
  const now = new Date().toISOString();
  const digits = String(read?.id_number ?? "").replace(/[^0-9A-Za-z]/g, "");
  const kind: IdKind = read?.document_type && read.document_type !== "unknown" ? read.document_type : (row.document_type as IdKind);
  await db().from("person_id_documents").update({
    status: "active", confirmed_at: now, document_type: kind,
    read_name: read?.full_name ?? null, read_birth_date: isoDate(read?.birth_date ?? null), id_number_last4: digits ? digits.slice(-4) : null,
    expires_on: isoDate(read?.expires_on ?? null), issuing_region: read?.issuing_region ?? null, read_confidence: read?.confidence ?? null,
  }).eq("id", row.id);
  const { data: prev } = await db().from("person_id_documents").select("id").eq("person_id", row.person_id).eq("side", row.side).eq("status", "active").neq("id", row.id);
  for (const p of (prev ?? []) as any[]) await db().from("person_id_documents").update({ status: "superseded", superseded_by: row.id, superseded_at: now }).eq("id", p.id);
  // A clearly read birthday fills a blank birthday only; KYC status is never changed by an upload.
  const dob = read?.confidence === "high" ? isoDate(read.birth_date) : null;
  if (dob) {
    const { data: per } = await db().from("persons").select("date_of_birth").eq("id", row.person_id).maybeSingle();
    if (per && !per.date_of_birth) {
      await db().from("persons").update({ date_of_birth: dob, updated_at: now }).eq("id", row.person_id);
      await db().from("investor_record_changes").insert({ offering_id: s.ob.offering_id, onboarding_id: s.ob.id, subject_table: "persons", subject_id: row.person_id, field: "date_of_birth", old_value: null, new_value: "on file (from ID card)", source: "document", actor_user_id: userId, manager_visible: false });
    }
  }
  return { ok: true, kind: ID_KIND_LABELS[kind], read: Boolean(read) };
}

async function logReveal(s: Awaited<ReturnType<typeof scope>>, userId: string, kind: "ssn" | "ein" | "id_card", personId: string | null) {
  await db().from("person_identifier_reveals").insert({ person_id: personId, investment_profile_id: s.ip?.id ?? null, onboarding_id: s.ob.id, offering_id: s.ob.offering_id, kind, actor_user_id: userId, actor_role: s.role });
}

export async function personIdCardUrl(userId: string, input: { onboardingId: string; id: string }) {
  const s = await scope(userId, input.onboardingId);
  const { data: row } = await db().from("person_id_documents").select("id, person_id, storage_path, status").eq("id", input.id).maybeSingle();
  if (!row || row.status === "pending") fail("That file is not available.");
  await assertPerson(s, row.person_id);
  const { data: signed, error } = await db().storage.from(BUCKET).createSignedUrl(row.storage_path, 120);
  if (error || !signed) fail("Could not open that file.");
  await logReveal(s, userId, "id_card", row.person_id);
  return { url: String(signed.signedUrl) };
}

export async function revealFullTaxNumber(userId: string, input: { onboardingId: string; personId?: string | null | undefined; entity?: boolean | undefined }) {
  const s = await scope(userId, input.onboardingId);
  const { decryptTin } = await import("@/lib/irs-forms.server");
  if (input.entity) {
    if (!s.ip) fail("No investing entity on file.");
    const { data } = await db().rpc("read_profile_tax_id", { _profile: s.ip.id });
    const r = ((data ?? []) as any[])[0];
    if (!r) fail("No EIN is on file yet.");
    await logReveal(s, userId, "ein", null);
    return { number: await decryptTin(r.ciphertext, r.iv) };
  }
  if (!input.personId) fail("Choose a person.");
  await assertPerson(s, input.personId as string);
  const { data } = await db().rpc("read_person_tax_id", { _person: input.personId });
  const r = ((data ?? []) as any[])[0];
  if (!r) fail("No SSN is on file yet.");
  await logReveal(s, userId, "ssn", input.personId as string);
  return { number: await decryptTin(r.ciphertext, r.iv) };
}
