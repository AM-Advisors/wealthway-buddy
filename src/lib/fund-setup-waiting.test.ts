import { describe, expect, it } from "vitest";
import { bankSetupStatus, isSetupFile, redactSensitive, setupDefaults, stepStatus, waitingOnViewer } from "@/lib/fund-setup-waiting";

describe("guided setup", () => {
  it("completes banking from the fund record without a manager submission", () => {
    expect(bankSetupStatus(true, null)).toBe("done");
    expect(bankSetupStatus(false, null)).toBe("waiting_manager");
  });
  it("keeps replacement bank submissions waiting for review", () => {
    expect(bankSetupStatus(true, "submitted")).toBe("waiting_harmonious");
  });
  it("keeps returned bank submissions needing changes", () => {
    expect(bankSetupStatus(true, "returned")).toBe("needs_changes");
  });
  it("recognizes an approved bank submission", () => {
    expect(bankSetupStatus(false, "approved")).toBe("done");
  });
  it("projects step owner", () => {
    expect(stepStatus({ submission: "submitted", complete: false })).toBe("waiting_harmonious");
    expect(stepStatus({ submission: "returned", complete: true })).toBe("needs_changes");
    expect(stepStatus({ complete: true })).toBe("done");
    expect(stepStatus({ complete: true, pendingProposals: true })).toBe("waiting_harmonious");
    expect(stepStatus({ complete: false })).toBe("waiting_manager");
    expect(stepStatus({ complete: false, harmoniousOwned: true })).toBe("waiting_harmonious");
  });
  it("counts what waits on the viewer", () => {
    const s = ["done", "waiting_manager", "needs_changes", "waiting_harmonious"] as const;
    expect(waitingOnViewer(s, false)).toBe(2);
    expect(waitingOnViewer(s, true)).toBe(1);
  });
  it("defaults only fill blanks and never fees", () => {
    const d = setupDefaults({ jurisdiction: "Texas" }, { saasOnly: false });
    expect(d["jurisdiction"]).toBeUndefined();
    expect(d["administrator"]).toBe("Harmonious");
    expect(Object.keys(d).some((k) => /fee|carry/i.test(k))).toBe(false);
    expect(setupDefaults({}, { saasOnly: true })["administrator"]).toMatch(/SaaS/);
  });
  it("redacts identifiers", () => {
    expect(redactSensitive("EIN 12-3456789 SSN 123-45-6789 acct 000123456789")).not.toMatch(/\d{4}/);
  });
  it("picks setup files", () => {
    expect(isSetupFile("Long Live Monarch LLC Form D.pdf")).toBe(true);
    expect(isSetupFile("PPM Template (Redline).docx")).toBe(false);
  });
});
