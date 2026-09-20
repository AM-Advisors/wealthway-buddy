import { describe, expect, it } from "vitest";

import {
  accountMenu,
  canOpenFund,
  canOpenInvestmentProfile,
  clientNavigation,
  containsInternalLinks,
  delegationBanner,
  fundWorkspaceTabs,
  investmentWorkspaceTabs,
  keepDelegatedContext,
  legacyClientRedirect,
  navigationTelemetry,
  searchScope,
  workspaceOptions,
  workspaceOptionsFromFacts,
} from "@/lib/client-navigation";
import { availableWorkspaces, emptyFacts } from "@/lib/session-resolution";

const titles = (kind: Parameters<typeof clientNavigation>[0]) =>
  clientNavigation(kind).map((l) => l.title);

describe("client navigation by workspace", () => {
  it("gives an investor exactly the investor menu", () => {
    expect(titles("investor")).toEqual([
      "Home",
      "Investments",
      "Activity",
      "Reports",
      "Documents",
      "Tax",
      "Profile",
    ]);
  });

  it("gives a fund manager exactly the manager menu", () => {
    expect(titles("fund_manager")).toEqual([
      "Home",
      "Funds",
      "Investors",
      "Capital",
      "Reports",
      "Documents",
      "Profile",
    ]);
  });

  it("gives a company user exactly the company menu", () => {
    expect(titles("company")).toEqual([
      "Home",
      "Company",
      "Cap table",
      "Stakeholders",
      "Transactions",
      "Documents",
      "Reports",
      "Profile",
    ]);
  });

  it("gives a professional exactly the delegated menu", () => {
    expect(titles("professional")).toEqual(["Home", "Clients", "Tasks", "Documents", "Profile"]);
  });

  it("does not put fund-manager or internal destinations in the investor menu", () => {
    const urls = clientNavigation("investor").map((l) => l.url);
    expect(urls.some((u) => u.startsWith("/manager"))).toBe(false);
    expect(containsInternalLinks(clientNavigation("investor"))).toBe(false);
  });

  it("keeps every client menu free of Harmonious-only sections", () => {
    for (const kind of ["investor", "fund_manager", "company", "professional"] as const) {
      expect(containsInternalLinks(clientNavigation(kind))).toBe(false);
    }
  });

  it("does not put backend concepts in a primary client menu", () => {
    const banned = ["NAV Review", "Reconciliation", "General Ledger", "Allocation Runs", "KYC Review"];
    for (const kind of ["investor", "fund_manager", "company", "professional"] as const) {
      for (const link of clientNavigation(kind)) {
        expect(banned).not.toContain(link.title);
      }
    }
  });

  it("shows no client menu for the operations workspace", () => {
    expect(clientNavigation("operations")).toEqual([]);
    expect(clientNavigation(null)).toEqual([]);
  });
});

describe("contextual workspaces", () => {
  it("puts investment detail behind tabs, not extra menu items", () => {
    expect(investmentWorkspaceTabs("inv-1").map((t) => t.title)).toEqual([
      "Overview",
      "Capital",
      "Activity",
      "Performance",
      "Reports",
      "Documents",
      "Tax",
    ]);
    const investorUrls = clientNavigation("investor").map((l) => l.url);
    expect(investorUrls).not.toContain("/investment/inv-1?tab=capital");
  });

  it("scopes every investment tab to the one investment", () => {
    for (const tab of investmentWorkspaceTabs("inv-9")) {
      expect(tab.url.startsWith("/investment/inv-9")).toBe(true);
    }
  });

  it("shows only the fund tabs the manager is authorized for", () => {
    expect(fundWorkspaceTabs("f1", ["overview", "investors"]).map((t) => t.title)).toEqual([
      "Overview",
      "Investors",
    ]);
    expect(fundWorkspaceTabs("f1", []).length).toBe(0);
  });

  it("keeps fund tabs pointed at the fund that was opened", () => {
    for (const tab of fundWorkspaceTabs("f2", ["overview", "capital", "documents"])) {
      expect(tab.url.includes("/manager/fund/f2")).toBe(true);
    }
  });
});

describe("resource authorization", () => {
  it("refuses a fund the manager does not manage", () => {
    expect(canOpenFund(["fund-a"], "fund-a")).toBe(true);
    expect(canOpenFund(["fund-a"], "fund-b")).toBe(false);
  });

  it("refuses an investment profile that belongs to someone else", () => {
    expect(canOpenInvestmentProfile(["profile-a"], "profile-a")).toBe(true);
    expect(canOpenInvestmentProfile(["profile-a"], "profile-b")).toBe(false);
  });

  it("keeps an individual, an LLC and a trust distinct", () => {
    const owned = ["individual-1", "llc-1"];
    expect(canOpenInvestmentProfile(owned, "trust-1")).toBe(false);
  });
});

describe("workspace switcher", () => {
  it("offers nothing to someone with no relationships", () => {
    expect(workspaceOptionsFromFacts(emptyFacts())).toEqual([]);
  });

  it("offers one entry per real relationship", () => {
    const facts = {
      ...emptyFacts(),
      investmentProfileIds: ["p1"],
      managedFundIds: ["f1"],
      companyIds: ["c1"],
      activeDelegationIds: ["d1"],
    };
    expect(workspaceOptionsFromFacts(facts).map((o) => o.id)).toEqual([
      "investor",
      "fund-manager",
      "company",
      "professional",
    ]);
  });

  it("sends staff to the operations application instead of changing this one", () => {
    const facts = { ...emptyFacts(), staff: { active: true, roles: ["operations"] } };
    const ops = workspaceOptionsFromFacts(facts).find((o) => o.id === "operations");
    expect(ops?.external).toBe(true);
    expect(ops?.href).toBe("https://ops.harmonious.co/ops");
  });

  it("keeps client workspaces inside this application", () => {
    const facts = { ...emptyFacts(), investmentProfileIds: ["p1"] };
    const options = workspaceOptions(availableWorkspaces(facts));
    expect(options[0]?.external).toBe(false);
    expect(options[0]?.href).toBe("/dashboard");
  });

  it("cannot produce an entry for an invented workspace", () => {
    const facts = { ...emptyFacts(), investmentProfileIds: ["p1"] };
    expect(workspaceOptionsFromFacts(facts).some((o) => o.id === "operations")).toBe(false);
  });
});

describe("delegated access", () => {
  it("says plainly who is being acted for", () => {
    const banner = delegationBanner({
      principalName: "Jane Smith",
      organizationName: "Smith & Co Advisors",
    });
    expect(banner.acting).toBe("Acting on behalf of Jane Smith");
    expect(banner.through).toBe("Through Smith & Co Advisors");
    expect(banner.exitLabel).toBe("Exit delegated access");
  });

  it("drops delegated context when an unrelated record is opened", () => {
    expect(
      keepDelegatedContext({ delegatedProfileIds: ["p1"], resourceProfileId: "p2" }),
    ).toBe(false);
    expect(
      keepDelegatedContext({ delegatedProfileIds: ["p1"], resourceProfileId: "p1" }),
    ).toBe(true);
  });
});

describe("old addresses and search", () => {
  it("keeps moved manager pages working, with their context", () => {
    expect(legacyClientRedirect("/manager/nav")).toBe("/manager/reporting?section=nav");
    expect(legacyClientRedirect("/manager/allocations?fund=f1")).toBe(
      "/manager/capital?section=investor-capital&fund=f1",
    );
  });

  it("leaves unmoved pages alone", () => {
    expect(legacyClientRedirect("/dashboard")).toBeNull();
    expect(legacyClientRedirect("/investment/abc")).toBeNull();
  });

  it("scopes search to the active workspace only", () => {
    expect(searchScope("investor")).not.toContain("funds");
    expect(searchScope("fund_manager")).toContain("funds");
    expect(searchScope("operations")).toEqual([]);
  });
});

describe("account menu and telemetry", () => {
  it("never offers system administration", () => {
    const links = accountMenu({ isProfessional: true });
    expect(containsInternalLinks(links)).toBe(false);
    expect(links.some((l) => /administration/i.test(l.title))).toBe(false);
  });

  it("only shows professional memberships to professionals", () => {
    expect(
      accountMenu({ isProfessional: false }).some((l) => l.title === "Professional memberships"),
    ).toBe(false);
  });

  it("records the section only, never record content", () => {
    const event = navigationTelemetry({
      workspaceKind: "investor",
      path: "/investment/abc-123?tab=tax",
    });
    expect(event).toEqual({ event: "client_navigation", workspace: "investor", section: "investment" });
    expect(JSON.stringify(event)).not.toContain("abc-123");
  });
});
