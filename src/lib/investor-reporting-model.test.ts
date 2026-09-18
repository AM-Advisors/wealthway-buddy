import { describe, expect, it } from "vitest";

import {
  blockingExceptions,
  brandingFor,
  canTransitionPackage,
  deliveryState,
  documentGroupFor,
  isInvestorSafeSource,
  isImmutablePackage,
  manifestGaps,
  packageExceptions,
  portfolioForInvestor,
  presetForFund,
  publicationBlockers,
  sanitizeSections,
  segregationError,
  SECTION_CAPABILITY,
} from "@/lib/investor-reporting-model";

describe("sections", () => {
  it("drops anything that is not a known investor section", () => {
    expect(sanitizeSections(["cover", "trial_balance", "nav_summary"])).toEqual([
      "cover",
      "nav_summary",
    ]);
  });

  it("treats internal accounting records as never investor-safe", () => {
    expect(isInvestorSafeSource("accounting_workpapers")).toBe(false);
    expect(isInvestorSafeSource("journal_lines")).toBe(false);
    expect(isInvestorSafeSource("investor_statements")).toBe(true);
  });

  it("requires an explicit capability for every section", () => {
    expect(SECTION_CAPABILITY.capital_account).toBe("view_financial_statements");
    expect(SECTION_CAPABILITY.capital_calls).toBe("view_capital_calls");
  });
});

describe("portfolio visibility follows fund policy", () => {
  const rows = [
    {
      asset: "Acme",
      security: "Series A Preferred",
      costCents: 100,
      valueCents: 150,
      changeCents: 50,
      pctOfNav: 12,
      status: "held",
    },
  ];

  it("shows nothing when the fund publishes no portfolio detail", () => {
    expect(portfolioForInvestor(rows, "none")).toEqual([]);
  });

  it("hides security, cost and change at summary level", () => {
    const [row] = portfolioForInvestor(rows, "summary");
    expect(row).toEqual({ asset: "Acme", valueCents: 150, pctOfNav: 12, status: "held" });
  });

  it("shows the full row only at detail level", () => {
    const [row] = portfolioForInvestor(rows, "detail");
    expect(row?.security).toBe("Series A Preferred");
    expect(row?.costCents).toBe(100);
  });

  it("respects the fund's configured column list", () => {
    const [row] = portfolioForInvestor(rows, "detail", ["asset", "value"]);
    expect(row).toEqual({ asset: "Acme", valueCents: 150 });
  });
});

describe("templates", () => {
  it("picks the fund-type template for the frequency", () => {
    expect(presetForFund("venture", "quarter").code).toBe("vc_quarterly");
    expect(presetForFund("hedge", "month").code).toBe("hedge_monthly");
    expect(presetForFund("anything", "year").code).toBe("annual_package");
  });
});

describe("lifecycle", () => {
  it("only allows the defined transitions", () => {
    expect(canTransitionPackage("draft", "review")).toBe(true);
    expect(canTransitionPackage("draft", "published")).toBe(false);
    expect(canTransitionPackage("published", "approved")).toBe(false);
    expect(canTransitionPackage("superseded", "published")).toBe(false);
  });

  it("freezes published and superseded packages", () => {
    expect(isImmutablePackage("published")).toBe(true);
    expect(isImmutablePackage("superseded")).toBe(true);
    expect(isImmutablePackage("review")).toBe(false);
  });

  it("stops the generator approving or publishing their own package", () => {
    const pkg = { generated_by: "amy" };
    expect(segregationError("amy", pkg, "approved")).toMatch(/cannot approve/);
    expect(segregationError("amy", pkg, "published")).toMatch(/cannot publish/);
    expect(segregationError("ben", pkg, "published")).toBeNull();
  });
});

describe("completeness", () => {
  it("blocks when a required component was never published", () => {
    const exceptions = packageExceptions(
      ["nav_summary", "capital_account"],
      [{ sectionKey: "nav_summary", sourceTable: "nav_versions", sourceStatus: "approved" }],
    );
    expect(blockingExceptions(exceptions)).toHaveLength(1);
    expect(exceptions[0]?.kind).toBe("missing_component");
  });

  it("blocks a component that is still in draft", () => {
    const exceptions = packageExceptions(
      [],
      [{ sectionKey: "capital_account", sourceTable: "investor_statements", sourceStatus: "draft" }],
    );
    expect(exceptions[0]?.kind).toBe("component_not_published");
  });

  it("blocks internal workpapers from ever entering a package", () => {
    const exceptions = packageExceptions(
      [],
      [
        {
          sectionKey: "financial_statements",
          sourceTable: "accounting_workpapers",
          sourceStatus: "approved",
        },
      ],
    );
    expect(exceptions.some((e) => e.kind === "internal_material")).toBe(true);
  });

  it("passes a complete, published set", () => {
    const exceptions = packageExceptions(
      ["nav_summary"],
      [{ sectionKey: "nav_summary", sourceTable: "nav_versions", sourceStatus: "published" }],
    );
    expect(exceptions).toEqual([]);
  });
});

describe("manifest", () => {
  const complete = {
    investorUserId: "amy",
    offeringId: "fund",
    periodStart: "2026-01-01",
    periodEnd: "2026-03-31",
    templateCode: "vc_quarterly",
    templateVersion: 1,
    generatedBy: "ops",
    approvedBy: "lead",
    publishedBy: "lead",
  };

  it("lists what is still missing", () => {
    expect(manifestGaps({ ...complete, publishedBy: null })).toEqual(["publishedBy"]);
    expect(manifestGaps(complete)).toEqual([]);
  });

  it("blocks publication on either exceptions or manifest gaps", () => {
    expect(publicationBlockers([], { ...complete, approvedBy: null })).toHaveLength(1);
    expect(
      publicationBlockers(
        [{ kind: "missing_component", severity: "blocking", detail: "No NAV." }],
        complete,
      ),
    ).toEqual(["No NAV."]);
    expect(publicationBlockers([], complete)).toEqual([]);
  });
});

describe("delivery", () => {
  it("never treats an email as portal access", () => {
    const state = deliveryState([
      { event: "published", created_at: "2026-04-01T00:00:00Z" },
      { event: "delivered", channel: "email", created_at: "2026-04-01T01:00:00Z" },
      { event: "opened", channel: "email", created_at: "2026-04-01T02:00:00Z" },
    ]);
    expect(state.delivered).not.toBeNull();
    expect(state.accessedInPortal).toBe(false);
  });

  it("records portal access as authoritative", () => {
    const state = deliveryState([
      { event: "opened", channel: "portal", created_at: "2026-04-02T00:00:00Z" },
      { event: "downloaded", channel: "portal", created_at: "2026-04-02T01:00:00Z" },
      { event: "acknowledged", channel: "portal", created_at: "2026-04-02T02:00:00Z" },
    ]);
    expect(state.accessedInPortal).toBe(true);
    expect(state.acknowledged).toBe("2026-04-02T02:00:00Z");
  });
});

describe("document library and branding", () => {
  it("groups documents by what they are", () => {
    expect(documentGroupFor("capital_call_notice")).toBe("Capital calls");
    expect(documentGroupFor("k-1")).toBe("Tax");
    expect(documentGroupFor("subscription_agreement")).toBe("Subscription and legal");
  });

  it("keeps the administrator attribution by default", () => {
    const branding = brandingFor("Growth Fund I", "Q1 2026", null);
    expect(branding.administrator).toBe("Administered by Harmonious");
    expect(branding.fundName).toBe("Growth Fund I");
  });

  it("uses fund branding where the fund configured it", () => {
    const branding = brandingFor("Growth Fund I", "Q1 2026", {
      branding: { fundName: "GF I", logoUrl: "https://example.com/logo.png" },
      administrator_attribution: "Administered by Harmonious",
      contact: { name: "Investor relations", email: "ir@example.com" },
    });
    expect(branding.fundName).toBe("GF I");
    expect(branding.contactEmail).toBe("ir@example.com");
  });
});
