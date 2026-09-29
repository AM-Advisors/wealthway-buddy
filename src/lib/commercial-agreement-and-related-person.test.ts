import { describe, expect, it } from "vitest";
import { clientAgreementNotice, commercialAgreementStatus, msaDocStatus, sowDocStatus } from "@/lib/commercial-agreement-model";
import { classifyRelatedMatch, relatedCandidateMatches, resolutionError, RELATED_REVIEW_MESSAGE } from "@/lib/related-person-model";
import { matchesFilter } from "@/lib/ops-funds-model";

describe("commercial agreement status", () => {
  it("combined signed / unsigned", () => {
    expect(commercialAgreementStatus("combined", "not_prepared", "signed").overall).toBe("complete");
    const u = commercialAgreementStatus("combined", "not_prepared", "sent");
    expect(u.overall).toBe("follow_up");
    expect(u.lines).toHaveLength(1);
    expect(u.supporting).toBe("Combined MSA + SOW is not fully executed. Operations may continue.");
    expect(u.followUpItems).toEqual(["Obtain executed agreement"]);
  });
  it("separate combinations", () => {
    expect(commercialAgreementStatus("separate", "signed", "sent").remaining).toBe("SOW unsigned");
    expect(commercialAgreementStatus("separate", "draft", "signed").remaining).toBe("MSA unsigned");
    expect(commercialAgreementStatus("separate", "draft", "draft").remaining).toBe("MSA and SOW unsigned");
    expect(commercialAgreementStatus("separate", "signed", "signed").overall).toBe("complete");
  });
  it("MSA only / SOW only never warn about the other document", () => {
    const m = commercialAgreementStatus("msa_only", "signed", "not_prepared");
    expect(m.overall).toBe("complete");
    const s = commercialAgreementStatus("sow_only", "not_prepared", "signed");
    expect(s.overall).toBe("complete");
    expect(s.followUpItems).toEqual([]);
  });
  it("not determined is an internal setup review, hidden from clients", () => {
    const n = commercialAgreementStatus("not_determined", "signed", "signed");
    expect(n.headline).toBe("Agreement setup needs review");
    expect(clientAgreementNotice(n)).toBeNull();
    expect(clientAgreementNotice(commercialAgreementStatus("combined", "draft", "draft"))?.body).toMatch(/may continue/);
  });
  it("only recorded execution counts as signed; operations never mark it signed", () => {
    expect(sowDocStatus({ status: "active", client_status: "sent" })).toBe("sent");
    expect(sowDocStatus({ status: "active", signed_on: "2026-01-01", signed_by: "X" })).toBe("signed");
    expect(sowDocStatus({ status: "draft", client_signed_at: "2026-01-01" })).toBe("partially_signed");
    expect(msaDocStatus(null)).toBe("not_prepared");
    expect(msaDocStatus({ status: "in_review", client_approved_at: "x" })).toBe("partially_signed");
  });
  it("agreement follow-up filter is independent of readiness metrics", () => {
    const metrics = { investors: 0, onboarding: 0, ready: 0, needsHarmonious: 0, blocked: 0, funded: 0, needsAttention: 0, waitingInvestor: 0, waitingManager: 0 };
    const r = { isOpen: true, targetClose: null, metrics, agreement: "follow_up" };
    expect(matchesFilter(r, "agreement_follow_up")).toBe(true);
    expect(matchesFilter(r, "blocked")).toBe(false);
    expect(matchesFilter({ ...r, agreement: "complete" }, "agreement_follow_up")).toBe(false);
  });
});

describe("related-person matching", () => {
  it("classifies none / possible / ambiguous", () => {
    expect(classifyRelatedMatch([])).toBe("none");
    expect(classifyRelatedMatch(["a", "a"])).toBe("possible");
    expect(classifyRelatedMatch(["a", "b"])).toBe("ambiguous");
  });
  it("matches on normalized email or exact full name", () => {
    const c = { id: "1", email: "Jo@X.com ", firstName: "Jo", lastName: "Doe" };
    expect(relatedCandidateMatches({ email: "jo@x.com", firstName: "Z", lastName: "Z" }, c)).toBe(true);
    expect(relatedCandidateMatches({ firstName: "jo", lastName: "DOE" }, c)).toBe(true);
    expect(relatedCandidateMatches({ firstName: "Jo", lastName: "Smith" }, c)).toBe(false);
  });
  it("use existing only picks a server-found candidate; keep new / later need none", () => {
    expect(resolutionError("use_existing", "x", ["a"])).toMatch(/not one of/);
    expect(resolutionError("use_existing", null, ["a"])).toMatch(/Choose/);
    expect(resolutionError("use_existing", "a", ["a"])).toBeNull();
    expect(resolutionError("keep_new", null, ["a"])).toBeNull();
    expect(resolutionError("review_later", null, [])).toBeNull();
  });
  it("neutral message reveals no matching details", () => {
    expect(RELATED_REVIEW_MESSAGE).not.toMatch(/duplicate|match|person record/i);
  });
});
