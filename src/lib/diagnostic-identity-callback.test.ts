import { describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (options: unknown) => ({ options }) }));
vi.mock("@/lib/didit.server", () => ({ collectEmails: vi.fn(), fetchDiditSessionDecision: vi.fn(), verifyDiditWebhook: () => ({ ok: false, reason: "bad_signature", debug: { got: "private-signature", want: "private-hmac" } }) }));
import { Route } from "@/routes/api/public/webhooks/didit";
describe("identity callback rejection", () => {
  it("does not log raw identity body or signature debug material", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = (Route as any).options.server.handlers.POST;
    const response = await handler({ request: new Request("https://synthetic.example.test/callback", { method: "POST", body: JSON.stringify({ ssn: "123-45-6789", name: "Private Person" }) }) });
    expect(response.status).toBe(401);
    expect(log).toHaveBeenCalledWith("[identity-callback] rejected", "bad_signature");
    expect(JSON.stringify(log.mock.calls)).not.toContain("123-45-6789");
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-signature");
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-hmac");
    log.mockRestore();
  });
});