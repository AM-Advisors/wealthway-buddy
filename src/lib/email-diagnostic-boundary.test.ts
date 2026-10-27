import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ adminImported: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => { const chain: any = { middleware: () => chain, validator: () => chain, handler: (...fns: unknown[]) => fns[fns.length - 1] }; return chain; } }));
vi.mock("@/lib/require-auth", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => { mocks.adminImported(); throw new Error("Privileged reader must not load for unauthorized users"); });
import { getDeliveryDetails, listDeliveryLog, listEmailClicks } from "./email-delivery.functions";
describe("email server boundaries reject before privileged reads", () => {
  it.each([getDeliveryDetails, listDeliveryLog, listEmailClicks])("blocks manager access before privileged imports or service calls", async (fn) => {
    const db = { from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [{ role: "fund_manager" }], error: null }) }) }) };
    await expect((fn as unknown as (args: unknown) => Promise<unknown>)({ data: { recipient: "unrelated@example.test" }, context: { supabase: db, userId: "synthetic-manager" } })).rejects.toThrow("Forbidden");
    expect(mocks.adminImported).not.toHaveBeenCalled();
  });
});