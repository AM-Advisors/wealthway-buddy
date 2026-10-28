// Maps approved fund economics classes to live investor_classes rows.
// Pure: no I/O. Only approved economics may feed this.

export type EconomicsClass = {
  key?: string;
  name?: string;
  appliesTo?: string;
  minInvestmentCents?: number | null;
  maxInvestmentCents?: number | null;
  preferredReturnPercent?: number | null;
  managementFeePercent?: number | null;
  carryPercent?: number | null;
  otherDifferences?: string | null;
};

export type InvestorClassRow = {
  offering_id: string;
  code: string;
  name: string;
  series_label: string | null;
  version: number;
  preferred_return_bps: number | null;
  management_fee_bps: number | null;
  carry_bps: number | null;
  liquidity_terms: string | null;
  effective_from: string;
  terms: Record<string, unknown>;
};

const bps = (p: number | null | undefined) =>
  typeof p === "number" && Number.isFinite(p) ? Math.round(p * 100) : null;

export function classRowsFromEconomics(
  offeringId: string,
  classes: EconomicsClass[],
  version: number,
  effectiveFrom: string,
): InvestorClassRow[] {
  return classes
    .filter((c) => c && (c.key || c.name))
    .map((c) => {
      const name = (c.name ?? c.key ?? "").trim();
      const series = name.match(/Series\s+[A-Z0-9-]+/i)?.[0] ?? null;
      const lockup = /lock-?up/i.test(`${c.appliesTo ?? ""} ${c.otherDifferences ?? ""}`)
        ? (c.otherDifferences ?? c.appliesTo ?? null)
        : null;
      return {
        offering_id: offeringId,
        code: (c.key ?? name).trim(),
        name,
        series_label: series,
        version,
        preferred_return_bps: bps(c.preferredReturnPercent),
        management_fee_bps: bps(c.managementFeePercent),
        carry_bps: bps(c.carryPercent),
        liquidity_terms: lockup,
        effective_from: effectiveFrom,
        terms: {
          appliesTo: c.appliesTo ?? null,
          minInvestmentCents: c.minInvestmentCents ?? null,
          maxInvestmentCents: c.maxInvestmentCents ?? null,
          otherDifferences: c.otherDifferences ?? null,
          source: "fund_economics_versions",
        },
      };
    });
}
