/** Collateral Studio templates. Browser-safe. Content is edited in the Studio; layout and brand are fixed. */
export type Item = { title: string; subtitle: string; points: string[]; on: boolean };
export type CollateralContent = {
  eyebrow: string; title: string; subtitle: string; hookLead: string; hook: string;
  structure: "series" | "standalone" | "both"; reg: "506b" | "506c" | "both";
  tiers: { label: string; title: string; points: string[] }[];
  flows: string[];
  pillars: { title: string; body: string }[];
  services: Item[];
  platform: string[]; specialists: string[];
  showFooter: boolean;
};
export type TemplateId = "spv" | "fof" | "captable" | "social";
export const TEMPLATES: { id: TemplateId; label: string }[] = [
  { id: "spv", label: "SPV" }, { id: "fof", label: "Fund of Funds" }, { id: "captable", label: "Cap Table Management" }, { id: "social", label: "Social Announcement" },
];

const svc = (title: string, subtitle: string, points: string[]): Item => ({ title, subtitle, points, on: true });
const PLATFORM = ["Real-time GP deal dashboard: live commitments, signed agreements and incoming wires.", "Modern branded LP portal with document vaults and reports.", "Built-in accredited investor verification and regulatory caps.", "Manage many vehicles from one command center."];
const SPECIALISTS = ["A dedicated senior fund accountant on every closing.", "Proactive closing support for fast-paced rounds.", "Strict SOC-compliant procedures backed by $24B+ in AUA.", "We handle entity filings, bank operations and tax so you focus on deal flow."];

export function defaults(t: TemplateId): CollateralContent {
  const base = { structure: "both" as const, reg: "both" as const, platform: PLATFORM, specialists: SPECIALISTS, showFooter: true };
  if (t === "fof") return { ...base,
    eyebrow: "Harmonious / Fund of Funds Solutions", title: "Fund of Funds Administration", subtitle: "Institutional-grade infrastructure for multi-asset, multi-tier Fund of Funds.",
    hookLead: "Look-through clarity across every underlying fund, SPV and co-investment.",
    hook: "Harmonious delivers legal formation, institutional LP onboarding, look-through fund accounting, capital call automation, K-1 aggregation and a real-time investor portal on one platform, with dedicated specialist support.",
    tiers: [
      { label: "Tier 1: FoF limited partners", title: "Institutions · Family Offices · UHNW investors", points: ["Digital subscriptions", "KYC/KYB & AML", "Consolidated K-1s"] },
      { label: "Tier 2: Harmonious FoF master entity", title: "Unified ledger, cap table & capital management", points: ["Unified general ledger", "PCAPs & NAV", "Waterfall & carry", "Cash & reserves"] },
      { label: "Tier 3: Underlying investments", title: "Primary funds · Emerging funds · Co-investment SPVs", points: ["Capital call tracking", "Look-through valuation", "Realized-exit tracking"] },
    ],
    flows: ["Capital commitments, onboarding & K-1s", "Capital calls into underlying funds & co-investments"],
    pillars: [
      { title: "True look-through clarity", body: "See through to underlying funds, SPVs and portfolio companies in one place." },
      { title: "An experience LPs love", body: "Intuitive onboarding, clear wire instructions and fast digital K-1 access." },
      { title: "Dedicated specialists", body: "Every manager is paired with an experienced fund accounting specialist." },
    ],
    services: [
      svc("Entity formation & structure", "Master, feeder & series vehicles", ["Delaware LP, LLC or statutory trust", "Series structures & vintage sleeves", "EIN, registered agent & franchise tax"]),
      svc("LP onboarding & compliance", "KYC/KYB, accreditation & tax intake", ["White-label LP portal", "OFAC, PEP and sanctions checks", "Qualified Purchaser & Accredited Investor checks"]),
      svc("Capital calls & liquidity", "Inbound calls and outbound deployment", ["Capital call notices from approved drawdowns", "Wire tracking & reconciliation", "Reserve and liquidity forecasting"]),
      svc("Look-through accounting", "Multi-entity ledger, NAV & PCAPs", ["Quarterly look-through valuation", "ASC 820 classification", "GAAP statements with audit support"]),
      svc("Tax & K-1 aggregation", "Underlying K-1s to consolidated K-1s", ["Underlying K-1 tracking dashboard", "Pass-through aggregation", "Digital K-1 delivery"]),
      svc("Regulatory & governance", "Form D, Blue Sky & maintenance", ["Form D filings and amendments", "State Blue Sky notices", "Delaware renewals"]),
    ],
  };
  if (t === "captable") return { ...base,
    eyebrow: "Harmonious / Cap Table Solutions", title: "Cap Table Management", subtitle: "One accurate record of every share, class and holder.",
    hookLead: "Ownership records your investors and auditors can trust.",
    hook: "Harmonious keeps shares, classes, certificates and holder access on one record, with every correction kept as a clear history and holder portals that match the books.",
    tiers: [
      { label: "Tier 1: Holders", title: "Founders · Employees · Investors", points: ["Holder portal access", "Certificates & statements", "Exercise requests"] },
      { label: "Tier 2: Harmonious cap table record", title: "Classes, issuances, transfers & vesting", points: ["Security classes", "Issuances & transfers", "Vesting schedules", "Change history"] },
      { label: "Tier 3: Company events", title: "Rounds · Secondaries · Exits", points: ["Round modeling", "Secondary transfers", "Pro-rata tracking"] },
    ],
    flows: ["Issuances, grants & holder onboarding", "Rounds, transfers & corporate events"],
    pillars: [
      { title: "One source of truth", body: "Every holding traces to a recorded transaction." },
      { title: "Holder-ready", body: "Holders see their own positions and documents, nothing more." },
      { title: "Audit-ready history", body: "Corrections are recorded, never overwritten." },
    ],
    services: [
      svc("Security classes", "Common, preferred & options", ["Class terms", "Authorized shares", "Conversion tracking"]),
      svc("Issuances & certificates", "Digital certificates", ["Certificate issuance", "Legends & restrictions", "Cancellation history"]),
      svc("Transfers & secondaries", "Controlled transfers", ["ROFR coordination", "Transfer documents", "Board consents"]),
      svc("Vesting & equity plans", "Schedules and exercises", ["Vesting schedules", "Exercise requests", "Plan pool tracking"]),
      svc("Rounds & modeling", "Financing events", ["Round setup", "SAFE and note conversion", "Pro-rata calculation"]),
      svc("Holder portal", "Self-serve access", ["Positions & statements", "Document vault", "Permissioned access"]),
    ],
  };
  // spv and social share SPV content (social uses hook + pillars only).
  return { ...base,
    eyebrow: "Harmonious / SPV Solutions", title: "Special Purpose Vehicle (SPV) Administration", subtitle: "Rapid, institutional-grade syndication and co-investment infrastructure.",
    hookLead: "Single-asset syndications require lightning-fast execution without institutional compromises.",
    hook: "Harmonious provides a complete, modern SPV stack: same-day Delaware entity deployment, automated investor onboarding, dedicated banking with an EIN, digital wire reconciliation, and lifecycle accounting through final exit distributions.",
    tiers: [
      { label: "Tier 1: SPV participants & syndicate LPs", title: "Angel Investors · Venture LPs · Family Offices · Strategic Co-Investors", points: ["Self-serve onboarding (KYC/AML & OFAC)", "Accreditation", "In-app wire & ACH funding"] },
      { label: "Tier 2: Harmonious SPV vehicle", title: "Same-day deployment, dedicated banking & automated closing", points: ["Dedicated banking & EIN", "Deal room & cap table tracking", "Subscription execution & escrow", "Annual K-1 distribution"] },
      { label: "Tier 3: Target investments", title: "Co-investments · Syndicates · Secondaries", points: ["Single-line cap table", "Pass-through rights", "Secure escrow closing"] },
    ],
    flows: ["Digital subscriptions, accredited verification & commitments", "Outbound investment wire & direct equity holding"],
    pillars: [
      { title: "Same-day deployment", body: "Delaware entities with dedicated banking and an EIN in hours, not weeks." },
      { title: "Frictionless LP experience", body: "One-click LP profiles, in-app wire tracking and modern investor dashboards." },
      { title: "Full-lifecycle governance", body: "GAAP accounting, annual K-1s and distribution waterfalls." },
    ],
    services: [
      svc("Formation & structural setup", "Delaware entities", ["Entity formation", "Operating agreements & LPA terms", "EIN & registered agent"]),
      svc("Investor onboarding & compliance", "LP verification & accreditation", ["KYC/AML, PEP and OFAC checks", "Regulation D workflows", "Universal LP passport"]),
      svc("Dedicated banking & treasury", "Escrow, wires & reconciliation", ["Dedicated FDIC-insured account per SPV", "Inbound wire matching", "Outbound wire to the company"]),
      svc("Cap table & closing", "Clean equity holding", ["Single-line cap table", "Digital SAFE, note or stock execution", "Closing binders"]),
      svc("Fund accounting & tax", "Audit-ready books & K-1s", ["GAAP fund accounting", "ASC 820 valuations", "Electronic Schedule K-1s"]),
      svc("Distributions & dissolution", "Waterfalls & wind-down", ["American & European waterfalls", "Carry & hurdle tracking", "Final return & closure"]),
    ],
  };
}

/** Text appended for structure / Reg D toggles. */
export function structureLabel(c: CollateralContent) {
  return c.structure === "series" ? "Delaware Series LLC/LP" : c.structure === "standalone" ? "Delaware Stand-Alone entity" : "Delaware Series or Stand-Alone";
}
export function regLabel(c: CollateralContent) {
  return c.reg === "506b" ? "Rule 506(b)" : c.reg === "506c" ? "Rule 506(c)" : "Rule 506(b) & 506(c)";
}

export function toMarkdown(c: CollateralContent) {
  const on = c.services.filter((s) => s.on);
  return [
    `# ${c.title}`, `**${c.subtitle}**`, "", `## ${c.hookLead}`, c.hook, "",
    `Structure: ${structureLabel(c)} · Offering exemption: ${regLabel(c)}`, "",
    "## Capital flow architecture",
    ...c.tiers.flatMap((t, i) => [`### ${t.label}`, t.title, ...t.points.map((p) => `- ${p}`), c.flows[i] ? `\n> ${c.flows[i]}` : "", ""]),
    "## Why Harmonious", ...c.pillars.map((p) => `- **${p.title}:** ${p.body}`), "",
    "## Core services", ...on.flatMap((s, i) => [`### ${i + 1}. ${s.title}`, `*${s.subtitle}*`, ...s.points.map((p) => `- ${p}`), ""]),
    "## Platform capabilities", ...c.platform.map((p) => `- ${p}`), "",
    "## Dedicated specialists", ...c.specialists.map((p) => `- ${p}`), "",
    c.showFooter ? "---\n$24B+ AUA · 750+ Fund Managers · Your Funds On Easy Mode · harmonious.co" : "",
  ].join("\n");
}
