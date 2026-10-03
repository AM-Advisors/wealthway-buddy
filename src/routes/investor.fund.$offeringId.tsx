import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { getMyPortfolioValue } from "@/lib/cap-table.functions";
import { DiligenceRoom } from "@/components/diligence-room";
import { DocumentsStep } from "@/components/steps/documents-step";
import { InvestorSharePanel } from "@/components/investor-share-panel";
import { InvestorReportingCenter } from "@/components/investor-reporting-center";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { investorFundStatusFn } from "@/lib/investor-fund-page.functions";
import {
  FundCapitalCallsPanel,
  FundTaxDocumentsPanel,
  InvestorFundMessages,
  InvestorFundStatusPanel,
} from "@/components/investor-fund-panels";

type Tab = "overview" | "my-share" | "documents" | "deal-room" | "payments" | "taxes" | "messages" | "updates";

const TABS: { value: Tab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "my-share", label: "My Share" },
  { value: "documents", label: "Documents" },
  { value: "deal-room", label: "Deal room" },
  { value: "payments", label: "Payments" },
  { value: "taxes", label: "Taxes" },
  { value: "messages", label: "Messages" },
  { value: "updates", label: "Updates" },
];

export const Route = createFileRoute("/investor/fund/$offeringId")({
  head: () => ({
    meta: [
      { title: "Fund - Harmonious Investor Portal" },
      { name: "description", content: "Your investment in this fund: overview, documents, deal room, payments, taxes, messages and updates." },
      { property: "og:title", content: "Fund - Harmonious Investor Portal" },
      { property: "og:description", content: "Overview, documents, deal room, payments and taxes for one fund." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } =>
    TABS.some((t) => t.value === s["tab"]) ? { tab: s["tab"] as Tab } : {},
  component: InvestorFund,
});

function money(cents: number | null | undefined) {
  if (cents == null) return "-";
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

function InvestorFund() {
  const { offeringId } = Route.useParams();
  const { tab = "overview" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const load = useServerFn(getMyPortfolioValue);
  const { data, isLoading } = useQuery({ queryKey: ["my-portfolio-value"], queryFn: () => load() });
  const fund = (((data as any)?.funds ?? []) as any[]).find((f) => f.offering_id === offeringId);
  const loadStatus = useServerFn(investorFundStatusFn);
  const status = useQuery({
    queryKey: ["investor-fund-status", offeringId],
    queryFn: () => loadStatus({ data: { offeringId } }),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <Button asChild variant="ghost" size="sm">
        <Link to="/investor"><ArrowLeft className="mr-1 h-4 w-4" />My investments</Link>
      </Button>
      <h1 className="text-2xl font-semibold">{fund?.offering_name ?? (isLoading ? "Loading…" : "Fund")}</h1>

      <Tabs value={tab} onValueChange={(v) => navigate({ search: { tab: v as Tab }, replace: true })}>
        <TabsList className="flex h-auto flex-wrap justify-start">
          {TABS.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          {fund ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Your position</CardTitle>
                <CardDescription>{fund.share_class}{fund.reg_type ? ` · Reg D ${fund.reg_type}` : ""}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 text-sm sm:grid-cols-3">
                <Stat label="Committed" value={money(fund.commitment_cents)} />
                <Stat label="Received by the fund" value={money(fund.funded_cents)} />
                <Stat label="Equity value" value={money(fund.equity_value_cents)} />
              </CardContent>
            </Card>
          ) : !isLoading ? (
            <Card><CardContent className="py-6 text-sm text-muted-foreground">
              You don't have a position in this fund yet. Its documents and deal room are in the other tabs.
            </CardContent></Card>
          ) : null}
          <InvestorFundStatusPanel offeringId={offeringId} />
        </TabsContent>
        <TabsContent value="my-share" className="mt-4"><InvestorSharePanel offeringId={offeringId} /></TabsContent>
        <TabsContent value="documents" className="mt-4"><DocumentsStep offeringId={offeringId} /></TabsContent>
        <TabsContent value="deal-room" className="mt-4"><DiligenceRoom offeringId={offeringId} /></TabsContent>
        <TabsContent value="payments" className="mt-4"><FundCapitalCallsPanel offeringId={offeringId} /></TabsContent>
        <TabsContent value="taxes" className="mt-4"><FundTaxDocumentsPanel offeringId={offeringId} /></TabsContent>
        <TabsContent value="messages" className="mt-4">
          <InvestorFundMessages applicationId={status.data?.applicationId ?? null} />
        </TabsContent>
        <TabsContent value="updates" className="mt-4"><InvestorReportingCenter /></TabsContent>
      </Tabs>
    </div>
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
