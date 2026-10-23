import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Button } from "@/components/ui/button";
import { seoLinks, seoMeta } from "@/lib/seo";

const TITLE = "Rule 506(b) vs 506(c): Which Reg D Exemption Fits Your Raise?";
const DESCRIPTION =
  "Regulation D Rule 506(b) vs 506(c): who you can raise from, whether you can advertise, how accreditation is verified, and which filings each one triggers.";
const PATH = "/resources/reg-d-506b-vs-506c";
const URL = `https://www.harmonious.co${PATH}`;

export const Route = createFileRoute("/resources/reg-d-506b-vs-506c")({
  head: () => ({
    meta: [
      { title: `${TITLE} - Harmonious` },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      ...seoMeta(PATH),
    ],
    links: seoLinks(PATH),
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: TITLE,
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
          "@type": "BreadcrumbList",
          itemListElement: [
            {
              "@type": "ListItem",
              position: 1,
              name: "Home",
              item: "https://www.harmonious.co/",
            },
            {
              "@type": "ListItem",
              position: 2,
              name: "Resources",
              item: "https://www.harmonious.co/resources",
            },
            { "@type": "ListItem", position: 3, name: "506(b) vs 506(c)", item: URL },
          ],
        }),
      },
    ],
  }),
  component: RegDComparisonPage,
});

const COMPARISON: { dimension: string; b: string; c: string }[] = [
  {
    dimension: "General solicitation & advertising",
    b: "Not permitted. You may only offer to people with a pre-existing, substantive relationship.",
    c: "Permitted. You can market the offering publicly - website, email, social, demo days, press.",
  },
  {
    dimension: "Who can invest",
    b: "Unlimited accredited investors plus up to 35 sophisticated non-accredited investors.",
    c: "Accredited investors only. No non-accredited participants.",
  },
  {
    dimension: "Accreditation standard",
    b: "Reasonable belief - self-certification by the investor is generally accepted.",
    c: "Issuer must take reasonable steps to verify: income, net worth, or a third-party letter.",
  },
  {
    dimension: "Disclosure burden",
    b: "Adding non-accredited investors triggers Rule 502(b) information delivery requirements.",
    c: "No Rule 502(b) delivery requirement because all investors are accredited.",
  },
  {
    dimension: "Federal filing",
    b: "Form D with the SEC within 15 days of first sale.",
    c: "Form D with the SEC within 15 days of first sale, with the 506(c) box checked.",
  },
  {
    dimension: "State (Blue Sky) filings",
    b: "Notice filings and fees in each state where an investor resides.",
    c: "Notice filings and fees in each state where an investor resides.",
  },
  {
    dimension: "Resale",
    b: "Restricted securities. Rule 144 holding periods apply.",
    c: "Restricted securities. Rule 144 holding periods apply.",
  },
];

const CHOOSE_B = [
  "Your raise comes from an existing network - prior LPs, angels, colleagues, friends of the GP.",
  "You want the option to include a small number of sophisticated non-accredited investors.",
  "You would rather avoid collecting tax returns, bank statements, or verification letters.",
];

const CHOOSE_C = [
  "You intend to market publicly: a live deal page, a newsletter, a podcast, a demo day, LinkedIn.",
  "Your investor list is mostly people you have not met, so a pre-existing relationship is hard to prove.",
  "You are comfortable running (or outsourcing) documented accreditation verification on every investor.",
];

const STEPS = [
  "Form the issuing entity and get the EIN - Form D requires both before you can file.",
  "Pick the exemption and lock the offering terms in the subscription documents and PPM.",
  "Onboard investors: KYC/AML, accreditation (self-certified for 506(b), verified for 506(c)), and e-signature.",
  "File Form D on EDGAR within 15 days of the first sale, then file amendments annually while the offering is open.",
  "File state Blue Sky notices and pay each state's fee where an investor resides.",
  "Keep the evidence: verification records, investor communications, and filing receipts, retained and auditable.",
];

function RegDComparisonPage() {
  return (
    <MarketingShell>
      <article className="mx-auto w-full max-w-4xl px-5 py-16 sm:py-20">
        <nav aria-label="Breadcrumb" className="text-[12.5px] text-muted-foreground">
          <Link to="/resources" className="hover:text-foreground">
            Resources
          </Link>
          <span className="mx-2" aria-hidden>
            /
          </span>
          <span>506(b) vs 506(c)</span>
        </nav>

        <h1 className="mt-4 text-[clamp(2rem,4.5vw,3rem)] font-semibold leading-[1.08] tracking-tight">
          Rule 506(b) vs 506(c): which Reg D exemption fits your raise?
        </h1>
        <p className="mt-5 text-[16px] leading-relaxed text-muted-foreground">
          Regulation D is the exemption most private offerings in the United States rely on to sell
          securities without registering them with the SEC. Rule 506 is its safe harbor, and it
          comes in two flavors. The practical difference is a trade: 506(c) lets you advertise the
          raise, but every investor must be verified as accredited. 506(b) keeps verification light,
          but you cannot solicit publicly.
        </p>

        <section className="mt-12" aria-labelledby="side-by-side">
          <h2 id="side-by-side" className="text-[24px] font-semibold tracking-tight">
            Side by side
          </h2>
          <div className="mt-5 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[720px] text-left text-[13.5px]">
              <thead className="bg-muted/50 text-[12px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Dimension
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Rule 506(b)
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Rule 506(c)
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr key={row.dimension} className="border-t border-border align-top">
                    <th scope="row" className="px-4 py-3 font-medium">
                      {row.dimension}
                    </th>
                    <td className="px-4 py-3 text-muted-foreground">{row.b}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-12 grid gap-4 lg:grid-cols-2" aria-labelledby="which-one">
          <h2 id="which-one" className="sr-only">
            Which exemption to choose
          </h2>
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="text-[17px] font-semibold">Choose 506(b) when</h3>
            <ul className="mt-3 space-y-2 text-[13.5px] text-muted-foreground">
              {CHOOSE_B.map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="text-[17px] font-semibold">Choose 506(c) when</h3>
            <ul className="mt-3 space-y-2 text-[13.5px] text-muted-foreground">
              {CHOOSE_C.map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mt-12" aria-labelledby="steps">
          <h2 id="steps" className="text-[24px] font-semibold tracking-tight">
            What the filing sequence actually looks like
          </h2>
          <ol className="mt-5 space-y-3 text-[14px] leading-relaxed text-muted-foreground">
            {STEPS.map((step, i) => (
              <li key={step} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[12px] font-semibold text-primary">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-5 text-[13px] text-muted-foreground">
            Rule 506 is codified at{" "}
            <a
              className="underline underline-offset-2 hover:text-foreground"
              href="https://www.ecfr.gov/current/title-17/chapter-II/part-230/subject-group-ECFR6e651a4c86c0174/section-230.506"
              rel="noreferrer noopener"
              target="_blank"
            >
              17 CFR § 230.506
            </a>
            . This page is general information, not legal advice - confirm the specifics of your
            offering with securities counsel.
          </p>
        </section>

        <section className="mt-14 rounded-2xl border border-border bg-muted/30 p-7">
          <h2 className="text-[20px] font-semibold tracking-tight">
            Run the whole raise in one place
          </h2>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
            Harmonious offers EIN, Form D and Blue Sky filing services for clients. Our team
            coordinates the applicable submissions, tracks filing dates and receipts, and keeps
            the record alongside investor onboarding and signed subscriptions. Filing work is
            handled by the team, not submitted automatically by the platform.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link to="/platform">
                Regulatory filings <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden />
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/contactus">Talk to sales</Link>
            </Button>
          </div>
        </section>
      </article>
    </MarketingShell>
  );
}
