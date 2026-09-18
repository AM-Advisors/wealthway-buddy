import { createFileRoute } from "@tanstack/react-router";

import { InvestorDistributions } from "@/components/investor-distributions";

export const Route = createFileRoute("/_authenticated/investor-distributions")({
  head: () => ({
    meta: [
      { title: "My distributions | Harmonious" },
      {
        name: "description",
        content:
          "See what each of your investments has paid you, the tax withheld, where it was sent and when.",
      },
      { property: "og:title", content: "My distributions | Harmonious" },
      {
        property: "og:description",
        content: "Your distribution history, kept separate for each investment profile you hold.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InvestorDistributionsPage,
});

function InvestorDistributionsPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-semibold">My distributions</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Everything each of your investments has paid you, with the tax withheld and the account it
        was sent to.
      </p>
      <div className="mt-6">
        <InvestorDistributions />
      </div>
    </main>
  );
}
