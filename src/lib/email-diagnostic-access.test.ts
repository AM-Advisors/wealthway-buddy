import { describe, expect, it, vi } from "vitest";
import { authorizeEmailDiagnostics } from "./email-diagnostic-access";
function db(roles: string[], error: unknown = null) {
  return { from: vi.fn(() => ({ select: () => ({ eq: () => Promise.resolve({ data: roles.map(role => ({ role })), error }) }) })) };
}
describe("privileged recipient diagnostic authorization", () => {
  it("a global fund manager cannot read unrelated recipient history", async () => {
    await expect(authorizeEmailDiagnostics(db(["fund_manager"]), "manager", { recipient: "unrelated@example.test" })).rejects.toThrow("Forbidden");
  });
  it("an application ID cannot broaden a manager's access", async () => {
    await expect(authorizeEmailDiagnostics(db(["fund_manager"]), "manager", { recipient: "investor@example.test", applicationId: "another-fund-application" })).rejects.toThrow("Forbidden");
  });
  it("denies unscoped histories and signed-in nonreviewers", async () => {
    await expect(authorizeEmailDiagnostics(db([]), "investor", {})).rejects.toThrow("Forbidden");
    await expect(authorizeEmailDiagnostics(db(["fund_manager"]), "manager", {})).rejects.toThrow("Forbidden");
  });
  it("a failed role lookup fails closed", async () => {
    await expect(authorizeEmailDiagnostics(db(["admin"], { message: "failed" }), "admin", {})).rejects.toThrow("could not be checked");
  });
  it("keeps existing administrator diagnostic access", async () => {
    await expect(authorizeEmailDiagnostics(db(["admin"]), "admin", { recipient: "investor@example.test" })).resolves.toEqual({ admin: true });
  });
});