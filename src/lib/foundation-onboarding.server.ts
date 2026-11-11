/**
 * Server-only foundation client onboarding, submission review, foundation verification and component release controls.
 * Client members act only through their own active membership of the exact client; recorded foundation roles are never
 * consulted for access. Nothing here sends email, grants access, creates funds or invoices, screens anyone, files or moves money.
 */
import { capabilitiesFor } from "@/lib/ops-capabilities";
import { COMPONENT_KEYS, componentByKey, FOUNDATION_COMPONENTS, isFoundationKey, type ComponentKey } from "@/lib/foundation-admin-model";
import {
  clientFactsSchema, clientFoundationAccess, changedSinceSubmission, factsProblem, onboardingChecklist, personRequestSchema,
  proposedChanges, reviewProblem, CLIENT_FACT_FIELDS, type FactChange,
} from "@/lib/foundation-onboarding-model";
import { clientVerificationView, foundationRequirements, verificationSummary, type VDoc } from "@/lib/foundation-verification-model";
import {
  PROTECTED_FINANCIAL, RELEASE_DIMENSIONS, RELEASE_EVIDENCE, REQUIRED_EVIDENCE, releaseApprovalProblem, releaseRequestProblem, releaseState,
  type ReleaseDimension, type ReleaseEvent, type ReleaseEvidenceKey,
} from "@/lib/foundation-release-model";
import { actor, admin, foundationFlags, logEvent, must, profileFor, storeFoundationDocument, type FoundationUpload } from "@/lib/foundation-admin.server";

const nowIso = () => new Date().toISOString();

// ------------------------------------------------------------ Shared reads

async function docsWithReviews(db: any, profileIds: string[]) {
  if (!profileIds.length) return [] as any[];
  const docs = must(await db.from("foundation_documents").select("id, foundation_profile_id, kind, title, file_name, size_bytes, superseded_by, uploaded_at, uploaded_by, source").in("foundation_profile_id", profileIds).order("uploaded_at", { ascending: false }), "Couldn't read the documents.") as any[];
  const ids = docs.map((d) => d.id);
  const reviews = ids.length ? (must(await db.from("foundation_document_reviews").select("document_id, decision, note, reviewed_by, created_at").in("document_id", ids).order("created_at"), "Couldn't read document reviews.") as any[]) : [];
  const last = new Map<string, any>(); for (const r of reviews) last.set(r.document_id, r);
  return docs.map((d) => ({ ...d, review: d.source === "client" ? (last.get(d.id)?.decision ?? null) : null, reviewNote: last.get(d.id)?.note ?? null }));
}

async function verificationFor(db: any, p: any, docs: any[], components: ComponentKey[]) {
  const [{ data: entity }, { data: auth }, { data: reviews }] = await Promise.all([
    db.from("client_entities").select("tax_id_status").eq("id", p.client_entity_id).maybeSingle(),
    db.from("foundation_authority_roles").select("person_id, role, authority_scopes, evidence_document_id, status").eq("foundation_profile_id", p.id),
    db.from("foundation_verification_reviews").select("id, decision, evidence_document_ids, note, decided_by, created_at").eq("foundation_profile_id", p.id).order("created_at"),
  ]);
  const authority = (auth ?? []) as any[];
  const pids = [...new Set(authority.map((a) => a.person_id))];
  const people = pids.length ? (((await db.from("persons").select("id, legal_first_name, legal_last_name, kyc_status, aml_status").in("id", pids)).data ?? []) as any[]) : [];
  const persons = Object.fromEntries(pids.map((id) => {
    const x = people.find((r) => r.id === id);
    return [id, x ? { name: `${x.legal_first_name ?? ""} ${x.legal_last_name ?? ""}`.trim() || "Person on file", kyc_status: x.kyc_status, aml_status: x.aml_status } : null];
  }));
  const rs = (reviews ?? []) as any[];
  const reqs = foundationRequirements({
    profile: p, entity: entity ?? null, documents: docs as VDoc[], authority, persons,
    entityReview: rs.length ? rs[rs.length - 1] : null, components,
  });
  return { requirements: reqs, summary: verificationSummary(reqs), reviews: rs };
}

/** Components this foundation is quoted for or handed off with (scope for verification). */
async function scopeComponents(db: any, p: any): Promise<ComponentKey[]> {
  const { data } = await db.from("sales_quote_lines").select("service_key, quote_id").eq("foundation_snapshot->>clientEntityId", p.client_entity_id);
  const keys = new Set<ComponentKey>(["onboarding_setup"]);
  for (const l of (data ?? []) as any[]) if (isFoundationKey(l.service_key)) { const c = componentByKey(String(l.service_key).split(":")[1] ?? ""); if (c) keys.add(c.key); }
  return [...keys];
}

// ------------------------------------------------------------ Client side

async function membership(db: any, userId: string, clientId: string) {
  const { data } = await db.from("client_users").select("client_id, client_role, revoked_at").eq("user_id", userId).eq("client_id", clientId).maybeSingle();
  return data ?? null;
}

async function clientGate(db: any, userId: string, clientId: string, write: boolean) {
  const f = await foundationFlags(db);
  const m = await membership(db, userId, clientId);
  const access = clientFoundationAccess(m, f.foundation_administration && f.foundation_client_onboarding);
  if (access.problem) throw new Error(access.problem);
  if (write && !access.write) throw new Error("Your access to this organization is view-only. Ask someone who manages it to make changes.");
  return access;
}

async function clientProfile(db: any, userId: string, profileId: string, write: boolean) {
  const p = await profileFor(db, profileId);
  if (p.status !== "active") throw new Error("Foundation not found.");
  await clientGate(db, userId, p.client_id, write);
  return p;
}

/** Whether to show the client entry point. Never reveals anything beyond a yes/no. */
export async function clientFoundationAvailability(userId: string) {
  const db = await admin();
  const f = await foundationFlags(db);
  if (!(f.foundation_administration && f.foundation_client_onboarding)) return { available: false };
  const { data: links } = await db.from("client_users").select("client_id").eq("user_id", userId).is("revoked_at", null);
  const ids = ((links ?? []) as any[]).map((l) => l.client_id);
  if (!ids.length) return { available: false };
  const { data } = await db.from("foundation_profiles").select("id").in("client_id", ids).eq("status", "active").limit(1);
  return { available: !!data?.length };
}

export async function getClientFoundations(userId: string) {
  const db = await admin();
  const f = await foundationFlags(db);
  if (!(f.foundation_administration && f.foundation_client_onboarding)) return { available: false, foundations: [] as any[] };
  const { data: links } = await db.from("client_users").select("client_id, client_role, revoked_at").eq("user_id", userId).is("revoked_at", null);
  const ms = (links ?? []) as any[];
  if (!ms.length) return { available: true, foundations: [] as any[] };
  const profs = must(await db.from("foundation_profiles").select("*").in("client_id", ms.map((m) => m.client_id)).eq("status", "active").order("created_at"), "Couldn't read your foundations.") as any[];
  if (!profs.length) return { available: true, foundations: [] as any[] };
  const ids = profs.map((p) => p.id);
  const [ents, contacts, auth, subs, docs] = await Promise.all([
    db.from("client_entities").select("id, legal_name, jurisdiction, formation_date, tax_id_masked, tax_id_status").in("id", profs.map((p) => p.client_entity_id)),
    db.from("client_contacts").select("client_id, person_id, full_name, title, status").in("client_id", ms.map((m) => m.client_id)).not("person_id", "is", null),
    db.from("foundation_authority_roles").select("id, foundation_profile_id, person_id, role, title, authority_scopes, evidence_document_id, status, effective_on, ended_on").in("foundation_profile_id", ids),
    db.from("foundation_submissions").select("id, foundation_profile_id, kind, payload, status, submitted_by, submitted_at, reviewed_at, review_note").in("foundation_profile_id", ids).order("submitted_at", { ascending: false }),
    docsWithReviews(db, ids),
  ]);
  const people = ((contacts.data ?? []) as any[]).filter((c) => c.status !== "inactive");
  const out = [];
  for (const p of profs) {
    const m = ms.find((x) => x.client_id === p.client_id);
    const access = clientFoundationAccess(m, true);
    const entity = ((ents.data ?? []) as any[]).find((e) => e.id === p.client_entity_id) ?? null;
    const mineDocs = docs.filter((d) => d.foundation_profile_id === p.id);
    const authority = ((auth.data ?? []) as any[]).filter((r) => r.foundation_profile_id === p.id);
    const submissions = ((subs.data ?? []) as any[]).filter((s) => s.foundation_profile_id === p.id);
    const v = await verificationFor(db, p, mineDocs, await scopeComponents(db, p));
    const names = new Map(people.filter((c) => c.client_id === p.client_id).map((c) => [c.person_id, c.full_name]));
    out.push({
      profileId: p.id, canEdit: access.write,
      name: entity?.legal_name ?? "Foundation", jurisdiction: entity?.jurisdiction ?? null, formationDate: entity?.formation_date ?? null,
      einMasked: entity?.tax_id_masked ?? null,
      facts: Object.fromEntries(Object.keys(CLIENT_FACT_FIELDS).map((k) => [k, p[k] ?? null])),
      people: people.filter((c) => c.client_id === p.client_id).map((c) => ({ personId: c.person_id, name: c.full_name, title: c.title })),
      authority: authority.filter((r) => r.status === "active").map((r) => ({ id: r.id, name: names.get(r.person_id) ?? "Person on file", role: r.role, title: r.title, scopes: r.authority_scopes, effectiveOn: r.effective_on })),
      documents: mineDocs.map((d) => ({ id: d.id, kind: d.kind, title: d.title, uploadedAt: d.uploaded_at, source: d.source, superseded: !!d.superseded_by, review: d.review, reviewNote: d.review === "correction_requested" ? d.reviewNote : null, mine: d.uploaded_by === userId })),
      submissions: submissions.map((s) => ({ id: s.id, kind: s.kind, status: s.status, submittedAt: s.submitted_at, reviewedAt: s.reviewed_at, note: s.status === "correction_requested" ? s.review_note : null, mine: s.submitted_by === userId, summary: submissionSummary(s, names) })),
      checklist: onboardingChecklist({ profile: p, entity, documents: mineDocs, authority, submissions }),
      verification: clientVerificationView(v.requirements),
    });
  }
  return { available: true, foundations: out };
}

function submissionSummary(s: any, names: Map<string, string>): string {
  if (s.kind === "profile_facts") return `Details: ${((s.payload?.changes ?? []) as FactChange[]).map((c) => CLIENT_FACT_FIELDS[c.field] ?? c.field).join(", ")}`;
  if (s.kind === "person_existing") return `Person: ${names.get(s.payload?.personId) ?? "Person on file"} as ${String(s.payload?.role ?? "").replace(/_/g, " ")}`;
  if (s.kind === "person_new") return `New person: ${s.payload?.firstName ?? ""} ${s.payload?.lastName ?? ""} as ${String(s.payload?.role ?? "").replace(/_/g, " ")}`;
  return "Ready for review";
}

async function ensureReviewTask(db: any, p: any, actorId: string) {
  // One open review task per foundation; a later submission after it closes gets a fresh task (refs stay unique).
  const prefix = `foundation-review:${p.id}`;
  const { data: open } = await db.from("staff_tasks").select("id").eq("source", "workflow").like("source_ref", `${prefix}%`).not("status", "in", "(done,cancelled)").limit(1);
  if (open?.length) return;
  const { data: ent } = await db.from("client_entities").select("legal_name").eq("id", p.client_entity_id).maybeSingle();
  const t = await db.from("staff_tasks").insert({
    title: `Review foundation onboarding from ${ent?.legal_name ?? "a client"}`,
    description: "The client submitted foundation information or documents. Accept each item or ask for a correction; submissions never change records by themselves.",
    status: "open", priority: "normal", team: "operations", created_by: actorId, due_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    source: "workflow", source_ref: `${prefix}:${Date.now()}`, client_id: p.client_id, offering_id: null, related_entity_id: p.client_entity_id,
    related_workflow_type: "foundation_administration", related_workflow_id: p.id, responsible_party_type: "HARMONIOUS", responsibility_status: "HARMONIOUS_HANDLING", client_visibility: false,
  }).select("id").single();
  if (t.error) { console.error("foundation review task", t.error); return; }
  await db.from("staff_task_events").insert({ task_id: t.data.id, actor_user_id: actorId, kind: "created", detail: { source: "foundation_onboarding" } });
}

async function submit(db: any, p: any, userId: string, kind: string, payload: object, base: object = {}) {
  const row = must(await db.from("foundation_submissions").insert({ foundation_profile_id: p.id, kind, payload, base, submitted_by: userId }).select("id").single(), "Couldn't send that for review.") as any;
  await logEvent(db, p.id, userId, "client_submission", { submissionId: row.id, kind });
  await ensureReviewTask(db, p, userId);
  return { id: row.id as string };
}

export async function submitClientFoundationFacts(userId: string, d: { profileId: string; facts: unknown }) {
  const db = await admin();
  const p = await clientProfile(db, userId, d.profileId, true);
  const facts = clientFactsSchema.parse(d.facts);
  const changes = proposedChanges(p, facts);
  if (!changes.length) throw new Error("Nothing changed.");
  const problem = factsProblem({ ...p, ...Object.fromEntries(changes.map((c) => [c.field, c.to])) });
  if (problem) throw new Error(problem);
  const { data: open } = await db.from("foundation_submissions").select("id").eq("foundation_profile_id", p.id).eq("kind", "profile_facts").eq("status", "submitted").limit(1);
  if (open?.length) throw new Error("Your earlier changes are still being reviewed. Withdraw them first to send new ones.");
  return submit(db, p, userId, "profile_facts", { changes }, Object.fromEntries(changes.map((c) => [c.field, c.from])));
}

export async function requestClientFoundationPerson(userId: string, d: { profileId: string; request: unknown }) {
  const db = await admin();
  const p = await clientProfile(db, userId, d.profileId, true);
  const r = personRequestSchema.parse(d.request);
  if (r.mode === "existing") {
    const { data: c } = await db.from("client_contacts").select("id").eq("client_id", p.client_id).eq("person_id", r.personId).limit(1);
    if (!c?.length) throw new Error("Choose one of your organization's people, or add a new person.");
    return submit(db, p, userId, "person_existing", r);
  }
  return submit(db, p, userId, "person_new", { ...r, email: r.email ? r.email.toLowerCase() : null });
}

export async function uploadClientFoundationDocument(userId: string, d: FoundationUpload) {
  const db = await admin();
  const p = await clientProfile(db, userId, d.profileId, true);
  const r = await storeFoundationDocument(db, p, userId, d, "client");
  await ensureReviewTask(db, p, userId);
  return r;
}

export async function openClientFoundationDocument(userId: string, documentId: string) {
  const db = await admin();
  const doc = must(await db.from("foundation_documents").select("id, foundation_profile_id, storage_bucket, storage_path").eq("id", documentId).maybeSingle(), "Couldn't read the document.") as any;
  if (!doc) throw new Error("Document not found.");
  const p = await clientProfile(db, userId, doc.foundation_profile_id, false);
  const { data, error } = await db.storage.from(doc.storage_bucket).createSignedUrl(doc.storage_path, 60);
  if (error || !data?.signedUrl) throw new Error("Couldn't open the document.");
  await logEvent(db, p.id, userId, "document_opened", { documentId, by: "client" });
  return { url: data.signedUrl as string };
}

export async function markClientFoundationReady(userId: string, profileId: string) {
  const db = await admin();
  const p = await clientProfile(db, userId, profileId, true);
  const { data: open } = await db.from("foundation_submissions").select("id").eq("foundation_profile_id", p.id).eq("kind", "ready_for_review").eq("status", "submitted").limit(1);
  if (open?.length) throw new Error("Harmonious already has this for review.");
  return submit(db, p, userId, "ready_for_review", {});
}

export async function withdrawClientFoundationSubmission(userId: string, submissionId: string) {
  const db = await admin();
  const s = must(await db.from("foundation_submissions").select("id, foundation_profile_id, submitted_by, status").eq("id", submissionId).maybeSingle(), "Couldn't read that submission.") as any;
  if (!s) throw new Error("Submission not found.");
  const p = await clientProfile(db, userId, s.foundation_profile_id, true);
  if (s.submitted_by !== userId) throw new Error("Only the person who sent it can withdraw it.");
  if (s.status !== "submitted") throw new Error("This was already reviewed.");
  must(await db.from("foundation_submissions").update({ status: "withdrawn", reviewed_by: userId, reviewed_at: nowIso() }).eq("id", s.id).eq("status", "submitted"), "Couldn't withdraw it.");
  await logEvent(db, p.id, userId, "client_submission_withdrawn", { submissionId: s.id });
  return { ok: true };
}

// ------------------------------------------------------------ Staff review

/** Harmonious staff only, by capability; client membership never reaches these paths. */
async function staff(db: any, userId: string, cap: string) {
  const a = await actor(db, userId);
  if (!a.capabilities.includes(cap)) throw new Error(cap === "clients:see" ? "Foundation not found." : "Your role can't do that.");
  const f = await foundationFlags(db);
  if (!f.foundation_administration) throw new Error("Foundation Administration is turned off.");
  return a;
}

export async function getFoundationReview(userId: string, profileId: string) {
  const db = await admin();
  const p = await profileFor(db, profileId);
  const a = await staff(db, userId, "clients:see");
  const [subs, docs] = await Promise.all([
    db.from("foundation_submissions").select("*").eq("foundation_profile_id", p.id).order("submitted_at", { ascending: false }).limit(100),
    docsWithReviews(db, [p.id]),
  ]);
  const list = must(subs, "Couldn't read submissions.") as any[];
  const facts = Object.fromEntries(Object.keys(CLIENT_FACT_FIELDS).map((k) => [k, p[k] ?? null]));
  const pids = [...new Set(list.filter((s) => s.kind === "person_existing").map((s) => s.payload?.personId).filter(Boolean))];
  const names = pids.length ? (((await db.from("client_contacts").select("person_id, full_name").eq("client_id", p.client_id).in("person_id", pids)).data ?? []) as any[]) : [];
  const out = [];
  for (const s of list) {
    let candidates: any[] = [];
    if (s.kind === "person_new" && s.status === "submitted") {
      const { findPersonCandidates } = await import("@/lib/person-resolution.server");
      candidates = (await findPersonCandidates({ email: s.payload?.email ?? null, firstName: s.payload?.firstName, lastName: s.payload?.lastName })).map((c) => ({ id: c.id, name: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim(), email: c.email, hasLogin: !!c.userId }));
    }
    const changes = (s.payload?.changes ?? []) as FactChange[];
    out.push({
      ...s, changes, candidates,
      changedSince: s.kind === "profile_facts" && s.status === "submitted" ? changedSinceSubmission(s.base ?? {}, facts, changes) : [],
      personName: s.kind === "person_existing" ? (names.find((n) => n.person_id === s.payload?.personId)?.full_name ?? "Person on file") : null,
      ownSubmission: s.submitted_by === userId,
    });
  }
  return { canReview: a.capabilities.includes("clients:review"), submissions: out, pendingDocuments: docs.filter((d) => d.source === "client" && !d.superseded_by && d.review === null).map((d) => ({ ...d, ownUpload: d.uploaded_by === userId })) };
}

export async function reviewFoundationSubmission(userId: string, d: { submissionId: string; decision: "accepted" | "correction_requested"; note?: string | null | undefined; confirmReplace?: boolean | undefined; person?: { action: "create_new" | "use_existing"; personId?: string | null | undefined } | null | undefined }) {
  const db = await admin();
  const s = must(await db.from("foundation_submissions").select("*").eq("id", d.submissionId).maybeSingle(), "Couldn't read that submission.") as any;
  if (!s) throw new Error("Submission not found.");
  const p = await profileFor(db, s.foundation_profile_id);
  await staff(db, userId, "clients:review");
  const problem = reviewProblem({ reviewerId: userId, submitterId: s.submitted_by, decision: d.decision, note: d.note ?? null, status: s.status });
  if (problem) throw new Error(problem);
  let resolution: Record<string, unknown> | null = null;

  if (d.decision === "accepted" && s.kind === "profile_facts") {
    const changes = (s.payload?.changes ?? []) as FactChange[];
    const changed = changedSinceSubmission(s.base ?? {}, p, changes);
    if (changed.length && !d.confirmReplace) throw new Error(`These were changed after the client submitted: ${changed.map((f) => CLIENT_FACT_FIELDS[f]).join(", ")}. Confirm to replace them.`);
    const row: Record<string, unknown> = Object.fromEntries(changes.map((c) => [c.field, c.field === "fiscal_year_end_month" && c.to !== null ? Number(c.to) : c.to]));
    const merged = { ...p, ...row };
    const fp = factsProblem(merged);
    if (fp) throw new Error(fp);
    must(await db.from("foundation_profiles").update({ ...row, updated_by: userId, updated_at: nowIso() }).eq("id", p.id), "Couldn't apply the changes.");
    resolution = { applied: changes, replacedChangedFields: changed };
    await logEvent(db, p.id, userId, "profile_updated", { fields: changes.map((c) => c.field), from: Object.fromEntries(changes.map((c) => [c.field, p[c.field] ?? null])), to: row, submissionId: s.id });
  }
  if (d.decision === "accepted" && s.kind === "person_new") resolution = await resolveNewPerson(db, p, s, userId, d.person ?? null);
  if (d.decision === "accepted" && s.kind === "person_existing") resolution = { personId: s.payload?.personId, role: s.payload?.role, next: "Record the role with its evidence under People and authority. Accepting this grants no authority or access." };

  const done = must(await db.from("foundation_submissions").update({ status: d.decision, reviewed_by: userId, reviewed_at: nowIso(), review_note: d.note?.trim() || null, resolution }).eq("id", s.id).eq("status", "submitted").select("id"), "Couldn't record the decision.") as any[];
  if (!done?.length) throw new Error("This submission was already decided.");
  await logEvent(db, p.id, userId, d.decision === "accepted" ? "submission_accepted" : "submission_correction_requested", { submissionId: s.id, kind: s.kind });
  return { ok: true };
}

/** New people go through canonical Person resolution: an explicit choice whenever a possible match exists; never a silent reuse or merge. */
async function resolveNewPerson(db: any, p: any, s: any, userId: string, choice: { action: "create_new" | "use_existing"; personId?: string | null | undefined } | null) {
  const { findPersonCandidates, withPersonCreationLock } = await import("@/lib/person-resolution.server");
  const signals = { email: s.payload?.email ?? null, firstName: s.payload?.firstName, lastName: s.payload?.lastName };
  return withPersonCreationLock(signals, async () => {
    const candidates = await findPersonCandidates(signals);
    if (candidates.length && !choice) throw new Error("This person may already exist. Choose the matching person or confirm a new person.");
    let personId: string;
    let matchKind: string;
    if (choice?.action === "use_existing") {
      if (!choice.personId || !candidates.some((c) => c.id === choice.personId)) throw new Error("Choose one of the possible matches.");
      personId = choice.personId; matchKind = "existing_chosen";
    } else {
      const created = must(await db.from("persons").insert({ user_id: null, legal_first_name: String(s.payload.firstName).trim(), legal_last_name: String(s.payload.lastName).trim(), email: s.payload?.email ?? null, entry_source: "foundation_onboarding", created_by: userId, onboarding_state: "account_created" }).select("id").single(), "Couldn't add that person.") as any;
      personId = created.id; matchKind = candidates.length ? "new_despite_candidates" : "new";
    }
    const { data: existing } = await db.from("client_contacts").select("id").eq("client_id", p.client_id).eq("person_id", personId).limit(1);
    let contactId = existing?.[0]?.id ?? null;
    if (!contactId) {
      const c = must(await db.from("client_contacts").insert({ client_id: p.client_id, full_name: `${s.payload.firstName} ${s.payload.lastName}`.trim(), email: s.payload?.email ?? null, title: s.payload?.title ?? null, person_id: personId, created_by: userId }).select("id").single(), "Couldn't add the person to this client.") as any;
      contactId = c.id;
      await db.from("client_contact_events").insert({ contact_id: contactId, client_id: p.client_id, actor_id: userId, event_kind: "created", detail: { source: "foundation_onboarding", submissionId: s.id } });
    }
    return { personId, contactId, matchKind, role: s.payload?.role, next: "Record the role with its evidence under People and authority. No login or access was created." };
  });
}

export async function reviewFoundationDocument(userId: string, d: { documentId: string; decision: "accepted" | "correction_requested"; note?: string | null | undefined }) {
  const db = await admin();
  const doc = must(await db.from("foundation_documents").select("id, foundation_profile_id, uploaded_by, source, superseded_by, title").eq("id", d.documentId).maybeSingle(), "Couldn't read the document.") as any;
  if (!doc) throw new Error("Document not found.");
  const p = await profileFor(db, doc.foundation_profile_id);
  await staff(db, userId, "clients:review");
  if (doc.source !== "client") throw new Error("Only client uploads need review.");
  if (doc.superseded_by) throw new Error("Only the current version can be reviewed.");
  if (doc.uploaded_by === userId) throw new Error("Someone other than the uploader must review a document.");
  if (d.decision === "correction_requested" && (d.note ?? "").trim().length < 3) throw new Error("Say what needs to be corrected.");
  must(await db.from("foundation_document_reviews").insert({ document_id: doc.id, decision: d.decision, note: d.note?.trim() || null, reviewed_by: userId }), "Couldn't record the review.");
  await logEvent(db, p.id, userId, d.decision === "accepted" ? "document_accepted" : "document_correction_requested", { documentId: doc.id, title: doc.title });
  return { ok: true };
}

// ------------------------------------------------------------ Verification

export async function getFoundationVerification(userId: string, profileId: string) {
  const db = await admin();
  const p = await profileFor(db, profileId);
  const a = await staff(db, userId, "clients:see");
  const docs = await docsWithReviews(db, [p.id]);
  const v = await verificationFor(db, p, docs, await scopeComponents(db, p));
  const strict = capabilitiesFor(a.roles, { moneyPath: true });
  const canDecide = strict.includes("onboarding:approve") && a.roles.some((r) => ["compliance", "admin", "super_admin"].includes(r));
  const accountChecks = await accountChecksFor(db, v.requirements.map((r) => r.personId).filter((x): x is string => !!x));
  return {
    ...v, canDecide, userId,
    evidenceOptions: docs.filter((d) => !d.superseded_by && (d.source === "staff" || d.review === "accepted")).map((d) => ({ id: d.id, title: d.title, kind: d.kind, uploadedByMe: d.uploaded_by === userId })),
    accountChecks,
  };
}

/** Sign-in account checks, shown separately for context. They never satisfy a foundation requirement here. */
async function accountChecksFor(db: any, personIds: string[]) {
  if (!personIds.length) return [] as { personId: string; status: string }[];
  const { data: ps } = await db.from("persons").select("id, user_id").in("id", personIds);
  const users = ((ps ?? []) as any[]).filter((x) => x.user_id);
  if (!users.length) return [];
  const { data } = await db.from("account_identity_checks").select("user_id, status, created_at").in("user_id", users.map((u) => u.user_id)).order("created_at", { ascending: false });
  return users.map((u) => ({ personId: u.id as string, status: (((data ?? []) as any[]).find((c) => c.user_id === u.user_id)?.status ?? "none") as string }));
}

export async function decideFoundationEntityReview(userId: string, d: { profileId: string; decision: "approved" | "declined" | "more_information"; evidenceDocumentIds: string[]; note: string }) {
  const db = await admin();
  const p = await profileFor(db, d.profileId);
  const a = await staff(db, userId, "clients:see");
  const strict = capabilitiesFor(a.roles, { moneyPath: true });
  if (!strict.includes("onboarding:approve") || !a.roles.some((r) => ["compliance", "admin", "super_admin"].includes(r))) throw new Error("Only Compliance or an administrator can decide foundation verification.");
  if (d.note.trim().length < 3) throw new Error("Add a short note explaining the decision.");
  const docs = await docsWithReviews(db, [p.id]);
  for (const id of d.evidenceDocumentIds) {
    const doc = docs.find((x) => x.id === id);
    if (!doc) throw new Error("Evidence must be documents of this foundation.");
    if (doc.uploaded_by === userId) throw new Error("Someone other than the uploader must decide on that evidence.");
  }
  must(await db.from("foundation_verification_reviews").insert({ foundation_profile_id: p.id, requirement: "entity_records", decision: d.decision, evidence_document_ids: d.evidenceDocumentIds, note: d.note.trim(), decided_by: userId }), "Couldn't record the decision. Approval needs a current, accepted governing document and the EIN on file.");
  await logEvent(db, p.id, userId, "verification_decided", { requirement: "entity_records", decision: d.decision, evidence: d.evidenceDocumentIds });
  return { ok: true };
}

// ------------------------------------------------------------ Component release controls

async function releaseEvents(db: any): Promise<ReleaseEvent[]> {
  return must(await db.from("foundation_component_release_events").select("id, component, dimension, action, request_id, evidence, reason, actor_id, created_at").order("created_at"), "Couldn't read release history.") as ReleaseEvent[];
}

export async function getFoundationReleaseControls(userId: string) {
  const db = await admin();
  const a = await actor(db, userId);
  if (!a.capabilities.includes("clients:see")) throw new Error("Not allowed.");
  const events = await releaseEvents(db);
  const state = releaseState(events);
  return {
    userId, canRequest: a.roles.some((r) => r === "admin" || r === "super_admin"), canApprove: a.superAdmin,
    flags: await foundationFlags(db),
    components: FOUNDATION_COMPONENTS.map((c) => ({ key: c.key, name: c.name, capability: c.readiness.capability, available: c.readiness.available, missing: c.readiness.missing, state: state[c.key] })),
    events: [...events].reverse().slice(0, 100),
    dimensions: RELEASE_DIMENSIONS, evidence: RELEASE_EVIDENCE, required: REQUIRED_EVIDENCE, protectedFinancial: PROTECTED_FINANCIAL,
  };
}

export async function requestFoundationRelease(userId: string, d: { component: ComponentKey; dimension: ReleaseDimension; evidence: Partial<Record<ReleaseEvidenceKey, string>>; reason: string }) {
  const db = await admin();
  const a = await actor(db, userId);
  const state = releaseState(await releaseEvents(db));
  if (!COMPONENT_KEYS.includes(d.component)) throw new Error("Choose a Foundation Administration component.");
  const problem = releaseRequestProblem({ component: d.component, dimension: d.dimension, evidence: d.evidence, reason: d.reason, roles: a.roles, state: state[d.component][d.dimension] });
  if (problem) throw new Error(problem);
  const evidence = Object.fromEntries(REQUIRED_EVIDENCE[d.dimension].map((k) => [k, (d.evidence[k] ?? "").trim()]));
  must(await db.from("foundation_component_release_events").insert({ component: d.component, dimension: d.dimension, action: "requested", evidence, reason: d.reason.trim(), actor_id: userId }), "Couldn't record the release request.");
  return { ok: true };
}

export async function decideFoundationRelease(userId: string, d: { component: ComponentKey; dimension: ReleaseDimension; action: "approved" | "withdrawn" | "revoked"; reason: string }) {
  const db = await admin();
  const a = await actor(db, userId);
  const state = releaseState(await releaseEvents(db));
  if (!COMPONENT_KEYS.includes(d.component)) throw new Error("Choose a Foundation Administration component.");
  const st = state[d.component][d.dimension];
  if (d.reason.trim().length < 10) throw new Error("Give the reason (at least 10 characters).");
  if (d.action === "approved") {
    const problem = releaseApprovalProblem({ request: st.openRequest, approverId: userId, roles: a.roles, deliveryReleased: state[d.component].delivery.released });
    if (problem) throw new Error(problem);
  }
  if (d.action === "withdrawn" && (!st.openRequest || (st.openRequest.actor_id !== userId && !a.superAdmin))) throw new Error("Only the requester or a Super Admin can withdraw an open request.");
  if (d.action === "revoked" && (!a.superAdmin || !st.released)) throw new Error("Only a Super Admin can revoke a released component.");
  must(await db.from("foundation_component_release_events").insert({ component: d.component, dimension: d.dimension, action: d.action, request_id: d.action === "revoked" ? null : st.openRequest?.id ?? null, reason: d.reason.trim(), actor_id: userId }), "Couldn't record that decision.");
  return { ok: true };
}
