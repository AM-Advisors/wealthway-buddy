import { describe, expect, it } from "vitest";
import { gateOpen, resolveGate } from "./account-kyc-model";

describe("account identity gate", () => {
  it("exempts staff", () => expect(resolveGate({ roles: ["compliance"], grandfathered: false, latest: null })).toBe("exempt"));
  it("counts an approved fund KYC", () => expect(resolveGate({ roles: ["fund_manager"], grandfathered: true, latest: null })).toBe("approved"));
  it("blocks while in review", () => { const s = resolveGate({ roles: ["investor"], grandfathered: false, latest: "review" }); expect(s).toBe("review"); expect(gateOpen(s)).toBe(false); });
  it("lets declined and expired retry", () => { expect(resolveGate({ roles: [], grandfathered: false, latest: "declined" })).toBe("retry"); expect(resolveGate({ roles: [], grandfathered: false, latest: "expired" })).toBe("retry"); });
  it("starts new accounts", () => expect(resolveGate({ roles: ["client_gp"], grandfathered: false, latest: null })).toBe("start"));
});

import { accountStatusFromProvider, isAccountDecisionEvent, isSessionDecisionFor } from "./account-kyc-model";
describe("provider notices never reverse a verification result", () => {
  it("ignores profile 'user.data.updated' notices", () => {
    expect(isAccountDecisionEvent("user.data.updated", null)).toBe(false);
    expect(isAccountDecisionEvent("business.data.updated", null)).toBe(false);
    expect(isAccountDecisionEvent("status.updated", "s-1")).toBe(true);
  });
  it("only accepts a result for the check's own session", () => {
    expect(isSessionDecisionFor({ session_id: "s-1" }, { status: "ACTIVE" })).toBe(false);
    expect(isSessionDecisionFor({ session_id: "s-1" }, { status: "Approved", session_id: "s-2" })).toBe(false);
    expect(isSessionDecisionFor({ session_id: "s-1" }, { status: "Approved", session_id: "s-1" })).toBe(true);
  });
  it("an expired session lets the person start again", () => {
    expect(accountStatusFromProvider("Expired", "review")).toBe("expired");
    expect(accountStatusFromProvider("Approved", "approved")).toBe("approved");
  });
});
