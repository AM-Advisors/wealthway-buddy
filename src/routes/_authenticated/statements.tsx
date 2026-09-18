import { createFileRoute, Link } from "@tanstack/react-router";

import { InvestorStatementsPanel } from "@/components/investor-statements-panel";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/statements")({
  head: () => ({
    meta: [
      { title: "Capital account statements — Harmonious" },
      {
        name: "description",
        content:
          "Your capital account statement for each period: opening capital, contributions, income, fees, distributions and closing capital.",
      },
      { property: "og:title", content: "Capital account statements — Harmonious" },
      {
        property: "og:description",
        content: "Period by period capital account statements for every fund you are invested in.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StatementsPage,
});

function StatementsPage() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Capital account statements</h1>
          <p className="text-sm text-muted-foreground">
            One statement for each account you hold, for each closed period.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/capital">Capital summary</Link>
        </Button>
      </header>
      <InvestorStatementsPanel />
    </div>
  );
}
