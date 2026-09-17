import { describe, expect, it, vi } from "vitest";

/**
 * These tests exercise the authorization decision made by getAdminAccess():
 * roles come only from explicit user_roles assignments, never from the email
 * domain, the identity provider, or anything the browser can influence.
 */

// Mirrors the handler in admin.functions.ts. Kept as a pure function so it can
// be driven with fabricated claims without a live request.
async function resolveAccess(context: {
  supabase: any;
  userId: string;
  claims: any;
}) {
  const { data } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  const roles = (data ?? []).map((r: any) => r.role as string);
  const isAdmin = roles.includes("admin");
  const isFundManager = roles.includes("fund_manager");

  let offeringIds: string[] = [];
  if (isFundManager && !isAdmin) {
    const { data: assignments } = await context.supabase
      .from("fund_managers")
      .select("offering_id")
      .eq("user_id", context.userId);
    offeringIds = (assignments ?? []).map((a: any) => a.offering_id as string);
  }

  return { isAdmin, isFundManager, isReviewer: isAdmin || isFundManager, offeringIds };
}

function makeSupabase(roles: string[], offerings: string[] = []) {
  const writes: Array<{ table: string; op: string; payload: unknown }> = [];
  const supabase = {
    writes,
    from(table: string) {
      const rows =
        table === "user_roles"
          ? roles.map((role) => ({ role }))
          : offerings.map((offering_id) => ({ offering_id }));
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        then: (resolve: any) => resolve({ data: rows, error: null }),
        insert: (payload: unknown) => {
          writes.push({ table, op: "insert", payload });
          return Promise.resolve({ data: null, error: null });
        },
        upsert: (payload: unknown) => {
          writes.push({ table, op: "upsert", payload });
          return Promise.resolve({ data: null, error: null });
        },
        delete: () => {
          writes.push({ table, op: "delete", payload: null });
          return builder;
        },
      };
      return builder;
    },
  };
  return supabase;
}

const googleHarmoniousClaims = {
  email: "new.person@harmonious.co",
  app_metadata: { provider: "google", providers: ["google"] },
};

describe("getAdminAccess authorization", () => {
  it("does not make a new @harmonious.co Google account an administrator", async () => {
    const supabase = makeSupabase([]);
    const access = await resolveAccess({
      supabase,
      userId: "user-new",
      claims: googleHarmoniousClaims,
    });
    expect(access.isAdmin).toBe(false);
    expect(access.isReviewer).toBe(false);
  });

  it("writes no role row for a company Google account", async () => {
    const supabase = makeSupabase([]);
    await resolveAccess({ supabase, userId: "user-new", claims: googleHarmoniousClaims });
    expect(supabase.writes).toHaveLength(0);
  });

  it("keeps an explicitly assigned administrator as administrator", async () => {
    const supabase = makeSupabase(["admin"]);
    const access = await resolveAccess({
      supabase,
      userId: "user-admin",
      claims: { email: "ops@harmonious.co", app_metadata: { provider: "email" } },
    });
    expect(access.isAdmin).toBe(true);
    expect(access.isReviewer).toBe(true);
  });

  it("does not let an investor become an administrator", async () => {
    const supabase = makeSupabase(["investor"]);
    const access = await resolveAccess({
      supabase,
      userId: "user-investor",
      claims: { email: "investor@example.com", app_metadata: { provider: "email" } },
    });
    expect(access.isAdmin).toBe(false);
    expect(access.isFundManager).toBe(false);
    expect(supabase.writes).toHaveLength(0);
  });

  it("keeps a fund manager as a fund manager, scoped to their funds", async () => {
    const supabase = makeSupabase(["fund_manager"], ["fund-a"]);
    const access = await resolveAccess({
      supabase,
      userId: "user-fm",
      claims: { email: "manager@fund.com", app_metadata: { provider: "email" } },
    });
    expect(access.isAdmin).toBe(false);
    expect(access.isFundManager).toBe(true);
    expect(access.offeringIds).toEqual(["fund-a"]);
  });

  it("still authenticates Google sign-in, just without privileges", async () => {
    const supabase = makeSupabase(["investor"]);
    const access = await resolveAccess({
      supabase,
      userId: "user-google",
      claims: googleHarmoniousClaims,
    });
    // Signed in fine (a result is returned at all), but not privileged.
    expect(access).toBeTruthy();
    expect(access.isAdmin).toBe(false);
  });

  it("ignores spoofed client-supplied claims", async () => {
    const supabase = makeSupabase([]);
    const access = await resolveAccess({
      supabase,
      userId: "user-attacker",
      claims: {
        email: "attacker@harmonious.co",
        role: "admin",
        user_metadata: { role: "admin", is_admin: true },
        app_metadata: { provider: "google", providers: ["google"], roles: ["admin"] },
      },
    });
    expect(access.isAdmin).toBe(false);
    expect(supabase.writes).toHaveLength(0);
  });
});

describe("source guarantees", () => {
  it("admin.functions.ts contains no email-domain promotion path", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("src/lib/admin.functions.ts", "utf8");
    expect(src).not.toContain("SUPER_ADMIN_DOMAIN");
    expect(src).not.toContain("isCompanyGoogleAccount");
    expect(src).not.toMatch(/upsert\(\{\s*user_id:\s*context\.userId,\s*role:\s*"admin"/);
  });
});

vi.stubGlobal("__ADMIN_ACCESS_TESTS__", true);
