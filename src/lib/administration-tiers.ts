// Canonical Harmonious administration tiers (pure). Prices/entitlements are
// the commercial source for pricing pages and quotes; a tier never grants access.

export type TierKey = "core" | "fund_admin" | "white_glove" | "institutional";
export type BillingCadence = "annual" | "quarterly" | "monthly";

export interface AdministrationTier {
  key: TierKey;
  name: string;
  positioning: string;
  statement: string;
  operatingModel: string;
  /** null = not separately priced (Core) or custom (Institutional). */
  prices: Partial<Record<BillingCadence, number>> | null;
  startingAnnual?: number;
  selfServe: boolean;
  includesPrevious?: TierKey;
  scope?: string[];
  entitlements: string[];
}

export const ADMINISTRATION_TIERS: AdministrationTier[] = [
  {
    key: "core",
    name: "Core Administration",
    positioning: "Essential SPV infrastructure",
    statement: "We provide the infrastructure.",
    operatingModel: "Included with Harmonious-administered SPVs",
    prices: null,
    selfServe: false,
    entitlements: [
      "Investor records & portal", "KYC/KYB/AML workflow", "Accreditation workflow",
      "Subscription & commitment tracking", "Funding status", "Document storage",
      "Basic investor communications", "Capital contribution & distribution tracking",
      "Basic SPV accounting & general ledger", "Bank reconciliation", "Expense tracking",
      "Investor capital balances", "Basic entity reporting", "Tax-document delivery",
    ],
  },
  {
    key: "fund_admin",
    name: "Fund Administration",
    positioning: "Complete Fund Administration",
    statement: "We administer the fund.",
    operatingModel: "Collaborative — Harmonious owns normal administration; the GP initiates or approves material fund actions.",
    prices: { annual: 20000, quarterly: 5500, monthly: 2000 },
    selfServe: true,
    scope: ["1 Fund, 1 GP, 1 Management Company", "Up to 50 investors", "Standard structure & waterfall", "Quarterly NAV & reporting"],
    entitlements: [
      "Fund general ledger, trial balance & GL reports", "Bank reconciliation", "Investment accounting",
      "Capital accounts, contributions & distributions", "Standard management fee & waterfall calculations",
      "Quarterly NAV, quarterly & year-end close", "Schedule of investments",
      "Investor onboarding, capital calls & statements", "Investor transfers & document delivery",
      "Quarterly reporting package", "Fund operating calendar", "Service requests & task management",
      "Tax preparer & audit coordination", "Regulatory deadline tracking",
    ],
  },
  {
    key: "white_glove",
    name: "White Glove Fund Administration",
    positioning: "Managed Fund Operations",
    statement: "We run the back office with you.",
    operatingModel: "Harmonious managed — we proactively manage recurring operational requirements so you don't have to remember routine deadlines.",
    prices: { annual: 36000, quarterly: 10000, monthly: 3500 },
    selfServe: true,
    includesPrevious: "fund_admin",
    entitlements: [
      "Named Primary Fund Administrator & Relationship Lead", "Priority support",
      "Monthly accounting close & enhanced monthly reporting", "Monthly NAV where contracted",
      "Quarterly operating review", "Enhanced waterfall & management fee support", "Treasury coordination",
      "Proactive capital-call & distribution administration", "Investor inquiry & exception management",
      "Proactive KYC/AML follow-up", "Regulatory & entity compliance calendar management",
      "GP approval workflows", "Custom manager reports", "Executive Fund Dashboard",
    ],
  },
  {
    key: "institutional",
    name: "Institutional Fund Administration",
    positioning: "Outsourced Fund Operations",
    statement: "We become your operating infrastructure.",
    operatingModel: "Dedicated administration team with custom SLAs and approval controls.",
    prices: null,
    startingAnnual: 60000,
    selfServe: false,
    includesPrevious: "white_glove",
    entitlements: [
      "Dedicated team & senior accounting review", "Multiple funds, entities & classes",
      "Parallel vehicles, feeders, blockers, master-feeder", "Complex allocations & waterfalls",
      "Institutional LP & board reporting", "Multi-bank treasury", "International investors & withholding",
      "Consolidated & custom reporting", "API integrations & custom data exports", "Bespoke workflows",
    ],
  },
];

export const tierByKey = (k: TierKey) => ADMINISTRATION_TIERS.find((t) => t.key === k)!;

/** Annual savings vs paying monthly, for "best value" messaging. */
export function annualSavings(t: AdministrationTier): number | null {
  if (!t.prices?.annual || !t.prices.monthly) return null;
  return t.prices.monthly * 12 - t.prices.annual;
}

// Ownership lanes — the central "who is this waiting on" concept.
export type OwnershipLane = "harmonious" | "your_approval" | "information_required" | "waiting_investor" | "waiting_third_party" | "completed";

export const OWNERSHIP_LANES: { key: OwnershipLane; label: string }[] = [
  { key: "harmonious", label: "Harmonious handling" },
  { key: "your_approval", label: "Your approval required" },
  { key: "information_required", label: "Information required" },
  { key: "waiting_investor", label: "Waiting on investor" },
  { key: "waiting_third_party", label: "Waiting on third party" },
  { key: "completed", label: "Completed" },
];
