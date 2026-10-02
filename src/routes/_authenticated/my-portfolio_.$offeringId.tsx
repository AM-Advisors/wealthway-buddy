import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { getMyPortfolioValue } from "@/lib/cap-table.functions";
import { DiligenceRoom } from "@/components/diligence-room";
import { DocumentsStep } from "@/components/steps/documents-step";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Tab = "investment" | "documents" | "deal-room";

export const Route = createFileRoute("/_authenticated/my-portfolio_/$offeringId")({
  head: () => ({
    meta: [
      { title: "Your Fund - Harmonious" },
      {
        name: "description",
        content: "Your investment in this fund: holdings, fund documents and the fund's deal room.",
      },
      { property: "og:title", content: "Your Fund - Harmonious" },
      { property: "og:description", content: "Investment details, documents and deal room for one fund." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } =>
    s["tab"] === "documents" || s["tab"] === "deal-room" || s["tab"] === "investment"
      ? { tab: s["tab"] as Tab }
      : {},
  component: InvestorFundPage,
});

function money(cents: number | null | undefined) {
  if (cents == null) return "-";
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

function InvestorFundPage() {
  const { offeringId } = Route.useParams();
  const { tab = "investment" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const load = useServerFn(getMyPortfolioValue);
  const { data, isLoading } = useQuery({ queryKey: ["my-portfolio-value"], queryFn: () => load() });
  const funds: any[] = ((data as any)?.funds ?? []) as any[];
  const fund = funds.find((f) => f.offering_id === offeringId);

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <Button asChild variant="ghost" size="sm">
        <Link to="/my-portfolio"><ArrowLeft className="mr-1 h-4 w-4" />My portfolio</Link>
      </Button>
      <h1 className="text-2xl font-semibold">{fund?.offering_name ?? (isLoading ? "Loading…" : "Fund")}</h1>

      <Tabs value={tab} onValueChange={(v) => navigate({ search: { tab: v as Tab }, replace: true })}>
        <TabsList>
          <TabsTrigger value="investment">Investment information</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="deal-room">Deal room</TabsTrigger>
        </TabsList>

        <TabsContent value="investment" className="mt-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !fund ? (
            <Card><CardContent className="py-6 text-sm text-muted-foreground">
              You don't have a position in this fund yet. Its documents and deal room are in the other tabs.
            </CardContent></Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Your position</CardTitle>
                <CardDescription>
                  {fund.share_class}
                  {fund.reg_type ? ` · Reg D ${fund.reg_type}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 text-sm sm:grid-cols-3">
                <Stat label="Committed" value={money(fund.commitment_cents)} />
                <Stat label="Received by the fund" value={money(fund.funded_cents)} />
                <Stat label="Equity value" value={money(fund.equity_value_cents)} />
                <Stat label="Shares" value={fund.shares != null ? Number(fund.shares).toLocaleString("en-US") : "-"} />
                <Stat label="Price per share" value={money(fund.share_price_cents)} />
                <Stat label="Share of fund" value={fund.pct_of_committed ? `${Number(fund.pct_of_committed).toFixed(2)}%` : "0%"} />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <DocumentsStep offeringId={offeringId} />
        </TabsContent>

        <TabsContent value="deal-room" className="mt-4">
          <DiligenceRoom offeringId={offeringId} />
        </TabsContent>
      </Tabs>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
