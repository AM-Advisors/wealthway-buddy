import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateLinkToken, linkCanStart, linkStatus, publicLinkView, rateLimited, tokenLooksValid, invitationMessage, RATE_MAX_FAILURES } from "@/lib/fund-onboarding-link";

// ---------- tiny in-memory table fake
type Row = Record<string, any>;
const tables: Record<string, Row[]> = {};
function q(name: string) {
  const t = (tables[name] ??= []);
  let filters: ((r: Row) => boolean)[] = [];
  let op: "select" | "update" | "insert" | "upsert" = "select";
  let payload: any = null; let head = false; let lim = Infinity; let onConflict: string | null = null;
  const rows = () => t.filter((r) => filters.every((f) => f(r)));
  const run = () => {
    if (op === "insert") { const r = { id: `id-${Math.random().toString(36).slice(2)}`, created_at: new Date(Date.now() + t.length).toISOString(), status: "active", ...payload }; t.push(r); return { data: r, error: null }; }
    if (op === "upsert") { if (onConflict && t.some((r) => r[onConflict!] === payload[onConflict!])) return { data: null, error: null }; t.push({ id: `u-${t.length}`, ...payload }); return { data: null, error: null }; }
    if (op === "update") { const hit = rows(); hit.forEach((r) => Object.assign(r, payload)); return { data: hit, error: null }; }
    const r = rows().slice(0, lim); return head ? { data: null, count: r.length, error: null } : { data: r, error: null };
  };
  const b: any = {
    select: (_s?: string, o?: any) => { if (o?.head) head = true; return b; },
    eq: (k: string, v: any) => { filters.push((r) => r[k] === v); return b; },
    in: (k: string, v: any[]) => { filters.push((r) => v.includes(r[k])); return b; },
    gte: (k: string, v: any) => { filters.push((r) => r[k] >= v); return b; },
    order: () => b, limit: (n: number) => { lim = n; return b; },
    insert: (p: any) => { op = "insert"; payload = p; return b; },
    update: (p: any) => { op = "update"; payload = p; return b; },
    upsert: (p: any, o: any) => { op = "upsert"; payload = p; onConflict = o?.onConflict ?? null; return b; },
    maybeSingle: async () => { const r = run(); return { data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: null }; },
    single: async () => run(),
    then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
  };
  return b;
}
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: (n: string) => q(n) } }));

const FUND_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FUND_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const STAFF = "staff", MGR_A = "mgr-a", MGR_B = "mgr-b", INV = "investor", OUTSIDER = "outsider";
const openFunds = new Set([FUND_A, FUND_B]);
const starts: { userId: string; offering: string }[] = [];
const onboardings = new Map<string, string>();

vi.mock("@/lib/investor-onboarding.server", () => ({
  forbid: (m: string) => { throw new Error(`Forbidden: ${m}`); },
  onboardingActor: async (u: string) => ({ userId: u, isStaff: u === STAFF, managedOfferingIds: u === MGR_A ? [FUND_A] : u === MGR_B ? [FUND_B] : [] }),
  assertStaff: async (u: string) => { if (u !== STAFF) throw new Error("Forbidden: staff only"); return { userId: u, isStaff: true, managedOfferingIds: [] }; },
  launchedOffering: async (id: string) => { if (!openFunds.has(id)) throw new Error("This fund is not open for investor onboarding yet."); return { offering: { id, name: id === FUND_A ? "Chapter 7" : "Fund B", client_id: null }, setup: {} }; },
  // Same idempotency contract as the canonical startOnboarding: one open onboarding per fund + person.
  startOnboarding: async (userId: string, i: { slugOrId: string }) => {
    starts.push({ userId, offering: i.slugOrId });
    const k = `${i.slugOrId}:${userId}`;
    if (onboardings.has(k)) return { onboardingId: onboardings.get(k)!, resumed: true };
    const id = `onb-${onboardings.size + 1}`; onboardings.set(k, id); return { onboardingId: id, resumed: false };
  },
}));
vi.mock("@/lib/access-control.server", () => ({ recordAccessEvent: vi.fn(async () => {}) }));

const srv = () => import("@/lib/fund-onboarding-link.server");
const tokenOf = (url: string) => url.split("/join/")[1]!;

beforeEach(() => { for (const k of Object.keys(tables)) delete tables[k]; starts.length = 0; onboardings.clear(); openFunds.add(FUND_A); });

describe("token rules", () => {
  it("tokens are opaque 256-bit base64url and cannot be enumerated", () => {
    const a = generateLinkToken(), b = generateLinkToken();
    expect(a).not.toBe(b);
    expect(tokenLooksValid(a)).toBe(true);
    for (const bad of ["1", "2", FUND_A, "a".repeat(42), "a".repeat(44), "../../x", `${"a".repeat(42)}=`]) expect(tokenLooksValid(bad)).toBe(false);
  });
  it("status and start rules", () => {
    expect(linkStatus(null)).toBe("not_configured");
    expect(linkStatus({ status: "superseded" })).toBe("not_configured");
    expect(linkCanStart({ status: "disabled" }, true)).toBe(false);
    expect(linkCanStart({ status: "active" }, false)).toBe(false);
    expect(linkCanStart({ status: "active" }, true)).toBe(true);
  });
  it("public view is a strict whitelist", () => {
    expect(publicLinkView({ fundName: "F", managedBy: "M", investors: [1], documents: [2], wire: "x", offeringId: FUND_A })).toEqual({ fundName: "F", managedBy: "M" });
  });
  it("rate limit trips on repeated failures", () => {
    expect(rateLimited(Array.from({ length: RATE_MAX_FAILURES }, () => ({ ok: false })))).toBe(true);
    expect(rateLimited([{ ok: true }])).toBe(false);
  });
  it("invitation message names the fund only", () => {
    expect(invitationMessage("Chapter 7", "https://x/join/t")).toContain("investor onboarding for Chapter 7 through Harmonious");
  });
});

describe("link management authorization", () => {
  it("unauthorized users cannot see or manage a fund's link", async () => {
    const s = await srv();
    await expect(s.getFundLink(OUTSIDER, FUND_A)).rejects.toThrow(/Forbidden/);
    await expect(s.getFundLink(MGR_B, FUND_A)).rejects.toThrow(/Forbidden/);
    await expect(s.regenerateFundLink(MGR_A, FUND_A)).rejects.toThrow(/Forbidden/);
    await expect(s.setFundLinkEnabled(MGR_A, FUND_A, false)).rejects.toThrow(/Forbidden/);
  });
  it("a fund manager of that exact fund can view and copy it but not manage it", async () => {
    const s = await srv();
    await s.regenerateFundLink(STAFF, FUND_A);
    const v = await s.getFundLink(MGR_A, FUND_A);
    expect(v.status).toBe("active");
    expect(v.url).toMatch(/\/join\/[A-Za-z0-9_-]{43}$/);
    expect(v.canManage).toBe(false);
  });
});

describe("public link", () => {
  it("valid link resolves exactly one fund and exposes no investor list", async () => {
    const s = await srv();
    const { url } = await s.regenerateFundLink(STAFF, FUND_A);
    const view = await s.resolvePublicLink(tokenOf(url!), "caller");
    expect(Object.keys(view).sort()).toEqual(["fundName", "managedBy"]);
    expect(view.fundName).toBe("Chapter 7");
  });
  it("unknown, malformed, disabled or closed-fund links cannot start onboarding", async () => {
    const s = await srv();
    await expect(s.startFromLink(INV, generateLinkToken(), "c1")).rejects.toThrow(/isn't active/);
    await expect(s.startFromLink(INV, FUND_A, "c1")).rejects.toThrow(/isn't active/);
    const { url } = await s.regenerateFundLink(STAFF, FUND_A);
    await s.setFundLinkEnabled(STAFF, FUND_A, false);
    await expect(s.startFromLink(INV, tokenOf(url!), "c1")).rejects.toThrow(/isn't active/);
    await s.setFundLinkEnabled(STAFF, FUND_A, true);
    openFunds.delete(FUND_A);
    await expect(s.startFromLink(INV, tokenOf(url!), "c1")).rejects.toThrow(/isn't active/);
    expect(starts).toHaveLength(0);
  });
  it("duplicate submissions converge on one investment via the canonical start", async () => {
    const s = await srv();
    const { url } = await s.regenerateFundLink(STAFF, FUND_A);
    const a = await s.startFromLink(INV, tokenOf(url!), "c");
    const b = await s.startFromLink(INV, tokenOf(url!), "c");
    expect(a.onboardingId).toBe(b.onboardingId);
    expect(b.resumed).toBe(true);
    expect(starts.every((x) => x.offering === FUND_A)).toBe(true);
    expect((tables["fund_onboarding_link_starts"] ?? []).length).toBe(1);
    expect((await s.getFundLink(STAFF, FUND_A)).starts).toBe(1);
  });
  it("regeneration disables the old token but keeps earlier onboarding", async () => {
    const s = await srv();
    const first = await s.regenerateFundLink(STAFF, FUND_A);
    const r = await s.startFromLink(INV, tokenOf(first.url!), "c");
    const second = await s.regenerateFundLink(STAFF, FUND_A);
    expect(second.url).not.toBe(first.url);
    expect(second.regeneratedAt).not.toBeNull();
    await expect(s.startFromLink("someone-else", tokenOf(first.url!), "c")).rejects.toThrow(/isn't active/);
    expect(onboardings.get(`${FUND_A}:${INV}`)).toBe(r.onboardingId);
    expect((tables["fund_onboarding_link_starts"] ?? []).length).toBe(1);
  });
  it("a link for one fund never starts onboarding in another", async () => {
    const s = await srv();
    const a = await s.regenerateFundLink(STAFF, FUND_A);
    await s.regenerateFundLink(STAFF, FUND_B);
    await s.startFromLink(INV, tokenOf(a.url!), "c");
    expect(starts.map((x) => x.offering)).toEqual([FUND_A]);
  });
  it("repeated bad lookups are throttled", async () => {
    const s = await srv();
    for (let i = 0; i < RATE_MAX_FAILURES; i++) await expect(s.resolvePublicLink(generateLinkToken(), "abuser")).rejects.toThrow();
    await expect(s.resolvePublicLink(generateLinkToken(), "abuser")).rejects.toThrow(/Too many attempts/);
  });
});
