import { describe, expect, it } from "vitest";
import { canApproveMfaReset } from "./mfa-reset-rules";

const req = (o: Partial<{ status: string; target_user_id: string; requested_by: string }> = {}) => ({
  status: "pending", target_user_id: "thomas", requested_by: "alyssa", ...o,
});

describe("canApproveMfaReset", () => {
  it("lets a Super Admin request and approve alone", () => {
    expect(canApproveMfaReset(req(), "alyssa", true)).toBe(true);
  });
  it("makes other administrators get a second person", () => {
    expect(canApproveMfaReset(req({ requested_by: "mckay" }), "mckay", false)).toBe(false);
    expect(canApproveMfaReset(req({ requested_by: "mckay" }), "alyssa", false)).toBe(true);
  });
  it("never lets someone approve a reset of their own account", () => {
    expect(canApproveMfaReset(req({ target_user_id: "alyssa" }), "alyssa", true)).toBe(false);
  });
  it("refuses requests that are no longer pending", () => {
    expect(canApproveMfaReset(req({ status: "approved" }), "alyssa", true)).toBe(false);
  });
});
