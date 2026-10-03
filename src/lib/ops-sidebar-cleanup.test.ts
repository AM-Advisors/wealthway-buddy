import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { getNavigation, operationsNavItemIsActive, type NavigationSession } from "@/lib/navigation";
import { clientNavigation } from "@/lib/client-navigation";
import { OPS_WORK_AREAS, activeOpsSection, capabilitiesFor, opsNavigation } from "@/lib/ops-capabilities";
import { opsSearchIndex, searchOpsIndex } from "@/lib/ops-search";
import { topbarShowsLogo } from "@/components/portal-topbar";

const routes = readdirSync("src/routes/_authenticated").map((f) => f.replace(/\.tsx$/, ""));
const routeExists = (url: string) => {
  const flat = url.replace(/^\//, "").replace(/\//g, ".") || "index";
  return routes.includes(flat) || routes.map((r) => r.replace(/_\./g, ".")).includes(flat) || routes.includes(`${flat}.index`) || (flat === "admin" && routes.includes("admin.index"));
};

function session(kinds: string[], roles: string[] = ["admin"]): NavigationSession {
  const staff = kinds.includes("operations");
  return {
    operations: staff,
    operationsCapabilities: staff ? capabilitiesFor(roles) : [],
    workspaces: kinds.map((k) => ({
      kind: k as never, id: k === "fund_manager" ? "fund-manager" : k, label: k,
      path: k === "operations" ? "/ops" : "/home", surface: k === "operations" ? "ops" : "client",
    })),
  };
}

const FIRST_LEVEL = ["Home", "Clients", "Funds & SPVs", "Investors", "Money", "Accounting & Reports", "Tax", "Companies", "Administration"];
const SPECIALIST = ["Valuation review", "NAV review", "Investor allocations", "Financial reporting",
  "Performance reporting", "Investor reporting", "Banking requests", "EIN and SS-4"];

describe("Operations sidebar consolidation", () => {
  it("super admin gets exactly the consolidated first-level menu", () => {
    const nav = getNavigation(session(["operations"], ["super_admin"]), "operations", "/ops");
    expect(nav.operations.map((s) => s.title)).toEqual(FIRST_LEVEL);
  });

  it("specialist screens are not first-level links", () => {
    const titles = getNavigation(session(["operations"], ["super_admin"]), "operations", "/ops").operations.map((s) => s.title);
    for (const t of SPECIALIST) expect(titles).not.toContain(t);
  });

  it("every specialist screen and area landing still resolves to a route", () => {
    for (const area of OPS_WORK_AREAS) {
      if (!area.url.startsWith("/ops/areas/")) expect(routeExists(area.url), area.url).toBe(true);
      for (const s of area.screens) expect(routeExists(s.url), s.url).toBe(true);
    }
    expect(routes).toContain("ops.areas.$area");
  });

  it("child routes activate exactly one parent section", () => {
    const cases: [string, string][] = [
      ["/ops", "home"], ["/ops/funds/abc", "funds"], ["/ops/fund/abc", "funds"], ["/ops/fund-setup", "funds"], ["/ops/fund-setup/abc", "funds"], ["/ops/investors/x", "investors"],
      ["/ops/accounting", "accounting"], ["/ops/valuations", "accounting"], ["/ops/nav", "accounting"],
      ["/ops/reporting", "accounting"], ["/ops/financials", "accounting"], ["/ops/banking", "capital"],
      ["/ops/ss4", "funds"], ["/admin", "investors"], ["/admin/investor-onboarding", "investors"],
      ["/ops/areas/reports", "accounting"], ["/ops/areas/onboarding", "investors"], ["/staff", "clients"], ["/ops/team", "administration"],
    ];
    const sections = opsNavigation(capabilitiesFor(["super_admin"]));
    for (const [path, owner] of cases) {
      expect(activeOpsSection(path)).toBe(owner);
      const active = [{ url: "/ops" }, ...sections].filter((s) => operationsNavItemIsActive(s.url, path));
      expect(active, path).toHaveLength(1);
    }
  });

  it("unauthorized work areas stay absent (tax role)", () => {
    const titles = opsNavigation(capabilitiesFor(["tax"])).map((s) => s.title);
    expect(titles).toEqual(["Accounting & Reports", "Tax"]);
  });

  it("search respects capabilities and finds hidden specialist screens", () => {
    const finance = opsSearchIndex(capabilitiesFor(["finance"]));
    expect(searchOpsIndex(finance, "NAV").map((r) => r.url)).toContain("/ops/nav");
    expect(searchOpsIndex(finance, "SS-4")).toEqual([]);
    expect(searchOpsIndex(opsSearchIndex([]), "NAV")).toEqual([]);
  });

  it("multi-role users never get a merged client + Operations menu", () => {
    const s = session(["investor", "operations"]);
    const client = getNavigation(s, "investor", "/home");
    expect(client.shell).toBe("client");
    expect(client.primary).toEqual(clientNavigation("investor"));
    expect(client.primary.some((l) => l.url.startsWith("/ops") || l.url.startsWith("/admin"))).toBe(false);
    expect(getNavigation(s, "investor", "/admin/audit").shell).toBe("ops");
    expect(getNavigation(s, "operations", "/ops/nav").shell).toBe("ops");
  });

  it("staff on legacy internal routes get the Operations menu; non-staff never do", () => {
    expect(getNavigation(session(["operations"]), "operations", "/admin/wire").shell).toBe("ops");
    expect(getNavigation(session(["investor"]), "investor", "/admin/wire").shell).not.toBe("ops");
  });

  it("uses the Operations menu on Sales for Operations staff without changing client pages", () => {
    const s = session(["investor", "operations"]);
    expect(getNavigation(s, "investor", "/sales").shell).toBe("ops");
    expect(getNavigation(s, "investor", "/sales").operations.some((item) => item.title === "Clients")).toBe(true);
    expect(getNavigation(s, "investor", "/home").shell).toBe("client");
  });

  it("gives commercial-only Sales staff a Sales menu, never privileged Operations links", () => {
    const s = { ...session(["investor"]), staffRoles: ["sales"] };
    const sales = getNavigation(s, "investor", "/sales");
    expect(sales.shell).toBe("ops");
    expect(sales.operations.map((item) => item.url)).toEqual(expect.arrayContaining(["/sales", "/sales/crm", "/account-manager"]));
    expect(sales.operations.every((item) => item.url.startsWith("/sales") || item.url.startsWith("/account-manager"))).toBe(true);
    expect(getNavigation(s, "investor", "/home").shell).toBe("client");
    expect(getNavigation(session(["investor"]), "investor", "/sales").shell).toBe("client");
  });
});

describe("shell chrome", () => {
  it("top bar shows the logo only on mobile with the drawer closed", () => {
    expect(topbarShowsLogo(false, false)).toBe(false);
    expect(topbarShowsLogo(true, false)).toBe(true);
    expect(topbarShowsLogo(true, true)).toBe(false);
  });

  it("each sidebar renders one logo; account controls live in the footer", () => {
    for (const f of ["ops-sidebar", "client-sidebar"]) {
      const src = readFileSync(`src/components/${f}.tsx`, "utf8");
      expect(src.match(/data-testid="brand-logo"/g)).toHaveLength(1);
      expect(src).toContain("SidebarAccountFooter");
      expect(src).not.toMatch(/tooltip="Sign out"/);
      expect(src).not.toMatch(/Your sign-off/);
    }
    const topbar = readFileSync("src/components/portal-topbar.tsx", "utf8");
    expect(topbar).not.toMatch(/Sign out/);
  });

  it("collapsed state is presentation only", () => {
    const src = readFileSync("src/components/ops-sidebar.tsx", "utf8");
    expect(src).toContain('collapsible="icon"');
    expect(src).toContain("tooltip={item.title}");
    expect(src).not.toMatch(/collapsed[^\n]*operationsCapabilities/);
  });
});

describe("process-based work areas keep per-screen access", () => {
  it("legal still reaches EIN/SS-4 and documents, but not Fund Setup", async () => {
    const { opsWorkAreas } = await import("@/lib/ops-capabilities");
    const urls = opsWorkAreas(capabilitiesFor(["legal"])).flatMap((a) => a.screens.map((s) => s.url));
    expect(urls).toContain("/ops/ss4");
    expect(urls).toContain("/ops/documents");
    expect(urls).not.toContain("/ops/fund-setup");
  });
  it("client success sees onboarding screens but not the investor directory's area page by default", async () => {
    const { opsWorkAreas } = await import("@/lib/ops-capabilities");
    const inv = opsWorkAreas(capabilitiesFor(["client_success"])).find((a) => a.id === "investors")!;
    expect(inv.screens.map((s) => s.url)).toContain("/ops/readiness");
  });
});
