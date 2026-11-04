import { beforeEach, describe, expect, it, vi } from "vitest";
const send = vi.hoisted(() => vi.fn(async (_template: string, _recipient: string, _options: any) => ({ sent: true })));
vi.mock("./email-templates/send-email", () => ({ sendTemplateEmail: send }));
import { sendFundReview } from "./fund-review-notify.server";
function fixture(kind: string, status: string, assigned?: string, owner?: string, revoked = false, updatedAt?: string) {
  const tables: Record<string, any[]> = { fund_economics_versions: [{ id: "item", setup_id: "setup", status }], fund_questionnaire_sections: [{ id: "item", offering_id: "fund", status }], offering_document_versions: [{ id: "item", offering_id: "fund", approval_status: status }], side_letter_change_requests: [{ id: "item", offering_id: "fund", status }], fund_setups: [{ id: "setup", offering_id: "fund" }], offerings: [{ id: "fund", name: "Fictional fund" }], fund_managers: [{ user_id: "manager", offering_id: "fund" }], fund_team_grants: [], user_roles: [] };
  if (assigned) for (const table of ["fund_economics_versions", "fund_questionnaire_sections", "offering_document_versions", "side_letter_change_requests"]) for (const row of tables[table] ?? []) row.assigned_to = assigned;
  tables["fund_fee_terms"] = [{ id: "item", offering_id: "fund", status, requested_by: "requester" }];
  if (kind === "fee_change") tables["user_roles"] = [{ user_id: "requester", role: "admin" }, { user_id: "approver", role: "operations" }];
  if (updatedAt) for (const row of tables["fund_economics_versions"] ?? []) row.updated_at = updatedAt;
  if (owner) { const fund = tables["offerings"]?.[0]; if (fund) fund.routine_review_user_id = owner; tables["fund_team_grants"] = [{ role: "fund_reviewer", scope: "fund", offering_id: "fund", grantee_user_id: owner, status: revoked ? "revoked" : "active", expires_at: null, granted_by: "manager" }]; }
  return { from(table: string) { let data = tables[table] ?? []; const c: any = { select: () => c, order: () => c, eq: (k: string, v: unknown) => { data = data.filter(r => r[k] === v); return c; }, in: (k: string, values: unknown[]) => { data = data.filter(r => values.includes(r[k])); return c; }, maybeSingle: async () => ({ data: data[0], error: null }), then: (resolve: any) => resolve({ data, error: null }) }; return c; }, auth: { admin: { getUserById: async (id: string) => ({ data: { user: { email: `${id}@example.com`, email_confirmed_at: "2026-01-01" } } }) } } };
}
beforeEach(() => send.mockClear());
describe("event-bound routine reviews", () => {
  it("a new pending draft revision emails once using that save's deduplication key", async () => {
    await sendFundReview(fixture("terms", "draft", undefined, undefined, false, "2026-11-04T19:48:00Z"), "terms", "item");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[2]).toMatchObject({ managed: true, idempotencyKey: "fund-review:terms:item:manager:2026-11-04T19:48:00Z" });
  });
  it("post-signing fee changes email an eligible staff approver, never the requester or manager", async () => {
    await sendFundReview(fixture("fee_change", "pending_approval"), "fee_change", "item");
    expect(send).toHaveBeenCalledExactlyOnceWith("fund-review", "approver@example.com", expect.objectContaining({ managed: true, idempotencyKey: "fund-review:fee_change:item:approver", templateData: { fundName: "Fictional fund", item: "Fee and carry change", portalUrl: "https://ops.harmonious.co/ops/fund/fund?tab=setup" } }));
  });
  it("an active fee change does not request another approval", async () => {
    await sendFundReview(fixture("fee_change", "active"), "fee_change", "item");
    expect(send).not.toHaveBeenCalled();
  });
  it("manager review email opens the fund's Approvals directly", async () => {
    await sendFundReview(fixture("terms", "draft"), "terms", "item");
    expect(send.mock.calls[0]?.[2].templateData.portalUrl).toBe("https://app.harmonious.co/manager/fund/fund?tab=approvals");
  });
  for (const [kind, pending] of [["terms", "draft"], ["questions", "draft"], ["document", "uploaded_review_required"], ["side_letter", "pending"]] as const) {
    it(`${kind} sends only one pending-item notice`, async () => { await sendFundReview(fixture(kind, pending), kind, "item"); expect(send).toHaveBeenCalledTimes(1); expect(send.mock.calls[0]?.[2]).toMatchObject({ idempotencyKey: `fund-review:${kind}:item:manager` }); });
    it(`${kind} ignores resolved work`, async () => { await sendFundReview(fixture(kind, "approved"), kind, "item"); expect(send).not.toHaveBeenCalled(); });
  }
  it("does not leak item payload or notes", async () => { await sendFundReview(fixture("terms", "draft"), "terms", "item"); expect(Object.keys(send.mock.calls[0]?.[2].templateData)).toEqual(["fundName", "item", "portalUrl"]); });
  it("refuses an outside assignment and keeps the manager fallback", async () => { await sendFundReview(fixture("terms", "draft", "outside"), "terms", "item"); expect(send.mock.calls[0]?.[2].idempotencyKey).toBe("fund-review:terms:item:manager"); });
  it("routes to the explicitly designated eligible teammate", async () => { await sendFundReview(fixture("terms", "draft", undefined, "reviewer"), "terms", "item"); expect(send.mock.calls[0]?.[2].idempotencyKey).toBe("fund-review:terms:item:reviewer"); });
  it("returns to the manager after reviewer revocation", async () => { await sendFundReview(fixture("terms", "draft", undefined, "reviewer", true), "terms", "item"); expect(send.mock.calls[0]?.[2].idempotencyKey).toBe("fund-review:terms:item:manager"); });
});