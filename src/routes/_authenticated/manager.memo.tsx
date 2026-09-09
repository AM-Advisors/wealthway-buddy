import { createFileRoute, Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { OfferingMemoEditor } from "@/components/offering-memo-editor";

export const Route = createFileRoute("/_authenticated/manager/memo")({
  head: () => ({
    meta: [
      { title: "Offering Memo Editor — Harmonious Fund Manager" },
      {
        name: "description",
        content:
          "Write and publish the offering memo your investors read alongside the fund's legal documents.",
      },
      { property: "og:title", content: "Offering Memo Editor — Harmonious Fund Manager" },
      {
        property: "og:description",
        content: "Draft, edit and publish your fund's offering memo for investors.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManagerMemoPage,
});

function ManagerMemoPage() {
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Offering memo</h1>
          <p className="text-sm text-muted-foreground">
            The story behind the numbers. Save a draft while you work on it, then publish when you
            want investors to see it.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/manager/documents">Legal documents</Link>
        </Button>
      </header>

      <OfferingMemoEditor />
    </main>
  );
}
