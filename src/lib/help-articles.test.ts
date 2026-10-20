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
});

describe("self-service help articles", async () => {
  const { HELP_ARTICLES } = await import("@/lib/help-catalog");
  const want: Record<string, string> = {
    "manager-launch-fund": "fund_manager", "manager-close-reopen-fund": "fund_manager", "manager-edit-before-signing": "fund_manager",
    "manager-track-investors": "fund_manager", "manager-capital-method": "fund_manager", "manager-update-emails": "fund_manager",
    "manager-deal-room": "fund_manager", "manager-sign-w9": "fund_manager", "client-statements-of-work": "fund_manager",
    "investor-deal-room": "investor", "investor-profiles": "investor", "investor-profile-documents": "investor",
    "investor-personal-link": "investor", "investor-going-back": "investor",
  };
  for (const [slug, role] of Object.entries(want)) it(`${slug} exists with steps for ${role}`, () => {
    const a: any = (HELP_ARTICLES as any[]).find((x) => x.slug === slug);
    expect(a?.roles).toContain(role);
    expect(a.sections.some((s: any) => s.steps?.length)).toBe(true);
  });
});
