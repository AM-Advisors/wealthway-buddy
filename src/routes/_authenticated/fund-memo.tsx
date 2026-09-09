import { useState } from "react";

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MEMO_SECTIONS, getMemoForInvestor } from "@/lib/offering-memo.functions";

export const Route = createFileRoute("/_authenticated/fund-memo")({
  head: () => ({
    meta: [
      { title: "Offering Memo — Harmonious Investor Portal" },
      {
        name: "description",
        content:
          "Read your fund's offering memo: the strategy, opportunity, terms, team and risks, alongside the legal documents.",
      },
      { property: "og:title", content: "Offering Memo — Harmonious Investor Portal" },
      {
        property: "og:description",
        content: "The fund's own account of its strategy, terms, team and risks.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FundMemoPage,
});

function FundMemoPage() {
  const load = useServerFn(getMemoForInvestor);
  const [fundId, setFundId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["fund-memo", fundId],
    queryFn: () => load({ data: { offering_id: fundId } }),
  });

  if (isLoading) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 text-sm text-muted-foreground">Loading…</main>
    );
  }

  const funds = data?.funds ?? [];
  const memo: any = data?.memo ?? null;
  const sections = MEMO_SECTIONS.filter((s) => (memo?.[s.key] ?? "").trim().length > 0);

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Offering memo</h1>
          <p className="text-sm text-muted-foreground">
            Your fund's own account of what it does and why. Read it with the legal documents.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/fund-documents">Legal documents</Link>
        </Button>
      </header>

      {funds.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {funds.map((fund) => (
            <Button
              key={fund.id}
              size="sm"
              variant={data?.selected?.id === fund.id ? "default" : "outline"}
              onClick={() => setFundId(fund.id)}
            >
              {fund.name}
            </Button>
          ))}
        </div>
      )}

      {funds.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-sm text-muted-foreground">
            You are not attached to a fund yet. Once your invitation is accepted, the fund's memo
            will appear here.
          </CardContent>
        </Card>
      ) : !memo || sections.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-sm text-muted-foreground">
            Your fund manager has not published a memo for {data?.selected?.name ?? "this fund"}{" "}
            yet. The legal documents are still available.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{memo.headline || data?.selected?.name || "Offering memo"}</CardTitle>
            <CardDescription>
              {data?.selected?.name}
              {data?.selected?.reg_type ? ` · Reg D ${data.selected.reg_type}` : ""}
              {memo.published_at
                ? ` · Published ${new Date(memo.published_at).toLocaleDateString()}`
                : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {sections.map((section) => (
              <section key={section.key} className="space-y-2">
                <h2 className="text-lg font-medium">{section.label}</h2>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {memo[section.key]}
                </p>
              </section>
            ))}
          </CardContent>
        </Card>
      )}
    </main>
  );
}
