// Server-only: KYC/AML details entered by Operations, decided by a second authorized reviewer.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ACCOUNT_KYC_DECIDERS } from "@/lib/account-kyc-model";
import { approvalEffects, approvalError, entryProblems, type AmlEntry, type KycEntry } from "@/lib/staff-verification-model";

const db = () => supabaseAdmin as any;
const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const BUCKET = "government-ids";
const PATH = "/ops/verifications";

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
    db().from("investor_onboardings").select("person_id").in("person_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]).not("stage", "in", "(declined,cancelled)"),
    db().from("staff_verification_entries").select("person_id").eq("status", "review"),
  ]);
  const clientsOf = new Map<string, string[]>();
  for (const c of (contacts ?? []) as any[]) { const n = c.clients?.name; if (n) clientsOf.set(c.person_id, [...(clientsOf.get(c.person_id) ?? []), n]); }
  const invest = new Map<string, number>();
  for (const o of (obs ?? []) as any[]) invest.set(o.person_id, (invest.get(o.person_id) ?? 0) + 1);
  const waiting = new Set(((open ?? []) as any[]).map((o) => o.person_id));
  return ((persons ?? []) as any[]).map((p) => ({
    id: String(p.id), name: nameOf(p) || p.email || "Unnamed person", email: p.email ?? null, hasLogin: !!p.user_id, isSelf: p.user_id === uid,
    kycStatus: p.kyc_status ?? "not_started", amlStatus: p.aml_status ?? "not_started", testDemo: !!p.is_test_demo,
    clients: [...new Set(clientsOf.get(p.id) ?? [])], investments: invest.get(p.id) ?? 0, waiting: waiting.has(p.id),
  }));
}

export async function enterVerification(uid: string, input: {
  personId: string; kyc: KycEntry | null; aml: AmlEntry | null; sourceReference: string; note: string | null;
  evidence: { fileName: string; contentType: string; contentBase64: string } | null;
}) {
  await assertVerifier(uid);
  const problems = entryProblems({ kyc: input.kyc, aml: input.aml, sourceReference: input.sourceReference }, today());
  if (problems.length) throw new Error(problems[0]);
  const { data: person } = await db().from("persons").select("id, user_id, merged_into_person_id").eq("id", input.personId).maybeSingle();
  if (!person || person.merged_into_person_id) throw new Error("Person not found.");
  if (person.user_id === uid) throw new Error("You can't enter verification details for yourself.");
  const { data: open } = await db().from("staff_verification_entries").select("id").eq("person_id", person.id).eq("status", "review").maybeSingle();
  if (open) throw new Error("This person already has details waiting for review. Decide or withdraw those first.");
  let evidencePath: string | null = null;
  if (input.evidence) {
    const bytes = Uint8Array.from(atob(input.evidence.contentBase64), (ch) => ch.charCodeAt(0));
    if (bytes.byteLength > 15 * 1024 * 1024) throw new Error("The evidence file must be 15 MB or smaller.");
    const safe = input.evidence.fileName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "evidence.pdf";
    evidencePath = `staff-entries/${person.id}/${crypto.randomUUID()}-${safe}`;
    const up = await db().storage.from(BUCKET).upload(evidencePath, bytes, { contentType: input.evidence.contentType, upsert: false });
    if (up.error) throw new Error("Couldn't save the evidence file. Please try again.");
  }
  const kyc = input.kyc ? { ...input.kyc, legalName: input.kyc.legalName.trim(), idLast4: input.kyc.idLast4.toUpperCase(), issuingCountry: input.kyc.issuingCountry.trim(), issuingRegion: input.kyc.issuingRegion?.trim() || null } : null;
  const aml = input.aml ? { ...input.aml, listsChecked: input.aml.listsChecked.trim(), explanation: input.aml.explanation?.trim() || null } : null;
  const ins = await db().from("staff_verification_entries").insert({
    person_id: person.id, kyc, aml, source_reference: input.sourceReference.trim(), evidence_path: evidencePath,
    evidence_name: input.evidence?.fileName ?? null, note: input.note?.trim() || null, entered_by: uid,
  }).select("id, person_id").single();
  if (ins.error) throw new Error(ins.error.code === "23505" ? "This person already has details waiting for review." : "Couldn't save the details.");
  await logEvent(ins.data, "entered", null, "review", uid, input.note?.trim() || null);
  return { entryId: String(ins.data.id) };
}

export async function verificationEntries(uid: string, filter: "review" | "all") {
  await assertVerifier(uid);
  let q = db().from("staff_verification_entries").select("*").order("created_at", { ascending: false }).limit(200);
  if (filter === "review") q = q.eq("status", "review");
  const { data } = await q;
  const rows = (data ?? []) as any[];
  const pids = [...new Set(rows.map((r) => r.person_id))];
  const uids = [...new Set(rows.flatMap((r) => [r.entered_by, r.decided_by]).filter(Boolean))];
  const [{ data: persons }, { data: staff }] = await Promise.all([
    pids.length ? db().from("persons").select("id, user_id, email, legal_first_name, legal_middle_name, legal_last_name, date_of_birth, kyc_status, aml_status").in("id", pids) : { data: [] },
    uids.length ? db().from("profiles").select("user_id, legal_name, email").in("user_id", uids) : { data: [] },
  ]);
  const pm = new Map(((persons ?? []) as any[]).map((p) => [p.id, p]));
  const sm = new Map(((staff ?? []) as any[]).map((s) => [s.user_id, s.legal_name || s.email || "Harmonious team member"]));
  return rows.map((r) => {
    const p = pm.get(r.person_id);
    return {
      id: String(r.id), personId: String(r.person_id), status: String(r.status), kyc: r.kyc as KycEntry | null, aml: r.aml as AmlEntry | null,
      sourceReference: r.source_reference, hasEvidence: !!r.evidence_path, evidenceName: r.evidence_name, note: r.note,
      enteredBy: sm.get(r.entered_by) ?? "Harmonious team member", enteredByMe: r.entered_by === uid, enteredAt: r.entered_at,
      decidedBy: r.decided_by ? sm.get(r.decided_by) ?? "Harmonious team member" : null, decidedAt: r.decided_at, decisionNote: r.decision_note,
      person: { name: nameOf(p) || p?.email || "Unnamed person", email: p?.email ?? null, dateOfBirth: p?.date_of_birth ?? null, kycStatus: p?.kyc_status ?? null, amlStatus: p?.aml_status ?? null },
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
  if (person.user_id === uid) throw new Error("You can't decide your own verification.");
  if (input.action === "decline") {
    if (!note) throw new Error("Add a note explaining why.");
    await db().from("staff_verification_entries").update({ status: "declined", decided_by: uid, decided_at: now(), decision_note: note, updated_at: now() }).eq("id", e.id).eq("status", "review");
    await logEvent(e, "declined", "review", "declined", uid, note);
    return { ok: true };
  }
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
  const patch: Record<string, unknown> = {};
  if (fx.kyc) Object.assign(patch, { kyc_status: "approved", kyc_verified_at: at, identity_verified_at: at });
  if (fx.aml) Object.assign(patch, { aml_status: "approved", aml_screened_at: at });
  if (fx.fillDateOfBirth) patch["date_of_birth"] = fx.fillDateOfBirth;
  if (Object.keys(patch).length) {
    const { error } = await db().from("persons").update({ ...patch, updated_at: at }).eq("id", person.id);
    if (error) throw new Error("The approval was recorded, but the person's status didn't update. Please contact support.");
    await db().from("person_onboarding_events").insert({
      person_id: person.id, from_state: person.onboarding_state ?? null, to_state: person.onboarding_state ?? "kyc_pending",
      actor_kind: "staff", actor_user_id: uid, reason: "Verification details entered by Operations and approved by a reviewer",
      detail: { entry_id: e.id, entered_by: e.entered_by, kyc: fx.kyc, aml: fx.aml },
    });
  }
  // A person with a login also needs an approved login check so their account opens.
  if (e.kyc && person.user_id) {
    const { data: last } = await db().from("account_identity_checks").select("status").eq("user_id", person.user_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (last?.status !== "approved") {
      const k = e.kyc as KycEntry;
      const ins = await db().from("account_identity_checks").insert({
        user_id: person.user_id, person_id: person.id, provider: "staff_entry", vendor_data: `staff:${e.id}`, status: "approved",
        decided_by: uid, decided_at: at, decision_note: note ?? "Approved from details entered by Operations",
        decision_summary: { document: { type: k.idType, country: k.issuingCountry, last4: k.idLast4, expires: k.idExpires }, liveness: k.selfie === "passed" ? "Approved" : "Not performed", faceMatch: k.selfie === "passed" ? "Approved" : "Not performed", aml: e.aml ? { status: e.aml.result === "confirmed_match" ? "review" : "approved", hits: 0 } : { status: "not recorded", hits: 0 } },
        review_details: { staffEntry: { entryId: e.id, enteredBy: e.entered_by, method: k.method, verifiedOn: k.verifiedOn } }, warnings: [],
      }).select("id, user_id").single();
      if (!ins.error) await db().from("account_identity_check_events").insert({ check_id: ins.data.id, user_id: person.user_id, event: "staff_entry_approved", from_status: null, to_status: "approved", note: `Entry ${e.id}`, actor_user_id: uid });
    }
  }
  try {
    const { data: obs } = await db().from("investor_onboardings").select("id").eq("person_id", person.id).not("stage", "in", "(declined,cancelled)");
    const { reconcileAfter } = await import("@/lib/investor-onboarding.server");
    await reconcileAfter(((obs ?? []) as any[]).map((o) => o.id), { actorUserId: uid, trigger: "staff_verification_approved" });
  } catch (x) { console.error("[staff-verification] reconcile", x instanceof Error ? x.message : String(x)); }
  try {
    const { notifyVerificationConfirmation } = await import("@/lib/ops-slack-notify.server");
    if (fx.kyc) await notifyVerificationConfirmation({ check: "KYC", status: "approved", ref: e.id, path: PATH });
    if (fx.aml) await notifyVerificationConfirmation({ check: "AML", status: "approved", ref: e.id, path: PATH });
  } catch (x) { console.error("[staff-verification] notify", x instanceof Error ? x.message : String(x)); }
  return { ok: true, applied: fx };
}
