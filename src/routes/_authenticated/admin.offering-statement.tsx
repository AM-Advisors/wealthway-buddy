import { createFileRoute, Link } from "@tanstack/react-router";

import { OfferingStatementEditor } from "@/components/offering-statement-editor";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/offering-statement")({
  head: () => ({
    meta: [
      { title: "Offering Statement — Harmonious Admin" },
      {
        name: "description",
        content:
          "Enter each fund's offering terms — fees, minimums, closings and distributions — and publish them to the due diligence room.",
      },
      { property: "og:title", content: "Offering Statement — Harmonious Admin" },
      {
        property: "og:description",
        content: "Enter and publish offering terms for each fund.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminOfferingStatementPage,
});

function AdminOfferingStatementPage() {
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Offering statement</h1>
          <p className="text-sm text-muted-foreground">
            Pick a fund, enter its offering terms and publish them to the due diligence room.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/admin/memo">Offering memo</Link>
        </Button>
      </header>

      <OfferingStatementEditor />
    </main>
  );
}
