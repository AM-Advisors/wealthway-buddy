import { createFileRoute, Link } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { InvestmentChecklist, FundReadiness } from "@/components/investment-readiness";
import { NoActiveViewAs, ViewAsBanner, useActiveViewAs } from "@/components/view-as";
import { clientNavigation } from "@/lib/client-navigation";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { viewAsPageFn } from "@/lib/view-as.functions";

export const Route = createFileRoute("/_authenticated/view-as")({
  validateSearch: (s: Record<string, unknown>): { page?: string } => (typeof s["page"] === "string" ? { page: s["page"] } : {}),
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
            <ViewAsPageList page={current.url} title={current.title} subject={ctx.subjectName} />
          )}
        </main>
      </div>
    </div>
  );
}

function ViewAsPageList({ page, title, subject }: { page: string; title: string; subject: string }) {
  const load = useServerFn(viewAsPageFn);
  const q = useQuery({ queryKey: ["view-as-page", page], queryFn: () => load({ data: { page } }) });
  if (q.isPending) return <Skeleton className="h-40" />;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const items = q.data?.items ?? [];
  if (!items.length) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center">
        <p className="font-medium">Nothing here yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {q.data ? `${subject} has nothing on their ${title} page yet.` : `This is the ${title} page ${subject} sees. It isn't shown in Client View yet.`}
        </p>
      </div>
    );
  }
  return (
    <ul className="divide-y rounded-lg border">
      {items.map((it, i) => (
        <li key={i} className="flex items-start justify-between gap-3 p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{it.title}</p>
            {it.subtitle ? <p className="text-xs text-muted-foreground">{it.subtitle}</p> : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {it.badge ? <Badge variant="secondary">{it.badge}</Badge> : null}
            {it.date ? <span className="text-xs text-muted-foreground">{new Date(it.date).toLocaleDateString()}</span> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
