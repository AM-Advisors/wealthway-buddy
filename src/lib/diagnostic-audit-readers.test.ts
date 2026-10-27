import { describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => { const chain: any = { middleware: () => chain, validator: () => chain, handler: (fn: unknown) => fn }; return chain; } }));
vi.mock("@/lib/require-auth", () => ({ requireSupabaseAuth: {} }));
import { listMoneyAudit, listInvestorCheckAudit } from "./audit-log.functions";
import { getCapAuditHistory } from "./captable-audit.functions";
function db() {
  return { from: (table: string) => {
    const result = table === "user_roles" ? { data: [{ role: "admin" }], error: null } : { data: [], error: { message: "private source failure" } };
    const chain: any = { select: () => chain, eq: () => chain, in: () => chain, order: () => chain, limit: () => chain, maybeSingle: () => chain, then: (resolve: (r: unknown) => void) => Promise.resolve(result).then(resolve) };
    return chain;
  } };
}
describe("existing audit readers with failed offline sources", () => {
  it.each([listMoneyAudit, listInvestorCheckAudit, getCapAuditHistory])("rejects failed reads rather than returning empty audit records", async (fn) => {
    await expect((fn as unknown as (args: unknown) => Promise<unknown>)({ data: { companyId: "synthetic-company", limit: 100 }, context: { userId: "synthetic-admin", supabase: db() } })).rejects.toThrow("could not be loaded");
  });
});