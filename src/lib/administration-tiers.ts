// Canonical Harmonious administration tiers (pure). Prices/entitlements are
// the commercial source for pricing pages and quotes; a tier never grants access.

export type TierKey = "self_serve" | "core" | "fund_admin" | "white_glove" | "institutional" | "saas";

/** SaaS à la carte = Core à la carte price × this markup (fund documents are a fixed $500 each). */
export const SAAS_MARKUP = 1.5;
export const SAAS_FUND_DOCUMENT_CENTS = 50000;
/** SaaS keeps the October 2026 +25% uplift that standard prices no longer carry. */
export const SAAS_BASE_UPLIFT = 1.25;
export const saasPriceCents = (coreCents: number) => Math.round((coreCents * SAAS_BASE_UPLIFT * SAAS_MARKUP) / 100) * 100;
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
    key: "self_serve",
    name: "Self Serve",
    positioning: "Run your fund on the platform",
    statement: "You run it; the platform does the work.",
    operatingModel: "Included in the base fund price. Clients set up funds, generate Harmonious templates, invite investors and send documents for signature themselves. Help center support.",
    prices: null,
    selfServe: true,
    entitlements: [
      "Fund setup without Harmonious review", "Harmonious document templates, autofilled", "Investor invites, onboarding & e-signature",
      "Investor portal & document storage", "KYC/KYB/AML workflow", "Help center",
    ],
  },
  {
    key: "core",
    name: "Core Administration",
    positioning: "Essential SPV infrastructure",
    statement: "We provide the infrastructure.",
    operatingModel: "Buy-up from Self Serve: Harmonious support with a 72-hour response target.",
    prices: { annual: 15000, quarterly: 4250, monthly: 1500 },
    selfServe: false,
    includesPrevious: "self_serve",
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
    operatingModel: "Harmonious managed, we proactively manage recurring operational requirements so you don't have to remember routine deadlines.",
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

export const SAAS_TIER: AdministrationTier = {
  key: "saas",
  name: "SaaS",
  positioning: "Platform only",
  statement: "Software only, services when you need them.",
  operatingModel: "No Harmonious support. Buy services one at a time at SaaS à la carte prices (Core à la carte + markup); Harmonious fund documents are $500 each.",
  prices: null,
  selfServe: true,
  entitlements: ["Full platform access", "À la carte services on request", "Harmonious fund documents — $500 each"],
};
ADMINISTRATION_TIERS.push(SAAS_TIER);

export const tierByKey = (k: TierKey) => ADMINISTRATION_TIERS.find((t) => t.key === k)!;

/** Annual savings vs paying monthly, for "best value" messaging. */
export function annualSavings(t: AdministrationTier): number | null {
  if (!t.prices?.annual || !t.prices.monthly) return null;
  return t.prices.monthly * 12 - t.prices.annual;
}

// Ownership lanes, the central "who is this waiting on" concept.
export type OwnershipLane = "harmonious" | "your_approval" | "information_required" | "waiting_investor" | "waiting_third_party" | "completed";

export const OWNERSHIP_LANES: { key: OwnershipLane; label: string }[] = [
  { key: "harmonious", label: "Harmonious handling" },
  { key: "your_approval", label: "Your approval required" },
  { key: "information_required", label: "Information required" },
  { key: "waiting_investor", label: "Waiting on investor" },
  { key: "waiting_third_party", label: "Waiting on third party" },
  { key: "completed", label: "Completed" },
];
