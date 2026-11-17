/**
 * Form 1023 / 1023-EZ exemption application workflow (pure, browser-safe).
 * Harmonious prepares; the foundation's board approves and an authorized officer signs and submits.
 * Nothing here files, pays the IRS user fee or decides anything for the foundation. The database re-checks stage order.
 */
import type { ReleaseDimension, ReleaseEvidenceInput } from "@/lib/foundation-release-model";

export const EXEMPTION_STAGES = {
  eligibility: "Choose the form",
  gathering: "Gather information",
  drafting: "Prepare the application",
  board_review: "Board review",
  ready_to_submit: "Ready for the officer to submit",
  submitted: "Submitted, waiting on the IRS",
  closed: "Closed",
} as const;
export type ExemptionStage = keyof typeof EXEMPTION_STAGES;
export const STAGE_ORDER = Object.keys(EXEMPTION_STAGES) as ExemptionStage[];

export const EXEMPTION_FORMS = { "1023": "Form 1023", "1023_ez": "Form 1023-EZ" } as const;
export type ExemptionForm = keyof typeof EXEMPTION_FORMS;

export const EXEMPTION_OUTCOMES = { approved: "Exemption recognized", denied: "Exemption denied", withdrawn: "Withdrawn" } as const;
export type ExemptionOutcome = keyof typeof EXEMPTION_OUTCOMES;

/** 1023-EZ screen. Any "yes" means the foundation files the full Form 1023. */
export const EZ_SCREEN = {
  projectedReceiptsOver50k: "Will annual gross receipts be more than $50,000 in any of the next 3 years?",
  pastReceiptsOver50k: "Were annual gross receipts more than $50,000 in any of the past 3 years?",
  assetsOver250k: "Are total assets worth more than $250,000?",
  foreignOrganized: "Was it formed outside the United States, or is its mailing address outside the United States?",
  ineligibleType: "Is it a church, school, hospital, supporting organization, private operating foundation, LLC, or the successor to a for-profit business?",
} as const;
export type EzKey = keyof typeof EZ_SCREEN;
export const EZ_KEYS = Object.keys(EZ_SCREEN) as EzKey[];
export type EzScreen = { [K in EzKey]?: boolean | undefined };

export type ProfileFacts = { legal_structure?: string | null; classification?: string | null; mission?: string | null };

export function ezScreenResult(screen: EzScreen, profile: ProfileFacts): { complete: boolean; eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (profile.legal_structure === "llc") reasons.push("The foundation is an LLC.");
  if (profile.classification === "private_operating_foundation") reasons.push("It is a private operating foundation.");
  if (profile.classification === "supporting_organization_509a3") reasons.push("It is a supporting organization.");
  for (const k of EZ_KEYS) if (screen[k] === true) reasons.push(EZ_SCREEN[k]);
  const complete = EZ_KEYS.every((k) => typeof screen[k] === "boolean");
  return { complete, eligible: complete && reasons.length === 0, reasons };
}

export function formChoiceProblem(form: string | null | undefined, screen: EzScreen, profile: ProfileFacts): string | null {
  if (form !== "1023" && form !== "1023_ez") return "Choose Form 1023 or Form 1023-EZ.";
  if (form === "1023_ez") {
    const r = ezScreenResult(screen, profile);
    if (!r.complete) return "Answer every 1023-EZ question first.";
    if (!r.eligible) return `This foundation files the full Form 1023: ${r.reasons[0]}`;
  }
  return null;
}

export type PrereqFacts = {
  form: string | null; einOnFile: boolean; governingDocumentOnFile: boolean; boardCount: number; signerCount: number;
  missionRecorded: boolean; projectionsDocumentId: string | null;
};
export type Prereq = { key: string; label: string; done: boolean };

export function prerequisites(f: PrereqFacts): Prereq[] {
  const list: Prereq[] = [
    { key: "ein", label: "EIN on file", done: f.einOnFile },
    { key: "governing", label: "Articles and bylaws on file (Documents, accepted if the client uploaded them)", done: f.governingDocumentOnFile },
    { key: "board", label: "At least one active director, trustee or officer under People and authority", done: f.boardCount > 0 },
    { key: "signer", label: "An officer or director with authority to sign, backed by evidence", done: f.signerCount > 0 },
    { key: "mission", label: "Mission and planned activities recorded on the Overview", done: f.missionRecorded },
  ];
  if (f.form !== "1023_ez") list.push({ key: "projections", label: "Financial projections attached (Form 1023 asks for 3 to 4 years)", done: !!f.projectionsDocumentId });
  return list;
}
export const prerequisitesMet = (f: PrereqFacts) => prerequisites(f).every((p) => p.done);

/** Filing within 27 months of formation generally makes exemption retroactive to formation. Reference only. */
export function filingWindow(formationDate: string | null | undefined, today: string): { deadline: string; daysLeft: number; passed: boolean } | null {
  if (!formationDate || !/^\d{4}-\d{2}-\d{2}$/.test(formationDate)) return null;
  const [y, m, d] = formationDate.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + 27, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  const deadline = target.toISOString().slice(0, 10);
  const daysLeft = Math.round((Date.parse(deadline) - Date.parse(today)) / 86400000);
  return { deadline, daysLeft, passed: daysLeft < 0 };
}

export type AppFacts = {
  stage: ExemptionStage; form: string | null; ezScreen: EzScreen; draftDocumentId: string | null; projectionsDocumentId: string | null;
  boardApprovedOn: string | null; boardApproverPersonId: string | null; boardEvidenceDocumentId: string | null; boardNote: string | null;
};
export type People = { board: readonly string[]; signers: readonly string[] };
export type AdvanceInput = {
  submittedOn?: string | null | undefined; submittedByPersonId?: string | null | undefined; confirmationRef?: string | null | undefined;
  outcome?: ExemptionOutcome | null | undefined; determinationDocumentId?: string | null | undefined; determinationLetterOn?: string | null | undefined;
  exemptionEffectiveOn?: string | null | undefined; note?: string | null | undefined; openLetters?: number | undefined;
};

/** Next stage for the one-step forward move. */
export function nextStage(stage: ExemptionStage): ExemptionStage | null {
  const i = STAGE_ORDER.indexOf(stage);
  return i >= 0 && i < STAGE_ORDER.length - 1 ? STAGE_ORDER[i + 1]! : null;
}

/** Why the application can't move to `to`, or null. Same order the database enforces. */
export function advanceProblem(app: AppFacts, to: ExemptionStage, ctx: { prereqs: PrereqFacts; profile: ProfileFacts; people: People; today: string; input?: AdvanceInput }): string | null {
  const i = ctx.input ?? {};
  const note = (i.note ?? "").trim();
  if (app.stage === "closed") return "This application is closed.";
  if (to === "closed" && i.outcome === "withdrawn") return note.length >= 10 ? null : "Say why the application is withdrawn (at least 10 characters).";
  if (app.stage === "board_review" && to === "drafting") return note.length >= 10 ? null : "Say what the board asked to change (at least 10 characters).";
  if (nextStage(app.stage) !== to) return "That step isn't allowed from here.";
  switch (to) {
    case "gathering": return formChoiceProblem(app.form, app.ezScreen, ctx.profile);
    case "drafting": {
      const missing = prerequisites(ctx.prereqs).filter((p) => !p.done);
      return missing.length ? `Still needed: ${missing.map((p) => p.label).join("; ")}.` : null;
    }
    case "board_review": return app.draftDocumentId ? null : "Attach the prepared application from Documents first.";
    case "ready_to_submit":
      if (!app.boardApprovedOn) return "Enter the date the board approved the application.";
      if (app.boardApprovedOn > ctx.today) return "The board approval date can't be in the future.";
      if (!app.boardApproverPersonId || !ctx.people.board.includes(app.boardApproverPersonId)) return "Choose the director, trustee or officer who confirmed the board's approval.";
      if (!app.boardEvidenceDocumentId && (app.boardNote ?? "").trim().length < 10) return "Attach the board consent or minutes, or describe how the board approved it.";
      return null;
    case "submitted":
      if (!i.submittedOn) return "Enter the date the officer submitted the application.";
      if (i.submittedOn > ctx.today) return "The submission date can't be in the future.";
      if (app.boardApprovedOn && i.submittedOn < app.boardApprovedOn) return "The submission date can't be before the board approved it.";
      if (!i.submittedByPersonId || !ctx.people.signers.includes(i.submittedByPersonId)) return "Choose the officer or director with signing authority who submitted it.";
      if ((i.confirmationRef ?? "").trim().length < 3) return "Enter the IRS submission confirmation number.";
      return null;
    case "closed":
      if (i.openLetters && i.openLetters > 0) return "Finish or close every open IRS letter first.";
      if (i.outcome === "approved") {
        if (!i.determinationDocumentId) return "Attach the determination letter from Documents.";
        if (!i.determinationLetterOn) return "Enter the date on the determination letter.";
        if (i.determinationLetterOn > ctx.today) return "The letter date can't be in the future.";
        if (!i.exemptionEffectiveOn) return "Enter the exemption effective date from the letter.";
        return null;
      }
      if (i.outcome === "denied") return note.length >= 10 ? null : "Summarize the IRS decision (at least 10 characters).";
      return "Choose the IRS outcome.";
    default: return null;
  }
}

// ------------------------------------------------------------ IRS correspondence

export const IRS_LETTER_KINDS = { information_request: "Request for more information", acknowledgment: "Acknowledgment of receipt", notice: "Other IRS notice" } as const;
export type IrsLetterKind = keyof typeof IRS_LETTER_KINDS;
export const LETTER_STATUSES = { open: "Response needed", response_drafted: "Response drafted", board_approved: "Approved by the board", responded: "Response sent", closed: "Closed" } as const;
export type LetterStatus = keyof typeof LETTER_STATUSES;
export const LETTER_DONE: readonly LetterStatus[] = ["responded", "closed"];

export type LetterFacts = { status: LetterStatus; kind: IrsLetterKind; receivedOn: string; responseDueOn: string | null; responseDocumentId: string | null };
export type LetterInput = { responseDocumentId?: string | null | undefined; approverPersonId?: string | null | undefined; approvedOn?: string | null | undefined; respondedOn?: string | null | undefined; sentByPersonId?: string | null | undefined; reason?: string | null | undefined };

export function newLetterProblem(d: { kind: string; receivedOn: string; summary: string; responseDueOn: string | null }, appStage: ExemptionStage, today: string): string | null {
  if (appStage !== "submitted") return "IRS letters are logged after the application is submitted.";
  if (!(d.kind in IRS_LETTER_KINDS)) return "Choose the kind of letter.";
  if (d.receivedOn > today) return "The received date can't be in the future.";
  if (d.summary.trim().length < 3) return "Summarize what the IRS asked.";
  if (d.kind === "information_request" && !d.responseDueOn) return "Enter the response due date from the letter.";
  if (d.responseDueOn && d.responseDueOn < d.receivedOn) return "The due date can't be before the letter was received.";
  return null;
}

export function letterAdvanceProblem(l: LetterFacts, to: LetterStatus, people: People, today: string, i: LetterInput = {}): string | null {
  if (LETTER_DONE.includes(l.status)) return "This letter is finished.";
  if (to === "closed") return (i.reason ?? "").trim().length >= 10 ? null : "Say why no response is needed (at least 10 characters).";
  if (l.status === "response_drafted" && to === "open") return (i.reason ?? "").trim().length >= 10 ? null : "Say what needs to change (at least 10 characters).";
  const allowed: Partial<Record<LetterStatus, LetterStatus>> = { open: "response_drafted", response_drafted: "board_approved", board_approved: "responded" };
  if (allowed[l.status] !== to) return "That step isn't allowed from here.";
  if (to === "response_drafted") return i.responseDocumentId ? null : "Attach the drafted response from Documents.";
  if (to === "board_approved") {
    if (!i.approverPersonId || !people.board.includes(i.approverPersonId)) return "Choose the director, trustee or officer who approved the response.";
    if (!i.approvedOn || i.approvedOn > today) return "Enter the approval date (not in the future).";
    return null;
  }
  if (to === "responded") {
    if (!i.respondedOn || i.respondedOn > today) return "Enter the date the response was sent (not in the future).";
    if (!i.sentByPersonId || !people.signers.includes(i.sentByPersonId)) return "Choose the officer or director with signing authority who sent it.";
    return null;
  }
  return null;
}

export function letterDue(l: { status: LetterStatus; responseDueOn: string | null }, today: string): { daysLeft: number; overdue: boolean } | null {
  if (!l.responseDueOn || LETTER_DONE.includes(l.status)) return null;
  const daysLeft = Math.round((Date.parse(l.responseDueOn) - Date.parse(today)) / 86400000);
  return { daysLeft, overdue: daysLeft < 0 };
}

/** Operations task date: five days before the IRS deadline, never before today. */
export function letterTaskDue(responseDueOn: string, today: string): string {
  const d = new Date(Date.parse(responseDueOn) - 5 * 86400000).toISOString().slice(0, 10);
  return d < today ? today : d;
}

// ------------------------------------------------------------ Release evidence (a starting point the requester must check)

export function exemptionReleaseEvidence(dimension: ReleaseDimension): ReleaseEvidenceInput {
  const delivery = {
    delivery_workflow: "Form 1023 tab on each foundation (Operations > client > Foundation): choose Form 1023 or 1023-EZ with the EZ screen; prerequisite checklist (EIN, governing documents, board, signer, mission, projections); prepared draft attached; board approval recorded with evidence; the officer's own submission recorded with confirmation number; IRS letters logged with due dates, Operations tasks, board-approved responses; determination letter closes it and updates the foundation's exemption status. Harmonious never signs, submits or pays the IRS fee.",
    validation: "Automated tests in src/lib/foundation-exemption-model.test.ts (stage order, EZ eligibility, prerequisites, 27-month window, letter steps) pass; database guards block deletes, out-of-order stages and edits after submission. Reviewer: confirm a walkthrough on a test foundation before approving.",
  };
  if (dimension === "delivery") return delivery;
  return {
    ...delivery,
    terms: "Component wording FOUNDATION_SOW_TERMS and exemption_application scope/included/excluded in foundation-admin-model.ts (preparation only; officer signs and submits; no promise of IRS approval or timing; IRS user fee billed at cost).",
    pricing_policy: "Published rate card line FOUNDATION_ADMIN:exemption_application; any price below the rate card needs CEO or CRO approval through the existing quote approval.",
    verification: "Before submission the workflow requires an active officer or director with signing authority backed by an evidence document under People and authority; existing person KYC/AML and entity review stay unchanged.",
  };
}
