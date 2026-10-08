// MOCK tests: pure rules only; no LinkedIn API is called.
import { describe, expect, it } from "vitest";
import { afterEdit, allowed, canManageDelegates, publishCheck, type LiAccount, type LiGrant } from "./linkedin-personal-model";

const OWNER = "alyssa", EMP = "emp", SUPER = "super-admin";
const now = new Date("2026-10-08T18:00:00Z"); // 1pm Chicago
const acct: LiAccount = { owner_user_id: OWNER, status: "connected", member_sub: "abc", expires_at: "2026-12-01T00:00:00Z", has_token: true };
const approved = { owner_user_id: OWNER, status: "approved", version: 2, approved_version: 2 };
const g = (perms: LiGrant["perms"], x: Partial<LiGrant> = {}): LiGrant => ({ perms, ...x });
const ctx = (actorId: string, grant: LiGrant | null, extra = {}) => ({ actorId, ownerId: OWNER, grant, now, ...extra });

describe("personal LinkedIn delegation", () => {
  it("owner can do everything", () => { expect(publishCheck(acct, { ...approved, status: "draft", approved_version: null }, ctx(OWNER, null)).ok).toBe(true); });
  it("employee without permission has no access", () => { expect(allowed(ctx(EMP, null), "view").ok).toBe(false); });
  it("draft access can create but not publish", () => {
    const gr = g({ view: true, create: true });
    expect(allowed(ctx(EMP, gr), "create").ok).toBe(true);
    expect(publishCheck(acct, approved, ctx(EMP, gr)).ok).toBe(false);
  });
  it("approved-publisher publishes only approved versions", () => {
    const gr = g({ publish_approved: true });
    expect(publishCheck(acct, approved, ctx(EMP, gr)).ok).toBe(true);
    expect(publishCheck(acct, { ...approved, status: "draft", approved_version: null }, ctx(EMP, gr)).ok).toBe(false);
  });
  it("direct publisher needs separate authorization and respects limits", () => {
    const draft = { ...approved, status: "draft", approved_version: null };
    expect(publishCheck(acct, draft, ctx(EMP, g({ publish_direct: true }))).ok).toBe(false);
    const gr = g({ publish_direct: true }, { direct_publish_authorized_at: "2026-10-01", max_posts_per_day: 2, hours_start: 9, hours_end: 17 });
    expect(publishCheck(acct, draft, ctx(EMP, gr, { postsToday: 1 })).ok).toBe(true);
    expect(publishCheck(acct, draft, ctx(EMP, gr, { postsToday: 2 })).ok).toBe(false);
    expect(publishCheck(acct, draft, { ...ctx(EMP, gr), now: new Date("2026-10-09T04:00:00Z") }).ok).toBe(false);
    // Account time zone applies: 18:00Z is 9pm in London, outside 9–17.
    expect(publishCheck(acct, draft, { ...ctx(EMP, gr, { postsToday: 0 }), tz: "Europe/London" }).ok).toBe(false);
  });
  it("revoked, suspended or expired delegate cannot publish", () => {
    for (const x of [{ revoked_at: "2026-10-01" }, { suspended: true }, { expires_at: "2026-10-01" }])
      expect(publishCheck(acct, approved, ctx(EMP, g({ publish_approved: true }, x))).ok).toBe(false);
  });
  it("Super Admin has no implicit access or delegation rights", () => {
    expect(allowed(ctx(SUPER, null), "view").ok).toBe(false);
    expect(canManageDelegates(SUPER, OWNER).ok).toBe(false);
  });
  it("changed content requires reapproval", () => {
    const e = afterEdit({ ...approved, body: "Hello" }, "Hello world");
    expect(e).toEqual({ changed: true, invalidates: true, version: 3 });
    expect(publishCheck(acct, { ...approved, version: 3 }, ctx(EMP, g({ publish_approved: true }))).ok).toBe(false);
  });
  it("expired LinkedIn authorization blocks publishing, even for the owner", () => {
    expect(publishCheck({ ...acct, expires_at: "2026-10-01T00:00:00Z" }, approved, ctx(OWNER, null)).ok).toBe(false);
    expect(publishCheck({ ...acct, status: "reauthorization_required" }, approved, ctx(OWNER, null)).ok).toBe(false);
  });
  it("company-page access grants nothing on the personal profile", () => {
    // Company-page rights live in marketing roles; the personal check only reads the owner's explicit grant.
    expect(publishCheck(acct, approved, ctx("marketing-manager", null)).ok).toBe(false);
  });
  it("emergency pause blocks everyone, including the owner", () => {
    expect(publishCheck({ ...acct, paused_at: "2026-10-08T00:00:00Z" }, approved, ctx(OWNER, null)).ok).toBe(false);
    expect(publishCheck({ ...acct, paused_at: "2026-10-08T00:00:00Z" }, approved, ctx(EMP, g({ publish_approved: true }))).ok).toBe(false);
  });
  it("destination must match the owner", () => {
    expect(publishCheck(acct, { ...approved, owner_user_id: "someone-else" }, ctx(OWNER, null)).ok).toBe(false);
  });
  it("delegates cannot manage delegates", () => { expect(canManageDelegates(EMP, OWNER).ok).toBe(false); });
});
