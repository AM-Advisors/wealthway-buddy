import { createFileRoute } from "@tanstack/react-router";

import { SolutionGuidePage, type SolutionGuide } from "@/components/marketing/solution-guide";
import { seoLinks, seoMeta } from "@/lib/seo";

const TITLE = "Fund of Funds Administration Guide - Harmonious";
const DESCRIPTION = "Harmonious for Fund of Funds: the three-tier operating model, look-through accounting, capital calls, K-1 aggregation and a real-time LP portal.";

export const Route = createFileRoute("/solutions/fund-of-funds")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
      ...seoMeta("/solutions/fund-of-funds"),
    ],
    links: seoLinks("/solutions/fund-of-funds"),
  }),
  component: () => <SolutionGuidePage g={GUIDE} />,
});

const GUIDE: SolutionGuide = {
  eyebrow: "Harmonious / Fund of Funds Solutions",
  title: "Fund of Funds (FoF) Administration",
  subtitle: "Institutional-grade infrastructure for multi-asset and multi-tier Fund of Funds.",
  overview: "A Fund of Funds pools capital from institutions, family offices, RIAs and high-net-worth investors to deploy across primary funds, SPVs, co-investments and secondaries. Harmonious handles the compounded complexity: legal formation, institutional LP onboarding, look-through fund accounting, capital call automation, tax aggregation and a real-time investor portal, with dedicated specialist support.",
  tiers: [
    { label: "Tier 1: FoF limited partners", title: "Institutions · Family Offices · UHNW investors", points: ["Capital commitments & digital subscriptions", "KYC/KYB, AML and accreditation", "Consolidated K-1s in each LP's tax vault"] },
    { label: "Tier 2: Harmonious FoF master entity (Delaware LP/LLC, master-feeder)", title: "Unified ledger, cap table and capital management", points: ["Unified general ledger", "Cap table & PCAPs", "Cash flow & reserves", "Waterfall & carry"] },
    { label: "Tier 3: Underlying investments", title: "Primary VC funds · Emerging VC funds · Co-investment SPVs", points: ["Underlying LP interests across 20+ funds", "Direct co-investment SPV equity", "Look-through to portfolio companies"] },
  ],
  flows: ["Capital commitments, KYC/AML & K-1s", "Capital calls into underlying funds & direct co-investments"],
  targets: [
    { title: "Primary funds", subtitle: "Flagship & emerging managers", points: ["Capital call deadline tracking", "Verified GP wire instructions", "Quarterly GP report intake"] },
    { title: "Co-investment SPVs", subtitle: "Pro-rata & breakout companies", points: ["Concentrated deployment", "Single-line cap table", "Look-through valuation"] },
    { title: "Secondaries", subtitle: "LP interests & structured blocks", points: ["Negotiated valuations", "Transfer coordination", "Realized-exit tracking"] },
  ],
  matrix: [
    { title: "Entity formation & structure", subtitle: "Master, feeder & series vehicles", points: ["Delaware LP, LLC or statutory trust structuring", "Series structures & vintage sleeves", "EIN, formation certificates, registered agent & franchise tax", "LPA, PPM and subscription booklet coordination"] },
    { title: "Institutional LP onboarding & compliance", subtitle: "KYC/KYB, accreditation & tax intake", points: ["White-label LP portal for institutional and individual LPs", "KYC/KYB, beneficial ownership, OFAC, PEP and sanctions checks", "506(b) / 506(c), Qualified Purchaser & Accredited Investor verification", "Form W-9 and tax documentation validation"] },
    { title: "Capital calls & liquidity", subtitle: "Inbound calls and outbound deployment", points: ["Capital call notices from approved drawdowns", "Tracking of pending, cleared and delinquent wires", "Underlying GP wire-instruction verification", "Cash reserve and liquidity forecasting"] },
    { title: "Look-through accounting & reporting", subtitle: "Multi-entity ledger, NAV & PCAPs", points: ["Multi-entity general ledger", "Quarterly look-through valuation & ASC 820 classification", "European and American waterfalls, hurdles, catch-up & clawback", "Quarterly PCAPs and GAAP annual statements with audit support"] },
    { title: "Tax coordination & K-1 aggregation", subtitle: "Underlying K-1 tracking to consolidated K-1s", points: ["Tracking of 15 to 50+ underlying Schedule K-1s", "Pass-through aggregation incl. QSBS, UBTI & state sourcing", "Form 1065 and state filing coordination", "Digital K-1 delivery to each LP's tax vault"] },
    { title: "Regulatory filings & governance", subtitle: "Form D, Blue Sky & ongoing maintenance", points: ["Form D initial filing and annual amendments", "State-by-state Blue Sky notice filings", "Exempt Reporting Adviser (Form ADV) support", "Delaware franchise tax and annual renewals"] },
  ],
  pillars: [
    { title: "True look-through clarity", body: "See through your fund of funds into underlying funds, SPVs and portfolio companies on one platform." },
    { title: "An experience LPs love", body: "Intuitive onboarding, clear wire instructions and fast digital access to K-1s for institutional allocators." },
    { title: "Dedicated specialists", body: "Every manager is paired with an experienced fund accounting specialist, backed by $24B+ in AUA." },
  ],
  download: { href: "/guides/harmonious-fund-of-funds-guide.md", label: "Download the Fund of Funds guide" },
};
