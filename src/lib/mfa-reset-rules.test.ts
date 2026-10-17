import { describe, expect, it } from "vitest";
import { canApproveMfaReset } from "./mfa-reset-rules";

describe("canApproveMfaReset", () => {
  it("lets the requesting administrator approve alone", () => {
    expect(canApproveMfaReset({ status: "pending", target_user_id: "thomas" }, "alyssa")).toBe(true);
  });
  it("never lets someone approve a reset of their own account", () => {
    expect(canApproveMfaReset({ status: "pending", target_user_id: "alyssa" }, "alyssa")).toBe(false);
  });
  it("refuses requests that are no longer pending", () => {
    expect(canApproveMfaReset({ status: "approved", target_user_id: "thomas" }, "alyssa")).toBe(false);
  });
});
