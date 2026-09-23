// @ts-nocheck — fixtures are loosely typed.
/**
 * Consolidation Stage 2 — parity proofs for the single navigation generator
 * against each of the three menus it replaces (AppSidebar internal menu,
 * ClientSidebar, OpsSidebar), plus revocation and no-query guarantees.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  getNavigation,
  HOME_ROUTE_MAP,
  internalNavigationGroups,
  onboardingItems,
  operationsNavItemIsActive,
  surfaceLabelForPath,
  workspaceKindForPath,
} from "@/lib/navigation";
import { clientNavigation, contextToClear, storageKeysToClear } from "@/lib/client-navigation";
import { capabilitiesFor, OPS_HOME, opsNavigation } from "@/lib/ops-capabilities";

/** Every destination the pre-Stage-2 AppSidebar lists contained (fund id = F1). */
const LEGACY_APP_SIDEBAR_URLS = `/access /admin /admin/access /admin/activity /admin/agreements /admin/audit /admin/bank-accounts /admin/cap-table-migrations /admin/cap-table-plans /admin/cap-table-requests /admin/client-activity /admin/client-bank-accounts /admin/client-cap-tables /admin/contracts /admin/distributions /admin/document-log /admin/email-preview /admin/entities /admin/funds /admin/funnel /admin/investor-onboarding /admin/invoices /admin/money /admin/new-application /admin/onboarding /admin/onboarding-progress /admin/pricing /admin/rate-proposals /admin/security /admin/services /admin/setup /admin/signoff /admin/wire /client/cap-table /client/cap-table/compliance /client/cap-table/documents /client/cap-table/employees /client/cap-table/exposure /client/cap-table/fundraising /client/cap-table/investors /client/cap-table/migration /client/cap-table/reconciliation /client/cap-table/reports /client/cap-table/secondaries /client/cap-table/securities /client/cap-table/settings /client/cap-table/table /dashboard /diligence /documents /fund-documents /investor-distributions /investor-financials /investor-performance /investor-reporting /manager /manager/activity /manager/allocations /manager/approvals /manager/cash-approvals /manager/distributions /manager/financials /manager/fund/F1 /manager/fund/F1/assets /manager/fund/F1/compliance /manager/fund/F1/documents /manager/fund/F1/investors /manager/fund/F1/settings /manager/fund/F1/transactions /manager/inbox /manager/investor-onboarding /manager/nav /manager/performance-reporting /manager/reporting /manager/valuations /my-equity /onboarding/accreditation /onboarding/compliance /ops /ops/accounting /ops/allocations /ops/banking /ops/financials /ops/nav /ops/performance /ops/reporting /ops/ss4 /ops/tax-documents /ops/team /ops/valuations /portal /prepared /professional /professional/acceptance /professional/activity /professional/authority /professional/credentials /professional/documents /professional/funds /professional/investments /professional/organization /professional/prepare /professional/profiles /professional/signatures /professional/tasks /professional/tax /professional/verification /signatory /statements /vault /wire /wire-confirmation`.split(" ");

const ALL = { isAdmin: true, isReviewer: true, legacyOperationsAllowed: true, isProfessional: true };
const NONE = { isAdmin: false, isReviewer: false, legacyOperationsAllowed: false, isProfessional: false };
const urls = (groups) => groups.flatMap((g) => g.items.map((i) => i.url));

const ws = {
  investor: { kind: "investor", id: "investor", label: "My investments", path: "/dashboard", surface: "client" },
  fund_manager: { kind: "fund_manager", id: "fund-manager", label: "Fund management", path: "/manager", surface: "client" },
  company: { kind: "company", id: "company", label: "My company", path: "/client", surface: "client" },
  professional: { kind: "professional", id: "professional", label: "Acting for clients", path: "/professional", surface: "client" },
  operations: { kind: "operations", id: "operations", label: "Harmonious Operations", path: "/ops", surface: "ops" },
};
const session = (kinds, extra = {}) => ({
  operations: kinds.includes("operations"),
  operationsCapabilities: kinds.includes("operations") ? capabilitiesFor(extra.roles ?? ["operations"]) : [],
  workspaces: kinds.map((k) => ws[k]),
  navigation: extra.navigation ?? NONE,
});

describe("parity: legacy AppSidebar (internal menu)", () => {
  it("every legacy destination is still generated for a fully-privileged session", () => {
    const generated = new Set([...urls(internalNavigationGroups(ALL, "/manager/fund/F1")), ...onboardingItems.map((i) => i.url)]);
    for (const url of LEGACY_APP_SIDEBAR_URLS) expect(generated, url).toContain(url);
  });

  it("groups follow the same flag gates as before", () => {
    const ids = (nav, p = "/home") => internalNavigationGroups(nav, p).map((g) => g.id);
    expect(ids(NONE)).toEqual(["application", "cap-table"]);
    expect(ids({ ...NONE, isReviewer: true })).toEqual(["application", "cap-table", "funds"]);
    expect(ids({ ...NONE, isReviewer: true }, "/manager/fund/F1")).toContain("selected-fund");
    expect(ids({ ...NONE, isProfessional: true })).toEqual(["application", "cap-table", "professional"]);
    expect(ids({ ...NONE, legacyOperationsAllowed: true })).toEqual(["application", "cap-table", "operations"]);
    expect(ids({ ...NONE, isAdmin: true })).toEqual(["application", "cap-table", "clients-money", "applications-funds", "records"]);
    expect(urls(internalNavigationGroups(NONE, "/"))).not.toContain("/admin/client-cap-tables");
  });
});

describe("parity: legacy ClientSidebar", () => {
  for (const kind of ["investor", "fund_manager", "company", "professional"]) {
    it(`${kind} primary menu is identical to the previous client menu`, () => {
      const nav = getNavigation(session([kind]), ws[kind].id, "/home");
      expect(nav.primary).toEqual(clientNavigation(kind));
      expect(nav.shell).toBe("client");
    });
  }
  it("investor menu has the required sections", () => {
    expect(getNavigation(session(["investor"]), "investor", "/home").primary.map((l) => l.title)).toEqual([
      "Home", "Investments", "Activity", "Reports", "Documents", "Tax", "Profile",
    ]);
  });
});

describe("parity: legacy OpsSidebar", () => {
  for (const roles of [["operations"], ["compliance"], ["finance"], ["admin"], ["tax", "legal"]]) {
    it(`Operations menu for ${roles.join("+")} matches capability projection`, () => {
      const nav = getNavigation(session(["operations"], { roles }), "operations", "/ops");
      expect(nav.operations).toEqual([OPS_HOME, ...opsNavigation(capabilitiesFor(roles))]);
      expect(nav.shell).toBe("ops");
    });
  }
  it("no staff facts: no Operations menu, even on /ops", () => {
    const nav = getNavigation(session(["investor"]), "investor", "/ops");
    expect(nav.operations).toEqual([]);
    expect(nav.operationsLink).toBeNull();
    expect(nav.shell).not.toBe("ops");
  });
});

describe("workspace projection", () => {
  it("uses an authorized compatibility route to select its matching workspace", () => {
    const s = session(["investor", "fund_manager", "company", "professional"]);
    expect(getNavigation(s, "investor", "/manager").activeKind).toBe("fund_manager");
    expect(getNavigation(s, "investor", "/client/services").activeKind).toBe("company");
    expect(getNavigation(s, "investor", "/professional/tasks").activeKind).toBe("professional");
    expect(workspaceKindForPath("/dashboard")).toBe("investor");
  });

  it("does not let a compatibility route invent a workspace", () => {
    const nav = getNavigation(session(["investor"]), "investor", "/manager");
    expect(nav.activeKind).toBe("investor");
    expect(nav.primary).toEqual(clientNavigation("investor"));
  });

  it("fund manager, company and professional menus require the matching workspace", () => {
    const investorOnly = session(["investor"]);
    for (const id of ["fund-manager", "company", "professional", "operations"]) {
      expect(getNavigation(investorOnly, id, "/home").activeKind).toBe("investor");
    }
  });

  it("multi-role users get workspace-specific menus, never a merged one", () => {
    const s = session(["investor", "fund_manager", "company", "professional", "operations"]);
    const inv = getNavigation(s, "investor", "/home").primary.map((l) => l.url);
    const mgr = getNavigation(s, "fund-manager", "/manager").primary.map((l) => l.url);
    expect(inv).not.toContain("/manager/funds");
    expect(mgr).not.toContain("/dashboard");
    expect(getNavigation(s, "investor", "/home").switcher.map((w) => w.id)).toEqual([
      "investor", "fund-manager", "company", "professional", "operations",
    ]);
  });

  it("a stale/revoked workspace disappears from the switcher and cannot stay active", () => {
    const before = session(["investor", "company"]);
    expect(getNavigation(before, "company", "/client").activeKind).toBe("company");
    const after = session(["investor"]); // company access revoked; next resolve
    const nav = getNavigation(after, "company", "/client");
    expect(nav.switcher.map((w) => w.id)).toEqual(["investor"]);
    expect(nav.activeKind).toBe("investor");
  });

  it("staff deactivation removes Operations on the next resolved session", () => {
    expect(getNavigation(session(["investor", "operations"]), "operations", "/ops").shell).toBe("ops");
    const nav = getNavigation(session(["investor"]), "operations", "/ops");
    expect(nav.shell).not.toBe("ops");
    expect(nav.operations).toEqual([]);
  });

  it("no session: no menus at all", () => {
    const nav = getNavigation(null, "investor", "/home");
    expect(nav.primary).toEqual([]);
    expect(nav.switcher).toEqual([]);
    expect(nav.operations).toEqual([]);
  });

  it("switching workspace clears incompatible context but keeps cosmetic layout", () => {
    expect(contextToClear()).toEqual(expect.arrayContaining(["query-cache", "harmonious.workspace.active", "delegated-context"]));
    expect(storageKeysToClear(["harmonious.workspace.active", "harmonious.client.selected", "harmonious.sidebar.openGroups"])).toEqual([
      "harmonious.workspace.active", "harmonious.client.selected",
    ]);
  });
});

describe("visual route cues", () => {
  it("labels each signed-in client surface in human language", () => {
    expect(surfaceLabelForPath("/manager")).toBe("Fund management");
    expect(surfaceLabelForPath("/client/cap-table")).toBe("Company workspace");
    expect(surfaceLabelForPath("/professional/tasks")).toBe("Professional workspace");
    expect(surfaceLabelForPath("/dashboard")).toBe("Client & investor portal");
    expect(surfaceLabelForPath("/ops/clients")).toBe("Harmonious Operations");
  });

  it("keeps Funds & SPVs highlighted on a singular Fund 360 route", () => {
    expect(operationsNavItemIsActive("/ops/funds", "/ops/fund/F1")).toBe(true);
    expect(operationsNavItemIsActive("/ops/funds", "/ops/clients/C1")).toBe(false);
  });
});

describe("no independent relationship queries in navigation", () => {
  const files = [
    "src/lib/navigation.ts",
    "src/components/app-sidebar.tsx",
    "src/components/client-sidebar.tsx",
    "src/components/ops-sidebar.tsx",
    "src/components/portal-topbar.tsx",
    "src/routes/_authenticated/route.tsx",
  ];
  for (const file of files) {
    it(`${file} runs no role/manager/profile/delegation/staff probe`, () => {
      const src = readFileSync(file, "utf8");
      for (const probe of ["getAdminAccess", "getOperationsAccess", "getOperationsContext", "getProfessionalStanding", ".from(\"user_roles\"", ".from(\"fund_managers\"", ".from(\"delegations\"", ".from(\"profiles\""]) {
        expect(src, `${file} uses ${probe}`).not.toContain(probe);
      }
    });
  }
  it("the navigation generator is pure", () => {
    const src = readFileSync("src/lib/navigation.ts", "utf8");
    expect(src).not.toMatch(/supabase|createServerFn|fetch\(/);
  });
});

describe("Home consolidation", () => {
  it("every Home route renders the same Action Center read model", () => {
    const homes = {
      "/home": "src/routes/_authenticated/home.tsx",
      "/manager": "src/routes/_authenticated/manager.index.tsx",
      "/client": "src/routes/_authenticated/client.index.tsx",
      "/professional": "src/routes/_authenticated/professional.index.tsx",
    };
    for (const [route, file] of Object.entries(homes)) {
      expect(readFileSync(file, "utf8"), route).toContain("<AttentionCenter");
      expect(HOME_ROUTE_MAP.find((h) => h.route === route)?.canonical).toBe("/home");
    }
    const ac = readFileSync("src/components/attention-center.tsx", "utf8");
    expect(ac).toContain("getAttention");
  });

  it("the canonical Home no longer runs its own workflow-state calculation", () => {
    const src = readFileSync("src/routes/_authenticated/home.tsx", "utf8");
    expect(src).not.toContain("needsYou.push");
  });

  it("the Home summary reads relationships only via canonical facts", () => {
    const src = readFileSync("src/lib/role-overview.functions.ts", "utf8");
    expect(src).toContain("gatherFacts");
    expect(src).not.toContain('.from("user_roles")');
    expect(src).not.toContain('.from("fund_managers")');
    expect(src).not.toContain('.from("profiles")');
  });
});
