import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";

import { getMyPortfolioValue } from "@/lib/cap-table.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/investor/")({
  head: () => ({
    meta: [
      { title: "My Investments - Harmonious Investor Portal" },
      { name: "description", content: "Every fund you are invested in, with commitments, documents and messages." },
      { property: "og:title", content: "My Investments - Harmonious Investor Portal" },
      { property: "og:description", content: "Your funds, commitments and documents in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InvestorHome,
});

function money(cents: number | null | undefined) {
  if (cents == null) return "-";
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

function InvestorHome() {
  const load = useServerFn(getMyPortfolioValue);
  const { data, isLoading } = useQuery({ queryKey: ["my-portfolio-value"], queryFn: () => load() });
  const funds: any[] = ((data as any)?.funds ?? []) as any[];

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold">My investments</h1>
        <p className="text-sm text-muted-foreground">Open a fund to see its documents, deal room, payments, taxes and messages.</p>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : funds.length === 0 ? (
        <Card><CardContent className="py-6 text-sm text-muted-foreground">
          You don't have any investments yet. If you were invited to a fund, use the link in your invitation to begin.
        </CardContent></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {funds.map((f) => (
            <Link key={f.offering_id} to="/investor/fund/$offeringId" params={{ offeringId: f.offering_id }}>
              <Card className="h-full transition-colors hover:border-primary">
                <CardHeader>
                  <CardTitle className="text-base">{f.offering_name}</CardTitle>
                  <CardDescription>{f.share_class}{f.reg_type ? ` · Reg D ${f.reg_type}` : ""}</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-2 text-sm">
                  <div><p className="text-xs text-muted-foreground">Committed</p><p className="font-semibold">{money(f.commitment_cents)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Received</p><p className="font-semibold">{money(f.funded_cents)}</p></div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
