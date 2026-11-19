import { describe, expect, it } from "vitest";
import { poaDisplayStatus, poaInputBlocker, poaReviewBlocker } from "./power-of-attorney-model";

describe("power of attorney", () => {
  it("the person who uploaded it cannot accept it", () => {
    expect(poaReviewBlocker({ userId: "a", roles: ["operations"] }, { submitted_by: "a", status: "pending_review" })).toMatch(/other than/);
    expect(poaReviewBlocker({ userId: "b", roles: ["operations"] }, { submitted_by: "a", status: "pending_review" })).toBeNull();
  });
  it("only Harmonious reviewer roles can accept it, never fund managers or clients", () => {
    expect(poaReviewBlocker({ userId: "b", roles: ["fund_manager"] }, { submitted_by: "a", status: "pending_review" })).not.toBeNull();
    expect(poaReviewBlocker({ userId: "b", roles: [] }, { submitted_by: "a", status: "pending_review" })).not.toBeNull();
  });
  it("an already reviewed one cannot be reviewed again", () => {
    expect(poaReviewBlocker({ userId: "b", roles: ["admin"] }, { submitted_by: "a", status: "accepted" })).not.toBeNull();
  });
  it("accepted ones show expired after the end date and not yet effective before the start", () => {
    expect(poaDisplayStatus({ status: "accepted", effective_on: "2026-01-01", expires_on: "2026-06-30" }, "2026-11-19")).toBe("expired");
    expect(poaDisplayStatus({ status: "accepted", effective_on: "2026-12-01", expires_on: null }, "2026-11-19")).toBe("not_yet_effective");
    expect(poaDisplayStatus({ status: "accepted", effective_on: "2026-01-01", expires_on: null }, "2026-11-19")).toBe("accepted");
    expect(poaDisplayStatus({ status: "pending_review", effective_on: "2026-01-01", expires_on: "2026-02-01" }, "2026-11-19")).toBe("pending_review");
  });
  it("requires a named person, a start date, an end date after the start, and limits for a limited one", () => {
    const ok = { agentName: "Jane Doe", poaKind: "general" as const, coveredPowers: ["sign_documents"], effectiveOn: "2026-11-01" };
    expect(poaInputBlocker(ok)).toBeNull();
    expect(poaInputBlocker({ ...ok, agentName: " " })).not.toBeNull();
    expect(poaInputBlocker({ ...ok, expiresOn: "2026-10-01" })).not.toBeNull();
    expect(poaInputBlocker({ ...ok, poaKind: "limited" })).not.toBeNull();
    expect(poaInputBlocker({ ...ok, poaKind: "limited", limitsNote: "Only Erebor subscription" })).toBeNull();
    expect(poaInputBlocker({ ...ok, coveredPowers: [] })).not.toBeNull();
  });
});
