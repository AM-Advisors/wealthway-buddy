// Per-product commercial structure (pure): Fund cost -> Fund Administration -> Servicing -> À la carte.
// Administration = accounting work (GL, NAV, waterfalls, reporting, close).
// Servicing = how hands-on Harmonious is, split into client and investor servicing. No accounting items.
import { SAAS_FUND_DOCUMENT_CENTS, SAAS_MARKUP } from "./administration-tiers";

export type Billing = "monthly" | "quarterly" | "annual" | "one_time";
export const BILLING_LABEL: Record<Billing, string> = { monthly: "Monthly", quarterly: "Quarterly", annual: "Yearly", one_time: "One-time" };

/** amount null = custom quote. */
export interface Price { amount: number | null; billing: Billing; note?: string }
export interface Line { name: string; description?: string; prices: Price[]; items?: string[] }
export type ProductKey = "cap_table" | "venture" | "private_equity" | "hedge" | "spv" | "saas";
export interface Product {
  key: ProductKey; name: string; intro: string;
  fundCost: Line[]; administration: Line[];
  servicing: { client: Line[]; investor: Line[] };
  alaCarte: Line[]; openPoints: string[];
}

/** Annual price offered as yearly, quarterly (+10%) and monthly (+20%). */
export const cadences = (annual: number): Price[] => [
  { amount: annual, billing: "annual" },
  { amount: Math.round((annual / 4) * 1.1), billing: "quarterly" },
  { amount: Math.round((annual / 12) * 1.2), billing: "monthly" },
];
const once = (amount: number | null, note?: string): Price[] => [{ amount, billing: "one_time", note }];
const yearly = (amount: number | null, note?: string): Price[] => [{ amount, billing: "annual", note }];

export const ACCOUNTING_TERMS = ["general ledger", "nav", "waterfall", "quarterly report", "monthly close", "bank reconciliation", "trial balance"];

// Servicing (shared by fund products) — support and hands-on level only.
const CLIENT_SERVICING: Line[] = [
  { name: "Self Serve", description: "You run it on the platform. Help center only.", prices: yearly(0, "Included"), items: ["Help center", "Self-serve setup, templates and e-signature"] },
  { name: "Core", description: "72-hour response.", prices: cadences(3750), items: ["Email support, 72-hour response", "Setup and document review on request"] },
  { name: "Plus", description: "48-hour response, named contact.", prices: cadences(10000), items: ["Named relationship contact", "48-hour response", "Quarterly check-in call"] },
  { name: "White Glove", description: "24-hour response, proactive management.", prices: cadences(30000), items: ["Named administrator", "24-hour priority response", "Proactive deadline and calendar management", "GP approval workflows run for you"] },
  { name: "Institutional", description: "Dedicated team, custom SLAs.", prices: yearly(null, "Custom quote"), items: ["Dedicated team", "Custom SLAs and approval controls"] },
];
const INVESTOR_SERVICING: Line[] = [
  { name: "Self Serve investors", description: "Investors use the portal; questions go to the fund manager.", prices: yearly(0, "Included"), items: ["Investor portal", "Automated onboarding and reminders"] },
  { name: "Managed investor support", description: "Harmonious answers investor questions and chases missing items.", prices: cadences(3125), items: ["Investor inquiry handling", "Onboarding follow-up and KYC exception chasing", "Statement and tax-document delivery help"] },
  { name: "Per-investor onboarding help", prices: once(63, "per investor") },
];

const FUND_A_LA_CARTE: Line[] = [
  { name: "Harmonious fund documents (OA, PPM, Subscription Agreement)", prices: once(500, "each") },
  { name: "K-1 / 1065 / 1042-S services", prices: yearly(3125) },
  { name: "Financial statements", prices: once(3125, "per report") },
  { name: "Financial review", prices: once(9375, "per review") },
  { name: "Delaware Management LLC", prices: yearly(2500) },
  { name: "Delaware Master LLC", prices: yearly(3125) },
  { name: "Capital call", prices: once(2500, "each") },
  { name: "Additional close", prices: once(2500, "each") },
  { name: "Additional asset", prices: once(2500, "each") },
  { name: "Additional cash distribution", prices: once(2500, "each") },
  { name: "Membership transfer", prices: once(1875, "each") },
  { name: "Side letter", prices: once(1250, "each") },
  { name: "Entity shutdown / dissolution", prices: once(1875) },
  { name: "Form D filing (Harmonious fee)", prices: once(160) },
  { name: "Blue Sky filings", prices: once(null, "At cost, pass-through") },
];

const fundCost: Line[] = [{ name: "Fund platform fee", description: "Base price for every fund: portal, investor records, documents, e-signature, KYC/AML workflow.", prices: cadences(3125) }];
const fundAdmin = (nav: "quarterly" | "monthly", annual: number): Line => ({
  name: nav === "monthly" ? "Fund Administration — monthly NAV" : "Fund Administration — quarterly NAV",
  description: "Accounting work, priced separately from servicing.",
  prices: cadences(annual),
  items: ["General ledger, trial balance and bank reconciliation", nav === "monthly" ? "Monthly close and monthly NAV" : "Quarterly close and quarterly NAV",
    "Capital accounts, contributions and distributions", "Management fee and waterfall calculations", "Quarterly reporting package and schedule of investments", "Year-end package for tax and audit"],
});

function fundProduct(key: ProductKey, name: string, intro: string, admin: Line[], extra: string[]): Product {
  return { key, name, intro, fundCost, administration: admin, servicing: { client: CLIENT_SERVICING, investor: INVESTOR_SERVICING }, alaCarte: FUND_A_LA_CARTE,
    openPoints: ["Administration and servicing were split so they add up to today's tier totals (Core $18,750, Fund Admin $25,000, White Glove $45,000). Confirm the split.", ...extra] };
}

export const PRODUCTS: Product[] = [
  {
    key: "cap_table", name: "Cap Table", intro: "Ownership records, share issuance and stakeholder portal for companies.",
    fundCost: [
      { name: "Free", description: "Up to 5 stakeholders", prices: [{ amount: 0, billing: "monthly" }] },
      { name: "Starter", description: "Up to 25 stakeholders", prices: [{ amount: 188, billing: "monthly" }, { amount: 1500, billing: "annual" }] },
      { name: "Growth", description: "Up to 50 stakeholders", prices: [{ amount: 375, billing: "monthly" }, { amount: 3750, billing: "annual" }] },
      { name: "Scale", description: "Unlimited stakeholders", prices: [{ amount: 749, billing: "monthly" }, { amount: 7490, billing: "annual" }] },
      { name: "Enterprise", description: "Custom", prices: yearly(null, "Custom quote") },
    ],
    administration: [{ name: "Ledger administration", description: "Share ledger, issuances and certificates are included in the plan.", prices: yearly(0, "Included") }],
    servicing: {
      client: [CLIENT_SERVICING[0], { name: "Managed cap table", description: "Harmonious records issuances and transfers for you.", prices: cadences(3750) }],
      investor: [{ name: "Stakeholder portal", description: "Holders view their shares and certificates.", prices: yearly(0, "Included") }],
    },
    alaCarte: [{ name: "Membership / share transfer", prices: once(1875, "each") }, { name: "Cap table migration", prices: once(null, "Custom quote") }],
    openPoints: ["Rate card says Starter $188 / Growth $375; the plan file said $161 / $374. Sheet uses the rate card.", "Scale shows $749/mo; rate card listed it as custom. Confirm."],
  },
  fundProduct("venture", "Venture Funds", "Closed-end venture funds with capital calls and quarterly reporting.", [fundAdmin("quarterly", 15000)], []),
  fundProduct("private_equity", "Private Equity Funds", "Closed-end PE funds with capital calls, waterfalls and quarterly NAV.", [fundAdmin("quarterly", 15000)], ["Private Equity uses the same administration price as Venture. Confirm or set a higher price for complex waterfalls."]),
  fundProduct("hedge", "Hedge Funds", "Open-end funds with subscriptions, redemptions and monthly NAV.", [fundAdmin("monthly", 24000)], ["Hedge Fund Administration assumed at $24,000/yr because of monthly NAV. Confirm."]),
  {
    key: "spv", name: "SPVs", intro: "Single-asset SPVs. One-time fee by capital raised (pre-increase prices restored).",
    fundCost: [
      { name: "Raise under $250,000", prices: once(5000) },
      { name: "Raise $250,000 – $1,000,000", prices: once(7500) },
      { name: "Raise $1,000,000 – $5,000,000", prices: once(12500) },
      { name: "Raise $5,000,000 – $10,000,000", prices: once(15000) },
      { name: "Raise over $10,000,000", prices: once(null, "Custom quote") },
    ],
    administration: [
      { name: "SPV administration", description: "Included in the one-time fee.", prices: once(0, "Included"), items: ["General ledger and bank reconciliation", "Contributions, distributions and expenses", "Investor capital balances", "Tax document delivery"] },
      { name: "Enhanced SPV administration", description: "Added on top of the one-time fee.", prices: yearly(2500, "from"), items: ["Investor statements", "Annual financial package", "Investment value tracking", "Enhanced distribution calculations"] },
    ],
    servicing: {
      client: [CLIENT_SERVICING[0], { name: "Core", description: "72-hour response.", prices: once(0, "Included in SPV fee") }, { name: "White Glove", description: "Named administrator, proactive management.", prices: yearly(7500, "from") }],
      investor: INVESTOR_SERVICING,
    },
    alaCarte: FUND_A_LA_CARTE,
    openPoints: ["SPV Plus ($2,500/yr) mostly covered accounting work, so it is now 'Enhanced SPV administration'. Confirm.", "SPV prices restored to before the 25% increase."],
  },
  {
    key: "saas", name: "SaaS Platform", intro: "Platform only, no Harmonious support. Buy services one at a time.",
    fundCost: [{ name: "Platform fee", description: "Full platform access per fund.", prices: cadences(3125) }],
    administration: [{ name: "Fund Administration", description: "Not included. Available à la carte.", prices: yearly(null, `Core price + ${Math.round((SAAS_MARKUP - 1) * 100)}%`) }],
    servicing: { client: [{ name: "No Harmonious support", description: "Help center only.", prices: yearly(0, "Included") }], investor: [{ name: "Investor portal", prices: yearly(0, "Included") }] },
    alaCarte: FUND_A_LA_CARTE.map((l) => l.name.startsWith("Harmonious fund documents")
      ? { ...l, prices: once(SAAS_FUND_DOCUMENT_CENTS / 100, "each, fixed") }
      : { ...l, prices: l.prices.map((p) => (p.amount == null || /Form D|Blue Sky/.test(l.name) ? p : { ...p, amount: Math.round(p.amount * SAAS_MARKUP) })) }),
    openPoints: ["SaaS à la carte = standard price + 50% (Form D and Blue Sky unchanged). Confirm markup."],
  },
];

export const productByKey = (k: ProductKey) => PRODUCTS.find((p) => p.key === k)!;
export const allLines = (p: Product) => [...p.fundCost, ...p.administration, ...p.servicing.client, ...p.servicing.investor, ...p.alaCarte];
