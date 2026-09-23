import { Link, createFileRoute } from "@tanstack/react-router";

import { OperationsBanking } from "@/components/operations-board";

export const Route = createFileRoute("/_authenticated/ops/banking")({

  head: () => ({
    meta: [
      { title: "Banking requests — Harmonious operations" },
      {
        name: "description",
        content: "Approve or send back each fund's request to have Harmonious open its bank account.",
      },
      { property: "og:title", content: "Banking requests — Harmonious operations" },
      {
        property: "og:description",
        content: "Track Mercury, Texas Capital and Customers Bank account openings.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BankingPage,
});

function BankingPage() {
  return (
    <div>
      <div className="mx-auto w-full max-w-5xl px-4 pt-6">
        <Link
          to="/ops/distributions"
          className="text-sm font-medium text-primary underline underline-offset-4"
        >
          Distributions and payments →
        </Link>
      </div>
      <OperationsBanking />
    </div>
  );
}

