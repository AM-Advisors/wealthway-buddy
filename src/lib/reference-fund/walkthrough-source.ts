/**
 * DEMO / SYNTHETIC source package for the Harmonious Walkthrough reference fund.
 * Represents the fund's books at 2025-12-31, immediately before Harmonious takes over.
 * Every value is fictional. No real identities, tax numbers, banks or documents.
 *
 * Cents throughout. Ties by construction:
 *   contributions 10,000,000 - expenses 800,000 + unrealized gain 750,000 = NAV 9,950,000
 *   cash 1,750,000 + investments 8,250,000 - accrued 50,000 = NAV 9,950,000
 */
import type { OpeningPackage, SourceAccount, TargetAccount } from "@/lib/fund-migration-model";

const $ = (dollars: number) => Math.round(dollars * 100);

export const WALKTHROUGH_OFFERING_ID = "4014f341-8d38-4afc-9c18-ee21f8ae9224";
export const WALKTHROUGH_CUTOVER_DATE = "2025-12-31";

/** Commitments seeded on the Walkthrough fund (total exactly $25,000,000). */
export const WALKTHROUGH_INVESTORS = [
  { key: "Northwind Family Office LLC", cls: "A", commitment: 5_000_000, tax: true },
  { key: "Cedar Ridge Partners LP", cls: "A", commitment: 4_000_000, tax: true },
  { key: "Atlas Peak Holdings Corp.", cls: "A", commitment: 3_000_000, tax: true },
  { key: "Kestrel Holdings GmbH", cls: "A", commitment: 2_850_000, tax: true },
  { key: "Juniper Lane Ventures LLC", cls: "A", commitment: 2_500_000, tax: true },
  { key: "Harbor & Pine Family Trust", cls: "B", commitment: 2_000_000, tax: false },
  { key: "Silverline Advisory Clients LLC (RIA-managed)", cls: "B", commitment: 2_000_000, tax: true },
  { key: "Ada & Tunde Okafor (JTWROS)", cls: "B", commitment: 1_500_000, tax: true },
  { key: "Lena Rivera Self-Directed IRA", cls: "B", commitment: 1_000_000, tax: true },
  { key: "Erik Lindqvist", cls: "B", commitment: 750_000, tax: true },
  { key: "Blake Testholdings", cls: "B", commitment: 250_000, tax: true },
  { key: "Avery Testinvestor", cls: "B", commitment: 100_000, tax: true },
  { key: "Casey Testtrust", cls: "B", commitment: 50_000, tax: true },
] as const;

export const FUND_COMMITMENTS = $(25_000_000);
export const PRIOR_NAV = $(9_950_000);
/** Each investor's capital is their pro-rata share of NAV (commitment x 0.398). */
export const capitalFor = (commitmentDollars: number) => $(commitmentDollars * 0.398);

export const SOURCE_TRIAL_BALANCE: SourceAccount[] = [
  { code: "1000", name: "Operating cash", type: "asset", balanceCents: $(1_700_000) },
  { code: "1010", name: "Money market sweep", type: "asset", balanceCents: $(50_000) },
  { code: "1200", name: "Investments at cost", type: "asset", balanceCents: $(7_500_000) },
  { code: "1210", name: "Unrealized appreciation", type: "asset", balanceCents: $(750_000) },
  { code: "2000", name: "Accrued expenses", type: "liability", balanceCents: $(50_000) },
  { code: "3000", name: "Partners' contributed capital", type: "equity", balanceCents: $(10_000_000) },
  { code: "4100", name: "Unrealized gain on investments", type: "income", balanceCents: $(750_000) },
  { code: "5000", name: "Management fees", type: "expense", balanceCents: $(600_000) },
  { code: "5100", name: "Professional fees", type: "expense", balanceCents: $(200_000) },
];

export const HARMONIOUS_CHART: TargetAccount[] = [
  { code: "H-1000", name: "Cash", type: "asset" },
  { code: "H-1200", name: "Investments at fair value", type: "asset" },
  { code: "H-2000", name: "Accrued liabilities", type: "liability" },
  { code: "H-3000", name: "Partners' capital", type: "equity" },
  { code: "H-4100", name: "Unrealized gain", type: "income" },
  { code: "H-5000", name: "Management fee expense", type: "expense" },
  { code: "H-5150", name: "Legal & audit fees", type: "expense", authorizedBy: "demo-accounting-lead" },
  { code: "H-9999", name: "Suspense", type: "asset", isPlug: true },
];

/** Initial mapping as received: 1010 deliberately unmapped (exception). */
export const INITIAL_MAPPING: Record<string, string | null> = {
  "1000": "H-1000",
  "1010": null,
  "1200": "H-1200",
  "1210": "H-1200",
  "2000": "H-2000",
  "3000": "H-3000",
  "4100": "H-4100",
  "5000": "H-5000",
  "5100": "H-5150",
};

export const INVESTMENTS = [
  { name: "Lumen Bio, Inc. (Series A)", costCents: $(3_000_000), fairValueCents: $(3_500_000), valuationEvidence: false },
  { name: "Gridwise Energy, Inc. (Seed)", costCents: $(2_500_000), fairValueCents: $(2_750_000), valuationEvidence: true },
  { name: "Parcel Robotics, Inc. (SAFE)", costCents: $(2_000_000), fairValueCents: $(2_000_000), valuationEvidence: true },
];

/** Source package with the deliberate discrepancies the migration must catch. */
export function walkthroughOpeningPackage(opts: { withDiscrepancies: boolean }): OpeningPackage {
  const d = opts.withDiscrepancies;
  return {
    accounts: SOURCE_TRIAL_BALANCE,
    bankStatementCents: $(1_760_000),
    outstandingItemsCents: $(-10_000), // one outstanding check
    cashAccountCodes: ["1000", "1010"],
    investmentAccountCodes: ["1200", "1210"],
    investments: INVESTMENTS.map((i) => ({ ...i, valuationEvidence: d ? i.valuationEvidence : true })),
    investors: WALKTHROUGH_INVESTORS.map((i) => {
      const source = capitalFor(i.commitment);
      // Kestrel capital entered $100 high; Okafor commitment keyed as $1,600,000.
      const capital = d && i.key.startsWith("Kestrel") ? source + 10_000 : source;
      const commitment = d && i.key.startsWith("Ada") ? $(1_600_000) : $(i.commitment);
      return { key: i.key, commitmentCents: commitment, capitalCents: capital, sourceCapitalCents: source, sourceCommitmentCents: $(i.commitment), taxDocument: d ? i.tax : true };
    }),
    fundCommitmentsCents: FUND_COMMITMENTS,
    priorNavCents: PRIOR_NAV,
  };
}
