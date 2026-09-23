/**
 * Single source of truth for the public marketing website.
 *
 * - Navigation, footer, CTAs, approved metrics, disclosures and pricing live here.
 * - Editing a value here updates every marketing page; nothing is duplicated per page.
 * - Nothing in this file grants application authority. CTAs only route to public
 *   pages (contact form, signup), never into authenticated workflows.
 */

/** Future canonical marketing origin. Every marketing canonical/og:url uses it. */
export const MARKETING_ORIGIN = "https://www.harmonious.co";

/** Hosts that serve the application — never treated as marketing sites. */
export const APPLICATION_HOSTS = [
  "app.harmonious.co",
  "portal.harmonious.co",
  "onboard.harmonious.co",
  "ops.harmonious.co",
] as const;

export const ORGANIZATION = {
  name: "Harmonious",
  legalName: "Harmonious Capital Administration",
  url: MARKETING_ORIGIN,
  logo: `${MARKETING_ORIGIN}/favicon.png`,
  email: "support@harmonious.co",
  /** Only add profiles that are active and approved. */
  sameAs: [] as string[],
};

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

/**
 * `live` items render. `planned` items stay hidden until a real, reviewed page
 * exists — the menu never links to thin placeholder pages.
 */
export type NavStatus = "live" | "planned";
export interface NavItem {
  label: string;
  href: string;
  status: NavStatus;
  description?: string;
}
export interface NavGroup {
  label: string;
  /** Group landing page, when one exists. */
  href?: string;
  items: NavItem[];
}

export const MARKETING_NAV: NavGroup[] = [
  {
    label: "Platform",
    href: "/platform",
    items: [
      { label: "Platform overview", href: "/platform", status: "live" },
      { label: "Investor Onboarding", href: "/investor-onboarding", status: "planned" },
      { label: "KYC, KYB & AML", href: "/kyc-aml", status: "planned" },
      { label: "Fund Accounting", href: "/fund-accounting", status: "planned" },
      { label: "NAV & Valuations", href: "/nav-calculation", status: "planned" },
      { label: "Capital & Banking", href: "/capital-banking", status: "planned" },
      { label: "Investor Reporting", href: "/investor-reporting", status: "planned" },
      { label: "Documents & Deal Room", href: "/deal-room", status: "planned" },
      { label: "Tax Operations", href: "/fund-tax-services", status: "planned" },
      { label: "Regulatory Workflows", href: "/regulatory-filings", status: "planned" },
    ],
  },
  {
    label: "Fund Administration",
    href: "/fund-administration",
    items: [
      { label: "Overview", href: "/fund-administration", status: "live" },
      { label: "Venture Capital", href: "/venture-capital-fund-administration", status: "planned" },
      { label: "Private Equity", href: "/private-equity-fund-administration", status: "planned" },
      { label: "Hedge Funds", href: "/hedge-fund-administration", status: "planned" },
      { label: "Real Estate Funds", href: "/real-estate-fund-administration", status: "planned" },
      { label: "Emerging Managers", href: "/emerging-fund-managers", status: "planned" },
    ],
  },
  {
    label: "SPVs",
    href: "/spvs",
    items: [
      { label: "SPV Administration", href: "/spvs", status: "live" },
      { label: "Founder SPVs", href: "/founder-spvs", status: "planned" },
      { label: "Secondary SPVs", href: "/secondary-spvs", status: "planned" },
      { label: "Syndicates", href: "/syndicates", status: "planned" },
    ],
  },
  {
    label: "Cap Tables",
    href: "/cap-table-management",
    items: [
      { label: "Cap Table Management", href: "/cap-table-management", status: "live" },
      { label: "Stakeholders & Securities", href: "/stakeholders-securities", status: "planned" },
      { label: "Cap Table Migration", href: "/cap-table-migration", status: "planned" },
    ],
  },
  {
    label: "Solutions",
    items: [
      { label: "Fund Managers", href: "/solutions/fund-managers", status: "planned" },
      { label: "Founders & Companies", href: "/solutions/founders", status: "planned" },
      { label: "Investors", href: "/solutions/investors", status: "planned" },
      { label: "Law Firms", href: "/solutions/law-firms", status: "planned" },
      { label: "Family Offices", href: "/solutions/family-offices", status: "planned" },
      { label: "Advisers / Professional Partners", href: "/solutions/partners", status: "planned" },
    ],
  },
  {
    label: "Resources",
    href: "/harmoniousclassroom",
    items: [
      { label: "Guides / Classroom", href: "/harmoniousclassroom", status: "live" },
    ],
  },
  {
    label: "Pricing",
    href: "/pricing",
    items: [],
  },
  {
    label: "Company",
    href: "/about",
    items: [
      { label: "About", href: "/about", status: "live" },
      { label: "Leadership", href: "/leadership", status: "planned" },
      { label: "Partners", href: "/partners", status: "planned" },
      { label: "Security / Trust", href: "/security", status: "planned" },
      { label: "Careers", href: "/careers", status: "planned" },
      { label: "Contact", href: "/contactus", status: "live" },
    ],
  },
];

/** Resource categories — used by the Classroom hub and article model. */
export const RESOURCE_CATEGORIES = [
  { slug: "spvs", label: "SPVs", pillar: "/spvs" },
  { slug: "fund-administration", label: "Fund Administration", pillar: "/fund-administration" },
  { slug: "fund-accounting", label: "Fund Accounting", pillar: "/fund-administration" },
  { slug: "investor-onboarding", label: "Investor Onboarding", pillar: "/platform" },
  { slug: "cap-tables", label: "Cap Tables", pillar: "/cap-table-management" },
  { slug: "compliance", label: "Compliance", pillar: "/platform" },
  { slug: "tax-reporting", label: "Tax & Reporting", pillar: "/fund-administration" },
  { slug: "private-markets", label: "Private Markets", pillar: "/" },
] as const;
export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number]["slug"];

/** Visible navigation only: planned items and empty groups are dropped. */
export function visibleNav(nav: NavGroup[] = MARKETING_NAV): NavGroup[] {
  return nav
    .map((g) => ({ ...g, items: g.items.filter((i) => i.status === "live") }))
    .filter((g) => g.href || g.items.length > 0);
}

// ---------------------------------------------------------------------------
// Calls to action
// ---------------------------------------------------------------------------

export type CtaId =
  | "schedule_demo"
  | "start_spv"
  | "request_fund_admin"
  | "switch_administrator"
  | "start_cap_table"
  | "migrate_cap_table"
  | "partner"
  | "talk_to_administrator";

/** Lead intents shown on the contact form ("What can we help with?"). */
export const LEAD_INTENTS = [
  { value: "fund_administration", label: "Fund Administration" },
  { value: "spv", label: "SPV" },
  { value: "cap_table", label: "Cap Table" },
  { value: "investor_onboarding", label: "Investor Onboarding" },
  { value: "fund_migration", label: "Existing Fund Migration" },
  { value: "partnership", label: "Partnership" },
  { value: "other", label: "Other" },
] as const;
export type LeadIntent = (typeof LEAD_INTENTS)[number]["value"];

export const CTAS: Record<CtaId, { label: string; intent: LeadIntent }> = {
  schedule_demo: { label: "Schedule a Demo", intent: "other" },
  start_spv: { label: "Start an SPV", intent: "spv" },
  request_fund_admin: { label: "Request Fund Administration", intent: "fund_administration" },
  switch_administrator: { label: "Switch Fund Administrators", intent: "fund_migration" },
  start_cap_table: { label: "Start Your Cap Table", intent: "cap_table" },
  migrate_cap_table: { label: "Migrate Your Cap Table", intent: "cap_table" },
  partner: { label: "Partner With Harmonious", intent: "partnership" },
  talk_to_administrator: { label: "Talk to an Administrator", intent: "other" },
};

/** Every CTA routes to the public contact form, never to account creation. */
export const CTA_DESTINATION = "/contactus" as const;

// ---------------------------------------------------------------------------
// Approved public metrics
// ---------------------------------------------------------------------------

export interface PublicMetric {
  label: string;
  value: string;
  /** Who approved it and when — required before a metric is published. */
  approvedBy: string;
  approvedOn: string;
}

/**
 * EMPTY on purpose: no metric has been approved for public display yet.
 * Add a metric here (with approval details) and it appears on every page
 * that renders <MetricStrip />.
 */
export const APPROVED_METRICS: PublicMetric[] = [];

// ---------------------------------------------------------------------------
// Disclosures
// ---------------------------------------------------------------------------

export interface Disclosure {
  id: string;
  text: string;
}

/**
 * Centrally managed disclosure text. These two statements are the wording the
 * public site already displays today — carried over verbatim, not new language.
 * Final regulatory wording is to be supplied/approved by Harmonious.
 */
export const DISCLOSURES: Record<"offering" | "status", Disclosure> = {
  offering: {
    id: "offering",
    text: "Nothing on this site is an offer to sell or a solicitation to buy securities. Private offerings are made only to qualified investors through the fund's own documents.",
  },
  status: {
    id: "status",
    text: "Harmonious is an administrator, not an investment adviser or broker-dealer.",
  },
};

/** Shown on educational content. Pending approval of final wording. */
export const EDUCATIONAL_DISCLOSURE: Disclosure | null = null;

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

export type PriceKind = "fixed" | "starting_at" | "custom";
export interface PricingItem {
  name: string;
  description: string;
  kind: PriceKind;
  /** Whole dollars. Required for fixed / starting_at; omitted for custom. */
  amountUsd?: number;
  unit?: string;
  approved: boolean;
}
export interface PricingSection {
  id: "spvs" | "fund_administration" | "cap_tables" | "additional";
  title: string;
  items: PricingItem[];
}

/**
 * No prices are published until Harmonious approves them. Existing Wix prices
 * are not copied here. Unapproved items render as "Contact us for pricing".
 */
export const PRICING: PricingSection[] = [
  { id: "spvs", title: "SPVs", items: [] },
  { id: "fund_administration", title: "Fund Administration", items: [] },
  { id: "cap_tables", title: "Cap Tables", items: [] },
  { id: "additional", title: "Additional Services", items: [] },
];

export function formatPrice(item: PricingItem): string {
  if (!item.approved || item.kind === "custom" || item.amountUsd == null) return "Custom pricing";
  const amount = `$${item.amountUsd.toLocaleString("en-US")}`;
  const unit = item.unit ? ` ${item.unit}` : "";
  return item.kind === "starting_at" ? `Starting at ${amount}${unit}` : `${amount}${unit}`;
}

export function hasPublishedPricing(sections: PricingSection[] = PRICING): boolean {
  return sections.some((s) => s.items.some((i) => i.approved));
}

// ---------------------------------------------------------------------------
// Comparison pages (architecture only — none published)
// ---------------------------------------------------------------------------

export interface ComparisonPage {
  slug: string;
  competitor: string;
  published: boolean;
  factReviewedBy?: string;
}
/** Nothing is published until facts are reviewed. No routes exist yet. */
export const COMPARISON_PAGES: ComparisonPage[] = [
  { slug: "carta-alternative", competitor: "Carta", published: false },
  { slug: "pulley-alternative", competitor: "Pulley", published: false },
];
