import { describe, expect, it } from "vitest";
import { campaignDecisionProblem, campaignEditProblem, campaignSendProblem, canCreate, canReassign, canSee, mergeUpdates, resolveAudience, unreadCount, type CrmActor } from "@/lib/crm-model";

const base: CrmActor = { userId: "u1", superUser: false, viewAll: false, canAssign: false, canApproveCampaigns: false, harmoniousStaff: false, managedFunds: new Set() };
const sales: CrmActor = { ...base, harmoniousStaff: true };
const manager: CrmActor = { ...base, managedFunds: new Set(["f1"]) };
const superU: CrmActor = { ...base, superUser: true };

describe("visibility", () => {
  it("sales sees only their own Harmonious records", () => {
    expect(canSee(sales, { scope: "harmonious", offering_id: null, owner_user_id: "u1" })).toBe(true);
    expect(canSee(sales, { scope: "harmonious", offering_id: null, owner_user_id: "u2" })).toBe(false);
    expect(canSee(sales, { scope: "fund", offering_id: "f1", owner_user_id: "u1" })).toBe(false);
  });
  it("managers see only their Funds' contacts", () => {
    expect(canSee(manager, { scope: "fund", offering_id: "f1", owner_user_id: "u9" })).toBe(true);
    expect(canSee(manager, { scope: "fund", offering_id: "f2", owner_user_id: "u1" })).toBe(false);
    expect(canSee(manager, { scope: "harmonious", offering_id: null, owner_user_id: "u1" })).toBe(false);
  });
  it("super admin and view-all grant see everything", () => {
    expect(canSee(superU, { scope: "fund", offering_id: "f9", owner_user_id: "x" })).toBe(true);
    expect(canSee({ ...base, viewAll: true }, { scope: "harmonious", offering_id: null, owner_user_id: "x" })).toBe(true);
  });
  it("creation and reassignment", () => {
    expect(canCreate(manager, "fund", "f1")).toBe(true);
    expect(canCreate(manager, "fund", "f2")).toBe(false);
    expect(canCreate(manager, "harmonious", null)).toBe(false);
    expect(canReassign(sales)).toBe(false);
    expect(canReassign(superU)).toBe(true);
  });
});

describe("campaigns", () => {
  const approver: CrmActor = { ...base, userId: "a", canApproveCampaigns: true };
  it("needs a different approver with permission", () => {
    expect(campaignDecisionProblem(approver, { status: "submitted", created_by: "u1" })).toBeNull();
    expect(campaignDecisionProblem({ ...approver, userId: "u1" }, { status: "submitted", created_by: "u1" })).toMatch(/other than/);
    expect(campaignDecisionProblem(sales, { status: "submitted", created_by: "u2" })).toMatch(/not set up/);
    expect(campaignDecisionProblem(approver, { status: "draft", created_by: "u1" })).toMatch(/waiting/);
  });
  it("sends only after approval, by author or approver", () => {
    expect(campaignSendProblem(sales, { status: "approved", created_by: "u1", decided_by: "a" })).toBeNull();
    expect(campaignSendProblem(sales, { status: "submitted", created_by: "u1", decided_by: null })).toMatch(/approved/);
    expect(campaignSendProblem({ ...base, userId: "z" }, { status: "approved", created_by: "u1", decided_by: "a" })).toMatch(/author/);
  });
  it("edits only drafts", () => {
    expect(campaignEditProblem({ status: "draft" })).toBeNull();
    expect(campaignEditProblem({ status: "approved" })).not.toBeNull();
  });
  it("emails only opted-in contacts with valid email", () => {
    const c = (id: string, over: Partial<Parameters<typeof resolveAudience>[0][0]> = {}) => ({ id, email: `${id}@x.co`, consent: "opted_in", archived_at: null, tags: ["lp"], stages: ["lead"], ...over });
    const r = resolveAudience([c("a"), c("b", { consent: "unknown" }), c("c", { consent: "unsubscribed" }), c("d", { email: null }), c("e", { archived_at: "2026" }), c("f", { tags: ["other"] })], { tags: ["lp"] });
    expect(r.included.map((x) => x.id)).toEqual(["a"]);
    expect(r.excluded).toEqual({ noEmail: 1, notOptedIn: 1, unsubscribed: 1, archived: 1 });
  });
});

describe("updates feed", () => {
  it("merges newest first, dedupes, counts unread", () => {
    const u = (id: string, at: string) => ({ id, kind: "deal" as const, offeringId: null, fundName: null, headline: id, detail: "", at, path: "/" });
    const m = mergeUpdates([[u("a", "2026-01-01"), u("b", "2026-03-01")], [u("a", "2026-01-01"), u("c", "2026-02-01")]]);
    expect(m.map((x) => x.id)).toEqual(["b", "c", "a"]);
    expect(unreadCount(m, "2026-01-15")).toBe(2);
    expect(unreadCount(m, null)).toBe(3);
  });
});
