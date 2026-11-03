import { describe, expect, it } from "vitest";
import { assertRoutineFields, routineReviewer } from "./fund-routine-access.server";

function fixture(over: Record<string, unknown> = {}, granter = true) {
  const tables: Record<string, any[]> = { fund_team_grants: [{ offering_id: "fund", grantee_user_id: "reviewer", role: "fund_reviewer", scope: "fund", status: "active", expires_at: null, granted_by: "manager", ...over }], fund_managers: granter ? [{ id: "m", user_id: "manager", offering_id: "fund" }] : [], user_roles: [] };
  return { from(table: string) { let data = tables[table] ?? []; const c: any = { select: () => c, eq: (k: string, v: unknown) => { data = data.filter(r => r[k] === v); return c; }, in: () => c, maybeSingle: async () => ({ data: data[0], error: null }), then: (resolve: any) => resolve({ data, error: null }) }; return c; } };
}
describe("exact-fund routine reviewer", () => {
  it("uses an explicit live grant", async () => { expect(await routineReviewer(fixture(), "reviewer", "fund")).toBe(true); });
  it("denies another fund", async () => { expect(await routineReviewer(fixture(), "reviewer", "other")).toBe(false); });
  it("denies revoked access", async () => { expect(await routineReviewer(fixture({ status: "revoked" }), "reviewer", "fund")).toBe(false); });
  it("denies expired access", async () => { expect(await routineReviewer(fixture({ expires_at: "2000-01-01" }), "reviewer", "fund")).toBe(false); });
  it("denies a departed granting manager", async () => { expect(await routineReviewer(fixture({}, false), "reviewer", "fund")).toBe(false); });
  it("does not upgrade assistants", async () => { expect(await routineReviewer(fixture({ role: "fund_assistant" }), "reviewer", "fund")).toBe(false); });
  it("permits routine minimum details", () => { expect(() => assertRoutineFields({ minInvestmentCents: 10_000_000 })).not.toThrow(); });
  for (const field of ["signatoryPersonId", "taxClassification", "driveLinks", "regType", "entityType"]) it(`protects ${field}`, () => { expect(() => assertRoutineFields({ [field]: "changed" })).toThrow(); });
});