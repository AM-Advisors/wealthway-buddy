import { useState } from "react";

import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { readAttribution } from "@/lib/marketing/attribution";
import { submitLead } from "@/lib/marketing/leads.functions";
import { marketingHead } from "@/lib/marketing/seo";
import { CTAS, LEAD_INTENTS, ORGANIZATION, type CtaId, type LeadIntent } from "@/lib/marketing/site-config";

type Search = { cta?: CtaId | undefined; intent?: LeadIntent | undefined };

export const Route = createFileRoute("/contactus")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    cta: typeof s["cta"] === "string" && s["cta"] in CTAS ? (s["cta"] as CtaId) : undefined,
    intent: LEAD_INTENTS.some((i) => i.value === s["intent"]) ? (s["intent"] as LeadIntent) : undefined,
  }),
  head: () =>
    marketingHead({
      path: "/contactus",
      title: "Contact Harmonious — Schedule a Demo",
      description:
        "Talk to Harmonious about fund administration, SPVs, cap table management, investor onboarding or moving an existing fund.",
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Contact", path: "/contactus" },
      ],
    }),
  component: ContactPage,
});

function ContactPage() {
  const { cta, intent } = Route.useSearch();
  const send = useServerFn(submitLead);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const heading = cta ? CTAS[cta].label : "Schedule a Demo";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    setState("sending");
    try {
      await send({
        data: {
          name: String(f.get("name") ?? ""),
          workEmail: String(f.get("workEmail") ?? ""),
          company: String(f.get("company") ?? ""),
          intent: String(f.get("intent") ?? "other"),
          message: String(f.get("message") ?? ""),
          website: String(f.get("website") ?? ""),
          attribution: { ...readAttribution(), cta: cta ?? "contact", sourcePage: readAttribution().sourcePage },
        },
      });
      setState("sent");
    } catch (err) {
      setState("idle");
      setError(err instanceof Error ? err.message.slice(0, 200) : "Something went wrong.");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto grid max-w-6xl gap-12 px-4 py-14 lg:grid-cols-2 lg:py-20">
        <div>
          <h1 className="text-3xl leading-tight sm:text-4xl">{heading}</h1>
          <p className="mt-4 max-w-md text-muted-foreground">
            Tell us a little about what you need. A member of the Harmonious team will follow up to
            understand your fund, SPV or company.
          </p>
          <p className="mt-6 text-sm text-muted-foreground">
            Prefer email? <a className="underline" href={`mailto:${ORGANIZATION.email}`}>{ORGANIZATION.email}</a>
          </p>
        </div>

        {state === "sent" ? (
          <div className="rounded-xl border bg-card p-8" role="status">
            <h2 className="text-xl">Thanks — we've got it.</h2>
            <p className="mt-2 text-muted-foreground">We'll be in touch shortly.</p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4 rounded-xl border bg-card p-6 sm:p-8">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required maxLength={120} autoComplete="name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="workEmail">Work email</Label>
              <Input id="workEmail" name="workEmail" type="email" required maxLength={254} autoComplete="email" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="company">Company</Label>
              <Input id="company" name="company" required maxLength={160} autoComplete="organization" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="intent">What can we help with?</Label>
              <select
                id="intent"
                name="intent"
                defaultValue={intent ?? "other"}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {LEAD_INTENTS.map((i) => (
                  <option key={i.value} value={i.value}>{i.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="message">Anything else? (optional)</Label>
              <Textarea id="message" name="message" maxLength={2000} rows={3} />
            </div>
            <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={state === "sending"}>
              {state === "sending" ? "Sending…" : "Send"}
            </Button>
          </form>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
