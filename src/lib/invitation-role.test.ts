import { describe, expect, it } from "vitest";
import {
  INVITABLE_ROLES,
  assertInvitationRole,
  invitationRoleLabel,
  isInvitationRole,
} from "@/lib/invitation-role";
import { assertInvitableRole } from "@/lib/reviewer-authz.server";

describe("invitation role type", () => {
  it("contains only investor and fund manager", () => {
    expect([...INVITABLE_ROLES]).toEqual(["investor", "fund_manager"]);
  });

  it("accepts the two invitation roles", () => {
    expect(assertInvitationRole("investor")).toBe("investor");
    expect(assertInvitationRole("fund_manager")).toBe("fund_manager");
  });

  it("rejects every privileged platform role", () => {
    for (const role of [
      "admin",
      "super_admin",
      "operations",
      "compliance",
      "legal",
      "finance",
      "executive",
      "",
      null,
      undefined,
      123,
    ]) {
      expect(isInvitationRole(role)).toBe(false);
      expect(() => assertInvitationRole(role)).toThrow(/investors and fund managers/i);
    }
  });

  it("is the same guard the reviewer authorization layer uses", () => {
    expect(assertInvitableRole).toBe(assertInvitationRole);
  });

  it("labels roles for display", () => {
    expect(invitationRoleLabel("fund_manager")).toBe("Fund manager");
    expect(invitationRoleLabel("investor")).toBe("Investor");
  });
});
