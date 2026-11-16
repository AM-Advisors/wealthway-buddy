// Server-only: KYC/KYB/AML details entered by Operations, decided by a second authorized reviewer.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ACCOUNT_KYC_DECIDERS } from "@/lib/account-kyc-model";
import { isEntityProfileType } from "@/lib/identity-model";
import {
  approvalEffects, approvalError, cleanIdNumber, companyApprovalEffects, countryCode, entryProblems, screeningFromResponse, sensitiveSummary,
  type AmlEntry, type EntryInput, type KybEntry, type KycEntry, type PersonDetails, type ScreeningResult, type BulkMatch,
} from "@/lib/staff-verification-model";

const db = () => supabaseAdmin as any;
const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const BUCKET = "government-ids";
const PATH = "/ops/verifications";
const NONE = "00000000-0000-0000-0000-000000000000";

async function roles(uid: string): Promise<string[]> {
  const { data } = await db().from("user_roles").select("role").eq("user_id", uid);
  return ((data ?? []) as any[]).map((r) => String(r.role));
}
async function assertVerifier(uid: string) {
  const r = await roles(uid);
  if (!r.some((x) => ACCOUNT_KYC_DECIDERS.includes(x))) throw new Error("Only Harmonious Operations and compliance can enter or review verification details.");
  return r;
}
const nameOf = (p: any) => [p?.legal_first_name, p?.legal_middle_name, p?.legal_last_name].filter(Boolean).join(" ").trim();
const companyName = (p: any) => String(p?.legal_name || p?.display_label || "").trim();

async function logEvent(entry: { id: string; person_id: string }, event: string, from: string | null, to: string | null, actor: string, note: string | null = null) {
  await db().from("staff_verification_entry_events").insert({ entry_id: entry.id, person_id: entry.person_id, event, from_status: from, to_status: to, note, actor_user_id: actor });
}

/** People Operations can enter details for: investors and client contacts, with context labels. */
export async function verificationPeople(uid: string) {
  await assertVerifier(uid);
  const { data: persons } = await db().from("persons").select("id, user_id, email, legal_first_name, legal_middle_name, legal_last_name, kyc_status, aml_status, is_test_demo").is("merged_into_person_id", null).order("legal_last_name").limit(2000);
  const ids = ((persons ?? []) as any[]).map((p) => p.id);
  const [{ data: contacts }, { data: obs }, { data: open }] = await Promise.all([
    db().from("client_contacts").select("person_id, clients(name)").not("person_id", "is", null).is("deactivated_at", null),
    db().from("investor_onboardings").select("person_id").in("person_id", ids.length ? ids : [NONE]).not("stage", "in", "(declined,cancelled)"),
    db().from("staff_verification_entries").select("person_id").eq("status", "review").eq("subject_kind", "person"),
  ]);
  const clientsOf = new Map<string, string[]>();
  for (const c of (contacts ?? []) as any[]) { const n = c.clients?.name; if (n) clientsOf.set(c.person_id, [...(clientsOf.get(c.person_id) ?? []), n]); }
  const invest = new Map<string, number>();
  for (const o of (obs ?? []) as any[]) invest.set(o.person_id, (invest.get(o.person_id) ?? 0) + 1);
  const waiting = new Set(((open ?? []) as any[]).map((o) => o.person_id));
  return ((persons ?? []) as any[]).map((p) => ({
    id: String(p.id), userId: p.user_id ? String(p.user_id) : null, name: nameOf(p) || p.email || "Unnamed person", email: p.email ?? null, hasLogin: !!p.user_id, isSelf: p.user_id === uid,
    kycStatus: p.kyc_status ?? "not_started", amlStatus: p.aml_status ?? "not_started", testDemo: !!p.is_test_demo,
    clients: [...new Set(clientsOf.get(p.id) ?? [])], investments: invest.get(p.id) ?? 0, waiting: waiting.has(p.id),
  }));
}

/** Companies (investing entities) Operations can enter business verification for. */
export async function verificationCompanies(uid: string) {
  await assertVerifier(uid);
  const { data: profiles } = await db().from("investment_profiles").select("id, person_id, profile_type, legal_name, display_label, tax_id_last4, status")
    .not("profile_type", "in", "(individual,joint,ira,retirement_plan)").limit(2000);
  const rows = ((profiles ?? []) as any[]).filter((p) => isEntityProfileType(p.profile_type));
  const ids = rows.map((p) => p.id), pids = [...new Set(rows.map((p) => p.person_id).filter(Boolean))];
  const [{ data: evs }, { data: owners }, { data: open }] = await Promise.all([
    db().from("entity_verifications").select("profile_id, kyb_status, entity_aml_status").in("profile_id", ids.length ? ids : [NONE]),
    db().from("persons").select("id, user_id, email, legal_first_name, legal_middle_name, legal_last_name").in("id", pids.length ? pids : [NONE]),
    db().from("staff_verification_entries").select("profile_id").eq("status", "review").eq("subject_kind", "company"),
  ]);
  const ev = new Map(((evs ?? []) as any[]).map((e) => [e.profile_id, e]));
  const om = new Map(((owners ?? []) as any[]).map((o) => [o.id, o]));
  const waiting = new Set(((open ?? []) as any[]).map((o) => o.profile_id));
  return rows.map((p) => {
    const o = om.get(p.person_id);
    return {
      id: String(p.id), name: companyName(p) || "Unnamed company", type: String(p.profile_type), ownerName: nameOf(o) || o?.email || null,
      isOwnCompany: o?.user_id === uid, kybStatus: ev.get(p.id)?.kyb_status ?? "not_started", amlStatus: ev.get(p.id)?.entity_aml_status ?? "not_started",
      waiting: waiting.has(p.id),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

/** Runs one fresh watchlist screening with the platform's verification provider. Paid per check. */
async function runFreshScreening(q: { name: string; entityType: "person" | "company"; dateOfBirth?: string | null; nationality?: string | null; documentNumber?: string | null; ref: string; idempotencyKey?: string | null }): Promise<ScreeningResult> {
  const key = process.env["DIDIT_API_KEY"];
  if (!key) throw new Error("Fresh screening isn't set up yet. Record a past screening instead.");
  const body: Record<string, unknown> = { full_name: q.name, entity_type: q.entityType, include_adverse_media: true, save_api_request: true, vendor_data: `staff-screen:${q.ref}` };
  if (q.dateOfBirth) body["date_of_birth"] = q.dateOfBirth;
  if (q.nationality) body["nationality"] = q.nationality;
  if (q.documentNumber) body["document_number"] = q.documentNumber;
  const headers: Record<string, string> = { "x-api-key": key, "content-type": "application/json", accept: "application/json" };
  if (q.idempotencyKey) headers["Idempotency-Key"] = q.idempotencyKey.slice(0, 255);
  let res: Response;
  try {
    res = await fetch("https://verification.didit.me/v3/aml/", { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(75_000) });
  } catch (e) {
    console.error("[staff-verification] screening request failed", e instanceof Error ? e.message : String(e));
    throw new Error("The fresh screening didn't finish. Nothing was saved. Please try again.");
  }
  if (!res.ok) {
    console.error("[staff-verification] screening refused", res.status);
    throw new Error(res.status === 400 ? "The screening couldn't run with these details. Check the name, birthday and citizenship." : "The fresh screening couldn't run right now. Nothing was saved. Try again or record a past screening.");
  }
  return screeningFromResponse(await res.json(), { today: today(), name: q.name, entityType: q.entityType });
}

export type EnterInput = EntryInput & {
  personId?: string | null; profileId?: string | null; note: string | null; batchId?: string | null; clientKey?: string | null;
  evidence: { fileName: string; contentType: string; contentBase64: string } | null;
};

export async function enterVerification(uid: string, input: EnterInput) {
  await assertVerifier(uid);
  const subject = input.subject ?? "person";
  const problems = entryProblems({ ...input, subject }, today());
  if (problems.length) throw new Error(problems[0]);

  let person: any, profile: any = null;
  if (subject === "company") {
    if (!input.profileId) throw new Error("Choose the company.");
    const { data } = await db().from("investment_profiles").select("id, person_id, profile_type, legal_name, display_label").eq("id", input.profileId).maybeSingle();
    if (!data || !isEntityProfileType(data.profile_type)) throw new Error("Company not found.");
    profile = data;
    const { data: owner } = await db().from("persons").select("id, user_id, merged_into_person_id, legal_first_name, legal_middle_name, legal_last_name, date_of_birth, citizenship_country").eq("id", data.person_id).maybeSingle();
    if (!owner) throw new Error("This company has no owner record to attach the details to.");
    person = owner;
    if (owner.user_id === uid) throw new Error("You can't enter verification details for your own company.");
    const { data: open } = await db().from("staff_verification_entries").select("id").eq("profile_id", profile.id).eq("status", "review").maybeSingle();
    if (open) throw new Error("This company already has details waiting for review. Decide or withdraw those first.");
  } else {
    if (!input.personId) throw new Error("Choose the person.");
    const { data } = await db().from("persons").select("id, user_id, merged_into_person_id, legal_first_name, legal_middle_name, legal_last_name, date_of_birth, citizenship_country").eq("id", input.personId).maybeSingle();
    if (!data || data.merged_into_person_id) throw new Error("Person not found.");
    person = data;
    if (person.user_id === uid) throw new Error("You can't enter verification details for yourself.");
    const { data: open } = await db().from("staff_verification_entries").select("id").eq("person_id", person.id).eq("subject_kind", "person").eq("status", "review").maybeSingle();
    if (open) throw new Error("This person already has details waiting for review. Decide or withdraw those first.");
  }

  const kyc = input.kyc ? { ...input.kyc, legalName: input.kyc.legalName.trim(), idLast4: input.kyc.idLast4.toUpperCase(), issuingCountry: input.kyc.issuingCountry.trim(), issuingRegion: input.kyc.issuingRegion?.trim() || null } : null;
  const aml = input.aml ? { ...input.aml, listsChecked: input.aml.listsChecked.trim(), explanation: input.aml.explanation?.trim() || null } : null;
  const kyb = subject === "company" && input.kyb ? { ...input.kyb, legalName: input.kyb.legalName.trim(), ownersChecked: input.kyb.ownersChecked.trim(), entityType: input.kyb.entityType?.trim() || null, formationJurisdiction: input.kyb.formationJurisdiction?.trim() || null, formationDate: input.kyb.formationDate || null } : null;
  const details = input.details ? Object.fromEntries(Object.entries(input.details).map(([k, v]) => [k, typeof v === "string" ? v.trim() || null : null]).filter(([, v]) => v)) as PersonDetails : null;

  // Encrypt before anything is saved so a missing vault key never leaves half an entry.
  const { encryptTin, encryptSensitiveText } = await import("@/lib/irs-forms.server");
  const secrets: { kind: "id_number" | "ssn" | "ein"; enc: { ciphertext: string; iv: string; keyVersion: number } }[] = [];
  try {
    if (input.idNumber?.trim()) secrets.push({ kind: "id_number", enc: await encryptSensitiveText(input.idNumber) });
    if (input.ssn?.trim()) secrets.push({ kind: "ssn", enc: await encryptTin(input.ssn) });
    if (input.ein?.trim()) secrets.push({ kind: "ein", enc: await encryptTin(input.ein) });
  } catch { throw new Error("Secure number storage isn't available. Leave the full numbers blank or try again later."); }

  let screening: ScreeningResult | null = null;
  if (input.runScreening) {
    const name = subject === "company" ? (kyb?.legalName || companyName(profile)) : (kyc?.legalName || nameOf(person));
    if (!name || name.length < 2) throw new Error("Add the legal name before running a fresh screening.");
    screening = await runFreshScreening({
      name, entityType: subject,
      dateOfBirth: subject === "company" ? kyb?.formationDate ?? null : kyc?.dateOfBirth || person.date_of_birth || null,
      nationality: subject === "person" ? countryCode(details?.citizenship ?? person.citizenship_country) : null,
      documentNumber: subject === "person" && input.idNumber ? cleanIdNumber(input.idNumber) : null,
      ref: subject === "company" ? `company:${profile.id}` : `person:${person.id}`, idempotencyKey: input.clientKey ?? null,
    });
  }

  let evidencePath: string | null = null;
  if (input.evidence) {
    const bytes = Uint8Array.from(atob(input.evidence.contentBase64), (ch) => ch.charCodeAt(0));
    if (bytes.byteLength > 15 * 1024 * 1024) throw new Error("The evidence file must be 15 MB or smaller.");
    const safe = input.evidence.fileName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "evidence.pdf";
    evidencePath = `staff-entries/${subject === "company" ? `company-${profile.id}` : person.id}/${crypto.randomUUID()}-${safe}`;
    const up = await db().storage.from(BUCKET).upload(evidencePath, bytes, { contentType: input.evidence.contentType, upsert: false });
    if (up.error) throw new Error("Couldn't save the evidence file. Please try again.");
  }

  const ins = await db().from("staff_verification_entries").insert({
    person_id: person.id, subject_kind: subject, profile_id: profile?.id ?? null, kyc, aml, kyb, details, screening,
    sensitive: sensitiveSummary(input), batch_id: input.batchId ?? null,
    source_reference: input.sourceReference.trim(), evidence_path: evidencePath,
    evidence_name: input.evidence?.fileName ?? null, note: input.note?.trim() || null, entered_by: uid,
  }).select("id, person_id").single();
  if (ins.error) throw new Error(ins.error.code === "23505" ? `This ${subject} already has details waiting for review.` : "Couldn't save the details.");
  for (const s of secrets) {
    const { error } = await db().rpc("store_staff_verification_secret", { _entry: ins.data.id, _kind: s.kind, _ciphertext: s.enc.ciphertext, _iv: s.enc.iv, _key_version: s.enc.keyVersion, _actor: uid });
    if (error) {
      await db().from("staff_verification_entries").update({ status: "withdrawn", decided_by: uid, decided_at: now(), decision_note: "Automatically withdrawn: secure number storage failed", updated_at: now() }).eq("id", ins.data.id).eq("status", "review");
      await logEvent(ins.data, "withdrawn", "review", "withdrawn", uid, "Secure number storage failed");
      throw new Error("The full numbers couldn't be stored securely, so nothing was saved. Please try again.");
    }
  }
  await logEvent(ins.data, "entered", null, "review", uid, input.note?.trim() || null);
  if (screening) await logEvent(ins.data, "fresh_screening_run", "review", "review", uid, `${screening.status} · ${screening.totalHits} hit(s)`);
  return { entryId: String(ins.data.id), screening: screening ? { status: screening.status, totalHits: screening.totalHits } : null };
}

/** Finds the exact record for a spreadsheet row; anything not unique is refused, never guessed. */
async function resolveBulkMatch(match: BulkMatch): Promise<{ personId?: string; profileId?: string }> {
  if (match.kind === "person") {
    const { data } = await db().from("persons").select("id").ilike("email", match.email.trim().replace(/[\\%_]/g, (c) => `\\${c}`)).is("merged_into_person_id", null).limit(2);
    const rows = (data ?? []) as any[];
    if (!rows.length) throw new Error(`No person uses ${match.email}. Add them first, or enter this one by hand.`);
    if (rows.length > 1) throw new Error(`More than one person uses ${match.email}. Enter this one by hand.`);
    return { personId: String(rows[0].id) };
  }
  const want = match.companyName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const { data } = await db().from("investment_profiles").select("id, profile_type, legal_name, display_label").not("profile_type", "in", "(individual,joint,ira,retirement_plan)").limit(5000);
  const hits = ((data ?? []) as any[]).filter((p) => isEntityProfileType(p.profile_type) && companyName(p).toLowerCase().replace(/[^a-z0-9]/g, "") === want);
  if (!hits.length) throw new Error(`No company named "${match.companyName}" was found. Check the exact legal name.`);
  if (hits.length > 1) throw new Error(`More than one company is named "${match.companyName}". Enter this one by hand.`);
  return { profileId: String(hits[0].id) };
}

/** Saves spreadsheet rows one at a time; each still waits for a second reviewer. */
export async function bulkEnterVerification(uid: string, input: { batchId: string; rows: { row: number; clientKey: string; match: BulkMatch; input: EntryInput & { note: string | null } }[] }) {
  await assertVerifier(uid);
  const out: { row: number; ok: boolean; message: string }[] = [];
  for (const r of input.rows) {
    try {
      const target = await resolveBulkMatch(r.match);
      const res = await enterVerification(uid, { ...r.input, ...target, batchId: input.batchId, clientKey: r.clientKey, evidence: null });
      out.push({ row: r.row, ok: true, message: res.screening ? `Saved for review · fresh screening: ${res.screening.totalHits ? `${res.screening.totalHits} possible match(es)` : "no matches"}` : "Saved for review" });
    } catch (e) {
      out.push({ row: r.row, ok: false, message: e instanceof Error ? e.message : "Couldn't save this row." });
    }
  }
  return out;
}

export async function verificationEntries(uid: string, filter: "review" | "all") {
  await assertVerifier(uid);
  let q = db().from("staff_verification_entries").select("*").order("created_at", { ascending: false }).limit(200);
  if (filter === "review") q = q.eq("status", "review");
  const { data } = await q;
  const rows = (data ?? []) as any[];
  const pids = [...new Set(rows.map((r) => r.person_id))];
  const profIds = [...new Set(rows.map((r) => r.profile_id).filter(Boolean))];
  const uids = [...new Set(rows.flatMap((r) => [r.entered_by, r.decided_by]).filter(Boolean))];
  const [{ data: persons }, { data: staff }, { data: profiles }, { data: evs }] = await Promise.all([
    pids.length ? db().from("persons").select("id, user_id, email, legal_first_name, legal_middle_name, legal_last_name, date_of_birth, kyc_status, aml_status").in("id", pids) : { data: [] },
    uids.length ? db().from("profiles").select("user_id, legal_name, email").in("user_id", uids) : { data: [] },
    profIds.length ? db().from("investment_profiles").select("id, profile_type, legal_name, display_label").in("id", profIds) : { data: [] },
    profIds.length ? db().from("entity_verifications").select("profile_id, legal_name, kyb_status, entity_aml_status").in("profile_id", profIds) : { data: [] },
  ]);
  const pm = new Map(((persons ?? []) as any[]).map((p) => [p.id, p]));
  const sm = new Map(((staff ?? []) as any[]).map((s) => [s.user_id, s.legal_name || s.email || "Harmonious team member"]));
  const prm = new Map(((profiles ?? []) as any[]).map((p) => [p.id, p]));
  const evm = new Map(((evs ?? []) as any[]).map((e) => [e.profile_id, e]));
  return rows.map((r) => {
    const p = pm.get(r.person_id);
    const pr = r.profile_id ? prm.get(r.profile_id) : null;
    const ev = r.profile_id ? evm.get(r.profile_id) : null;
    return {
      id: String(r.id), personId: String(r.person_id), subject: (r.subject_kind ?? "person") as "person" | "company", status: String(r.status),
      kyc: r.kyc as KycEntry | null, aml: r.aml as AmlEntry | null, kyb: r.kyb as KybEntry | null, details: r.details as PersonDetails | null,
      screening: r.screening as ScreeningResult | null, sensitive: (r.sensitive ?? {}) as Record<string, string>, fromSpreadsheet: !!r.batch_id,
      sourceReference: r.source_reference, hasEvidence: !!r.evidence_path, evidenceName: r.evidence_name, note: r.note,
      enteredBy: sm.get(r.entered_by) ?? "Harmonious team member", enteredByMe: r.entered_by === uid, enteredAt: r.entered_at,
      decidedBy: r.decided_by ? sm.get(r.decided_by) ?? "Harmonious team member" : null, decidedAt: r.decided_at, decisionNote: r.decision_note,
      person: { name: nameOf(p) || p?.email || "Unnamed person", email: p?.email ?? null, dateOfBirth: p?.date_of_birth ?? null, kycStatus: p?.kyc_status ?? null, amlStatus: p?.aml_status ?? null },
      company: pr ? { name: ev?.legal_name || companyName(pr) || "Unnamed company", type: String(pr.profile_type), kybStatus: ev?.kyb_status ?? "not_started", amlStatus: ev?.entity_aml_status ?? "not_started" } : null,
    };
  });
}

export async function evidenceLink(uid: string, entryId: string) {
  await assertVerifier(uid);
  const { data: e } = await db().from("staff_verification_entries").select("id, person_id, status, evidence_path").eq("id", entryId).maybeSingle();
  if (!e?.evidence_path) throw new Error("No evidence file on these details.");
  const { data, error } = await db().storage.from(BUCKET).createSignedUrl(e.evidence_path, 600);
  if (error || !data?.signedUrl) throw new Error("Couldn't open the evidence file.");
  await logEvent(e, "evidence_viewed", e.status, e.status, uid);
  return { url: String(data.signedUrl) };
}

/** Copies an entered tax number into the profile's encrypted tax-ID store, only when the profile has none. */
async function fillProfileTaxId(entryId: string, kind: "ssn" | "ein", profileId: string, actor: string) {
  const { data: prof } = await db().from("investment_profiles").select("id, tax_id_last4").eq("id", profileId).maybeSingle();
  if (!prof || prof.tax_id_last4) return false;
  const { data: sec } = await db().rpc("read_staff_verification_secret", { _entry: entryId, _kind: kind });
  const row = Array.isArray(sec) ? sec[0] : sec;
  if (!row?.ciphertext) return false;
  const { decryptTin } = await import("@/lib/irs-forms.server");
  const tin = (await decryptTin(row.ciphertext, row.iv)).replace(/\D/g, "");
  if (tin.length !== 9) return false;
  const { error } = await db().rpc("store_profile_tax_id", { _profile: profileId, _ciphertext: row.ciphertext, _iv: row.iv, _key_version: 1, _actor: actor });
  if (error) return false;
  await db().from("investment_profiles").update({ tax_id_type: kind === "ein" ? "ein" : tin.startsWith("9") ? "itin" : "ssn", tax_id_last4: tin.slice(-4), updated_at: now() }).eq("id", profileId).is("tax_id_last4", null);
  await (await import("@/lib/account-connect.server")).recordProfileTin(profileId, tin).catch((e) => console.error("[staff-verification] tax ID match skipped", (e as Error).message));
  await db().from("investment_profile_events").insert({ profile_id: profileId, actor_id: actor, event: "tax_id_filled_from_verification", detail: { entry_id: entryId, kind } });
  return true;
}

export async function decideVerification(uid: string, input: { entryId: string; action: "approve" | "decline" | "withdraw"; note: string | null }) {
  const r = await assertVerifier(uid);
  const note = input.note?.trim() || null;
  const { data: e } = await db().from("staff_verification_entries").select("*").eq("id", input.entryId).maybeSingle();
  if (!e) throw new Error("Entry not found.");
  if (e.status !== "review") throw new Error("These details were already decided.");
  const { data: person } = await db().from("persons").select("*").eq("id", e.person_id).maybeSingle();
  if (!person) throw new Error("Person not found.");
  if (input.action === "withdraw") {
    if (e.entered_by !== uid) throw new Error("Only the person who entered these details can withdraw them.");
    await db().from("staff_verification_entries").update({ status: "withdrawn", decided_by: uid, decided_at: now(), decision_note: note, updated_at: now() }).eq("id", e.id).eq("status", "review");
    await logEvent(e, "withdrawn", "review", "withdrawn", uid, note);
    return { ok: true };
  }
  if (person.user_id === uid) throw new Error(e.subject_kind === "company" ? "You can't decide your own company's verification." : "You can't decide your own verification.");
  if (input.action === "decline") {
    if (!note) throw new Error("Add a note explaining why.");
    await db().from("staff_verification_entries").update({ status: "declined", decided_by: uid, decided_at: now(), decision_note: note, updated_at: now() }).eq("id", e.id).eq("status", "review");
    await logEvent(e, "declined", "review", "declined", uid, note);
    return { ok: true };
  }
  return e.subject_kind === "company" ? approveCompany(uid, r, e, person, note) : approvePerson(uid, r, e, person, note);
}

async function approvePerson(uid: string, r: string[], e: any, person: any, note: string | null) {
  const err = approvalError({
    entry: e, deciderId: uid, deciderIsSuperAdmin: r.includes("super_admin"), subjectUserId: person.user_id ?? null, note,
    personDateOfBirth: person.date_of_birth ?? null, personLegalName: nameOf(person) || null, today: today(),
  });
  if (err) throw new Error(err);
  const fx = approvalEffects(e, person);
  const at = now();
  const upd = await db().from("staff_verification_entries").update({ status: "approved", decided_by: uid, decided_at: at, decision_note: note, applied: fx, updated_at: at }).eq("id", e.id).eq("status", "review").select("id");
  if (!(upd.data ?? []).length) throw new Error("These details were already decided.");
  await logEvent(e, "approved", "review", "approved", uid, note);
  const patch: Record<string, unknown> = { ...fx.fillPerson };
  if (fx.kyc) Object.assign(patch, { kyc_status: "approved", kyc_verified_at: at, identity_verified_at: at });
  if (fx.aml) Object.assign(patch, { aml_status: "approved", aml_screened_at: at });
  if (fx.fillDateOfBirth) patch["date_of_birth"] = fx.fillDateOfBirth;
  if (Object.keys(patch).length) {
    const { error } = await db().from("persons").update({ ...patch, updated_at: at }).eq("id", person.id);
    if (error) throw new Error("The approval was recorded, but the person's record didn't update. Please contact support.");
    await db().from("person_onboarding_events").insert({
      person_id: person.id, from_state: person.onboarding_state ?? null, to_state: person.onboarding_state ?? "kyc_pending",
      actor_kind: "staff", actor_user_id: uid, reason: "Verification details entered by Operations and approved by a reviewer",
      detail: { entry_id: e.id, entered_by: e.entered_by, kyc: fx.kyc, aml: fx.aml, filled: Object.keys(fx.fillPerson) },
    });
  }
  // A Social Security number fills the person's only individual profile when it has no tax ID yet.
  if (e.sensitive?.ssnLast4) {
    try {
      const { data: profs } = await db().from("investment_profiles").select("id").eq("person_id", person.id).eq("profile_type", "individual");
      if ((profs ?? []).length === 1) await fillProfileTaxId(e.id, "ssn", String(profs[0].id), uid);
    } catch (x) { console.error("[staff-verification] ssn fill", x instanceof Error ? x.message : String(x)); }
  }
  // A person with a login also needs an approved login check so their account opens.
  if (e.kyc && person.user_id) {
    const { data: last } = await db().from("account_identity_checks").select("status").eq("user_id", person.user_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (last?.status !== "approved") {
      const k = e.kyc as KycEntry;
      const amlStatus = e.aml ? (e.aml.result === "confirmed_match" ? "review" : "approved") : e.screening ? (e.screening.status === "approved" ? "approved" : "review") : "not recorded";
      const ins = await db().from("account_identity_checks").insert({
        user_id: person.user_id, person_id: person.id, provider: "staff_entry", vendor_data: `staff:${e.id}`, status: "approved",
        decided_by: uid, decided_at: now(), decision_note: note ?? "Approved from details entered by Operations",
        decision_summary: { document: { type: k.idType, country: k.issuingCountry, last4: k.idLast4, expires: k.idExpires }, liveness: k.selfie === "passed" ? "Approved" : "Not performed", faceMatch: k.selfie === "passed" ? "Approved" : "Not performed", aml: { status: amlStatus, hits: e.screening?.totalHits ?? 0 } },
        review_details: { staffEntry: { entryId: e.id, enteredBy: e.entered_by, method: k.method, verifiedOn: k.verifiedOn } }, warnings: [],
      }).select("id, user_id").single();
      if (!ins.error) await db().from("account_identity_check_events").insert({ check_id: ins.data.id, user_id: person.user_id, event: "staff_entry_approved", from_status: null, to_status: "approved", note: `Entry ${e.id}`, actor_user_id: uid });
    }
  }
  const { data: obs } = await db().from("investor_onboardings").select("id").eq("person_id", person.id).not("stage", "in", "(declined,cancelled)");
  await afterApproval(uid, e.id, ((obs ?? []) as any[]).map((o) => o.id), [fx.kyc ? "KYC" : null, fx.aml ? "AML" : null]);
  return { ok: true, applied: fx };
}

async function approveCompany(uid: string, r: string[], e: any, owner: any, note: string | null) {
  const { data: profile } = await db().from("investment_profiles").select("id, legal_name, display_label").eq("id", e.profile_id).maybeSingle();
  if (!profile) throw new Error("Company not found.");
  const { data: ev } = await db().from("entity_verifications").select("*").eq("profile_id", profile.id).maybeSingle();
  const err = approvalError({
    entry: e, deciderId: uid, deciderIsSuperAdmin: r.includes("super_admin"), subjectUserId: owner.user_id ?? null, note,
    personDateOfBirth: null, personLegalName: ev?.legal_name || companyName(profile) || null, today: today(),
  });
  if (err) throw new Error(err);
  const fx = companyApprovalEffects(e, ev ?? null);
  const at = now();
  const upd = await db().from("staff_verification_entries").update({ status: "approved", decided_by: uid, decided_at: at, decision_note: note, applied: fx, updated_at: at }).eq("id", e.id).eq("status", "review").select("id");
  if (!(upd.data ?? []).length) throw new Error("These details were already decided.");
  await logEvent(e, "approved", "review", "approved", uid, note);
  const patch: Record<string, unknown> = { ...fx.fillEntity };
  if (fx.kyb) Object.assign(patch, { kyb_status: "approved", verified_at: at, reviewer_id: uid });
  if (fx.aml) Object.assign(patch, { entity_aml_status: "approved", screened_at: at });
  if (e.sensitive?.einLast4 && !ev?.tax_id_last4) patch["tax_id_last4"] = e.sensitive.einLast4;
  if (Object.keys(patch).length) {
    const res = ev
      ? await db().from("entity_verifications").update({ ...patch, updated_at: at }).eq("id", ev.id)
      : await db().from("entity_verifications").insert({ profile_id: profile.id, ...patch });
    if (res.error) throw new Error("The approval was recorded, but the company's record didn't update. Please contact support.");
    await db().from("investment_profile_events").insert({ profile_id: profile.id, actor_id: uid, event: "staff_verification_approved", detail: { entry_id: e.id, entered_by: e.entered_by, kyb: fx.kyb, aml: fx.aml, filled: Object.keys(fx.fillEntity) } });
  }
  if (e.sensitive?.einLast4) {
    try { await fillProfileTaxId(e.id, "ein", String(profile.id), uid); } catch (x) { console.error("[staff-verification] ein fill", x instanceof Error ? x.message : String(x)); }
  }
  const { data: obs } = await db().from("investor_onboardings").select("id").eq("investment_profile_id", profile.id).not("stage", "in", "(declined,cancelled)");
  await afterApproval(uid, e.id, ((obs ?? []) as any[]).map((o) => o.id), [fx.kyb ? "KYB" : null, fx.aml ? "AML" : null]);
  return { ok: true, applied: fx };
}

async function afterApproval(uid: string, entryId: string, onboardingIds: string[], checks: ("KYC" | "KYB" | "AML" | null)[]) {
  try {
    const { reconcileAfter } = await import("@/lib/investor-onboarding.server");
    await reconcileAfter(onboardingIds, { actorUserId: uid, trigger: "staff_verification_approved" });
  } catch (x) { console.error("[staff-verification] reconcile", x instanceof Error ? x.message : String(x)); }
  try {
    const { notifyVerificationConfirmation } = await import("@/lib/ops-slack-notify.server");
    for (const c of checks) if (c) await notifyVerificationConfirmation({ check: c, status: "approved", ref: entryId, path: PATH });
  } catch (x) { console.error("[staff-verification] notify", x instanceof Error ? x.message : String(x)); }
}
