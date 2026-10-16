// Per-product commercial structure (pure): Fund cost -> Fund Administration -> Servicing -> À la carte.
// Administration = accounting work (GL, NAV, waterfalls, reporting, close).
// Servicing = how hands-on Harmonious is, split into client and investor servicing. No accounting items.
import { SAAS_BASE_UPLIFT, SAAS_FUND_DOCUMENT_CENTS, SAAS_MARKUP } from "./administration-tiers";

export type Billing = "quarterly" | "annual" | "one_time";
export const BILLING_LABEL: Record<Billing, string> = { quarterly: "Quarterly", annual: "Yearly", one_time: "One-time" };

/** amount null = custom quote. */
export interface Price { amount: number | null; billing: Billing; note?: string | undefined }
export interface Line { name: string; description?: string | undefined; prices: Price[]; items?: string[] | undefined }
export type ProductKey = "cap_table" | "venture" | "private_equity" | "hedge" | "spv" | "saas";
export interface Product {
  key: ProductKey; name: string; intro: string;
  fundCost: Line[]; administration: Line[];
  servicing: { client: Line[]; investor: Line[] };
  alaCarte: Line[]; openPoints: string[];
}

/** Annual price offered as yearly or quarterly (+10%). No monthly billing. */
export const cadences = (annual: number): Price[] => [
  { amount: annual, billing: "annual" },
  { amount: Math.round((annual / 4) * 1.1), billing: "quarterly" },
];
const once = (amount: number | null, note?: string): Price[] => [{ amount, billing: "one_time", note }];
const yearly = (amount: number | null, note?: string): Price[] => [{ amount, billing: "annual", note }];

export const ACCOUNTING_TERMS = ["general ledger", "nav", "waterfall", "quarterly report", "monthly close", "bank reconciliation", "trial balance"];

// Servicing (shared by fund products) — support and hands-on level only.
const CLIENT_SERVICING: Line[] = [
  { name: "Self Serve", description: "You run it on the platform. Help center only.", prices: yearly(0, "Included"), items: ["Help center", "Self-serve setup, templates and e-signature"] },
  { name: "Core", description: "72-hour response.", prices: cadences(3000), items: ["Email support, 72-hour response", "Setup and document review on request"] },
  { name: "Plus", description: "48-hour response, named contact.", prices: cadences(8000), items: ["Named relationship contact", "48-hour response", "Quarterly check-in call"] },
  { name: "White Glove", description: "24-hour response, proactive management.", prices: cadences(24000), items: ["Named administrator", "24-hour priority response", "Proactive deadline and calendar management", "GP approval workflows run for you"] },
  { name: "Institutional", description: "Dedicated team, custom SLAs.", prices: yearly(null, "Custom quote"), items: ["Dedicated team", "Custom SLAs and approval controls"] },
];
/** Investor servicing tiers: one yearly price per fund, set by number of investors. */
export interface InvestorTier { key: string; name: string; maxInvestors: number | null; annual: number | null; items: string[] }
export const INVESTOR_TIERS: InvestorTier[] = [
  { key: "self_serve", name: "Self Serve", maxInvestors: null, annual: 0, items: ["Investor portal", "Automated onboarding and reminders", "Questions go to the fund manager"] },
  { key: "essentials", name: "Essentials", maxInvestors: 25, annual: 1500, items: ["Everything in Self Serve", "Investor questions answered by email", "Chasing missing onboarding items"] },
  { key: "standard", name: "Standard", maxInvestors: 75, annual: 3500, items: ["Everything in Essentials", "KYC/AML exception follow-up", "Statement and tax-document (K-1) delivery help"] },
  { key: "plus", name: "Plus", maxInvestors: 150, annual: 6500, items: ["Everything in Standard", "Named investor contact", "Phone support", "Transfers and contact-change help"] },
  { key: "premier", name: "Premier", maxInvestors: 300, annual: 11000, items: ["Everything in Plus", "Same-day responses", "Capital call and distribution notice help", "Quarterly investor-activity report to the manager"] },
  { key: "institutional", name: "Institutional", maxInvestors: null, annual: null, items: ["Dedicated investor team", "Custom service levels"] },
];
const PAID_TIERS = INVESTOR_TIERS.filter((t) => t.maxInvestors != null);
/** Smallest paid tier that covers this many investors (Institutional above 300). */
export function investorTierFor(count: number): InvestorTier {
  return PAID_TIERS.find((t) => count <= t.maxInvestors!) ?? INVESTOR_TIERS.find((t) => t.key === "institutional")!;
}
const tierRange = (t: InvestorTier, i: number) => t.key === "self_serve" ? "Any number of investors" : t.key === "institutional" ? "300+ investors" : `${i === 1 ? "Up to" : `${(PAID_TIERS[i - 2]!.maxInvestors! + 1)}-`}${i === 1 ? " " : ""}${t.maxInvestors} investors`;
const investorLines = (mult = 1): Line[] => INVESTOR_TIERS.map((t, i) => ({
  name: `${t.name} investor servicing`, description: tierRange(t, i), items: t.items,
  prices: t.annual == null ? yearly(null, "Custom quote") : t.annual === 0 ? yearly(0, "Included") : cadences(Math.round(t.annual * mult)),
}));
const INVESTOR_SERVICING: Line[] = investorLines();

const FUND_A_LA_CARTE: Line[] = [
  { name: "Per-investor onboarding help (Self Serve funds)", prices: once(50, "per investor") },
  { name: "Harmonious fund documents (OA, PPM, Subscription Agreement)", prices: once(500, "each") },
  { name: "K-1 / 1065 / 1042-S services", prices: yearly(2500) },
  { name: "Financial statements", prices: once(2500, "per report") },
  { name: "Financial review", prices: once(7500, "per review") },
  { name: "Delaware Management LLC", prices: yearly(2000) },
  { name: "Delaware Master LLC", prices: yearly(2500) },
  { name: "Capital call", prices: once(2000, "each") },
  { name: "Additional close", prices: once(2000, "each") },
  { name: "Additional asset", prices: once(2000, "each") },
  { name: "Additional cash distribution", prices: once(2000, "each") },
  { name: "Membership transfer", prices: once(1500, "each") },
  { name: "Side letter", prices: once(1000, "each") },
  { name: "Entity shutdown / dissolution", prices: once(1500) },
  { name: "Form D filing (Harmonious fee)", prices: once(160) },
  { name: "Blue Sky filings", prices: once(null, "At cost, pass-through") },
];

const fundCost: Line[] = [{ name: "Fund platform fee", description: "Base price for every fund: portal, investor records, documents, e-signature, KYC/AML workflow.", prices: cadences(2500) }];
const fundAdmin = (nav: "quarterly" | "monthly", annual: number): Line => ({
  name: nav === "monthly" ? "Fund Administration — monthly NAV" : "Fund Administration — quarterly NAV",
  description: "Accounting work, priced separately from servicing.",
  prices: cadences(annual),
  items: ["General ledger, trial balance and bank reconciliation", nav === "monthly" ? "Monthly close and monthly NAV" : "Quarterly close and quarterly NAV",
    "Capital accounts, contributions and distributions", "Management fee and waterfall calculations", "Quarterly reporting package and schedule of investments", "Year-end package for tax and audit"],
});

function fundProduct(key: ProductKey, name: string, intro: string, admin: Line[], extra: string[]): Product {
  return { key, name, intro, fundCost, administration: admin, servicing: { client: CLIENT_SERVICING, investor: INVESTOR_SERVICING }, alaCarte: FUND_A_LA_CARTE,
    openPoints: ["Administration and servicing were split so they add up to today's tier totals (Core $15,000, Fund Admin $20,000, White Glove $36,000). Confirm the split.", ...extra] };
}

export const PRODUCTS: Product[] = [
  {
    key: "cap_table", name: "Cap Table", intro: "Ownership records, share issuance and stakeholder portal for companies.",
    fundCost: [
      { name: "Free", description: "Up to 5 stakeholders", prices: yearly(0, "Free") },
      { name: "Starter", description: "Up to 25 stakeholders", prices: [{ amount: 1200, billing: "annual" }] },
      { name: "Growth", description: "Up to 50 stakeholders", prices: [{ amount: 3000, billing: "annual" }] },
      { name: "Scale", description: "Unlimited stakeholders", prices: [{ amount: 5990, billing: "annual" }] },
      { name: "Enterprise", description: "Custom", prices: yearly(null, "Custom quote") },
    ],
    administration: [{ name: "Ledger administration", description: "Share ledger, issuances and certificates are included in the plan.", prices: yearly(0, "Included") }],
    servicing: {
      client: [CLIENT_SERVICING[0]!, { name: "Managed cap table", description: "Harmonious records issuances and transfers for you.", prices: cadences(3000) }],
      investor: [{ name: "Stakeholder portal", description: "Holders view their shares and certificates.", prices: yearly(0, "Included") }],
    },
    alaCarte: [{ name: "Membership / share transfer", prices: once(1500, "each") }, { name: "Cap table migration", prices: once(null, "Custom quote") }],
    openPoints: ["25% increase removed. Rate card says Starter $150 / Growth $300; card checkout charges $129 / $299. Sheet uses the rate card — confirm which is right.", "Monthly billing removed; cap table plans are yearly only. Card checkout charges the existing yearly prices ($1,290 / $2,990 / $5,990). Confirm."],
  },
  fundProduct("venture", "Venture Funds", "Closed-end venture funds with capital calls and quarterly reporting.", [fundAdmin("quarterly", 12000)], []),
  fundProduct("private_equity", "Private Equity Funds", "Closed-end PE funds with capital calls, waterfalls and quarterly NAV.", [fundAdmin("quarterly", 12000)], ["Private Equity uses the same administration price as Venture. Confirm or set a higher price for complex waterfalls."]),
  fundProduct("hedge", "Hedge Funds", "Open-end funds with subscriptions, redemptions and monthly NAV.", [fundAdmin("monthly", 19200)], ["Hedge Fund Administration assumed at $19,200/yr because of monthly NAV. Confirm."]),
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
      client: [CLIENT_SERVICING[0]!,
        { name: "Core", description: "72-hour response.", prices: cadences(1500), items: ["Email support, 72-hour response", "Document review on request"] },
        { name: "Plus", description: "48-hour response, named contact.", prices: cadences(2500), items: ["Named relationship contact", "48-hour response"] },
        { name: "White Glove", description: "24-hour response, proactive management.", prices: cadences(7500), items: ["Named administrator", "24-hour priority response", "Proactive deadline management"] },
        { name: "Institutional", description: "Dedicated team, custom SLAs.", prices: yearly(null, "Custom quote"), items: ["Dedicated team", "Custom SLAs"] }],
      investor: INVESTOR_SERVICING,
    },
    alaCarte: FUND_A_LA_CARTE,
    openPoints: ["SPV Core $1,500/yr is a placeholder. Confirm.", "All non-SaaS prices are back to before the 25% increase."],
  },
  {
    key: "saas", name: "SaaS Platform", intro: "Platform only, no Harmonious support. Buy services one at a time.",
    fundCost: [{ name: "Platform fee", description: "Full platform access per fund.", prices: cadences(Math.round(2500 * SAAS_BASE_UPLIFT)) }],
    administration: [{ name: "Fund Administration", description: "Not included. Available à la carte.", prices: yearly(null, "SaaS à la carte price") }],
    servicing: { client: [{ name: "No Harmonious support", description: "Help center only.", prices: yearly(0, "Included") }], investor: investorLines(SAAS_BASE_UPLIFT * SAAS_MARKUP) },
    alaCarte: FUND_A_LA_CARTE.map((l) => l.name.startsWith("Harmonious fund documents")
      ? { ...l, prices: once(SAAS_FUND_DOCUMENT_CENTS / 100, "each, fixed") }
      : { ...l, prices: l.prices.map((p) => (p.amount == null || /Form D|Blue Sky/.test(l.name) ? p : { ...p, amount: Math.round(p.amount * SAAS_BASE_UPLIFT * SAAS_MARKUP) })) }),
    openPoints: ["SaaS keeps the 25% increase: à la carte = pre-increase price × 1.25 × 1.5 (Form D and Blue Sky unchanged). Confirm."],
  },
];

export const productByKey = (k: ProductKey) => PRODUCTS.find((p) => p.key === k)!;
export const allLines = (p: Product) => [...p.fundCost, ...p.administration, ...p.servicing.client, ...p.servicing.investor, ...p.alaCarte];
