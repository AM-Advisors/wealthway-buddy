import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { ConfirmYourInformation } from "@/components/confirm-your-information";
import { InvestmentOfferingDocuments } from "@/components/investment-offering-documents";
import { InvestorCapitalSummary } from "@/components/investor-capital-summary";
import { InvestorFinancialsPanel } from "@/components/investor-financials-panel";
import { InvestorOnboardingJourney } from "@/components/investor-onboarding-journey";
import { InvestorPerformancePanel } from "@/components/investor-performance-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { INVESTMENT_TABS, normalizeInvestmentTab } from "@/lib/investment-workspace";

export const Route = createFileRoute("/_authenticated/investment/$onboardingId")({
  head: () => ({
    meta: [
      { title: "Your investment - Harmonious" },
      {
        name: "description",
        content:
          "One place for each investment: onboarding steps, capital, performance, reports, documents and tax.",
      },
      { property: "og:title", content: "Your investment - Harmonious" },
      { property: "og:description", content: "Your investment workspace in the Harmonious portal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { step?: string; tab?: string } => ({
    ...(typeof search["step"] === "string" ? { step: search["step"] as string } : {}),
    ...(typeof search["tab"] === "string" ? { tab: search["tab"] as string } : {}),
  }),
  component: InvestmentPage,
});

function InvestmentPage() {
  const { onboardingId } = Route.useParams();
  const search = Route.useSearch();
  const tab = normalizeInvestmentTab(search.tab, search.step);
  // RLS: investors read only their own onboarding row.
  const ctx = useQuery({
    queryKey: ["investment-context", onboardingId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("investor_onboardings")
        .select("offering_id, offerings(name)")
        .eq("id", onboardingId)
        .maybeSingle();
      return { offeringId: (data?.offering_id as string) ?? null, fundName: (data?.offerings?.name as string) ?? null };
    },
  });
  const offeringId = ctx.data?.offeringId ?? null;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <header className="space-y-1">
        <Link to="/home" className="text-sm text-muted-foreground underline">My investments</Link>
        <h1 className="text-2xl font-semibold">{ctx.data?.fundName ?? "Your investment"}</h1>
      </header>
      <nav className="flex flex-wrap gap-1 border-b pb-2" aria-label="Investment sections">
        {INVESTMENT_TABS.map((t) => (
          <Button key={t.id} asChild size="sm" variant={t.id === tab ? "default" : "ghost"}>
            <Link to="/investment/$onboardingId" params={{ onboardingId }} search={t.id === "overview" ? {} : { tab: t.id }}>
              {t.title}
            </Link>
          </Button>
        ))}
      </nav>

      {tab === "overview" || tab === "onboarding" ? (
        <>
          <InvestorOnboardingJourney onboardingId={onboardingId} requestedStep={search.step} />
          {tab === "onboarding" ? <ConfirmYourInformation onboardingId={onboardingId} /> : null}
          {tab === "overview" ? <InvestmentOfferingDocuments onboardingId={onboardingId} /> : null}
        </>
      ) : null}
      {tab === "capital" ? <InvestorCapitalSummary offeringId={offeringId} /> : null}
      {tab === "performance" ? <InvestorPerformancePanel offeringId={offeringId} embedded /> : null}
      {tab === "reports" ? (
        <>
          <InvestorFinancialsPanel offeringId={offeringId} embedded />
          <Jump to="statements" label="Capital account statements and distributions" />
        </>
      ) : null}
      {tab === "documents" ? <InvestmentOfferingDocuments onboardingId={onboardingId} /> : null}
      {tab === "activity" ? <Card><CardContent className="p-4 text-sm">See every step and payment in <Link to="/activity" className="underline">Activity</Link>.</CardContent></Card> : null}
      {tab === "tax" ? <Card><CardContent className="p-4 text-sm">Your K-1s and tax forms are in <Link to="/tax" className="underline">Tax</Link>.</CardContent></Card> : null}
    </main>
  );
}

function Jump({ to, label }: { to: string; label: string }) {
  return (
    <Link to="/investor-reporting" search={{ section: to }} className="text-sm underline">
      {label}
    </Link>
  );
}
