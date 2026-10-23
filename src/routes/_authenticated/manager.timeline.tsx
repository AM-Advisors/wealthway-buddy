import { createFileRoute, Link } from "@tanstack/react-router";

import { FundTimelineEditor } from "@/components/fund-timeline-editor";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/manager/timeline")({
  head: () => ({
    meta: [
      { title: "Fund Timeline - Harmonious Fund Manager" },
      {
        name: "description",
        content:
          "Set your fund's key dates - closing, wire deadline and launch - and share them in the due diligence room.",
      },
      { property: "og:title", content: "Fund Timeline - Harmonious Fund Manager" },
      {
        property: "og:description",
        content: "Set and publish your fund's key dates for investors.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManagerTimelinePage,
});

function ManagerTimelinePage() {
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Fund timeline</h1>
          <p className="text-sm text-muted-foreground">
            Every date investors plan around. Anything you mark visible appears on the Timeline tab
            of the fund's due diligence room.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/manager/offering-statement">Offering statement</Link>
        </Button>
      </header>

      <FundTimelineEditor />
    </main>
  );
}
