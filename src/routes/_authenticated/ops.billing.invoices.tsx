import { createFileRoute } from "@tanstack/react-router";

import { InvoicesBoard } from "@/components/invoices-board";
import { BillingPipeline } from "@/components/ops-billing-pipeline";

export const Route = createFileRoute("/_authenticated/ops/billing/invoices")({
  head: () => ({
    meta: [
      { title: "Client invoices - Harmonious Operations" },
      { name: "description", content: "Invoices for each signed quote, from scheduled drafts to issued and paid, with review and issue actions." },
      { property: "og:title", content: "Client invoices - Harmonious Operations" },
      { property: "og:description", content: "Invoices by signed quote, with review, issue and payment status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <main className="mx-auto w-full max-w-5xl space-y-8 p-6">
      <header className="space-y-1">
        <h1 className="text-3xl">Client invoices</h1>
        <p className="text-sm text-muted-foreground">Each signed quote and the invoices its statement of work has produced. Review, issue and record payments below.</p>
      </header>
      <BillingPipeline view="invoices" />
      <section className="space-y-3">
        <h2 className="text-xl">Review and issue</h2>
        <InvoicesBoard />
      </section>
    </main>
  ),
});
