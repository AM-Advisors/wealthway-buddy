import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { getPublicFundPage, requestFundAccess } from "@/lib/public-fund.functions";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";

const SITE = "https://onboard.harmonious.co";

export const Route = createFileRoute("/fund/$slug")({
  loader: async ({ params }) => {
    const fund = await getPublicFundPage({ data: { slug: params.slug } });
    if (!fund) throw notFound();
    return { fund };
  },
  head: ({ params, loaderData }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Fund unavailable — Harmonious" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const { fund } = loaderData;
    const description = (fund.summary || `${fund.name} investor overview.`).slice(0, 155);
    const url = `${SITE}/fund/${params.slug}`;
    return {
      meta: [
        { title: `${fund.name} — Harmonious` },
        { name: "description", content: description },
        { property: "og:title", content: `${fund.name} — Harmonious` },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary" },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "InvestmentFund",
            name: fund.name,
            description,
            url,
          }),
        },
      ],
    };
  },
  errorComponent: () => (
    <Shell>
      <h1 className="text-2xl font-semibold">This page could not be loaded</h1>
      <p className="text-muted-foreground">Please try again in a moment.</p>
    </Shell>
  ),
  notFoundComponent: () => (
    <Shell>
      <h1 className="text-2xl font-semibold">Fund not found</h1>
      <p className="text-muted-foreground">
        This fund page is not published. If you were sent a link, ask your contact to share it
        again.
      </p>
    </Shell>
  ),
  component: PublicFundPage,
});

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-5xl space-y-4 px-4 py-16">{children}</main>;
}

function money(cents?: number | null) {
  if (!cents) return "$0";
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

function AccessRequestForm({ slug, fundName }: { slug: string; fundName: string }) {
  const submit = useServerFn(requestFundAccess);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    firm: "",
    phone: "",
    message: "",
    website: "",
  });
  const [done, setDone] = useState(false);

  const mutation = useMutation({
    mutationFn: () => submit({ data: { slug, ...form } }),
    onSuccess: () => setDone(true),
  });

  if (done) {
    return (
      <Card id="request-access">
        <CardHeader>
          <CardTitle>Request received</CardTitle>
          <CardDescription>
            Thank you. The {fundName} team will be in touch about access to the full materials.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <Card id="request-access">
      <CardHeader>
        <CardTitle>Request access to the full materials</CardTitle>
        <CardDescription>
          Offering documents and the diligence room are shared after a short introduction.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="rq-name">Your name</Label>
            <Input id="rq-name" value={form.full_name} onChange={set("full_name")} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rq-email">Email</Label>
            <Input id="rq-email" type="email" value={form.email} onChange={set("email")} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rq-firm">Firm (optional)</Label>
            <Input id="rq-firm" value={form.firm} onChange={set("firm")} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rq-phone">Phone (optional)</Label>
            <Input id="rq-phone" value={form.phone} onChange={set("phone")} />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="rq-message">Anything we should know? (optional)</Label>
          <Textarea id="rq-message" rows={3} value={form.message} onChange={set("message")} />
        </div>
        {/* Spam trap — hidden from people. */}
        <input
          className="hidden"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={form.website}
          onChange={set("website")}
        />
        {mutation.isError ? (
          <p className="text-sm text-destructive">{(mutation.error as Error).message}</p>
        ) : null}
        <Button
          disabled={
            mutation.isPending || form.full_name.trim().length < 2 || !form.email.includes("@")
          }
          onClick={() => mutation.mutate()}
        >
          Request access
        </Button>
      </CardContent>
    </Card>
  );
}

function DeckViewer({
  slides,
}: {
  slides: { id: string; heading: string | null; caption: string | null; image_url: string | null }[];
}) {
  const [index, setIndex] = useState(0);
  if (slides.length === 0) {
    return <p className="text-sm text-muted-foreground">Slides are being prepared.</p>;
  }
  const slide = slides[Math.min(index, slides.length - 1)]!;
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border bg-muted">
        {slide.image_url ? (
          <img
            src={slide.image_url}
            alt={slide.heading ?? `Slide ${index + 1}`}
            className="w-full object-contain"
            loading="lazy"
          />
        ) : (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            Slide unavailable
          </div>
        )}
      </div>
      {slide.heading ? <p className="font-medium">{slide.heading}</p> : null}
      {slide.caption ? <p className="text-sm text-muted-foreground">{slide.caption}</p> : null}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          disabled={index === 0}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
        >
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          Slide {index + 1} of {slides.length}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={index >= slides.length - 1}
          onClick={() => setIndex((i) => Math.min(slides.length - 1, i + 1))}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function PublicFundPage() {
  const { fund } = Route.useLoaderData();
  const progress =
    fund.target_raise_cents && fund.target_raise_cents > 0
      ? Math.min(100, (fund.committed_cents / fund.target_raise_cents) * 100)
      : null;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-4 py-10">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {fund.reg_type ? <Badge variant="secondary">Reg D {fund.reg_type}</Badge> : null}
          <Badge variant={fund.is_open ? "default" : "outline"}>
            {fund.is_open ? "Open to investors" : "Closed"}
          </Badge>
        </div>
        <h1 className="text-3xl font-semibold">{fund.headline}</h1>
        {fund.summary ? (
          <p className="max-w-3xl whitespace-pre-line text-muted-foreground">{fund.summary}</p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <a href="#request-access">Request access</a>
          </Button>
          <Button asChild variant="outline">
            <Link to="/auth">Investor sign in</Link>
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>The numbers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Committed</p>
              <p className="text-lg font-semibold">{money(fund.committed_cents)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Received</p>
              <p className="text-lg font-semibold">{money(fund.received_cents)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Investors</p>
              <p className="text-lg font-semibold">{fund.investor_count}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Minimum</p>
              <p className="text-lg font-semibold">{money(fund.min_investment_cents)}</p>
            </div>
          </div>
          {progress != null ? (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Progress to target</span>
                <span>
                  {money(fund.committed_cents)} of {money(fund.target_raise_cents)}
                </span>
              </div>
              <Progress value={progress} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {fund.deck ? (
        <Card>
          <CardHeader>
            <CardTitle>{fund.deck.title}</CardTitle>
            {fund.deck.summary ? <CardDescription>{fund.deck.summary}</CardDescription> : null}
          </CardHeader>
          <CardContent>
            <DeckViewer slides={fund.deck.slides} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Offering documents</CardTitle>
          <CardDescription>
            Listed here for reference. Request access to read and sign them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {fund.documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Documents are being prepared.</p>
          ) : (
            <ul className="divide-y">
              {fund.documents.map((doc) => (
                <li key={doc.title} className="flex items-center justify-between gap-3 py-2">
                  <div>
                    <p className="font-medium">{doc.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.doc_type}
                      {doc.requires_signature ? " · signature required" : ""}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <a href="#request-access">Request</a>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cap table</CardTitle>
          <CardDescription>Current investors, commitments and ownership.</CardDescription>
        </CardHeader>
        <CardContent>
          {fund.cap_table.length === 0 ? (
            <p className="text-sm text-muted-foreground">No investors have committed yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-3">Investor</th>
                    <th className="py-2 pr-3 text-right">Committed</th>
                    <th className="py-2 pr-3 text-right">Received</th>
                    <th className="py-2 pr-3 text-right">Units</th>
                    <th className="py-2 text-right">Ownership</th>
                  </tr>
                </thead>
                <tbody>
                  {fund.cap_table.map((row, i) => (
                    <tr key={`${row.name}-${i}`} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        {row.name}
                        <span className="block text-xs text-muted-foreground">
                          {row.share_class}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {money(row.commitment_cents)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {money(row.received_cents)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {row.shares == null ? "—" : row.shares.toLocaleString("en-US")}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {row.ownership_pct.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AccessRequestForm slug={fund.slug} fundName={fund.name} />

      <p className="text-xs text-muted-foreground">
        This page is for information only and is not an offer to sell or a solicitation to buy any
        security. Any investment is made solely through the fund's offering documents.
      </p>
    </main>
  );
}
