import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], error: null as null | { code: string } }));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => new Request("https://qa.example.test/", { headers: { "user-agent": "Synthetic browser" } }) }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: () => ({ insert: async (row: Record<string, unknown>) => { if (!state.error) state.rows.push(row); return { error: state.error }; } }) } }));
import { recordSecurityEvent } from "./account-security.server";
describe("durable security evidence", () => {
  beforeEach(() => { state.rows = []; state.error = null; });
  it("writes a session-linked event with redacted invitation path", async () => {
    const result = await recordSecurityEvent({ userId: "synthetic-user", eventType: "sign_in", sessionId: "synthetic-session", eventKey: "synthetic-key", path: "/invite/private-token?secret=private" });
    expect(result.accepted).toBe(true);
    expect(state.rows[0]).toMatchObject({ session_id: "synthetic-session", event_key: "synthetic-key", path: "/invite/:record" });
  });
  it("accepts an already-recorded sign-in without duplicating or alerting", async () => {
    state.error = { code: "23505" };
    const result = await recordSecurityEvent({ userId: "synthetic-user", eventType: "sign_in", eventKey: "synthetic-key" });
    expect(result.accepted).toBe(true);
    expect(result.recorded).toBe(false);
    expect(state.rows).toHaveLength(0);
  });
  it("does not claim evidence saved when the write fails", async () => {
    state.error = { code: "42501" };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await recordSecurityEvent({ userId: "synthetic-user", eventType: "page_view" });
    expect(result.accepted).toBe(false);
    spy.mockRestore();
  });
});