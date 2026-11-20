import { describe, expect, it, vi } from "vitest";

const updateUserById = vi.fn();
const from = vi.fn();
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { auth: { admin: { updateUserById } }, from },
}));
vi.mock("@/lib/account-security.server", () => ({
  sha256: async () => "h",
  randomToken: () => "r",
  recordSecurityEvent: async () => undefined,
}));

const { showRevokeConfirmation } = await import("@/routes/api/public/security/revoke");

describe("This wasn't me link", () => {
  it("opening the link never clears the password or touches the account", async () => {
    const token = "a".repeat(64);
    const res = await showRevokeConfirmation(new Request(`https://app.harmonious.co/api/public/security/revoke?token=${token}`));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('method="post"');
    expect(updateUserById).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
});
