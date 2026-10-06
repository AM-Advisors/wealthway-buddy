import { Link } from "@tanstack/react-router";
import { ArrowDown, Download } from "lucide-react";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Button } from "@/components/ui/button";

export type Tier = { label: string; title: string; points: string[] };
export type Box = { title: string; subtitle: string; points: string[] };
export type SolutionGuide = {
  eyebrow: string;
  title: string;
  subtitle: string;
  overview: string;
  tiers: Tier[];
  flows: string[];
  targets: Box[];
  matrix: Box[];
  pillars: { title: string; body: string }[];
  download: { href: string; label: string };
  collateral?: { src: string; alt: string }[];
};

export const PROOF = "$24B+ AUA · 750+ Fund Managers · Your Funds On Easy Mode";

export function SolutionGuidePage({ g }: { g: SolutionGuide }) {
  return (
    <MarketingShell>
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <p className="font-heading text-sm uppercase tracking-[0.16em] text-accent">{g.eyebrow}</p>
          <h1 className="mt-3 font-heading text-[clamp(2rem,4.5vw,3rem)] font-semibold leading-tight">{g.title}</h1>
          <p className="mt-3 max-w-3xl text-lg opacity-90">{g.subtitle}</p>
          <div className="mt-6 h-px bg-accent" />
          <p className="mt-6 max-w-3xl leading-relaxed opacity-90">{g.overview}</p>
          <div className="mt-8 flex flex-wrap gap-2">
            <Button asChild variant="secondary"><a href={g.download.href} download><Download className="mr-2 h-4 w-4" />{g.download.label}</a></Button>
            <Button asChild variant="outline" className="border-accent bg-transparent text-primary-foreground hover:bg-accent/20"><Link to="/contactus">Talk to our team</Link></Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-14">
        <p className="font-heading text-sm uppercase tracking-[0.16em] text-accent">Capital flow &amp; lifecycle architecture</p>
        <h2 className="mt-2 font-heading text-2xl font-semibold">Three tiers, one record</h2>
        <div className="mt-8 space-y-2">
          {g.tiers.map((t, i) => (
            <div key={t.label}>
              <div className={`rounded-xl border p-6 ${i === 1 ? "border-accent bg-accent/10" : "border-border bg-card"}`}>
                <p className="text-xs font-semibold uppercase tracking-wide text-accent">{t.label}</p>
                <h3 className="mt-1 font-heading text-lg font-semibold">{t.title}</h3>
                <ul className="mt-3 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">{t.points.map((p) => <li key={p}>• {p}</li>)}</ul>
              </div>
              {g.flows[i] && (
                <p className="flex items-center justify-center gap-2 py-3 text-sm font-medium text-muted-foreground"><ArrowDown className="h-4 w-4 text-accent" />{g.flows[i]}</p>
              )}
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {g.targets.map((b) => <BoxCard key={b.title} b={b} />)}
        </div>
      </section>

      <section className="bg-muted/40">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <p className="font-heading text-sm uppercase tracking-[0.16em] text-accent">Core services matrix</p>
          <h2 className="mt-2 font-heading text-2xl font-semibold">Full-lifecycle administration, formation to final distribution</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {g.matrix.map((b, i) => <BoxCard key={b.title} b={{ ...b, title: `${i + 1}. ${b.title}` }} />)}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-14">
        <p className="font-heading text-sm uppercase tracking-[0.16em] text-accent">Why managers choose Harmonious</p>
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          {g.pillars.map((p) => (
            <div key={p.title} className="border-t-2 border-accent pt-4">
              <h3 className="font-heading text-lg font-semibold">{p.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{p.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-10 text-sm text-muted-foreground">{PROOF}</p>
      </section>

      {g.collateral?.length ? (
        <section className="bg-muted/40">
          <div className="mx-auto max-w-6xl px-6 py-14">
            <p className="font-heading text-sm uppercase tracking-[0.16em] text-accent">Collateral</p>
            <h2 className="mt-2 font-heading text-2xl font-semibold">Two-page overview</h2>
            <div className="mt-8 grid gap-6 md:grid-cols-2">
              {g.collateral.map((c) => (
                <a key={c.src} href={c.src} download className="block overflow-hidden rounded-xl border border-border shadow-sm">
                  <img src={c.src} alt={c.alt} loading="lazy" className="w-full" />
                </a>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </MarketingShell>
  );
}

function BoxCard({ b }: { b: Box }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">{b.title}</p>
      <h3 className="mt-1 font-heading font-semibold">{b.subtitle}</h3>
      <ul className="mt-3 space-y-1 border-t border-border pt-3 text-sm text-muted-foreground">{b.points.map((p) => <li key={p}>• {p}</li>)}</ul>
    </div>
  );
}
