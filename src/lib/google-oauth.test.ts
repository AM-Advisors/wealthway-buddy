import { describe, expect, it } from "vitest";

import { googleReturnUrl } from "@/lib/google-oauth";
import { emptyFacts, resolveDestination } from "@/lib/session-resolution";

const APP = "https://app.harmonious.co";
const OPS = "https://ops.harmonious.co";

describe("the destination survives the Google round trip", () => {
  it("carries a client deep link back to the client sign-in page", () => {
    expect(googleReturnUrl(APP, "/auth", "/investments")).toBe(
      `${APP}/auth?next=%2Finvestments`,
    );
  });

  it("carries an Operations deep link back to the Operations sign-in page", () => {
    expect(googleReturnUrl(OPS, "/auth", "/ops/funds/c67a6e23")).toBe(
      `${OPS}/auth?next=%2Fops%2Ffunds%2Fc67a6e23`,
    );
  });

  it("keeps query and fragment of the original destination", () => {
    expect(googleReturnUrl(APP, "/auth", "/ops/funds/abc?tab=capital")).toBe(
      `${APP}/auth?next=%2Fops%2Ffunds%2Fabc%3Ftab%3Dcapital`,
    );
  });

  it("falls back to the plain sign-in page when nothing was requested", () => {
    expect(googleReturnUrl(APP, "/auth", null)).toBe(`${APP}/auth`);
    expect(googleReturnUrl(APP, "/client-login", "")).toBe(`${APP}/client-login`);
  });
});

describe("the preserved destination can never leave the application", () => {
  const hostile = [
    "https://evil.example",
    "http://evil.example/ops",
    "//evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "data:text/html,<script>",
    "/%2f%2fevil.example",
    "not-a-path",
    "  ",
  ];

  for (const value of hostile) {
    it(`refuses ${JSON.stringify(value)}`, () => {
      const url = googleReturnUrl(APP, "/auth", value);
      expect(url.startsWith(`${APP}/auth`)).toBe(true);
      expect(url).not.toContain("evil.example");
      expect(url).not.toContain("javascript:");
      expect(url).not.toContain("data:text");
    });
  }

  it("refuses a hostile sign-in page path too", () => {
    expect(googleReturnUrl(APP, "https://evil.example/auth", "/investments")).toBe(
      `${APP}/auth?next=%2Finvestments`,
    );
  });
});

describe("returning from Google grants nothing the backend has not granted", () => {
  function investor() {
    const facts = emptyFacts();
    facts.investmentCount = 2;
    facts.investmentProfileIds = ["p1"];
    return facts;
  }

  function staff() {
    const facts = emptyFacts();
    facts.staff = { active: true, roles: ["operations"] };
    return facts;
  }

  it("restores an authorised client deep link", () => {
    expect(resolveDestination(investor(), "/investments").path).toBe("/investments");
  });

  it("restores an Operations deep link for active staff", () => {
    const path = resolveDestination(staff(), "/ops/funds/c67a6e23").path;
    expect(path).toBe("/ops/funds/c67a6e23");
  });

  it("refuses an Operations destination for an investor", () => {
    const result = resolveDestination(investor(), "/ops/funds/c67a6e23");
    expect(result.path.startsWith("/ops")).toBe(false);
    expect(result.reason).toBe("denied");
  });

  it("refuses an Operations destination for a fund manager", () => {
    const facts = emptyFacts();
    facts.managedFundIds = ["f1"];
    expect(resolveDestination(facts, "/ops").path.startsWith("/ops")).toBe(false);
  });

  it("refuses an Operations destination for a delegated professional", () => {
    const facts = emptyFacts();
    facts.activeDelegationIds = ["d1"];
    expect(resolveDestination(facts, "/admin/users").path.startsWith("/admin")).toBe(false);
  });

  it("refuses an Operations destination for an ordinary authenticated person", () => {
    expect(resolveDestination(emptyFacts(), "/staff/queue").path.startsWith("/staff")).toBe(false);
  });

  it("refuses a deactivated staff member restoring an Operations deep link", () => {
    const facts = staff();
    facts.staff = { active: false, roles: [] };
    expect(resolveDestination(facts, "/ops/funds/c67a6e23").path.startsWith("/ops")).toBe(false);
  });

  it("refuses an external destination smuggled through the round trip", () => {
    for (const value of ["https://evil.example", "//evil.example", "/\\evil.example"]) {
      const path = resolveDestination(investor(), value).path;
      expect(path.startsWith("/")).toBe(true);
      expect(path).not.toContain("evil.example");
    }
  });
});
