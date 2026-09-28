import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { getNavigation, RETIRED_HOME_ALIASES, workspaceKindForPath } from "@/lib/navigation";
import {
  availableWorkspaces,
  isRetiredHomeAlias,
  resolveDestination,
  type RelationshipFacts,
} from "@/lib/session-resolution";

const base: RelationshipFacts = {
  investmentProfileIds: [],
  investmentCount: 0,
  managedFundIds: [],
  clientIds: [],
  companyIds: [],
  activeDelegationIds: [],
  outstandingRequirements: [],
  staff: { active: false, roles: [] },
} as unknown as RelationshipFacts;
const f = (o: Partial<Record<string, unknown>>) => ({ ...base, ...o }) as RelationshipFacts;

const investor = f({ investmentProfileIds: ["p1"], investmentCount: 1 });
const manager = f({ managedFundIds: ["fund1"] });
const company = f({ companyIds: ["c1"] });
const professional = f({ activeDelegationIds: ["d1"] });
const staff = f({ staff: { active: true, roles: ["operations"] } });

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|md)$/.test(n) && !n.endsWith(".test.ts") && !n.endsWith("routeTree.gen.ts")) out.push(p);
  }
  return out;
}

describe("retired legacy dashboard", () => {
  for (const alias of ["/dashboard", "/portal"]) {
    it(`${alias} renders nothing and redirects through the server resolver`, () => {
      const src = readFileSync(`src/routes/_authenticated${alias}.tsx`, "utf8");
      expect(src).toContain("resolveSession");
      expect(src).toContain("throw redirect(");
      expect(src).toContain("component: () => null");
      expect(src).not.toMatch(/<Card|getPortal|getFunding/);
    });
  }

  it("old links resolve to each canonical workspace", () => {
    for (const alias of ["/dashboard", "/portal", "/dashboard?x=1", "/portal/abc"]) {
      expect(isRetiredHomeAlias(alias)).toBe(true);
      expect(resolveDestination(investor, alias).path).toBe("/home");
      expect(resolveDestination(manager, alias).path).toBe("/manager");
      expect(resolveDestination(company, alias).path).toBe("/client");
      expect(resolveDestination(professional, alias).path).toBe("/professional");
      expect(resolveDestination(staff, alias).path).toBe("/ops");
    }
  });

  it("unauthenticated old link → sign-in → resolved destination, never legacy", () => {
    // The auth gate stores next=/dashboard; after sign-in the resolver ignores it.
    expect(resolveDestination(investor, "/dashboard").reason).not.toBe("intended");
  });

  it("no workspace, requirement fallback or sign-in fallback targets a retired alias", () => {
    for (const facts of [investor, manager, company, professional, staff]) {
      for (const w of availableWorkspaces(facts)) expect(RETIRED_HOME_ALIASES).not.toContain(w.path as never);
      expect(isRetiredHomeAlias(resolveDestination(facts).path)).toBe(false);
    }
    expect(isRetiredHomeAlias(resolveDestination(f({ outstandingRequirements: ["UNKNOWN"] })).path)).toBe(false);
    expect(readFileSync("src/lib/post-signin.ts", "utf8")).not.toContain("/dashboard");
    expect(readFileSync("src/routes/reset-password.tsx", "utf8")).not.toContain("/dashboard");
  });

  it("no live source links to /dashboard or /portal (emails, CTAs, menus, Action Center)", () => {
    const allowed = new Set([
      "src/routes/_authenticated/dashboard.tsx",
      "src/routes/_authenticated/portal.tsx",
      "src/lib/navigation.ts",
      "src/lib/session-resolution.ts",
    ]);
    for (const file of walk("src")) {
      if (allowed.has(file)) continue;
      const src = readFileSync(file, "utf8");
      expect(src, file).not.toMatch(/["'`](https:\/\/[a-z.]+)?\/dashboard["'`?]/);
      expect(src, file).not.toMatch(/["'`]\/portal["'`]/);
    }
  });

  it("a redirect never grants a role: non-staff never reach Operations", () => {
    expect(resolveDestination(investor, "/ops").path).toBe("/home");
    expect(resolveDestination(manager, "/admin").path).toBe("/manager");
  });
});

describe("retired legacy sidebar", () => {
  it("the legacy AppSidebar is gone and the shell has no branch for it", () => {
    expect(existsSync("src/components/app-sidebar.tsx")).toBe(false);
    const layout = readFileSync("src/routes/_authenticated/route.tsx", "utf8");
    expect(layout).not.toMatch(/AppSidebar|"internal"/);
  });

  it("every session / path combination yields only the client or Operations shell", () => {
    const sessions = [
      null,
      { operations: false, workspaces: [] },
      { operations: true, workspaces: [{ kind: "operations", id: "operations", label: "", path: "/ops", surface: "ops" }] },
      { operations: false, workspaces: [{ kind: "investor", id: "investor", label: "", path: "/home", surface: "client" }] },
    ];
    for (const s of sessions)
      for (const p of ["/", "/home", "/dashboard", "/portal", "/admin", "/ops", "/manager"])
        expect(["client", "ops"]).toContain(getNavigation(s as never, null, p).shell);
  });

  it("non-staff on an internal URL never get the Operations menu", () => {
    const s = { operations: false, workspaces: [] };
    expect(getNavigation(s as never, "operations", "/admin").shell).toBe("client");
    expect(workspaceKindForPath("/dashboard")).toBeNull();
  });
});
