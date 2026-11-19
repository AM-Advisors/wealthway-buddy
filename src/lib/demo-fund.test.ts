import { describe, expect, it } from "vitest";
import { demoAutoApproves, demoScopeFrom, isDemoItem } from "./demo-fund";

const scope = demoScopeFrom(
  [
    { id: "demo-fund", client_id: "real-client", is_demo: true },
    { id: "test-client-fund", client_id: "test-client", is_demo: false },
    { id: "real-fund", client_id: "real-client", is_demo: false },
  ],
  [
    { id: "real-client", is_test_demo: false },
    { id: "test-client", is_test_demo: true },
  ],
);

describe("demo funds are not Operations tasks", () => {
  it("drops items on a fund marked as a demo", () => {
    expect(isDemoItem({ fundId: "demo-fund" }, scope)).toBe(true);
  });
  it("drops items on any fund of a test/demo client", () => {
    expect(isDemoItem({ fundId: "test-client-fund" }, scope)).toBe(true);
    expect(isDemoItem({ fundId: null, clientId: "test-client" }, scope)).toBe(true);
  });
  it("keeps items on real funds and clients", () => {
    expect(isDemoItem({ fundId: "real-fund", clientId: "real-client" }, scope)).toBe(false);
    expect(isDemoItem({ fundId: null, clientId: null }, scope)).toBe(false);
  });
});

describe("demo auto-approval covers routine reviews only", () => {
  it("approves fees & terms and extra fund questions on demo funds", () => {
    expect(demoAutoApproves("fund_economics", true)).toBe(true);
    expect(demoAutoApproves("fund_questionnaire_section", true)).toBe(true);
  });
  it("never approves anything on a real fund", () => {
    expect(demoAutoApproves("fund_economics", false)).toBe(false);
  });
  it("never approves identity checks or money steps", () => {
    for (const kind of ["kyc", "accreditation", "distribution", "capital_call", "expected_funding", "signature"]) {
      expect(demoAutoApproves(kind, true)).toBe(false);
    }
  });
});
