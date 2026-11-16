import { describe, expect, it } from "vitest";
import { fundAccessShouldEnd } from "./fund-access-end";

const none = { otherOnboardings: [], applications: [], signatureCount: 0, holdingCount: 0 };

describe("fundAccessShouldEnd", () => {
  it("ends access when nothing else ties the login to the fund", () => {
    expect(fundAccessShouldEnd(none)).toBe(true);
  });
  it("ends access when the only other records are cancelled or withdrawn", () => {
    expect(fundAccessShouldEnd({ ...none, otherOnboardings: [{ stage: "cancelled", removed_at: "2026-11-01" }], applications: [{ status: "withdrawn" }] })).toBe(true);
  });
  it("keeps access while another live investment exists", () => {
    expect(fundAccessShouldEnd({ ...none, otherOnboardings: [{ stage: "closed", removed_at: null }] })).toBe(false);
  });
  it("keeps access while an application is still in progress", () => {
    expect(fundAccessShouldEnd({ ...none, applications: [{ status: "in_progress" }] })).toBe(false);
  });
  it("keeps access when the investor signed fund documents", () => {
    expect(fundAccessShouldEnd({ ...none, signatureCount: 1 })).toBe(false);
  });
  it("keeps access when the investor holds a position", () => {
    expect(fundAccessShouldEnd({ ...none, holdingCount: 1 })).toBe(false);
  });
});
