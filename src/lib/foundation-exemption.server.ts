/**
 * Server-only Form 1023 workflow. Staff with the foundation workspace capabilities record what Harmonious prepared
 * and what the foundation's board and officer did. Nothing here files, signs, pays a fee or sends anything.
 */
import { admin, authorize, logEvent, must, profileFor } from "@/lib/foundation-admin.server";
import {
  LETTER_DONE, advanceProblem, ezScreenResult, filingWindow, letterAdvanceProblem, letterDue, letterTaskDue, newLetterProblem, prerequisites,
  type AdvanceInput, type AppFacts, type ExemptionStage, type EzScreen, type LetterInput, type LetterStatus, type People, type PrereqFacts,
} from "@/lib/foundation-exemption-model";

const today = () => new Date().toISOString().slice(0, 10);
const nowIso = () => new Date().toISOString();
const BOARD_ROLES = ["director", "trustee", "officer"];

async function context(db: any, profileId: string) {
  const p = await profileFor(db, profileId);
  const [entity, roles, docs, contacts] = await Promise.all([
    db.from("client_entities").select("legal_name, formation_date, tax_id_masked").eq("id", p.client_entity_id).maybeSingle(),
    db.from("foundation_authority_roles").select("person_id, role, authority_scopes, evidence_document_id, status").eq("foundation_profile_id", p.id).eq("status", "active"),
    db.from("foundation_documents").select("id, kind, title, source, superseded_by, uploaded_at").eq("foundation_profile_id", p.id).is("superseded_by", null).order("uploaded_at", { ascending: false }),
    db.from("client_contacts").select("person_id, full_name").eq("client_id", p.client_id).not("person_id", "is", null),
  ]);
  const docRows = (must(docs, "Couldn't read the foundation's documents.") ?? []) as any[];
  const docIds = docRows.map((d) => d.id);
  const reviews = docIds.length ? (((await db.from("foundation_document_reviews").select("document_id, decision, created_at").in("document_id", docIds).order("created_at")).data ?? []) as any[]) : [];
  const last = new Map<string, string>(); for (const r of reviews) last.set(r.document_id, r.decision);
  const usableDocs = docRows.filter((d) => d.source === "staff" || last.get(d.id) === "accepted").map((d) => ({ id: d.id as string, kind: d.kind as string, title: d.title as string }));
  const active = (must(roles, "Couldn't read the foundation's people.") ?? []) as any[];
  const names = new Map<string, string>(((contacts.data ?? []) as any[]).map((c) => [c.person_id, c.full_name]));
  const people: People = {
    board: [...new Set(active.filter((r) => BOARD_ROLES.includes(r.role)).map((r) => r.person_id as string))],
    signers: [...new Set(active.filter((r) => r.role !== "paperwork_preparer" && (r.authority_scopes ?? []).includes("sign_agreements") && r.evidence_document_id).map((r) => r.person_id as string))],
  };
  return { p, entity: (entity.data ?? null) as any, usableDocs, people, names };
}

function prereqFacts(c: Awaited<ReturnType<typeof context>>, app: any | null): PrereqFacts {
  return {
    form: app?.form ?? null, einOnFile: !!c.entity?.tax_id_masked,
    governingDocumentOnFile: c.usableDocs.some((d) => d.kind === "governing_document"),
    boardCount: c.people.board.length, signerCount: c.people.signers.length,
    missionRecorded: (c.p.mission ?? "").trim().length >= 10, projectionsDocumentId: app?.projections_document_id ?? null,
  };
}

const appFacts = (a: any): AppFacts => ({
  stage: a.stage, form: a.form, ezScreen: (a.ez_screen ?? {}) as EzScreen, draftDocumentId: a.draft_document_id, projectionsDocumentId: a.projections_document_id,
  boardApprovedOn: a.board_approved_on, boardApproverPersonId: a.board_approver_person_id, boardEvidenceDocumentId: a.board_evidence_document_id, boardNote: a.board_note,
});

async function appEvent(db: any, applicationId: string, actorId: string, event: string, detail: Record<string, unknown> = {}) {
  must(await db.from("foundation_exemption_events").insert({ application_id: applicationId, actor_id: actorId, event, detail }), "Couldn't record the history. Nothing else changed.");
}

async function loadApp(db: any, applicationId: string) {
  const a = must(await db.from("foundation_exemption_applications").select("*").eq("id", applicationId).maybeSingle(), "Couldn't read the application.") as any;
  if (!a) throw new Error("Application not found.");
  return a;
}

function requireDoc(c: Awaited<ReturnType<typeof context>>, id: string | null | undefined, label: string, kind?: string) {
  if (!id) return null;
  const d = c.usableDocs.find((x) => x.id === id);
  if (!d) throw new Error(`${label} must be a current document of this foundation (client uploads need to be accepted first).`);
  if (kind && d.kind !== kind) throw new Error(`${label} must be uploaded as a ${kind.replace(/_/g, " ")}.`);
  return id;
}

async function addTask(db: any, p: any, userId: string, spec: { title: string; description: string; team: string; due: string; ref: string }) {
  const { data: existing } = await db.from("staff_tasks").select("id").eq("source_ref", spec.ref).limit(1);
  if ((existing ?? []).length) return (existing as any[])[0].id as string;
  const t = must(await db.from("staff_tasks").insert({ title: spec.title.slice(0, 300), description: spec.description, status: "open", priority: "normal", team: spec.team, created_by: userId, due_date: spec.due, source: "workflow", source_ref: spec.ref, client_id: p.client_id, offering_id: null, related_entity_id: p.client_entity_id, related_workflow_type: "foundation_administration", related_workflow_id: p.id, responsible_party_type: "HARMONIOUS", responsibility_status: "HARMONIOUS_HANDLING", client_visibility: false }).select("id").single(), "Couldn't create the Operations task.") as any;
  await db.from("staff_task_events").insert({ task_id: t.id, actor_user_id: userId, kind: "created", detail: { source: "foundation_exemption" } });
  return t.id as string;
}

// ------------------------------------------------------------ Read

export async function getExemptionWorkspace(userId: string, profileId: string) {
  const db = await admin();
  const p0 = await profileFor(db, profileId);
  const a = await authorize(db, userId, p0.client_id, false);
  const c = await context(db, profileId);
  const apps = (must(await db.from("foundation_exemption_applications").select("*").eq("foundation_profile_id", profileId).order("created_at", { ascending: false }), "Couldn't read the applications.") ?? []) as any[];
  const open = apps.find((x) => x.stage !== "closed") ?? null;
  const current = open ?? apps[0] ?? null;
  const [events, letters] = current ? await Promise.all([
    db.from("foundation_exemption_events").select("id, event, detail, created_at, actor_id").eq("application_id", current.id).order("created_at", { ascending: false }).limit(60),
    db.from("foundation_irs_correspondence").select("*").eq("application_id", current.id).order("received_on", { ascending: false }),
  ]) : [{ data: [] }, { data: [] }];
  const t = today();
  const name = (id: string | null) => (id ? c.names.get(id) ?? "Person on file" : null);
  return {
    canEdit: a.capabilities.includes("clients:prepare"),
    today: t,
    entityName: c.entity?.legal_name ?? "this foundation",
    filingWindow: filingWindow(c.entity?.formation_date ?? null, t),
    profile: { legal_structure: c.p.legal_structure, classification: c.p.classification, mission: c.p.mission, exemption_status: c.p.exemption_status },
    documents: c.usableDocs,
    board: c.people.board.map((id) => ({ id, name: name(id) })),
    signers: c.people.signers.map((id) => ({ id, name: name(id) })),
    application: current ? {
      ...current,
      boardApproverName: name(current.board_approver_person_id), submittedByName: name(current.submitted_by_person_id),
      prerequisites: prerequisites(prereqFacts(c, current)),
      ez: ezScreenResult((current.ez_screen ?? {}) as EzScreen, c.p),
    } : null,
    earlierApplications: apps.filter((x) => x.id !== current?.id).map((x) => ({ id: x.id, form: x.form, outcome: x.outcome, closed_on: x.closed_on })),
    events: (events.data ?? []) as any[],
    letters: ((letters.data ?? []) as any[]).map((l) => ({ ...l, approverName: name(l.approver_person_id), sentByName: name(l.sent_by_person_id), due: letterDue({ status: l.status, responseDueOn: l.response_due_on }, t) })),
  };
}

// ------------------------------------------------------------ Application

export async function startExemptionApplication(userId: string, profileId: string) {
  const db = await admin();
  const p = await profileFor(db, profileId);
  await authorize(db, userId, p.client_id, true);
  if (p.status !== "active") throw new Error("This foundation is archived.");
  if (p.exemption_status === "determined") throw new Error("This foundation already has a determination letter on file.");
  const row = must(await db.from("foundation_exemption_applications").insert({ foundation_profile_id: p.id, created_by: userId, updated_by: userId }).select("id").single(), "Couldn't start the application. One may already be open.") as any;
  await appEvent(db, row.id, userId, "started");
  await logEvent(db, p.id, userId, "exemption_application_started", { applicationId: row.id });
  return { id: row.id as string };
}

export type ExemptionDetails = {
  applicationId: string; expectedStage: ExemptionStage;
  form?: "1023" | "1023_ez" | null | undefined; ezScreen?: EzScreen | undefined;
  projectionsDocumentId?: string | null | undefined; draftDocumentId?: string | null | undefined;
  boardApprovedOn?: string | null | undefined; boardApproverPersonId?: string | null | undefined; boardEvidenceDocumentId?: string | null | undefined; boardNote?: string | null | undefined;
};

/** Each field is editable only in the stage that owns it. */
const EDITABLE: Record<string, readonly ExemptionStage[]> = {
  form: ["eligibility"], ez_screen: ["eligibility"], projections_document_id: ["eligibility", "gathering", "drafting"],
  draft_document_id: ["gathering", "drafting"], board_approved_on: ["board_review"], board_approver_person_id: ["board_review"],
  board_evidence_document_id: ["board_review"], board_note: ["board_review"],
};

export async function saveExemptionDetails(userId: string, d: ExemptionDetails) {
  const db = await admin();
  const a = await loadApp(db, d.applicationId);
  const p = await profileFor(db, a.foundation_profile_id);
  await authorize(db, userId, p.client_id, true);
  if (a.stage !== d.expectedStage) throw new Error("Someone else moved this application. Refresh and try again.");
  const c = await context(db, p.id);
  const patch: Record<string, unknown> = {};
  if (d.form !== undefined) patch["form"] = d.form;
  if (d.ezScreen !== undefined) patch["ez_screen"] = d.ezScreen;
  if (d.projectionsDocumentId !== undefined) patch["projections_document_id"] = requireDoc(c, d.projectionsDocumentId, "The projections");
  if (d.draftDocumentId !== undefined) patch["draft_document_id"] = requireDoc(c, d.draftDocumentId, "The prepared application");
  if (d.boardApprovedOn !== undefined) { if (d.boardApprovedOn && d.boardApprovedOn > today()) throw new Error("The board approval date can't be in the future."); patch["board_approved_on"] = d.boardApprovedOn || null; }
  if (d.boardApproverPersonId !== undefined) { if (d.boardApproverPersonId && !c.people.board.includes(d.boardApproverPersonId)) throw new Error("Choose an active director, trustee or officer."); patch["board_approver_person_id"] = d.boardApproverPersonId || null; }
  if (d.boardEvidenceDocumentId !== undefined) patch["board_evidence_document_id"] = requireDoc(c, d.boardEvidenceDocumentId, "The board evidence");
  if (d.boardNote !== undefined) patch["board_note"] = d.boardNote?.trim() || null;
  const blocked = Object.keys(patch).filter((k) => !(EDITABLE[k] ?? []).includes(a.stage));
  if (blocked.length) throw new Error("That detail can't be changed at this stage.");
  const changed = Object.keys(patch).filter((k) => JSON.stringify(a[k] ?? null) !== JSON.stringify(patch[k] ?? null));
  if (!changed.length) return { ok: true };
  const done = must(await db.from("foundation_exemption_applications").update({ ...patch, updated_by: userId, updated_at: nowIso() }).eq("id", a.id).eq("stage", a.stage).select("id"), "Couldn't save.") as any[];
  if (!done?.length) throw new Error("Someone else moved this application. Refresh and try again.");
  await appEvent(db, a.id, userId, "details_saved", { fields: changed, from: Object.fromEntries(changed.map((k) => [k, a[k] ?? null])), to: Object.fromEntries(changed.map((k) => [k, patch[k] ?? null])) });
  return { ok: true };
}

export async function advanceExemption(userId: string, d: { applicationId: string; expectedStage: ExemptionStage; to: ExemptionStage; input?: AdvanceInput | undefined }) {
  const db = await admin();
  const a = await loadApp(db, d.applicationId);
  const p = await profileFor(db, a.foundation_profile_id);
  await authorize(db, userId, p.client_id, true);
  if (a.stage !== d.expectedStage) throw new Error("Someone else moved this application. Refresh and try again.");
  const c = await context(db, p.id);
  const t = today();
  const input: AdvanceInput = { ...(d.input ?? {}) };
  if (d.to === "closed") {
    const { data: ls } = await db.from("foundation_irs_correspondence").select("status").eq("application_id", a.id);
    input.openLetters = ((ls ?? []) as any[]).filter((l) => !LETTER_DONE.includes(l.status)).length;
    if (input.outcome === "approved") requireDoc(c, input.determinationDocumentId, "The determination letter", "determination_letter");
  }
  const problem = advanceProblem(appFacts(a), d.to, { prereqs: prereqFacts(c, a), profile: c.p, people: c.people, today: t, input });
  if (problem) throw new Error(problem);

  const patch: Record<string, unknown> = { stage: d.to, updated_by: userId, updated_at: nowIso() };
  if (d.to === "submitted") Object.assign(patch, { submitted_on: input.submittedOn, submitted_by_person_id: input.submittedByPersonId, confirmation_ref: input.confirmationRef?.trim() });
  if (d.to === "closed") Object.assign(patch, {
    outcome: input.outcome, closed_on: t, closed_note: input.note?.trim() || null,
    determination_document_id: input.outcome === "approved" ? input.determinationDocumentId : null,
    determination_letter_on: input.outcome === "approved" ? input.determinationLetterOn : null,
    exemption_effective_on: input.outcome === "approved" ? input.exemptionEffectiveOn : null,
  });
  if (a.stage === "board_review" && d.to === "drafting") Object.assign(patch, { board_approved_on: null, board_approver_person_id: null, board_evidence_document_id: null });
  const done = must(await db.from("foundation_exemption_applications").update(patch).eq("id", a.id).eq("stage", a.stage).select("id"), "Couldn't move the application.") as any[];
  if (!done?.length) throw new Error("Someone else moved this application. Refresh and try again.");
  await appEvent(db, a.id, userId, d.to === "closed" ? `closed_${input.outcome}` : a.stage === "board_review" && d.to === "drafting" ? "sent_back_to_drafting" : `moved_to_${d.to}`, { from: a.stage, to: d.to, note: input.note?.trim() || null, confirmationRef: d.to === "submitted" ? input.confirmationRef?.trim() : undefined });

  // Canonical foundation profile follows the recorded facts, logged like any profile edit.
  const setProfile = async (row: Record<string, unknown>, why: string) => {
    const changed = Object.keys(row).filter((k) => String(c.p[k] ?? "") !== String(row[k] ?? ""));
    if (!changed.length) return;
    must(await db.from("foundation_profiles").update({ ...row, updated_by: userId, updated_at: nowIso() }).eq("id", p.id), "The application moved, but the foundation's exemption status couldn't be updated. Update it on the Overview.");
    await logEvent(db, p.id, userId, "profile_updated", { fields: changed, from: Object.fromEntries(changed.map((k) => [k, c.p[k] ?? null])), to: Object.fromEntries(changed.map((k) => [k, row[k] ?? null])), source: why });
  };
  const ent = c.entity?.legal_name ?? "the foundation";
  if (d.to === "submitted") {
    if (c.p.exemption_status !== "determined") await setProfile({ exemption_status: "pending" }, "form_1023_submitted");
    await addTask(db, p, userId, { title: `Bill the remaining setup fees: Form 1023 submitted for ${ent}`, description: "The SOW's payment terms make the second half of the setup fees due when Form 1023 is submitted. Prepare the invoice through the normal billing review. Nothing is invoiced automatically, and the IRS user fee is billed separately at cost.", team: "finance", due: t, ref: `foundation-1023-billing:${a.id}` });
    await logEvent(db, p.id, userId, "exemption_application_submitted", { applicationId: a.id, form: a.form, submittedOn: input.submittedOn });
  }
  if (d.to === "closed") {
    if (input.outcome === "approved") await setProfile({ exemption_status: "determined", determination_letter_on: input.determinationLetterOn, exemption_effective_on: input.exemptionEffectiveOn }, "form_1023_determination");
    else if (c.p.exemption_status === "pending") await setProfile({ exemption_status: "not_applied" }, `form_1023_${input.outcome}`);
    await logEvent(db, p.id, userId, "exemption_application_closed", { applicationId: a.id, outcome: input.outcome });
  }
  return { stage: d.to };
}

// ------------------------------------------------------------ IRS correspondence

export async function addIrsLetter(userId: string, d: { applicationId: string; kind: string; receivedOn: string; summary: string; letterDocumentId?: string | null | undefined; responseDueOn?: string | null | undefined }) {
  const db = await admin();
  const a = await loadApp(db, d.applicationId);
  const p = await profileFor(db, a.foundation_profile_id);
  await authorize(db, userId, p.client_id, true);
  const t = today();
  const problem = newLetterProblem({ kind: d.kind, receivedOn: d.receivedOn, summary: d.summary, responseDueOn: d.responseDueOn ?? null }, a.stage, t);
  if (problem) throw new Error(problem);
  const c = await context(db, p.id);
  const docId = requireDoc(c, d.letterDocumentId, "The IRS letter");
  const needsResponse = d.kind === "information_request" || !!d.responseDueOn;
  const row = must(await db.from("foundation_irs_correspondence").insert({
    application_id: a.id, kind: d.kind, received_on: d.receivedOn, summary: d.summary.trim(), letter_document_id: docId, response_due_on: d.responseDueOn || null,
    status: needsResponse ? "open" : "closed", closed_reason: needsResponse ? null : "Logged for the record; no response needed.", created_by: userId, updated_by: userId,
  }).select("id").single(), "Couldn't log the letter.") as any;
  if (needsResponse && d.responseDueOn) {
    const taskId = await addTask(db, p, userId, { title: `Draft the IRS response for ${c.entity?.legal_name ?? "the foundation"} (due ${d.responseDueOn})`, description: `${d.summary.trim().slice(0, 500)}\n\nPrepare the draft, get the board's approval and record the officer's reply on the Form 1023 tab. Harmonious never sends it for the foundation. Mark this task done once the reply is recorded.`, team: "operations", due: letterTaskDue(d.responseDueOn, t), ref: `foundation-irs:${row.id}` });
    await db.from("foundation_irs_correspondence").update({ task_id: taskId }).eq("id", row.id);
  }
  await appEvent(db, a.id, userId, "irs_letter_logged", { letterId: row.id, kind: d.kind, receivedOn: d.receivedOn, responseDueOn: d.responseDueOn ?? null });
  return { id: row.id as string };
}

export async function advanceIrsLetter(userId: string, d: { letterId: string; expectedStatus: LetterStatus; to: LetterStatus; input?: LetterInput | undefined }) {
  const db = await admin();
  const l = must(await db.from("foundation_irs_correspondence").select("*").eq("id", d.letterId).maybeSingle(), "Couldn't read the letter.") as any;
  if (!l) throw new Error("Letter not found.");
  const a = await loadApp(db, l.application_id);
  const p = await profileFor(db, a.foundation_profile_id);
  await authorize(db, userId, p.client_id, true);
  if (l.status !== d.expectedStatus) throw new Error("Someone else updated this letter. Refresh and try again.");
  const c = await context(db, p.id);
  const i = d.input ?? {};
  if (d.to === "response_drafted") requireDoc(c, i.responseDocumentId, "The drafted response");
  const problem = letterAdvanceProblem({ status: l.status, kind: l.kind, receivedOn: l.received_on, responseDueOn: l.response_due_on, responseDocumentId: l.response_document_id }, d.to, c.people, today(), i);
  if (problem) throw new Error(problem);
  const patch: Record<string, unknown> = { status: d.to, updated_by: userId, updated_at: nowIso() };
  if (d.to === "response_drafted") patch["response_document_id"] = i.responseDocumentId;
  if (d.to === "board_approved") Object.assign(patch, { approver_person_id: i.approverPersonId, approved_on: i.approvedOn });
  if (d.to === "responded") Object.assign(patch, { responded_on: i.respondedOn, sent_by_person_id: i.sentByPersonId });
  if (d.to === "closed") patch["closed_reason"] = i.reason?.trim();
  const done = must(await db.from("foundation_irs_correspondence").update(patch).eq("id", l.id).eq("status", l.status).select("id"), "Couldn't update the letter.") as any[];
  if (!done?.length) throw new Error("Someone else updated this letter. Refresh and try again.");
  await appEvent(db, a.id, userId, `irs_letter_${d.to}`, { letterId: l.id, from: l.status, reason: i.reason?.trim() || null });
  return { status: d.to };
}
