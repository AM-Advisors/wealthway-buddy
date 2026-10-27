import { describe, expect, it, vi } from "vitest";
import { suppressedPromotionalEmails } from "./promotional-email.server";
describe("promotional suppression read", () => {
  it("checks normalized email-wide preferences before any sender", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ email: "person@example.test" }], error: null });
    expect([...(await suppressedPromotionalEmails({ rpc }, [" Person@Example.test "]))]).toEqual(["person@example.test"]);
    expect(rpc).toHaveBeenCalledWith("promotional_suppressed_emails", { _emails: ["person@example.test"] });
  });
  it("blocks sends when preferences cannot be read", async () => {
    await expect(suppressedPromotionalEmails({ rpc: vi.fn().mockResolvedValue({ data: null, error: {} }) }, ["person@example.test"])).rejects.toThrow("Couldn't verify email preferences");
  });
});