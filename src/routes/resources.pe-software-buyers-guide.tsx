import { seoLinks, seoMeta } from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";

const TITLE = "Private Equity Software Buyer's Guide (2026) — Harmonious";
const DESCRIPTION =
  "Compare private equity software categories — deal management, fund accounting, LP portals, cap table, reporting — and how to evaluate a unified platform.";
const URL = "https://www.harmonious.co/resources/pe-software-buyers-guide";

export const Route = createFileRoute("/resources/pe-software-buyers-guide")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      ...seoMeta("/resources/pe-software-buyers-guide"),
    ],
    links: seoLinks("/resources/pe-software-buyers-guide"),
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: "Private Equity Software Buyer's Guide",
          description: DESCRIPTION,
          mainEntityOfPage: URL,
          author: { "@type": "Organization", name: "Harmonious" },
          publisher: { "@type": "Organization", name: "Harmonious" },
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }),
      },
    ],
  }),
  component: BuyersGuidePage,
});

type Category = {
  name: string;
  jobToBeDone: string;
  buyer: string;
  evaluate: string[];
  watchOut: string;
};

const categories: Category[] = [
  {
    name: "Deal management & CRM",
    jobToBeDone:
      "Track sourcing, diligence, and relationship coverage from first meeting to close.",
    buyer: "Deal team / origination",
    evaluate: [
      "Relationship intelligence from email and calendar, not manual data entry",
      "Stage-based pipeline with conversion analytics per source",
      "Diligence checklists and document rooms attached to the deal record",
    ],
    watchOut:
      "Generic CRMs force fund workflows into sales objects and lose pipeline history at close.",
  },
  {
    name: "Fund accounting & administration",
    jobToBeDone:
      "Maintain the books: capital calls, distributions, allocations, waterfalls, and NAV.",
    buyer: "CFO / fund controller / administrator",
    evaluate: [
      "Multi-entity, multi-currency general ledger with allocation rules per LPA",
      "European vs American waterfall support and carry modeling",
      "Auditor-ready trails and reconciliation against custodian records",
    ],
    watchOut:
      "Spreadsheet-based allocations that can't be reproduced two years later during an audit.",
  },
  {
    name: "LP / investor portals",
    jobToBeDone: "Deliver statements, notices, K-1s, and performance to limited partners securely.",
    buyer: "Investor relations",
    evaluate: [
      "Per-investor entitlements down to the account and document level",
      "Branded statements and capital account rollforwards generated from the ledger",
      "Notification, acknowledgement, and access audit logging",
    ],
    watchOut: "Portals that are only a file share — LPs still email IR for numbers.",
  },
  {
    name: "Cap table & equity management",
    jobToBeDone:
      "Track ownership, rounds, options, and waterfall outcomes across portfolio companies.",
    buyer: "Portfolio operations",
    evaluate: [
      "Scenario modeling for new rounds and exit waterfalls",
      "Portfolio-company roll-up into fund-level ownership",
      "409A / valuation history retained alongside the ledger",
    ],
    watchOut:
      "Cap tables that live only at the company level, so the fund can't see look-through ownership.",
  },
  {
    name: "Portfolio monitoring & reporting",
    jobToBeDone: "Collect company KPIs and produce fund, investor, and board reporting.",
    buyer: "Finance / IR / partners",
    evaluate: [
      "Structured KPI intake instead of inbound spreadsheets",
      "IRR, MOIC, DPI, TVPI computed from the same ledger the accountants use",
      "One-click exports to PDF and CSV for board and LP packs",
    ],
    watchOut: "Reporting tools sitting downstream of three unreconciled sources of truth.",
  },
  {
    name: "Compliance, custody & controls",
    jobToBeDone: "Enforce access, retain evidence, and keep private-market holdings protected.",
    buyer: "Compliance / operations",
    evaluate: [
      "Role-based access control, SSO/SCIM, and immutable audit logs",
      "Prohibited-transaction, UBIT, and FMV checks for self-directed retirement accounts",
      "Data residency, retention, and export guarantees",
    ],
    watchOut: "Controls bolted on per tool, so evidence must be assembled by hand at audit time.",
  },
];

const stackComparison = [
  {
    dimension: "Source of truth",
    fragmented: "Each tool keeps its own ledger; reconciliation is a monthly project.",
    unified: "One ledger drives accounting, reporting, and the investor view.",
  },
  {
    dimension: "Investor reporting",
    fragmented: "Statements assembled in spreadsheets, then re-uploaded to a portal.",
    unified: "Statements generated from the same capital accounts the auditors see.",
  },
  {
    dimension: "Onboarding a new fund",
    fragmented: "Configure five vendors, five access models, five data mappings.",
    unified: "One intake defines the fund, entitlements, and reporting cadence.",
  },
  {
    dimension: "Access & audit",
    fragmented: "Per-tool permissions with no combined access review.",
    unified: "Central RBAC with a single, exportable audit trail.",
  },
  {
    dimension: "Total cost",
    fragmented: "Multiple licenses plus the internal headcount that glues them together.",
    unified: "One subscription; the integration work is the product's job, not yours.",
  },
];

const shortlistSteps = [
  "Write down the five reports you produce most often and who signs off on each.",
  "Map every place a number is re-keyed today — those are your reconciliation costs.",
  "Score vendors on the categories above, weighting the ones that touch LP-facing output.",
  "Ask each vendor to run your own last quarter-end through their system, not a demo dataset.",
  "Confirm access controls, audit export, and data-exit terms before pricing.",
  "Pilot with one fund and one LP cohort before committing the whole book.",
];

const faqs = [
  {
    q: "What is private equity software?",
    a: "Private equity software is the set of systems a sponsor uses to run a fund: deal management and CRM, fund accounting and administration, LP or investor portals, cap table and equity management, portfolio monitoring, and compliance controls. Some firms buy each category separately; others buy a unified platform that covers them on one ledger.",
  },
  {
    q: "Do I need separate deal management and fund accounting tools?",
    a: "Not necessarily. Separate tools are common because the categories matured independently, but the cost shows up in reconciliation — the same investment exists in the CRM, the ledger, and the LP portal. A unified platform removes that reconciliation step by keeping one record of the investment.",
  },
  {
    q: "How much does private equity software cost?",
    a: "Pricing is usually per fund, per entity, or per assets under administration, and most vendors quote annually. When you compare quotes, add the internal hours spent moving data between systems — for fragmented stacks that internal cost is frequently larger than the license fees.",
  },
  {
    q: "What should an LP portal include?",
    a: "At minimum: per-investor entitlements, capital account statements generated from the fund ledger, capital call and distribution notices, tax document delivery, and an access log showing who viewed or downloaded each document.",
  },
];

function BuyersGuidePage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
        Buyer's guide · Updated 2026
      </p>
      <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-foreground">
        Private Equity Software Buyer's Guide
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
        A practical comparison of the software categories private capital firms buy — deal
        management, fund accounting, LP portals, cap table, portfolio monitoring, and compliance —
        plus how to judge a unified platform against the fragmented legacy stack most firms inherit.
      </p>

      <section className="mt-14" aria-labelledby="categories">
        <h2 id="categories" className="font-display text-2xl font-semibold tracking-tight">
          The six categories of private equity software
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Most shortlists mix these up. Decide which categories you are actually buying before you
          compare vendors.
        </p>
        <div className="mt-6 space-y-5">
          {categories.map((c) => (
            <article key={c.name} className="rounded-xl border border-border bg-card p-6">
              <h3 className="font-display text-lg font-semibold">{c.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{c.jobToBeDone}</p>
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-primary">
                Primary buyer · {c.buyer}
              </p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-foreground/90">
                {c.evaluate.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">Watch out: </span>
                {c.watchOut}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-14" aria-labelledby="unified">
        <h2 id="unified" className="font-display text-2xl font-semibold tracking-tight">
          Fragmented stack vs unified platform
        </h2>
        <div className="mt-5 overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-secondary/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Dimension
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Fragmented legacy stack
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Unified platform
                </th>
              </tr>
            </thead>
            <tbody>
              {stackComparison.map((r) => (
                <tr key={r.dimension} className="border-t border-border align-top">
                  <th scope="row" className="px-4 py-3 font-semibold text-foreground">
                    {r.dimension}
                  </th>
                  <td className="px-4 py-3 text-muted-foreground">{r.fragmented}</td>
                  <td className="px-4 py-3 text-foreground/90">{r.unified}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Harmonious is built for the right-hand column: fund setup and administration, cap
          table, investor onboarding, investor and client reporting, and compliance controls operate
          on one record of each investment, so LP-facing output and the accounting ledger never
          drift apart.
        </p>
      </section>

      <section className="mt-14" aria-labelledby="shortlist">
        <h2 id="shortlist" className="font-display text-2xl font-semibold tracking-tight">
          How to run the evaluation
        </h2>
        <ol className="mt-5 list-decimal space-y-2 pl-5 text-sm text-foreground/90">
          {shortlistSteps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </section>

      <section className="mt-14" aria-labelledby="faq">
        <h2 id="faq" className="font-display text-2xl font-semibold tracking-tight">
          Frequently asked questions
        </h2>
        <div className="mt-5 space-y-5">
          {faqs.map((f) => (
            <div key={f.q}>
              <h3 className="font-display text-base font-semibold">{f.q}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      <section
        className="mt-14 rounded-xl border border-border bg-secondary/30 p-6"
        aria-labelledby="next"
      >
        <h2 id="next" className="font-display text-xl font-semibold tracking-tight">
          See the unified platform
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Browse the capabilities that replace the fragmented stack, or review the analytics event
          model behind the reporting layer.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            to="/platform"
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Explore services &amp; capabilities
          </Link>
          <Link
            to="/platform"
            className="inline-flex items-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Read the event taxonomy
          </Link>
        </div>
      </section>
    </main>
  );
}
