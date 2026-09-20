import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { safeInternalPath } from "@/lib/app-origins";
import {
  clientNavigation,
  contextToClear,
  menuForContext,
  storageKeysToClear,
  type ClientNavLink,
} from "@/lib/client-navigation";
import { nextRequirementPath } from "@/lib/session-resolution";

const KINDS = ["investor", "fund_manager", "company", "professional"] as const;

/** Maps a menu address to the route file that must exist for it. */
function routeFileFor(url: string): string {
  const path = (url.split("?")[0] ?? "").replace(/^\//, "");
  const segments = path.split("/").filter(Boolean);
  const base = segments.length === 0 ? "index" : segments.join(".");
  const candidates = [
    `src/routes/_authenticated/${base}.tsx`,
    `src/routes/_authenticated/${base}.index.tsx`,
    `src/routes/${base}.tsx`,
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!;
}

describe("every client menu item goes somewhere real", () => {
  for (const kind of KINDS) {
    it(`has no dead links in the ${kind} menu`, () => {
      for (const link of clientNavigation(kind) as ClientNavLink[]) {
        expect(existsSync(routeFileFor(link.url)), `${link.title} → ${link.url}`).toBe(true);
      }
    });
  }
});

describe("which menu a page gets", () => {
  it("gives an investor the client menu", () => {
    expect(
      menuForContext({ pathname: "/dashboard", hasClientWorkspace: true, activeKind: "investor" }),
    ).toBe("client");
  });

  it("never shows the client menu on a Harmonious-only page", () => {
    for (const pathname of ["/admin", "/admin/funds", "/ops", "/ops/nav", "/staff"]) {
      expect(menuForContext({ pathname, hasClientWorkspace: true, activeKind: "investor" })).toBe(
        "internal",
      );
    }
  });

  it("keeps the internal menu for staff working in Operations", () => {
    expect(
      menuForContext({ pathname: "/dashboard", hasClientWorkspace: true, activeKind: "operations" }),
    ).toBe("internal");
  });
});

describe("stale context", () => {
  it("names everything a workspace switch or sign-out must forget", () => {
    expect(contextToClear()).toEqual([
      "query-cache",
      "harmonious.workspace.active",
      "delegated-context",
    ]);
  });

  it("forgets the workspace and the chosen company, keeping only screen layout", () => {
    const remembered = [
      "harmonious.workspace.active",
      "harmonious.captable.company",
      "harmonious.lastTestEmail.abc",
      "harmonious.sidebar.openGroups",
      "theme",
    ];
    expect(storageKeysToClear(remembered)).toEqual([
      "harmonious.workspace.active",
      "harmonious.captable.company",
      "harmonious.lastTestEmail.abc",
    ]);
  });
});

describe("continuing onboarding", () => {
  it("sends people to the step the backend says is outstanding", () => {
    expect(nextRequirementPath(["KYC"])).toBe("/onboarding/compliance");
    expect(nextRequirementPath(["ACCREDITATION"])).toBe("/onboarding/accreditation");
    expect(nextRequirementPath(["FUNDING"])).toBe("/onboarding/funding");
  });

  it("has nothing to continue when the backend reports nothing outstanding", () => {
    expect(nextRequirementPath([])).toBeNull();
  });
});

describe("deep links into the client application", () => {
  it("keeps an authorized deep link intact through signing in", () => {
    expect(safeInternalPath("/investment/abc-123?tab=capital")).toBe(
      "/investment/abc-123?tab=capital",
    );
    expect(safeInternalPath("/manager/fund/f1/investors")).toBe("/manager/fund/f1/investors");
  });

  it("still refuses to be pointed off-site", () => {
    expect(safeInternalPath("https://evil.test/investment/abc", "/home")).toBe("/home");
  });
});
