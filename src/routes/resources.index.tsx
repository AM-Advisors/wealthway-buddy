import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { seoLinks, seoMeta, seoScripts } from "@/lib/seo";

const TITLE = "Resources — Guides for founders and fund managers";
const DESCRIPTION =
  "Practical guides on entity formation, EINs, Reg D exemptions, and private capital software — written from the filings Harmonious runs every day.";

export const Route = createFileRoute("/resources/")({
  head: () => ({
    meta: [
      { title: `${TITLE} — Harmonious` },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      ...seoMeta("/resources"),
    ],
    links: seoLinks("/resources"),
    scripts: seoScripts("/resources"),
  }),
  component: ResourcesIndex,
});

const GUIDES = [
  {
    audience: "For fund managers",
    title: "Rule 506(b) vs 506(c): which Reg D exemption fits your raise?",
    blurb:
      "Advertising rules, accreditation verification, Form D timing, and the Blue Sky notices each exemption triggers.",
    to: "/resources/reg-d-506b-vs-506c" as const,
  },
  {
    audience: "For founders",
    title: "How to get an EIN for an LLC (and what trips applications up)",
    blurb:
      "The SS-4 fields that matter, responsible-party rules, timing for founders without an SSN, and what to do once the EIN arrives.",
    to: "/resources/ein-for-llc" as const,
  },
  {
    audience: "For buyers",
    title: "Private Equity Software Buyer's Guide",
    blurb:
      "Compare deal management, fund accounting, LP portals, cap table, and reporting — and how to score a unified platform.",
    to: "/resources/pe-software-buyers-guide" as const,
  },
];

function ResourcesIndex() {
  return (
    <MarketingShell>
      <section className="mx-auto w-full max-w-5xl px-5 py-16 sm:py-20">
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-primary">
          Resources
        </p>
        <h1 className="mt-3 text-[clamp(2rem,4.5vw,3rem)] font-semibold leading-[1.08] tracking-tight">
          Guides for founders and fund managers
        </h1>
        <p className="mt-4 max-w-2xl text-[15.5px] leading-relaxed text-muted-foreground">
          {DESCRIPTION}
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {GUIDES.map((g) => (
            <Link
              key={g.to}
              to={g.to}
              className="group flex flex-col rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/50"
            >
              <p className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                {g.audience}
              </p>
              <h2 className="mt-2 text-[17px] font-semibold leading-snug">{g.title}</h2>
              <p className="mt-2 flex-1 text-[13.5px] leading-relaxed text-muted-foreground">
                {g.blurb}
              </p>
              <span className="mt-4 inline-flex items-center text-[12.5px] font-medium text-primary">
                Read the guide <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </MarketingShell>
  );
}
