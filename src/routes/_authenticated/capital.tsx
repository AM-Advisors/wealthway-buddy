import { createFileRoute, Link } from "@tanstack/react-router";

import { InvestorCapitalSummary } from "@/components/investor-capital-summary";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/capital")({
  head: () => ({
    meta: [
      { title: "Capital summary — Harmonious" },
      {
        name: "description",
        content:
          "Your commitment, capital contributed, units and distributions for every Harmonious fund you are invested in.",
      },
      { property: "og:title", content: "Capital summary — Harmonious" },
      {
        property: "og:description",
        content: "Commitment, contributions, units, distributions and capital account statements.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CapitalSummaryPage,
});

function CapitalSummaryPage() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Capital summary</h1>
          <p className="text-sm text-muted-foreground">
            Your commitment, the capital the fund has received from you, the units recorded for you
            and every distribution.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/dashboard">Back to dashboard</Link>
        </Button>
      </header>
      <InvestorCapitalSummary />
    </div>
  );
}
