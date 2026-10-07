import { Link } from "@tanstack/react-router";
import { AlertTriangle, ShieldCheck } from "lucide-react";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { SECURITY_STATEMENT } from "@/lib/security-content";
import { OPEN_SETTINGS_EVENT } from "@/lib/cookie-consent";

/**
 * Harmonious-owned security statement. Deliberately plain and text-first: it
 * describes controls, never shows scorecards, badges or compliance seals.
 */
export function SecurityCenterPage() {
  const s = SECURITY_STATEMENT;
  return (
    <MarketingShell>
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-4xl px-6 py-16">
          <p className="font-heading text-sm uppercase tracking-[0.16em] text-accent">{s.eyebrow}</p>
          <h1 className="mt-3 font-heading text-[clamp(1.9rem,4vw,2.75rem)] font-semibold leading-tight">
            {s.title}
          </h1>
          <div className="mt-6 h-px w-24 bg-accent" />
          <p className="mt-6 max-w-3xl leading-relaxed opacity-90">{s.summary}</p>
          <p className="mt-6 text-sm opacity-75">Last updated {s.updated}</p>
        </div>
      </section>

      <article className="mx-auto max-w-3xl px-6 py-14">
        {s.sections.map((section) => (
          <section key={section.heading} className="mb-12 last:mb-0">
            <h2 className="flex items-center gap-2 font-heading text-xl font-semibold">
              <ShieldCheck className="h-5 w-5 shrink-0 text-accent" aria-hidden />
              {section.heading}
            </h2>
            {section.intro ? (
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{section.intro}</p>
            ) : null}
            <ul className="mt-4 space-y-3">
              {section.bullets.map((b) => (
                <li key={b} className="flex gap-3 text-sm leading-relaxed">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            {section.heading === "Cookies and your consent" ? (
              <button
                type="button"
                className="mt-4 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
                onClick={() => window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT))}
              >
                Cookie settings
              </button>
            ) : null}
          </section>
        ))}

        <section className="mb-12">
          <h2 className="flex items-center gap-2 font-heading text-xl font-semibold">
            <AlertTriangle className="h-5 w-5 shrink-0 text-warning" aria-hidden />
            What this page does not claim
          </h2>
          <ul className="mt-4 space-y-3">
            {s.disclaimers.map((d) => (
              <li key={d} className="text-sm leading-relaxed text-muted-foreground">
                {d}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border bg-muted/40 p-6">
          <h2 className="font-heading text-lg font-semibold">Report a concern</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Found something that looks wrong or unsafe? Write to{" "}
            <a className="underline" href={`mailto:${s.contact}`}>
              {s.contact}
            </a>
            . A person reads every message, and two staff members must confirm your identity before
            we change anything on your account.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            Related:{" "}
            <Link className="underline" to="/privacy">
              Privacy Policy
            </Link>
            {" · "}
            <Link className="underline" to="/terms">
              Terms of Service
            </Link>
            {" · "}
            <a className="underline" href="/.well-known/trust.html">
              Hosting provider&rsquo;s platform evidence
            </a>
          </p>
        </section>
      </article>
    </MarketingShell>
  );
}
