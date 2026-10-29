import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { managerInvestorTodosFn, type ManagerInvestorTodo } from "@/lib/manager-investor-todos.functions";
import { useInvestorRecordRoute } from "@/lib/use-investor-record-route";

/** Everything waiting on a fund's investors, in one list the manager can work through. */
export function ManagerInvestorTodoList({ fundId }: { fundId: string }) {
  const load = useServerFn(managerInvestorTodosFn);
  const recordTo = useInvestorRecordRoute();
  const q = useQuery({
    queryKey: ["manager-investor-todos", fundId],
    queryFn: () => load({ data: { fundId } }),
    retry: false,
    refetchInterval: 60_000,
  });
  const items = (q.data?.items ?? []) as ManagerInvestorTodo[];
  const byInvestor = new Map<string, ManagerInvestorTodo[]>();
  for (const it of items) {
    const list = byInvestor.get(it.investorName) ?? [];
    list.push(it);
    byInvestor.set(it.investorName, list);
  }
  return (
    <Card>
      <CardHeader className="gap-1">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          To dos across investors
          {items.length > 0 ? <Badge variant="secondary">{items.length} open</Badge> : null}
        </CardTitle>
        <CardDescription>
          Everything waiting on this fund's investors, in one list. Open an investor to take care of it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.isError ? <p className="text-sm text-destructive">{(q.error as any)?.message ?? "Could not load the to-do list."}</p> : null}
        {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {!q.isLoading && !q.isError && items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing waiting on investors right now.</p>
        ) : null}
        {[...byInvestor.entries()].map(([name, list]) => (
          <div key={name} className="rounded-md border p-3">
            <p className="text-sm font-medium">{name}</p>
            <ul className="mt-1 space-y-1">
              {list.map((it, i) => (
                <li key={`${it.onboardingId}-${it.kind}-${i}`}>
                  <Link
                    to={recordTo}
                    params={{ fundId, onboardingId: it.onboardingId }}
                    className="text-sm text-primary underline-offset-2 hover:underline"
                  >
                    {it.label}
                    {it.detail ? <span className="text-muted-foreground"> · {it.detail}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
