import { createFileRoute, Link } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { InvestmentChecklist, FundReadiness } from "@/components/investment-readiness";
import { NoActiveViewAs, ViewAsBanner, useActiveViewAs } from "@/components/view-as";
import { clientNavigation } from "@/lib/client-navigation";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/view-as")({
  validateSearch: (s: Record<string, unknown>) => ({ page: typeof s.page === "string" ? s.page : undefined }),
  head: () => ({
    meta: [
      { title: "Client View - Harmonious" },
      { name: "description", content: "Read-only view of exactly what an investor or fund manager sees." },
      { property: "og:title", content: "Client View - Harmonious" },
      { property: "og:description", content: "Read-only view of exactly what an investor or fund manager sees." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ViewAsPage,
});

function ViewAsPage() {
  const q = useActiveViewAs();
  const { page } = Route.useSearch();
  if (q.isPending) return <Skeleton className="m-6 h-40" />;
  const ctx = q.data as any;
  if (!ctx) return <NoActiveViewAs />;
  // Every page in the client's own menu; display only, never grants access.
  const pages = clientNavigation(ctx.perspective === "investor" ? "investor" : "fund_manager");
  const current = pages.find((p) => p.url === page) ?? pages[0]!;
  const isHome = current === pages[0];
  return (
    <div>
      <ViewAsBanner ctx={ctx} />
      <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6 md:flex-row" aria-readonly="true">
        <nav className="flex shrink-0 flex-row flex-wrap gap-1 md:w-52 md:flex-col" aria-label="Client pages">
          {pages.map((p) => (
            <Link key={p.url} to="/view-as" search={{ page: p.url }}
              className={cn("rounded-md px-3 py-2 text-sm", p === current ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted")}>
              {p.title}
            </Link>
          ))}
        </nav>
        <main className="min-w-0 flex-1 space-y-4">
          <h1 className="text-2xl font-semibold">{current.title}</h1>
          {isHome ? (
            ctx.perspective === "investor"
              ? <InvestmentChecklist onboardingId={ctx.onboardingId} viewAs />
              : <FundReadiness fundId={ctx.offeringId} viewAs />
          ) : (
            <div className="rounded-lg border border-dashed p-10 text-center">
              <p className="font-medium">Nothing here yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                This is the {current.title} page {ctx.subjectName} sees. It fills in as items are added for them.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
