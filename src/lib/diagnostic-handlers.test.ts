import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ results: {} as Record<string, { data: unknown[]; error: unknown }>, staff: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => { const chain: any = { middleware: () => chain, inputValidator: () => chain, handler: (fn: unknown) => fn }; return chain; } }));
vi.mock("@/lib/require-auth", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/investor-onboarding.server", () => ({ assertStaff: mocks.staff }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: (table: string) => { const chain: any = { select: () => chain, gte: () => chain, order: () => chain, limit: () => Promise.resolve(mocks.results[table] ?? { data: [], error: null }) }; return chain; } } }));
import { emailHealthFn, webhookLogFn } from "./ops-health.functions";
const run = (fn: unknown) => (fn as (args: unknown) => Promise<any>)({ data: { days: 7 }, context: { userId: "synthetic-staff" } });
describe("existing health handlers with mocked offline sources", () => {
  it("surfaces failed email reads rather than an empty success", async () => {
    mocks.results = { email_delivery_events: { data: [], error: { message: "private diagnostic" } } };
    await expect(run(emailHealthFn)).rejects.toThrow("could not be loaded");
  });
  it("a failed webhook source prevents a misleading partial/empty history", async () => {
    mocks.results = { box_sign_webhook_events: { data: [], error: { message: "unavailable" } } };
    await expect(run(webhookLogFn)).rejects.toThrow("could not be loaded");
  });
  it("distinguishes received, failed and successfully processed records", async () => {
    mocks.results = { didit_webhook_events: { error: null, data: [
      { event_id: "received", received_at: "2026-10-21T12:00:00Z", processed_at: null, status: "Approved", error: null },
      { event_id: "failed", received_at: "2026-10-21T12:00:01Z", processed_at: "2026-10-21T12:00:02Z", error: "secret payload should not appear" },
      { event_id: "processed", received_at: "2026-10-21T12:00:03Z", processed_at: "2026-10-21T12:00:04Z", error: null },
    ] } };
    const output = await run(webhookLogFn);
    expect(output.events.map((e: any) => e.status).sort()).toEqual(["Processing failed", "Received: processing unconfirmed", "Successfully processed"].sort());
    expect(JSON.stringify(output)).not.toContain("secret payload");
  });
});