import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { InvestmentChecklist, FundReadiness } from "@/components/investment-readiness";
import { NoActiveViewAs, ViewAsBanner, useActiveViewAs } from "@/components/view-as";
import { VIEW_AS_COPY } from "@/lib/view-as";

export const Route = createFileRoute("/_authenticated/view-as")({
  head: () => ({
    meta: [
      { title: "Client View — Harmonious" },
      { name: "description", content: "Read-only view of exactly what an investor or fund manager sees." },
      { property: "og:title", content: "Client View — Harmonious" },
      { property: "og:description", content: "Read-only view of exactly what an investor or fund manager sees." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ViewAsPage,
});

function ViewAsPage() {
  const q = useActiveViewAs();
  if (q.isPending) return <Skeleton className="m-6 h-40" />;
  const ctx = q.data as any;
  if (!ctx) return <NoActiveViewAs />;
  return (
    <div>
      <ViewAsBanner ctx={ctx} />
      <div className="mx-auto max-w-6xl space-y-4 p-6" aria-readonly="true">
        {ctx.perspective === "investor" ? (
          <InvestmentChecklist onboardingId={ctx.onboardingId} viewAs />
        ) : (
          <FundReadiness fundId={ctx.offeringId} viewAs />
        )}
        <p className="text-xs text-muted-foreground">Other client pages: {VIEW_AS_COPY.notConverted}</p>
      </div>
    </div>
  );
}
