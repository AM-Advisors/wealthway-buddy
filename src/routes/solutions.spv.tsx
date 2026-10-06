import { createFileRoute } from "@tanstack/react-router";

import p1 from "@/assets/collateral/spv-collateral-p1.jpg.asset.json";
import p2 from "@/assets/collateral/spv-collateral-p2.jpg.asset.json";
import { SolutionGuidePage, type SolutionGuide } from "@/components/marketing/solution-guide";
import { seoLinks, seoMeta } from "@/lib/seo";

const TITLE = "SPV Administration Guide - Harmonious";
const DESCRIPTION = "How Harmonious runs SPVs end to end: the three-tier capital flow, six core services and full-lifecycle accounting through final distribution.";

export const Route = createFileRoute("/solutions/spv")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
      ...seoMeta("/solutions/spv"),
    ],
    links: seoLinks("/solutions/spv"),
  }),
  component: () => <SolutionGuidePage g={GUIDE} />,
});

const GUIDE: SolutionGuide = {
  eyebrow: "Harmonious / SPV Solutions",
  title: "Special Purpose Vehicle (SPV) Administration",
  subtitle: "Rapid, institutional-grade syndication and co-investment infrastructure.",
  overview: "In fast-moving private rounds, speed to close is everything. Harmonious provides a complete, modern SPV stack: same-day Delaware entity deployment, automated 506(b) and 506(c) investor onboarding, dedicated banking with an EIN, digital wire reconciliation, and comprehensive lifecycle accounting through final exit distributions.",
  tiers: [
    { label: "Tier 1: SPV participants & syndicate LPs", title: "Angel Investors · Venture LPs · Family Offices · Strategic Co-Investors", points: ["Self-serve digital onboarding (KYC/AML & OFAC)", "506(b) / 506(c) accreditation", "In-app wire & ACH funding with real-time tracking"] },
    { label: "Tier 2: Harmonious SPV vehicle (Delaware Series or Stand-Alone)", title: "Same-day deployment, dedicated banking & automated closing engine", points: ["Delaware Series & Stand-Alone entities", "Dedicated commercial banking & EIN", "Real-time deal room & cap table tracking", "Automated subscription execution & escrow", "Annual tax prep & Schedule K-1 distribution", "Real-time LP portal & performance updates"] },
    { label: "Tier 3: Target investments", title: "Clean cap-table, direct equity holding", points: ["Single-line representation on the target cap table", "Pass-through rights & governance"] },
  ],
  flows: ["Digital subscriptions, accredited verification & capital commitments", "Outbound investment wire & clean cap-table direct equity holding"],
  targets: [
    { title: "Venture co-investments", subtitle: "Follow-on & pro-rata allocations", points: ["Pro-rata rights exercise", "Clean single-line cap table", "Pass-through rights & governance"] },
    { title: "Early-stage syndicates", subtitle: "Angel & emerging manager rounds", points: ["Fast deal-room launch", "Low investment minimums", "Automated LP communications"] },
    { title: "Secondary transactions", subtitle: "Direct shares & LP interest buys", points: ["Transfer docs & ROFR execution", "Board consent coordination", "Secure escrow wire closing"] },
  ],
  matrix: [
    { title: "Formation & structural setup", subtitle: "Delaware Series LLC/LP & Stand-Alone entities", points: ["Delaware Series LLC/LP or standalone entity formation", "Standardized operating agreements & custom LPA terms", "Dedicated federal EIN filing & registered agent management", "Side letter administration & bespoke hurdle / carry terms"] },
    { title: "Investor onboarding & compliance", subtitle: "Frictionless LP verification & accreditation", points: ["Built-in digital KYC/AML, PEP and OFAC sanction checks", "Automated Regulation D 506(b) & 506(c) workflows", "Qualified Purchaser & Accredited Investor checks", "Universal LP passport profile for one-click repeat investing"] },
    { title: "Dedicated banking & treasury", subtitle: "Secure escrow, wires & cash reconciliation", points: ["Dedicated FDIC-insured commercial bank account per SPV", "Automated inward wire matching and ACH collection", "Real-time capital commitment and escrow reconciliation", "Secure outbound wire dispatch to the portfolio company"] },
    { title: "Cap table & closing execution", subtitle: "Clean target equity holding & document vault", points: ["Single-line representation on target company cap table", "Digital execution of SAFEs, notes or stock agreements", "Automated closing binders and counterparty document delivery", "Ongoing cap table equity tracking & pro-rata calculation"] },
    { title: "Fund accounting & tax coordination", subtitle: "Audit-ready books & electronic Schedule K-1s", points: ["GAAP-compliant fund accounting and financial reporting", "ASC 820 fair-value mark-to-market valuations", "Annual tax preparation and electronic Schedule K-1 issuance", "Dedicated CPA collaboration and state franchise tax filings"] },
    { title: "Distributions & vehicle dissolution", subtitle: "Waterfall calculations & final entity wind-down", points: ["Automated distribution waterfalls (American & European)", "Carried interest, hurdle rate & clawback reserve tracking", "Cash or in-kind stock distribution handling", "Delaware state dissolution, final tax return & vehicle closure"] },
  ],
  pillars: [
    { title: "Same-day deployment", body: "Deploy Series or standalone Delaware entities with dedicated banking and an EIN in hours, not weeks." },
    { title: "Frictionless LP experience", body: "One-click universal LP profiles, in-app wire tracking, and modern mobile-friendly investor dashboards." },
    { title: "Full-lifecycle governance", body: "Backed by $24B+ in institutional AUA: GAAP accounting, annual K-1 tax preparation, and distribution waterfalls." },
  ],
  download: { href: "/guides/harmonious-spv-guide.md", label: "Download the SPV guide" },
  collateral: [
    { src: p1.url, alt: "SPV Administration overview, page 1" },
    { src: p2.url, alt: "Core services matrix and platform technology, page 2" },
  ],
};
