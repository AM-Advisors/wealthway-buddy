import { Link, createFileRoute } from "@tanstack/react-router";

import { ManagerFundHome } from "@/components/manager-fund-home";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/manager/fund/$fundId")({
  head: () => ({
    meta: [
      { title: "Fund home — Harmonious fund manager" },
      {
        name: "description",
        content:
          "Setup progress, fund documents and every investor application for one Harmonious fund.",
      },
      { property: "og:title", content: "Fund home — Harmonious fund manager" },
      {
        property: "og:description",
        content: "One page per fund: setup progress, documents and investor applications.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: FundError,
  notFoundComponent: FundError,
  component: FundHomeRoute,
});

function FundHomeRoute() {
  const { fundId } = Route.useParams();
  return <ManagerFundHome offeringId={fundId} />;
}

function FundError() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 text-center">
      <h1 className="text-2xl">This fund isn't available</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        It may have been removed, or you may not be assigned to it.
      </p>
      <Button asChild variant="outline" className="mt-6">
        <Link to="/manager">Back to your panel</Link>
      </Button>
    </main>
  );
}
