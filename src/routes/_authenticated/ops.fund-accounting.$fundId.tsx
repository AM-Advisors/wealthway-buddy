import { createFileRoute } from "@tanstack/react-router";

import { FundAccountingPanel } from "@/components/fund-accounting-panel";

export const Route = createFileRoute("/_authenticated/ops/fund-accounting/$fundId")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Fund accounting - Harmonious" },
      { name: "description", content: "Investment purchases, fund expenses, payables, fee terms and account mappings with second-person review." },
      { property: "og:title", content: "Fund accounting - Harmonious" },
      { property: "og:description", content: "Reviewed investment, expense and fee-term records for a fund." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function Page() {
  const { fundId } = Route.useParams();
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl">Fund accounting</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every record is prepared by one person, approved by another and posted by someone other than the approver. Nothing here moves money.
        </p>
      </header>
      <FundAccountingPanel offeringId={fundId} />
    </main>
  );
}
