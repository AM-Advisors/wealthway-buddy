import { describe, expect, it } from "vitest";
import { TEXAS_CAPITAL_RECIPIENTS, approvalBlocker, canUndoApproval, linkExpiry, linkUsable, needsIdentification, requiredDocuments } from "./texas-capital-packet-model";

describe("Texas Capital package rules", () => {
  it("LLC needs operating agreement, formation, filing and EIN documents", () => {
    expect(requiredDocuments("llc", false).map((d) => d.key)).toEqual(["operating_agreement", "certificate_of_formation", "certificate_of_filing", "ein"]);
  });
  it("corporation needs incorporation/filing certificate and executed bylaws", () => {
    expect(requiredDocuments("corporation", false).map((d) => d.key)).toEqual(["incorporation_or_filing", "bylaws", "ein"]);
  });
  it("assumed name certificate only when there is a DBA", () => {
    expect(requiredDocuments("llc", true).some((d) => d.key === "assumed_name")).toBe(true);
  });
  it("ID needed only for people not already on file", () => {
    expect(needsIdentification({ name: "A", roles: ["signer"], onFileWithBank: true })).toBe(false);
    expect(needsIdentification({ name: "B", roles: ["signer"], onFileWithBank: false })).toBe(true);
  });
  it("preparer cannot approve their own package", () => {
    expect(approvalBlocker({ status: "ready", preparedBy: "u1", approverId: "u1", authorized: true })).not.toBeNull();
    expect(approvalBlocker({ status: "ready", preparedBy: "u1", approverId: "u2", authorized: true })).toBeNull();
  });
  it("undo only before sending", () => {
    expect(canUndoApproval("approved")).toBe(true);
    expect(canUndoApproval("sent")).toBe(false);
  });
  it("sends to the four Texas Capital addresses", () => {
    expect(TEXAS_CAPITAL_RECIPIENTS).toHaveLength(4);
    expect(TEXAS_CAPITAL_RECIPIENTS).toContain("MiddleMarketClientService@texascapital.com");
  });
  it("link expires after 14 days or when revoked", () => {
    const sent = new Date("2026-11-16T00:00:00Z");
    const exp = linkExpiry(sent).toISOString();
    expect(linkUsable({ expiresAt: exp, revokedAt: null, status: "sent" }, new Date("2026-11-29T00:00:00Z"))).toBe(true);
    expect(linkUsable({ expiresAt: exp, revokedAt: null, status: "sent" }, new Date("2026-12-01T00:00:00Z"))).toBe(false);
    expect(linkUsable({ expiresAt: exp, revokedAt: "2026-11-17", status: "sent" }, new Date("2026-11-18T00:00:00Z"))).toBe(false);
  });
});
