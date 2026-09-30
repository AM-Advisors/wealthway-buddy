import { Link, createFileRoute } from "@tanstack/react-router";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Button } from "@/components/ui/button";
import { seoLinks, seoMeta } from "@/lib/seo";

const TITLE = "Solutions — Harmonious";
const DESCRIPTION =
  "Fund administration, SPVs, cap table management and investor onboarding from Harmonious, on one record of every fund, investor and investment.";

export const Route = createFileRoute("/solutions/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      ...seoMeta("/solutions"),
    ],
    links: seoLinks("/solutions"),
  }),
  component: SolutionsPage,
});

const SOLUTIONS = [
  { to: "/fund-administration", title: "Fund administration", body: "Fund setup, investor onboarding, capital activity, financial statements and reviewed investor reporting." },
  { to: "/spvs", title: "SPV administration", body: "Stand up an SPV, onboard its investors, collect signatures and track funding against the bank." },
  { to: "/cap-table", title: "Cap table management", body: "Shares, classes, certificates and holder access, with corrections kept as a clear history." },
  { to: "/platform", title: "Investor onboarding", body: "About you, identity verification, signing and funding in four clear steps, with a separate investing profile for each entity." },
] as const;

function SolutionsPage() {
  return (
    <MarketingShell>
      <section className="mx-auto max-w-5xl px-6 py-16">
        <h1 className="font-heading text-4xl font-semibold tracking-tight">Solutions</h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">{DESCRIPTION}</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {SOLUTIONS.map((s) => (
            <Link key={s.to} to={s.to} className="rounded-xl border border-border p-6 transition-colors hover:bg-muted/40">
              <h2 className="text-lg font-semibold">{s.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
            </Link>
          ))}
        </div>
        <div className="mt-10 flex gap-2">
          <Button asChild><Link to="/contactus">Talk to us</Link></Button>
          <Button asChild variant="outline"><Link to="/resources">Read the guides</Link></Button>
        </div>
      </section>
    </MarketingShell>
  );
}
