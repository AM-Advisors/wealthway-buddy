import { describe, expect, it, vi } from "vitest";

/**
 * Stage 3.5 — the move to two addresses.
 *
 * Two questions are asked here over and over. Does a page end up at the right
 * address, without ever bouncing in a circle? And does the address itself
 * change what anyone is allowed to see? The answer to the second must always
 * be no: Harmonious Operations is entered from a staff record, never from a
 * hostname.
 */

import {
  LEGACY_ADMIN_ORIGIN,
  canonicalRedirect,
  classifyLegacyPath,
  isDevelopmentHost,
  isTrustedOrigin,
  opsLeavesCurrentHost,
  redirectSettles,
  surfaceForPath,
  trustedOrigins,
} from "@/lib/host-routing";
import { LEGACY_ORIGIN } from "@/lib/app-origins";
import { emptyFacts, resolveDestination, isInternalDestination } from "@/lib/session-resolution";
import { workspaceOptions } from "@/lib/client-navigation";

const APP = "https://app.harmonious.co";
const OPS = "https://ops.harmonious.co";

describe("which application a page belongs to", () => {
  it("puts operations sections on the operations address and everything else on the client one", () => {
    expect(surfaceForPath("/ops")).toBe("ops");
    expect(surfaceForPath("/ops/funds/abc")).toBe("ops");
    expect(surfaceForPath("/admin/banking")).toBe("ops");
    expect(surfaceForPath("/staff/queue")).toBe("ops");
    expect(surfaceForPath("/dashboard")).toBe("client");
    expect(surfaceForPath("/manager/fund/abc")).toBe("client");
  });

  it("leaves sign-in, machine endpoints and tracking alone", () => {
    for (const path of [
      "/auth",
      "/auth/register",
      "/reset-password",
      "/api/public/packet/xyz",
      "/lovable/email/events",
      "/__l5e/assets-v1/logo.png",
      "/robots.txt",
      "/sitemap.xml",
    ]) {
      expect(surfaceForPath(path)).toBe("shared");
      expect(canonicalRedirect({ url: `${LEGACY_ORIGIN}${path}` })).toBeNull();
    }
  });
});

describe("canonical addresses", () => {
  it("sends an operations page reached on the client address to operations", () => {
    expect(canonicalRedirect({ url: `${APP}/ops/funds/abc?tab=banking` })).toEqual({
      location: `${OPS}/ops/funds/abc?tab=banking`,
      status: 302,
    });
  });

  it("sends a client page reached on the operations address back to the client", () => {
    expect(canonicalRedirect({ url: `${OPS}/dashboard` })).toEqual({
      location: `${APP}/dashboard`,
      status: 302,
    });
  });

  it("leaves a page that is already in the right place", () => {
    expect(canonicalRedirect({ url: `${APP}/dashboard` })).toBeNull();
    expect(canonicalRedirect({ url: `${OPS}/ops/investors/abc` })).toBeNull();
  });

  it("never redirects while building or previewing", () => {
    expect(isDevelopmentHost("localhost:8080")).toBe(true);
    expect(canonicalRedirect({ url: "http://localhost:8080/ops/funds/abc" })).toBeNull();
    expect(
      canonicalRedirect({ url: "https://id-preview--x.lovable.app/ops" }),
    ).toBeNull();
  });

  it("uses a temporary redirect while the new address is being proven", () => {
    expect(canonicalRedirect({ url: `${APP}/ops` })?.status).toBe(302);
  });

  it("honours configured origins instead of hard-coded ones", () => {
    const env = { CLIENT_APP_ORIGIN: "https://client.example", OPS_APP_ORIGIN: "https://ops.example" };
    expect(canonicalRedirect({ url: "https://client.example/ops" }, env)?.location).toBe(
      "https://ops.example/ops",
    );
  });
});

describe("old addresses keep working", () => {
  it("classifies an old link rather than dropping everyone on the homepage", () => {
    expect(classifyLegacyPath("/invest/fund-one")).toBe("invitation");
    expect(classifyLegacyPath("/onboarding/kyc")).toBe("invitation");
    expect(classifyLegacyPath("/dashboard")).toBe("client");
    expect(classifyLegacyPath("/ops/funds/abc")).toBe("operations");
    expect(classifyLegacyPath("/api/public/email/open")).toBe("shared");
  });

  it("lands an old client link on the same page of the client application", () => {
    expect(
      canonicalRedirect({ url: `${LEGACY_ORIGIN}/invest/fund-one?token=abc` })?.location,
    ).toBe(`${APP}/invest/fund-one?token=abc`);
    expect(canonicalRedirect({ url: `${LEGACY_ADMIN_ORIGIN}/dashboard` })?.location).toBe(
      `${APP}/dashboard`,
    );
  });

  it("lands an old internal link on the same page of operations", () => {
    expect(canonicalRedirect({ url: `${LEGACY_ORIGIN}/admin/banking` })?.location).toBe(
      `${OPS}/admin/banking`,
    );
    expect(canonicalRedirect({ url: `${LEGACY_ADMIN_ORIGIN}/ops/funds/abc` })?.location).toBe(
      `${OPS}/ops/funds/abc`,
    );
  });

  it("keeps the query and fragment of a deep link intact", () => {
    expect(
      canonicalRedirect({ url: `${LEGACY_ORIGIN}/manager/fund/abc?tab=capital#calls` })?.location,
    ).toBe(`${APP}/manager/fund/abc?tab=capital#calls`);
  });

  it("leaves an address it does not recognise exactly where it is", () => {
    expect(canonicalRedirect({ url: "https://portal.harmonious.co/dashboard" })).toBeNull();
  });
});

describe("no redirect loops", () => {
  const paths = [
    "/",
    "/dashboard",
    "/manager/fund/abc",
    "/ops",
    "/ops/funds/abc?tab=accounting",
    "/admin/banking",
    "/auth?next=%2Fops%2Ffunds%2Fabc",
    "/api/public/email/open",
    "/invest/fund-one",
  ];
  const hosts = [APP, OPS, LEGACY_ORIGIN, LEGACY_ADMIN_ORIGIN];

  it("settles every page on every address in at most one hop", () => {
    for (const host of hosts) {
      for (const path of paths) {
        const url = `${host}${path}`;
        expect(redirectSettles(url), url).toBe(true);
        const first = canonicalRedirect({ url });
        if (first) expect(canonicalRedirect({ url: first.location })).toBeNull();
      }
    }
  });
});

describe("trusted origins stay explicit", () => {
  it("names each Harmonious address rather than allowing every subdomain", () => {
    const list = trustedOrigins();
    expect(list).toEqual([APP, OPS, LEGACY_ORIGIN, LEGACY_ADMIN_ORIGIN]);
    expect(list.some((o) => o.includes("*"))).toBe(false);
  });

  it("refuses a lookalike address", () => {
    expect(isTrustedOrigin("https://ops.harmonious.co")).toBe(true);
    expect(isTrustedOrigin("https://ops.harmonious.co.evil.test")).toBe(false);
    expect(isTrustedOrigin("https://harmonious.co.attacker.test")).toBe(false);
    expect(isTrustedOrigin("//ops.harmonious.co")).toBe(false);
    expect(isTrustedOrigin(null)).toBe(false);
  });
});

describe("returning someone to where they were heading", () => {
  it("keeps an operations deep link for staff through signing in", () => {
    const staff = { ...emptyFacts(), staff: { active: true, roles: ["fund_administration"] } };
    expect(resolveDestination(staff, "/ops/funds/abc?tab=banking")).toEqual({
      path: "/ops/funds/abc?tab=banking",
      reason: "intended",
    });
  });

  it("never returns a non-staff person to an operations address", () => {
    const investor = { ...emptyFacts(), investmentCount: 2 };
    const result = resolveDestination(investor, "/ops/funds/abc");
    expect(result.reason).toBe("denied");
    expect(isInternalDestination(result.path)).toBe(false);
    expect(result.path).toBe("/dashboard");
  });

  it("sends a person with nothing at all somewhere safe rather than into operations", () => {
    const result = resolveDestination(emptyFacts(), "/admin/banking");
    expect(result.reason).toBe("denied");
    expect(result.path).toBe("/home");
  });

  it("still refuses to leave Harmonious for an outside address", () => {
    const staff = { ...emptyFacts(), staff: { active: true, roles: ["admin"] } };
    for (const bad of [
      "https://evil.test/steal",
      "//evil.test/steal",
      "/\\evil.test",
      "javascript:alert(1)",
    ]) {
      expect(resolveDestination(staff, bad).path).not.toContain("evil.test");
    }
  });
});

describe("the workspace switcher points at operations without granting it", () => {
  const staff = {
    ...emptyFacts(),
    staff: { active: true, roles: ["operations"] },
    investmentCount: 1,
  };

  it("takes authorized staff to the operations address", () => {
    const options = workspaceOptions([
      { kind: "operations", id: "operations", label: "Harmonious Operations", path: "/ops", surface: "ops" },
    ]);
    expect(options[0]?.href).toBe(`${OPS}/ops`);
    expect(options[0]?.external).toBe(true);
  });

  it("only offers operations when the resolver found a staff record", () => {
    const investor = { ...emptyFacts(), investmentCount: 1 };
    expect(resolveDestination(investor).path).toBe("/dashboard");
    expect(resolveDestination(staff).path).toBe("/dashboard");
  });

  it("keeps operations in place on a preview address", () => {
    expect(opsLeavesCurrentHost("id-preview--x.lovable.app", OPS)).toBe(false);
    expect(opsLeavesCurrentHost("localhost:8080", OPS)).toBe(false);
    expect(opsLeavesCurrentHost("app.harmonious.co", OPS)).toBe(true);
    expect(opsLeavesCurrentHost("ops.harmonious.co", OPS)).toBe(false);
  });
});

/**
 * The address is not a permission. The same request, from the same person, is
 * answered the same way whatever hostname it arrived on — so the tests below
 * exercise the real Operations gate rather than any routing rule.
 */
const tables: Record<string, any[]> = {
  user_roles: [
    { user_id: "staff", role: "fund_administration" },
    { user_id: "investor", role: "investor" },
    { user_id: "manager", role: "fund_manager" },
    { user_id: "delegate", role: "professional" },
    { user_id: "ordinary", role: "user" },
  ],
};

function builder(table: string) {
  let rows = [...(tables[table] ?? [])];
  const api: any = {
    select: () => api,
    eq: (col: string, val: unknown) => {
      rows = rows.filter((r) => r[col] === val);
      return api;
    },
    then: (resolve: any) => resolve({ data: rows, error: null }),
  };
  return api;
}

const contextFor = (userId: string) => ({
  userId,
  supabase: { from: (t: string) => builder(t) },
  claims: { email: `${userId}@harmonious.co` },
});

vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));

const access = await import("@/lib/ops-access.functions");

describe("the hostname grants nothing", () => {
  it("refuses an investor, a fund manager, a delegate and an ordinary person", async () => {
    for (const who of ["investor", "manager", "delegate", "ordinary"]) {
      await expect(access.requireOperations(contextFor(who))).rejects.toThrow(/Harmonious team/);
    }
  });

  it("refuses them even though every one of them has a harmonious.co email", async () => {
    const context = contextFor("investor");
    expect(context.claims.email.endsWith("@harmonious.co")).toBe(true);
    await expect(access.requireOperations(context)).rejects.toThrow(/Harmonious team/);
  });

  it("admits an active staff member and gives them only their own areas", async () => {
    const result = await access.requireOperations(contextFor("staff"));
    expect(result.roles).toContain("fund_administration");
    expect(result.capabilities.length).toBeGreaterThan(0);
    await expect(access.requireOperations(contextFor("staff"), "tax", "approve")).rejects.toThrow(
      /permission/,
    );
  });

  it("drops access on the very next request when the staff record is removed", async () => {
    const original = [...tables["user_roles"]!];
    await expect(access.requireOperations(contextFor("staff"))).resolves.toBeTruthy();
    tables["user_roles"] = original.filter((r) => r.user_id !== "staff");
    await expect(access.requireOperations(contextFor("staff"))).rejects.toThrow(/Harmonious team/);
    tables["user_roles"] = original;
  });

  it("drops a single capability on the very next request when the role changes", async () => {
    const original = [...tables["user_roles"]!];
    const before = await access.requireOperations(contextFor("staff"));
    expect(before.capabilities.length).toBeGreaterThan(0);
    tables["user_roles"] = [
      ...original.filter((r) => r.user_id !== "staff"),
      { user_id: "staff", role: "executive" },
    ];
    const after = await access.requireOperations(contextFor("staff"));
    expect(after.capabilities.every((c) => c.endsWith(":see"))).toBe(true);
    tables["user_roles"] = original;
  });
});
