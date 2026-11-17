import { describe, expect, it } from "vitest";
import {
  advanceProblem, exemptionReleaseEvidence, ezScreenResult, filingWindow, formChoiceProblem, letterAdvanceProblem, letterDue, letterTaskDue,
  newLetterProblem, nextStage, prerequisites, prerequisitesMet, type AppFacts, type PrereqFacts,
} from "@/lib/foundation-exemption-model";
import { missingEvidence } from "@/lib/foundation-release-model";
import { componentByKey } from "@/lib/foundation-admin-model";

const T = "2026-11-17";
const noEz = { projectedReceiptsOver50k: false, pastReceiptsOver50k: false, assetsOver250k: false, foreignOrganized: false, ineligibleType: false };
const profile = { legal_structure: "nonprofit_corporation", classification: "public_charity_509a1", mission: "Fund literacy programs in Illinois" };
const prereqs: PrereqFacts = { form: "1023", einOnFile: true, governingDocumentOnFile: true, boardCount: 3, signerCount: 1, missionRecorded: true, projectionsDocumentId: "doc-p" };
const people = { board: ["dir-1", "off-1"], signers: ["off-1"] };
const app = (o: Partial<AppFacts> = {}): AppFacts => ({ stage: "eligibility", form: "1023", ezScreen: {}, draftDocumentId: null, projectionsDocumentId: "doc-p", boardApprovedOn: null, boardApproverPersonId: null, boardEvidenceDocumentId: null, boardNote: null, ...o });
const ctx = (input = {}) => ({ prereqs, profile, people, today: T, input });

describe("1023-EZ screen", () => {
  it("is eligible only when every answer is no", () => {
    expect(ezScreenResult(noEz, profile)).toEqual({ complete: true, eligible: true, reasons: [] });
    expect(ezScreenResult({ ...noEz, projectedReceiptsOver50k: true }, profile).eligible).toBe(false);
  });
  it("an LLC or private operating foundation always files the full Form 1023", () => {
    expect(ezScreenResult(noEz, { ...profile, legal_structure: "llc" }).eligible).toBe(false);
    expect(ezScreenResult(noEz, { ...profile, classification: "private_operating_foundation" }).eligible).toBe(false);
  });
  it("1023-EZ can't be chosen until the screen is answered and passes", () => {
    expect(formChoiceProblem("1023_ez", {}, profile)).toMatch(/Answer every/);
    expect(formChoiceProblem("1023_ez", { ...noEz, assetsOver250k: true }, profile)).toMatch(/full Form 1023/);
    expect(formChoiceProblem("1023_ez", noEz, profile)).toBeNull();
    expect(formChoiceProblem("1023", {}, profile)).toBeNull();
    expect(formChoiceProblem(null, {}, profile)).toMatch(/Choose/);
  });
});

describe("prerequisites", () => {
  it("full Form 1023 needs projections; 1023-EZ doesn't", () => {
    expect(prerequisitesMet({ ...prereqs, projectionsDocumentId: null })).toBe(false);
    expect(prerequisitesMet({ ...prereqs, form: "1023_ez", projectionsDocumentId: null })).toBe(true);
  });
  it("needs an EIN, governing documents, a board member and a signer", () => {
    for (const k of ["einOnFile", "governingDocumentOnFile"] as const) expect(prerequisitesMet({ ...prereqs, [k]: false })).toBe(false);
    expect(prerequisitesMet({ ...prereqs, boardCount: 0 })).toBe(false);
    expect(prerequisitesMet({ ...prereqs, signerCount: 0 })).toBe(false);
    expect(prerequisites(prereqs).every((p) => p.done)).toBe(true);
  });
});

describe("27-month filing window", () => {
  it("is 27 months after formation", () => expect(filingWindow("2025-03-15", T)?.deadline).toBe("2027-06-15"));
  it("clamps to the end of a shorter month", () => expect(filingWindow("2024-11-30", T)?.deadline).toBe("2027-02-28"));
  it("flags a passed window", () => expect(filingWindow("2023-01-10", T)?.passed).toBe(true));
  it("no formation date, no window", () => expect(filingWindow(null, T)).toBeNull());
});

describe("stage order", () => {
  it("moves one step at a time", () => {
    expect(nextStage("eligibility")).toBe("gathering");
    expect(advanceProblem(app(), "drafting", ctx())).toMatch(/isn't allowed/);
    expect(advanceProblem(app(), "gathering", ctx())).toBeNull();
  });
  it("can't start drafting until prerequisites are met", () => {
    expect(advanceProblem(app({ stage: "gathering" }), "drafting", { ...ctx(), prereqs: { ...prereqs, einOnFile: false } })).toMatch(/EIN/);
    expect(advanceProblem(app({ stage: "gathering" }), "drafting", ctx())).toBeNull();
  });
  it("board review needs the prepared application", () => {
    expect(advanceProblem(app({ stage: "drafting" }), "board_review", ctx())).toMatch(/prepared application/);
    expect(advanceProblem(app({ stage: "drafting", draftDocumentId: "d" }), "board_review", ctx())).toBeNull();
  });
  it("board approval needs a date, a board member and evidence or a note", () => {
    const b = app({ stage: "board_review", draftDocumentId: "d", boardApprovedOn: "2026-11-10", boardApproverPersonId: "dir-1" });
    expect(advanceProblem(b, "ready_to_submit", ctx())).toMatch(/consent or minutes/);
    expect(advanceProblem({ ...b, boardEvidenceDocumentId: "m" }, "ready_to_submit", ctx())).toBeNull();
    expect(advanceProblem({ ...b, boardEvidenceDocumentId: "m", boardApproverPersonId: "stranger" }, "ready_to_submit", ctx())).toMatch(/director, trustee or officer/);
    expect(advanceProblem({ ...b, boardEvidenceDocumentId: "m", boardApprovedOn: "2026-12-01" }, "ready_to_submit", ctx())).toMatch(/future/);
  });
  it("the board can send it back with a reason", () => {
    const b = app({ stage: "board_review" });
    expect(advanceProblem(b, "drafting", ctx({ note: "short" }))).toMatch(/at least 10/);
    expect(advanceProblem(b, "drafting", ctx({ note: "Change the program narrative" }))).toBeNull();
  });
  it("submission is recorded for a signing officer, with a confirmation number, not before board approval", () => {
    const r = app({ stage: "ready_to_submit", boardApprovedOn: "2026-11-10" });
    const ok = { submittedOn: "2026-11-12", submittedByPersonId: "off-1", confirmationRef: "IRS-12345" };
    expect(advanceProblem(r, "submitted", ctx(ok))).toBeNull();
    expect(advanceProblem(r, "submitted", ctx({ ...ok, submittedByPersonId: "dir-1" }))).toMatch(/signing authority/);
    expect(advanceProblem(r, "submitted", ctx({ ...ok, submittedOn: "2026-11-01" }))).toMatch(/before the board/);
    expect(advanceProblem(r, "submitted", ctx({ ...ok, confirmationRef: "" }))).toMatch(/confirmation/);
  });
  it("a determination needs the letter, its date and the effective date, and no open letters", () => {
    const s = app({ stage: "submitted" });
    const ok = { outcome: "approved" as const, determinationDocumentId: "dl", determinationLetterOn: "2026-11-15", exemptionEffectiveOn: "2025-03-15" };
    expect(advanceProblem(s, "closed", ctx(ok))).toBeNull();
    expect(advanceProblem(s, "closed", ctx({ ...ok, determinationDocumentId: null }))).toMatch(/determination letter/);
    expect(advanceProblem(s, "closed", ctx({ ...ok, openLetters: 1 }))).toMatch(/open IRS letter/);
  });
  it("withdrawal works from any open stage with a reason, and closed is final", () => {
    expect(advanceProblem(app({ stage: "gathering" }), "closed", ctx({ outcome: "withdrawn", note: "Board decided to wait a year" }))).toBeNull();
    expect(advanceProblem(app({ stage: "closed" }), "gathering", ctx())).toMatch(/closed/);
  });
});

describe("IRS letters", () => {
  it("are logged only after submission, and information requests need a due date", () => {
    const l = { kind: "information_request", receivedOn: "2026-11-15", summary: "Explain the scholarship program", responseDueOn: null };
    expect(newLetterProblem(l, "ready_to_submit", T)).toMatch(/after the application is submitted/);
    expect(newLetterProblem(l, "submitted", T)).toMatch(/due date/);
    expect(newLetterProblem({ ...l, responseDueOn: "2026-12-15" }, "submitted", T)).toBeNull();
  });
  it("draft, board approval and the officer's reply happen in order", () => {
    const l = { status: "open" as const, kind: "information_request" as const, receivedOn: "2026-11-15", responseDueOn: "2026-12-15", responseDocumentId: null };
    expect(letterAdvanceProblem(l, "board_approved", people, T)).toMatch(/isn't allowed/);
    expect(letterAdvanceProblem(l, "response_drafted", people, T, { responseDocumentId: "r" })).toBeNull();
    expect(letterAdvanceProblem({ ...l, status: "response_drafted" }, "board_approved", people, T, { approverPersonId: "dir-1", approvedOn: T })).toBeNull();
    expect(letterAdvanceProblem({ ...l, status: "board_approved" }, "responded", people, T, { respondedOn: T, sentByPersonId: "dir-1" })).toMatch(/signing authority/);
    expect(letterAdvanceProblem({ ...l, status: "board_approved" }, "responded", people, T, { respondedOn: T, sentByPersonId: "off-1" })).toBeNull();
    expect(letterAdvanceProblem({ ...l, status: "responded" }, "closed", people, T, { reason: "Nothing more needed here" })).toMatch(/finished/);
  });
  it("tracks overdue letters and schedules the task five days early", () => {
    expect(letterDue({ status: "open", responseDueOn: "2026-11-10" }, T)).toEqual({ daysLeft: -7, overdue: true });
    expect(letterDue({ status: "responded", responseDueOn: "2026-11-10" }, T)).toBeNull();
    expect(letterTaskDue("2026-12-15", T)).toBe("2026-12-10");
    expect(letterTaskDue("2026-11-19", T)).toBe(T);
  });
});

describe("release", () => {
  it("Form 1023 is built but still not released", () => {
    const c = componentByKey("exemption_application")!;
    expect(c.readiness.capability).toBe("built");
    expect(c.readiness.released).toBe(false);
  });
  it("the starting draft covers every required evidence item", () => {
    expect(missingEvidence("delivery", exemptionReleaseEvidence("delivery"))).toEqual([]);
    expect(missingEvidence("commercial", exemptionReleaseEvidence("commercial"))).toEqual([]);
  });
});
