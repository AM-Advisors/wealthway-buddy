import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Button } from "@/components/ui/button";
import { seoLinks, seoMeta } from "@/lib/seo";

const TITLE = "How to Get an EIN for an LLC: SS-4 Steps, Timing, and Pitfalls";
const DESCRIPTION =
  "How to get an EIN for a new LLC with Form SS-4: who the responsible party is, how long each filing channel takes, and what gets applications rejected.";
const PATH = "/resources/ein-for-llc";
const URL = `https://www.harmonious.co${PATH}`;

export const Route = createFileRoute("/resources/ein-for-llc")({
  head: () => ({
    meta: [
      { title: `${TITLE} — Harmonious` },
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
            { "@type": "ListItem", position: 3, name: "EIN for an LLC", item: URL },
          ],
        }),
      },
    ],
  }),
  component: EinGuidePage,
});

const STEPS = [
  {
    title: "Form the LLC first",
    body: "The IRS issues the EIN to a legal entity. File the articles of organization with the state and get the stamped formation certificate before you apply, so the legal name and formation date on the SS-4 match the state record exactly.",
  },
  {
    title: "Decide who the responsible party is",
    body: "The responsible party is the individual who ultimately controls the entity — not an attorney, not a formation agent. Only a natural person qualifies, and the IRS limits each responsible party to one EIN issued per day.",
  },
  {
    title: "Choose the tax classification",
    body: "A single-member LLC defaults to a disregarded entity, a multi-member LLC to a partnership. Electing S-corp or C-corp treatment is a separate filing (Form 2553 or 8832) but the SS-4 answers should be consistent with the election you intend.",
  },
  {
    title: "Complete Form SS-4",
    body: "Legal name, trade name, mailing and principal address, county and state of organization, responsible party name and SSN/ITIN/EIN, reason for applying, start date of the business, expected employees, and principal activity.",
  },
  {
    title: "File through the right channel",
    body: "The IRS online assistant issues an EIN immediately for applicants with an SSN or ITIN. Fax filing generally returns the EIN in about four business days; mail can take four to five weeks. International applicants without an SSN or ITIN apply by phone or fax.",
  },
  {
    title: "Store the CP 575 notice",
    body: "The CP 575 confirmation is what banks, payroll providers, and brokers ask for. Keep it with the formation documents — the IRS will not reissue it, only a replacement 147C letter.",
  },
];

const PITFALLS = [
  "Legal name on the SS-4 does not exactly match the state filing — a common rejection cause.",
  "Naming a formation company or lawyer as the responsible party instead of a controlling individual.",
  "Applying before the state approves the formation, so the entity does not yet legally exist.",
  "Hitting the one-EIN-per-responsible-party-per-day limit when spinning up several entities at once.",
  "Selecting the wrong reason for applying, which can trigger unnecessary employment-tax filing expectations.",
  "Applying for a second EIN after a name change — a name change is an update, not a new EIN.",
];

const AFTER = [
  "Open the operating bank account — the EIN and CP 575 are prerequisites at almost every bank.",
  "Register for state tax accounts and any payroll withholding accounts you need.",
  "Set the cap table's start of record: founder shares or units, vesting, and the 83(b) clock.",
  "If you plan to raise, line up the offering exemption before you take the first check.",
];

function EinGuidePage() {
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
          <span>EIN for an LLC</span>
        </nav>

        <h1 className="mt-4 text-[clamp(2rem,4.5vw,3rem)] font-semibold leading-[1.08] tracking-tight">
          How to get an EIN for an LLC
        </h1>
        <p className="mt-5 text-[16px] leading-relaxed text-muted-foreground">
          An Employer Identification Number is the federal tax ID the IRS assigns to a business
          entity. An LLC needs one to open a bank account, run payroll, issue equity, and file
          returns. The application itself is Form SS-4, it is free, and the hard part is getting the
          details to line up with the state record and with how you intend to be taxed.
        </p>

        <section className="mt-12" aria-labelledby="steps">
          <h2 id="steps" className="text-[24px] font-semibold tracking-tight">
            The six steps
          </h2>
          <ol className="mt-6 space-y-5">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-4">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[12.5px] font-semibold text-primary">
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-[15.5px] font-semibold">{step.title}</h3>
                  <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-12" aria-labelledby="pitfalls">
          <h2 id="pitfalls" className="text-[24px] font-semibold tracking-tight">
            What gets applications rejected
          </h2>
          <ul className="mt-4 space-y-2 text-[14px] leading-relaxed text-muted-foreground">
            {PITFALLS.map((p) => (
              <li key={p}>• {p}</li>
            ))}
          </ul>
          <p className="mt-5 text-[13px] text-muted-foreground">
            Form SS-4 and its instructions are published by the{" "}
            <a
              className="underline underline-offset-2 hover:text-foreground"
              href="https://www.irs.gov/forms-pubs/about-form-ss-4"
              rel="noreferrer noopener"
              target="_blank"
            >
              IRS
            </a>
            . Processing times are the IRS's own published estimates and can change during peak
            filing periods.
          </p>
        </section>

        <section className="mt-12" aria-labelledby="after">
          <h2 id="after" className="text-[24px] font-semibold tracking-tight">
            After the EIN arrives
          </h2>
          <ul className="mt-4 space-y-2 text-[14px] leading-relaxed text-muted-foreground">
            {AFTER.map((a) => (
              <li key={a}>• {a}</li>
            ))}
          </ul>
        </section>

        <section className="mt-14 rounded-2xl border border-border bg-muted/30 p-7">
          <h2 className="text-[20px] font-semibold tracking-tight">
            Keep formation and EIN records in one place
          </h2>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
            Harmonious offers EIN application support for clients: our team prepares the SS-4,
            coordinates the submission with the responsible party, and keeps the IRS EIN letter
            alongside the formation documents. Your fund setup records each step and its outcome.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link to="/platform">
                Startup launch <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden />
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
