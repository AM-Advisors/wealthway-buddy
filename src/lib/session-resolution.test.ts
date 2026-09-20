import { describe, expect, it } from "vitest";

import {
  CLIENT_ORIGIN_DEFAULT,
  LEGACY_ORIGIN,
  OPS_ORIGIN_DEFAULT,
  appUrl,
  migrateLegacyUrl,
  normalizeOrigin,
  safeInternalPath,
} from "@/lib/app-origins";
import {
  availableWorkspaces,
  canEnterWorkspace,
  defaultWorkspace,
  emptyFacts,
  hasOperationsAccess,
  operationsAccessFromEmail,
  resolveDestination,
  setupProgress,
} from "@/lib/session-resolution";

describe("application origins", () => {
  it("knows the two canonical applications and the legacy one", () => {
    expect(CLIENT_ORIGIN_DEFAULT).toBe("https://app.harmonious.co");
    expect(OPS_ORIGIN_DEFAULT).toBe("https://ops.harmonious.co");
    expect(LEGACY_ORIGIN).toBe("https://onboard.harmonious.co");
  });

  it("builds links into either application", () => {
    expect(appUrl("client", "/dashboard")).toBe("https://app.harmonious.co/dashboard");
    expect(appUrl("ops", "/ops/accounting")).toBe("https://ops.harmonious.co/ops/accounting");
  });

  it("prefers configured origins when they are set", () => {
    const env = { CLIENT_APP_ORIGIN: "https://app.example.com/", OPS_APP_ORIGIN: "https://ops.example.com" };
    expect(appUrl("client", "/x", env)).toBe("https://app.example.com/x");
    expect(appUrl("ops", "/y", env)).toBe("https://ops.example.com/y");
  });

  it("refuses an origin that is not an absolute address", () => {
    expect(normalizeOrigin("app.harmonious.co")).toBeNull();
    expect(normalizeOrigin("/relative")).toBeNull();
    expect(normalizeOrigin(undefined)).toBeNull();
  });

  it("rejects every open-redirect shape", () => {
    for (const bad of [
      "https://evil.test/steal",
      "//evil.test",
      "/\\evil.test",
      "javascript:alert(1)",
      "/ javascript:alert(1)",
      "/path\\..\\escape",
      "",
      null,
      undefined,
    ]) {
      expect(safeInternalPath(bad as any, "/")).toBe("/");
    }
  });

  it("keeps an ordinary internal path, including its query", () => {
    expect(safeInternalPath("/investment/abc?tab=capital")).toBe("/investment/abc?tab=capital");
  });

  it("migrates a legacy invitation link path-for-path", () => {
    expect(migrateLegacyUrl("https://onboard.harmonious.co/invest/fund-one?token=abc")).toBe(
      "https://app.harmonious.co/invest/fund-one?token=abc",
    );
  });

  it("does not migrate an address that is not the legacy one", () => {
    expect(migrateLegacyUrl("https://evil.test/invest/fund-one")).toBeNull();
  });
});

describe("operations authorization", () => {
  it("is refused without an explicit active staff record", () => {
    expect(hasOperationsAccess(emptyFacts())).toBe(false);
  });

  it("is never granted by an email address", () => {
    expect(operationsAccessFromEmail("someone@harmonious.co")).toBe(false);
  });

  it("is granted only by an active staff role", () => {
    const facts = { ...emptyFacts(), staff: { active: true, roles: ["operations"] } };
    expect(hasOperationsAccess(facts)).toBe(true);
  });

  it("disappears the moment staff authority is deactivated", () => {
    const facts = { ...emptyFacts(), staff: { active: false, roles: ["operations"] } };
    expect(hasOperationsAccess(facts)).toBe(false);
    expect(availableWorkspaces(facts).some((w) => w.surface === "ops")).toBe(false);
  });
});

describe("workspaces", () => {
  it("gives an investor only their own workspace", () => {
    const facts = { ...emptyFacts(), investmentProfileIds: ["p1"], investmentCount: 2 };
    expect(availableWorkspaces(facts).map((w) => w.id)).toEqual(["investor"]);
  });

  it("gives a person with several relationships one workspace each", () => {
    const facts = {
      ...emptyFacts(),
      investmentProfileIds: ["p1"],
      managedFundIds: ["f1"],
      clientIds: ["c1"],
      activeDelegationIds: ["d1"],
      staff: { active: true, roles: ["admin"] },
    };
    expect(availableWorkspaces(facts).map((w) => w.id)).toEqual([
      "investor",
      "fund-manager",
      "company",
      "professional",
      "operations",
    ]);
  });

  it("does not offer a fund workspace without a fund-manager record", () => {
    expect(canEnterWorkspace(emptyFacts(), "fund-manager")).toBe(false);
  });

  it("refuses an invented workspace identifier", () => {
    const facts = { ...emptyFacts(), investmentProfileIds: ["p1"] };
    expect(canEnterWorkspace(facts, "operations")).toBe(false);
    expect(canEnterWorkspace(facts, "../operations")).toBe(false);
  });

  it("lands staff in their client work first, so Operations is entered deliberately", () => {
    const facts = {
      ...emptyFacts(),
      investmentProfileIds: ["p1"],
      staff: { active: true, roles: ["admin"] },
    };
    expect(defaultWorkspace(facts)?.id).toBe("investor");
  });

  it("lands staff with no client relationships in Operations", () => {
    const facts = { ...emptyFacts(), staff: { active: true, roles: ["operations"] } };
    expect(defaultWorkspace(facts)?.id).toBe("operations");
  });
});

describe("destination after signing in", () => {
  it("honours a safe intended destination", () => {
    const facts = { ...emptyFacts(), investmentProfileIds: ["p1"] };
    expect(resolveDestination(facts, "/investment/abc")).toEqual({
      path: "/investment/abc",
      reason: "intended",
    });
  });

  it("ignores an unsafe intended destination", () => {
    const facts = { ...emptyFacts(), investmentProfileIds: ["p1"] };
    expect(resolveDestination(facts, "//evil.test").reason).toBe("workspace");
  });

  it("sends a person to their outstanding requirement before anything else", () => {
    const facts = {
      ...emptyFacts(),
      investmentProfileIds: ["p1"],
      outstandingRequirements: ["KYC", "ACCREDITATION"],
    };
    expect(resolveDestination(facts)).toEqual({
      path: "/onboarding/compliance",
      reason: "requirement",
    });
  });

  it("sends a brand new person into onboarding", () => {
    expect(resolveDestination(emptyFacts())).toEqual({
      path: "/onboarding/kyc",
      reason: "onboarding",
    });
  });
});

describe("setup progress", () => {
  it("reports completion and the next action", () => {
    const progress = setupProgress(
      ["ACCOUNT", "PERSON_PROFILE", "IDENTITY", "KYC", "INVESTMENT_PROFILE"],
      ["ACCREDITATION", "SUBSCRIPTION", "FUNDING"],
    );
    expect(progress.percent).toBe(63);
    expect(progress.next).toBe("ACCREDITATION");
  });

  it("is complete when nothing is outstanding", () => {
    expect(setupProgress(["ACCOUNT"], []).percent).toBe(100);
    expect(setupProgress([], []).next).toBeNull();
  });
});
