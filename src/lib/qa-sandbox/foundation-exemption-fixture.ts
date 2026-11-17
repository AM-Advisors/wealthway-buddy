/**
 * Fictional Form 1023 workflow for /qa-sandbox. Uses the same pure rules as the server; nothing leaves the browser.
 */
import {
  LETTER_DONE, advanceProblem, ezScreenResult, filingWindow, letterAdvanceProblem, letterDue, letterTaskDue, newLetterProblem, prerequisites,
  type AppFacts, type People, type PrereqFacts,
} from "@/lib/foundation-exemption-model";

export const QA_EXEMPTION_FNS = ["getExemptionWorkspace", "startExemptionApplication", "saveExemptionDetails", "advanceExemption", "addIrsLetter", "advanceIrsLetter"] as const;

type State = { profiles: any[]; entities: any[]; authority: any[]; documents: any[]; tasks: any[]; seq: number; exemptions?: any[]; irsLetters?: any[]; exemptionEvents?: any[] };
type Ctx = { usable: (s: State, d: any) => boolean; people: { personId: string; name: string }[]; log: (s: State, profileId: string, event: string) => void };

const today = () => new Date().toISOString().slice(0, 10);
const nowIso = () => new Date().toISOString();
const BOARD = ["director", "trustee", "officer"];

export function handleQaExemptionCall(fn: string, data: any, s: State, c: Ctx): unknown {
  const apps = (s.exemptions ??= []); const letters = (s.irsLetters ??= []); const events = (s.exemptionEvents ??= []);
  const prof = (id: string | undefined) => { const p = id ? s.profiles.find((x) => x.id === id) : s.profiles[0]; if (!p) throw new Error("Foundation not found."); return p; };
  const docsFor = (p: any) => s.documents.filter((d) => d.foundation_profile_id === p.id && !d.superseded_by && c.usable(s, d)).map((d) => ({ id: d.id, kind: d.kind, title: d.title }));
  const peopleFor = (p: any): People => {
    const active = s.authority.filter((r) => r.foundation_profile_id === p.id && r.status === "active");
    return { board: [...new Set(active.filter((r) => BOARD.includes(r.role)).map((r) => r.person_id))], signers: [...new Set(active.filter((r) => r.role !== "paperwork_preparer" && (r.authority_scopes ?? []).includes("sign_agreements") && r.evidence_document_id).map((r) => r.person_id))] };
  };
  const name = (id: string | null) => (id ? c.people.find((x) => x.personId === id)?.name ?? "Person on file" : null);
  const entity = (p: any) => s.entities.find((e) => e.id === p.client_entity_id);
  const facts = (p: any, a: any): PrereqFacts => { const pe = peopleFor(p); return { form: a?.form ?? null, einOnFile: !!entity(p)?.tax_id_masked, governingDocumentOnFile: docsFor(p).some((d) => d.kind === "governing_document"), boardCount: pe.board.length, signerCount: pe.signers.length, missionRecorded: (p.mission ?? "").trim().length >= 10, projectionsDocumentId: a?.projections_document_id ?? null }; };
  const appFacts = (a: any): AppFacts => ({ stage: a.stage, form: a.form, ezScreen: a.ez_screen ?? {}, draftDocumentId: a.draft_document_id, projectionsDocumentId: a.projections_document_id, boardApprovedOn: a.board_approved_on, boardApproverPersonId: a.board_approver_person_id, boardEvidenceDocumentId: a.board_evidence_document_id, boardNote: a.board_note });
  const ev = (a: any, event: string, detail: any = {}) => events.unshift({ id: `xev-${s.seq++}`, application_id: a.id, event, detail, created_at: nowIso() });
  const app = (id: string) => { const a = apps.find((x) => x.id === id); if (!a) throw new Error("Application not found."); return a; };
  const docOk = (p: any, id: string | null | undefined, label: string, kind?: string) => { if (!id) return null; const d = docsFor(p).find((x) => x.id === id); if (!d || (kind && d.kind !== kind)) throw new Error(`${label} must be a current document of this foundation.`); return id; };
  const t = today();

  switch (fn) {
    case "getExemptionWorkspace": {
      const p = prof(data?.profileId);
      const mine = apps.filter((a) => a.foundation_profile_id === p.id);
      const cur = mine.find((a) => a.stage !== "closed") ?? mine[0] ?? null;
      const pe = peopleFor(p);
      return {
        canEdit: true, today: t, entityName: entity(p)?.legal_name, filingWindow: filingWindow(entity(p)?.formation_date, t),
        profile: { legal_structure: p.legal_structure, classification: p.classification, mission: p.mission, exemption_status: p.exemption_status },
        documents: docsFor(p), board: pe.board.map((id) => ({ id, name: name(id) })), signers: pe.signers.map((id) => ({ id, name: name(id) })),
        application: cur ? { ...cur, boardApproverName: name(cur.board_approver_person_id), submittedByName: name(cur.submitted_by_person_id), prerequisites: prerequisites(facts(p, cur)), ez: ezScreenResult(cur.ez_screen ?? {}, p) } : null,
        earlierApplications: mine.filter((a) => a.id !== cur?.id).map((a) => ({ id: a.id, form: a.form, outcome: a.outcome, closed_on: a.closed_on })),
        events: cur ? events.filter((e) => e.application_id === cur.id) : [],
        letters: cur ? letters.filter((l) => l.application_id === cur.id).map((l) => ({ ...l, approverName: name(l.approver_person_id), sentByName: name(l.sent_by_person_id), due: letterDue({ status: l.status, responseDueOn: l.response_due_on }, t) })) : [],
      };
    }
    case "startExemptionApplication": {
      const p = prof(data.profileId);
      if (apps.some((a) => a.foundation_profile_id === p.id && a.stage !== "closed")) throw new Error("Couldn't start the application. One may already be open.");
      const a = { id: `xapp-${s.seq++}`, foundation_profile_id: p.id, form: null, ez_screen: {}, stage: "eligibility", projections_document_id: null, draft_document_id: null, board_approved_on: null, board_approver_person_id: null, board_evidence_document_id: null, board_note: null, submitted_on: null, submitted_by_person_id: null, confirmation_ref: null, outcome: null, determination_document_id: null, determination_letter_on: null, exemption_effective_on: null, closed_note: null, closed_on: null, created_at: nowIso(), updated_at: nowIso() };
      apps.unshift(a); ev(a, "started"); c.log(s, p.id, "exemption_application_started");
      return { id: a.id };
    }
    case "saveExemptionDetails": {
      const a = app(data.applicationId); const p = prof(a.foundation_profile_id);
      if (a.stage !== data.expectedStage) throw new Error("Someone else moved this application. Refresh and try again.");
      if ("form" in data) a.form = data.form ?? null;
      if ("ezScreen" in data) a.ez_screen = data.ezScreen ?? {};
      if ("projectionsDocumentId" in data) a.projections_document_id = docOk(p, data.projectionsDocumentId, "The projections");
      if ("draftDocumentId" in data) a.draft_document_id = docOk(p, data.draftDocumentId, "The prepared application");
      if ("boardApprovedOn" in data) a.board_approved_on = data.boardApprovedOn ?? null;
      if ("boardApproverPersonId" in data) a.board_approver_person_id = data.boardApproverPersonId ?? null;
      if ("boardEvidenceDocumentId" in data) a.board_evidence_document_id = docOk(p, data.boardEvidenceDocumentId, "The board evidence");
      if ("boardNote" in data) a.board_note = data.boardNote ?? null;
      a.updated_at = nowIso(); ev(a, "details_saved");
      return { ok: true };
    }
    case "advanceExemption": {
      const a = app(data.applicationId); const p = prof(a.foundation_profile_id);
      if (a.stage !== data.expectedStage) throw new Error("Someone else moved this application. Refresh and try again.");
      const input = { ...(data.input ?? {}) };
      if (data.to === "closed") { input.openLetters = letters.filter((l) => l.application_id === a.id && !LETTER_DONE.includes(l.status)).length; if (input.outcome === "approved") docOk(p, input.determinationDocumentId, "The determination letter", "determination_letter"); }
      const problem = advanceProblem(appFacts(a), data.to, { prereqs: facts(p, a), profile: p, people: peopleFor(p), today: t, input });
      if (problem) throw new Error(problem);
      const from = a.stage; a.stage = data.to; a.updated_at = nowIso();
      if (from === "board_review" && data.to === "drafting") Object.assign(a, { board_approved_on: null, board_approver_person_id: null, board_evidence_document_id: null });
      if (data.to === "submitted") { Object.assign(a, { submitted_on: input.submittedOn, submitted_by_person_id: input.submittedByPersonId, confirmation_ref: input.confirmationRef }); if (p.exemption_status !== "determined") p.exemption_status = "pending"; s.tasks.push({ id: `task-${s.seq++}`, title: `Bill the remaining setup fees: Form 1023 submitted for ${entity(p)?.legal_name}`, status: "open", due_date: t, related_entity_id: p.client_entity_id }); }
      if (data.to === "closed") {
        Object.assign(a, { outcome: input.outcome, closed_on: t, closed_note: input.note ?? null, determination_document_id: input.determinationDocumentId ?? null, determination_letter_on: input.determinationLetterOn ?? null, exemption_effective_on: input.exemptionEffectiveOn ?? null });
        if (input.outcome === "approved") Object.assign(p, { exemption_status: "determined", determination_letter_on: input.determinationLetterOn, exemption_effective_on: input.exemptionEffectiveOn });
        else if (p.exemption_status === "pending") p.exemption_status = "not_applied";
      }
      ev(a, data.to === "closed" ? `closed_${input.outcome}` : `moved_to_${data.to}`, { note: input.note ?? null });
      return { stage: data.to };
    }
    case "addIrsLetter": {
      const a = app(data.applicationId); const p = prof(a.foundation_profile_id);
      const problem = newLetterProblem({ kind: data.kind, receivedOn: data.receivedOn, summary: data.summary, responseDueOn: data.responseDueOn ?? null }, a.stage, t);
      if (problem) throw new Error(problem);
      const needs = data.kind === "information_request" || !!data.responseDueOn;
      const l = { id: `irs-${s.seq++}`, application_id: a.id, kind: data.kind, received_on: data.receivedOn, summary: data.summary, letter_document_id: docOk(p, data.letterDocumentId, "The IRS letter"), response_due_on: data.responseDueOn ?? null, status: needs ? "open" : "closed", closed_reason: needs ? null : "Logged for the record; no response needed.", response_document_id: null, approver_person_id: null, approved_on: null, responded_on: null, sent_by_person_id: null, updated_at: nowIso() };
      letters.unshift(l);
      if (needs && data.responseDueOn) s.tasks.push({ id: `task-${s.seq++}`, title: `Draft the IRS response for ${entity(p)?.legal_name} (due ${data.responseDueOn})`, status: "open", due_date: letterTaskDue(data.responseDueOn, t), related_entity_id: p.client_entity_id });
      ev(a, "irs_letter_logged");
      return { id: l.id };
    }
    case "advanceIrsLetter": {
      const l = letters.find((x) => x.id === data.letterId); if (!l) throw new Error("Letter not found.");
      const a = app(l.application_id); const p = prof(a.foundation_profile_id);
      if (l.status !== data.expectedStatus) throw new Error("Someone else updated this letter. Refresh and try again.");
      const i = data.input ?? {};
      if (data.to === "response_drafted") docOk(p, i.responseDocumentId, "The drafted response");
      const problem = letterAdvanceProblem({ status: l.status, kind: l.kind, receivedOn: l.received_on, responseDueOn: l.response_due_on, responseDocumentId: l.response_document_id }, data.to, peopleFor(p), t, i);
      if (problem) throw new Error(problem);
      l.status = data.to; l.updated_at = nowIso();
      if (data.to === "response_drafted") l.response_document_id = i.responseDocumentId;
      if (data.to === "board_approved") Object.assign(l, { approver_person_id: i.approverPersonId, approved_on: i.approvedOn });
      if (data.to === "responded") Object.assign(l, { responded_on: i.respondedOn, sent_by_person_id: i.sentByPersonId });
      if (data.to === "closed") l.closed_reason = i.reason;
      ev(a, `irs_letter_${data.to}`);
      return { status: data.to };
    }
  }
  throw new Error("Not modeled in the sandbox.");
}
