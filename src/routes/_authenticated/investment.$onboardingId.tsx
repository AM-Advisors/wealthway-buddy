import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { ConfirmYourInformation } from "@/components/confirm-your-information";
import { InvestmentOfferingDocuments } from "@/components/investment-offering-documents";
import { InvestorSignedDocuments } from "@/components/investor-signed-documents";
import { InvestorCapitalSummary } from "@/components/investor-capital-summary";
import { InvestorFinancialsPanel } from "@/components/investor-financials-panel";
import { InvestorOnboardingJourney } from "@/components/investor-onboarding-journey";
import { InvestorPerformancePanel } from "@/components/investor-performance-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { onboardingDetailFn } from "@/lib/investor-onboarding.functions";
import { INVESTMENT_TABS, normalizeInvestmentTab } from "@/lib/investment-workspace";
import { LoadError } from "@/components/load-error";
import { InvestmentChecklist } from "@/components/investment-readiness";

export const Route = createFileRoute("/_authenticated/investment/$onboardingId")({
  head: () => ({
    meta: [
      { title: "Your investment | Harmonious" },
      {
        name: "description",
        content:
          "One place for each investment: onboarding steps, capital, performance, reports, documents and tax.",
      },
      { property: "og:title", content: "Your investment | Harmonious" },
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
  const load = useServerFn(onboardingDetailFn);
  // Reuse the canonical authorized read used by the journey, not a separate
  // fund join whose visibility depends on legacy application/access records.
  const ctx = useQuery({
    queryKey: ["onboarding", onboardingId],
    queryFn: () => load({ data: { onboardingId } }),
  });
  const offeringId = ctx.data?.offering?.id ?? null;
  if (ctx.isPending) return <main className="mx-auto max-w-3xl px-4 py-10"><p className="text-sm text-muted-foreground">Loading your investment…</p></main>;
  if (ctx.error) return <main className="mx-auto max-w-3xl px-4 py-10"><LoadError audience="account" error={ctx.error} what="Your investment details" onRetry={() => void ctx.refetch()} /></main>;

  // Until the investment closes, show only the guided steps and documents; reports come later.
  const onboarding = !["closed", "declined", "cancelled"].includes(String(ctx.data?.stage ?? ""));
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <header className="space-y-1">
        <Link to="/home" className="text-sm text-muted-foreground underline">My investments</Link>
        <h1 className="text-2xl font-semibold">{ctx.data?.offering?.name ?? "Your investment"}</h1>
      </header>
      <nav className="flex flex-wrap gap-1 border-b pb-2" aria-label="Investment sections">
        {INVESTMENT_TABS.filter((t) => !onboarding || t.id === "overview" || t.id === "documents").map((t) => (
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
          {ctx.data?.executedSnapshot ? <InvestorSignedDocuments onboardingId={onboardingId} /> : null}
          {tab === "onboarding" ? <ConfirmYourInformation onboardingId={onboardingId} /> : null}
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
      {tab === "documents" ? <><InvestorSignedDocuments onboardingId={onboardingId} /><InvestmentOfferingDocuments onboardingId={onboardingId} /></> : null}
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
