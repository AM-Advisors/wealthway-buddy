import { Link, createFileRoute } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { LogoIcon } from "@/components/Logo";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About Harmonious Capital Administration" },
      {
        name: "description",
        content:
          "Harmonious Capital Administration exists to foster financial prosperity and harmony for its clients through an innovative platform for fund formation, administration and investor onboarding.",
      },
      { property: "og:title", content: "About Harmonious Capital Administration" },
      {
        property: "og:description",
        content:
          "Our mission, our values and the way we work with sponsors, fund managers and investors.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AboutPage,
});

const VALUES = [
  "Friendly",
  "Approachable",
  "Knowledgeable",
  "Educational",
  "Open",
  "Honest",
  "Trustworthy",
  "Respected",
  "Useful",
  "Easy",
] as const;

function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main>
        <section className="bg-brand-gradient text-primary-foreground">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <LogoIcon variant="teal" className="h-12 w-auto" />
            <h1 className="mt-8 max-w-3xl text-4xl leading-[1.1] sm:text-5xl">Our Mission</h1>
            <p className="mt-6 max-w-3xl text-lg text-primary-foreground/75">
              To use our platform to foster financial prosperity and harmony for our clients. We
              are dedicated to optimising their financial resources, protecting their assets and
              enabling them to achieve their long-term financial goals, all on a strong foundation
              of trust and integrity — a seamless and secure experience, driven by continuous
              innovation and a steadfast commitment to ethical practices.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-20">
          <h2 className="text-3xl leading-tight sm:text-4xl">How We Show Up</h2>
          <ul className="mt-10 flex flex-wrap gap-3">
            {VALUES.map((v) => (
              <li
                key={v}
                className="rounded-full border border-accent/60 bg-accent/10 px-4 py-2 text-sm"
              >
                {v}
              </li>
            ))}
          </ul>

          <div className="mt-16 grid gap-6 md:grid-cols-3">
            {[
              [
                "Administrators, not advisers",
                "Harmonious administers funds and runs onboarding. We are not an investment adviser or a broker-dealer, and nothing we publish is an offer of securities.",
              ],
              [
                "Documents belong to you",
                "Templates are a starting point. Your counsel tailors the offering documents, and every version is kept.",
              ],
              [
                "Privacy by default",
                "Bank details, signed documents and investor files sit in restricted storage, reachable only by the people granted access.",
              ],
            ].map(([title, body]) => (
              <article key={title} className="rounded-xl border bg-card p-7">
                <h3 className="text-lg">{title}</h3>
                <p className="mt-3 text-sm text-muted-foreground">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-t bg-secondary/50">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-2xl">Work with us.</h2>
            <div className="flex gap-3">
              <Button asChild size="lg">
                <Link to="/auth/register">Get started</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/auth">Sign in</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
