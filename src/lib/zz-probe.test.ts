import { it, vi } from "vitest";
vi.mock("@/lib/require-auth", async () => { const { createMiddleware } = await import("@tanstack/react-start"); return { requireSupabaseAuth: createMiddleware({ type: "function" }).server(({ next }) => next({ context: { userId: "synthetic-staff" } })) }; });
vi.mock("@/lib/investor-onboarding.server", () => ({ assertStaff: async () => {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: () => { const c: any = { select: () => c, gte: () => c, order: () => c, limit: () => Promise.resolve({ data: [], error: { message: "x" } }) }; return c; } } }));
import { emailHealthFn } from "./ops-health.functions";
it("p", async () => { const f: any = emailHealthFn; try { const s: any = (globalThis as any)[Symbol.for("tanstack-start:start-storage-context")]; console.log("RES", await s.run({ contextAfterGlobalMiddlewares: {} }, () => f.__executeServer({ data: { days: 7 } }))); } catch (e: any) { console.log("ERR", e.message, e.stack?.slice(0,400)); } });
