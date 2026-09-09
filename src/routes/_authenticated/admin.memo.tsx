import { createFileRoute, Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { OfferingMemoEditor } from "@/components/offering-memo-editor";

export const Route = createFileRoute("/_authenticated/admin/memo")({
  head: () => ({
    meta: [
      { title: "Offering Memos — Harmonious Admin" },
      {
        name: "description",
        content: "Write and publish the offering memo investors read for each Harmonious fund.",
      },
      { property: "og:title", content: "Offering Memos — Harmonious Admin" },
      {
        property: "og:description",
        content: "Edit each fund's offering memo and choose when investors can read it.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminMemoPage,
});

function AdminMemoPage() {
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Offering memos</h1>
          <p className="text-sm text-muted-foreground">
            Choose a fund, write the memo, and publish it when investors should read it.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/admin/funds">Fund setup</Link>
        </Button>
      </header>

      <OfferingMemoEditor />
    </main>
  );
}
