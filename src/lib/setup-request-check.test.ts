import { describe, expect, it } from "vitest";
import { checkRequestAgainstSetup, checkSummary, questionsStatus, type SetupSnapshot } from "./setup-request-check";
import { sectionStatuses, type SetupFacts } from "./fund-setup-canonical";
import { requestClassFields } from "./fund-request-model";

const snap = (o: Partial<SetupSnapshot> = {}): SetupSnapshot => ({
  legalName: null, displayName: null, fundType: null, entityType: null, jurisdiction: null, formationDate: null, regType: null,
  targetRaiseCents: null, minInvestmentCents: null, offeringCloseDate: null, gpName: null, signatoryNames: [], signatoryTitles: [], teamNames: [],
  managementFeePct: null, carryPct: null, preferredReturnPct: null, fundTermMonths: null, investmentPeriodMonths: null, classNames: [],
  hasEin: false, bankingStarted: false, documentCount: 0, serviceProviders: {}, investmentStrategy: null, ...o,
});
const request = {
  _kind: "fund_request_v2", fund_name: "Acme I", legal_name: "Acme I LP", kind: "venture_capital", vehicle_structure: "LP",
  jurisdiction: "Delaware", offering_exemption: "506(c)", target_raise: "$10,000,000", minimum_investment: "100000",
  management_fee: "2%", carried_interest: "20%", investor_eligibility: "Accredited only",
  managers: [{ name: "Thomas Morgan", email: "", title: "" }], signatory: { name: "Thomas Morgan", email: "", title: "Managing Partner" },
  classes: [{ name: "Class A", fee: "2%", carry: "20%", hurdle: "", minimum: "" }, { name: "Class B", fee: "0%", carry: "0%", hurdle: "", minimum: "$250,000" }],
};
const state = (rows: ReturnType<typeof checkRequestAgainstSetup>, key: string) => rows.find((r) => r.key === key)?.state;

describe("fund request answers vs Setup", () => {
  it("flags an answer Setup does not have yet", () => {
    const rows = checkRequestAgainstSetup(request, snap());
    expect(state(rows, "minimum")).toBe("missing");
    expect(state(rows, "class_class b")).toBe("missing");
  });
  it("counts a matching value as in Setup, even when formatted differently", () => {
    const rows = checkRequestAgainstSetup(request, snap({ minInvestmentCents: 10_000_000, targetRaiseCents: 1_000_000_000, managementFeePct: 2, regType: "506c" }));
    expect(state(rows, "minimum")).toBe("in_setup");
    expect(state(rows, "target_raise")).toBe("in_setup");
    expect(state(rows, "management_fee")).toBe("in_setup");
    expect(state(rows, "reg_type")).toBe("in_setup");
  });
  it("shows a changed value as a difference, not a missing item", () => {
    const rows = checkRequestAgainstSetup(request, snap({ carryPct: 15 }));
    expect(state(rows, "carry")).toBe("changed");
  });
  it("investor eligibility now has a Setup home (More fund details) and is matched against it", () => {
    expect(state(checkRequestAgainstSetup(request, snap()), "investor_eligibility")).toBe("missing");
    expect(state(checkRequestAgainstSetup(request, snap({ setupDetails: { investor_eligibility: "Accredited only" } })), "investor_eligibility")).toBe("in_setup");
  });
  it("older intake answers with no Setup field stay for a person to check", () => {
    expect(state(checkRequestAgainstSetup({ fund_name: "Old I", expected_investors: "12" }, snap()), "expected_investors")).toBe("reference");
  });
  it("matches the signatory only when that person is a recorded signer", () => {
    expect(state(checkRequestAgainstSetup(request, snap({ teamNames: ["Thomas Morgan"] })), "signatory")).toBe("missing");
    expect(state(checkRequestAgainstSetup(request, snap({ signatoryNames: ["Thomas Morgan"] })), "signatory")).toBe("in_setup");
  });
  it("reads the older intake form and never shows an EIN number", () => {
    const rows = checkRequestAgainstSetup({ fund_name: "Old Fund", legal_entity_name: "Old Fund LLC", min_investment: "50000", has_ein: true, ein: "12-3456789", reg_type: "506b" }, snap({ hasEin: true }));
    expect(state(rows, "legal_name")).toBe("missing");
    expect(state(rows, "ein")).toBe("in_setup");
    expect(JSON.stringify(rows)).not.toContain("3456789");
  });
});

describe("additional investor questions in Setup", () => {
  it("a waiting draft is a to-do; approved alone is not", () => {
    expect(questionsStatus([{ status: "draft", version: 1, questions: [{}, {}] }]).next).toBe("Approve the additional investor questions");
    expect(questionsStatus([{ status: "approved", version: 2, questions: [{}] }]).next).toBeNull();
    expect(questionsStatus([]).state).toBe("none");
  });
  it("the to-do list names every missing answer and a waiting draft", () => {
    const rows = checkRequestAgainstSetup(request, snap());
    const s = checkSummary(rows, questionsStatus([{ status: "draft", version: 1 }]));
    expect(s.toDo).toContain('Add "Minimum investment" in Fund Details');
    expect(s.toDo).toContain("Approve the additional investor questions");
  });
  it("a waiting questions draft keeps Offering Documents open", () => {
    const facts = { documentsStatus: { status: "complete", next: null }, questionsNext: "Approve the additional investor questions" } as unknown as SetupFacts;
    const base = { fundType: "SPV", hasMultipleClasses: false, classCount: 0, documentCount: 1, bankingState: "none", adminConfigured: false, economicsStatus: "none" };
    expect(sectionStatuses({ ...base, ...facts } as SetupFacts).offering_documents).toEqual({ status: "in_progress", next: "Approve the additional investor questions" });
    expect(sectionStatuses({ ...base, ...facts, questionsNext: null } as SetupFacts).offering_documents.status).toBe("complete");
  });
});

describe("request classes carry into Setup", () => {
  it("two named classes with terms mark the fund as multiple classes", () => {
    expect(requestClassFields({ classes: request.classes })).toEqual({ has_multiple_classes: true, planned_class_count: 2 });
    expect(requestClassFields({ classes: [request.classes[0]!] })).toEqual({});
  });
});
