import { describe, expect, it } from "vitest";

import { articlesFor, clientHelpRolesFor } from "@/lib/help-articles";
import { HELP_CATALOG } from "@/lib/help-catalog";

const allApproved = new Map(HELP_CATALOG.map((a) => [a.slug, a.version]));

describe("help center visibility", () => {
  it("never gives clients staff articles", () => {
    const list = articlesFor(HELP_CATALOG, { audience: "client", roles: ["investor", "fund_manager", "company", "professional"] }, allApproved);
    expect(list.some((a) => a.audience === "staff")).toBe(false);
  });
  it("hides unapproved client articles from clients", () => {
    expect(articlesFor(HELP_CATALOG, { audience: "client", roles: ["investor"] }, new Map())).toHaveLength(0);
  });
  it("filters client articles by role", () => {
    const list = articlesFor(HELP_CATALOG, { audience: "client", roles: ["investor"] }, allApproved);
    expect(list.some((a) => a.slug === "manager-ein")).toBe(false);
    expect(list.some((a) => a.slug === "investor-wire")).toBe(true);
    expect(list.some((a) => a.slug === "getting-started")).toBe(true);
  });
  it("staff see drafts of both audiences", () => {
    const list = articlesFor(HELP_CATALOG, { audience: "staff", roles: [] }, new Map());
    expect(list.some((a) => a.audience === "client" && !a.approved)).toBe(true);
    expect(list.some((a) => a.audience === "staff")).toBe(true);
  });
  it("maps fund manager platform role", () => {
    expect(clientHelpRolesFor(["fund_manager"])).toContain("fund_manager");
  });
  it("requires fresh approval for updated illustrated guides and protects new manager guides", () => {
    const slugs = ["fund-manager-first-login", "sign-operating-agreement"];
    const old = new Map(slugs.map((slug) => [slug, 1]));
    expect(articlesFor(HELP_CATALOG, { audience: "client", roles: ["fund_manager"] }, old)).toHaveLength(0);
    const current = new Map(slugs.map((slug) => [slug, 2]));
    expect(articlesFor(HELP_CATALOG, { audience: "client", roles: ["fund_manager"] }, current).map((a) => a.slug).sort()).toEqual(slugs.sort());
    const added = new Map(["manager-countersign-timing", "manager-document-downloads", "harmonized-spv-guide", "fund-of-funds-guide"].map((slug) => [slug, 1]));
    expect(articlesFor(HELP_CATALOG, { audience: "client", roles: ["investor"] }, added)).toHaveLength(0);
    expect(articlesFor(HELP_CATALOG, { audience: "client", roles: ["fund_manager"] }, added)).toHaveLength(4);
  });
  it("requires current-version approval for revised setup and EIN guidance", () => {
    const approved = new Map([["manager-set-up-fund", 1], ["manager-ein", 1]]);
    const reader = { audience: "client" as const, roles: ["fund_manager"] };
    expect(articlesFor(HELP_CATALOG, reader, approved)).toHaveLength(0);
    approved.set("manager-set-up-fund", 2);
    approved.set("manager-ein", 2);
    expect(articlesFor(HELP_CATALOG, reader, approved).map((a) => a.slug).sort()).toEqual(["manager-ein", "manager-set-up-fund"]);
  });
  it("keeps new service-level and draft guidance manager-only", () => {
    const approved = new Map([["manager-service-level-pricing", 1], ["manager-save-fund-draft", 1]]);
    const manager = articlesFor(HELP_CATALOG, { audience: "client", roles: ["fund_manager"] }, approved);
    expect(manager.map((a) => a.slug).sort()).toEqual(["manager-save-fund-draft", "manager-service-level-pricing"]);
    expect(articlesFor(HELP_CATALOG, { audience: "client", roles: ["investor"] }, approved)).toHaveLength(0);
  });
});

describe("self-service help articles", () => {
  const want: Record<string, string> = {
    "manager-launch-fund": "fund_manager", "manager-close-reopen-fund": "fund_manager", "manager-edit-before-signing": "fund_manager",
    "manager-track-investors": "fund_manager", "manager-capital-method": "fund_manager", "manager-update-emails": "fund_manager",
    "manager-deal-room": "fund_manager", "manager-sign-w9": "fund_manager", "client-statements-of-work": "fund_manager",
    "investor-deal-room": "investor", "investor-profiles": "investor", "investor-profile-documents": "investor",
    "investor-personal-link": "investor", "investor-going-back": "investor",
    "investor-step-about-you": "investor", "investor-step-verification": "investor", "investor-step-sign": "investor", "investor-step-fund": "investor", "manager-entity-details": "fund_manager",
  };
  for (const [slug, role] of Object.entries(want)) it(`${slug} exists with steps for ${role}`, () => {
    const a: any = (HELP_CATALOG as any[]).find((x) => x.slug === slug);
    expect(a?.roles).toContain(role);
    expect(a.sections.some((s: any) => s.steps?.length)).toBe(true);
  });
});
