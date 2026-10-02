/** Cap table service tiers. Prices mirror the Harmonious rate card (service_catalog). Annual = 10x monthly. */
export type CapTierKey = "free" | "starter" | "growth" | "scale" | "enterprise";
export type BillingInterval = "monthly" | "annual";

export const CAP_TABLE_TIERS: {
  key: CapTierKey; name: string; monthlyCents: number | null; stakeholders: string; highlights: string[]; contactSales?: boolean;
}[] = [
  { key: "free", name: "Free", monthlyCents: 0, stakeholders: "Up to 5 stakeholders", highlights: ["Automated cap table updates", "Dashboards", "Document vault", "Email support"] },
  { key: "starter", name: "Starter", monthlyCents: 12900, stakeholders: "Up to 25 stakeholders", highlights: ["Digital issuance of shares, SAFEs and units", "E-signatures and issuance tracking", "Basic reporting"] },
  { key: "growth", name: "Growth", monthlyCents: 29900, stakeholders: "Up to 50 stakeholders", highlights: ["Everything in Starter", "Waterfall and dilution modeling", "Vesting and option management", "Board approvals, priority support"] },
  { key: "scale", name: "Scale", monthlyCents: 59900, stakeholders: "Unlimited stakeholders", highlights: ["Everything in Growth", "Multi-entity management", "ASC 718 and audit-ready reporting"] },
  { key: "enterprise", name: "Enterprise", monthlyCents: null, stakeholders: "Custom", highlights: ["Custom scope and pricing", "Dedicated team"], contactSales: true },
];

export const priceIdFor = (tier: CapTierKey, interval: BillingInterval) => `cap_table_${tier}_${interval}`;
export const tierPriceCents = (monthlyCents: number, interval: BillingInterval) => (interval === "annual" ? monthlyCents * 10 : monthlyCents);
export const fmtUsd = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
