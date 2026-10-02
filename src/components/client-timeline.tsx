import { useInfiniteQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { clientTimelineFn } from "@/lib/ops-work-queue.functions";

/** Read-only timeline of everything that happened for one client. */
export function ClientTimeline({ clientId }: { clientId: string }) {
  const load = useServerFn(clientTimelineFn);
  const q = useInfiniteQuery({
    queryKey: ["client-timeline", clientId],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => load({ data: { clientId, before: pageParam } }),
    getNextPageParam: (last) => (last.length >= 100 ? last[last.length - 1]!.at : undefined),
  });
  const events = (q.data?.pages ?? []).flat();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Timeline</CardTitle>
        <CardDescription>Messages, payments, close requests, filings, approvals and access changes, newest first.</CardDescription>
      </CardHeader>
      <CardContent>
        {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> :
         q.error ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> :
         events.length === 0 ? <p className="text-sm text-muted-foreground">No activity recorded yet.</p> : (
          <ol className="space-y-3">
            {events.map((e, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="w-24 shrink-0 text-xs text-muted-foreground">{new Date(e.at).toLocaleDateString()}</span>
                <Badge variant="outline" className="h-fit whitespace-nowrap">{e.kind}</Badge>
                <div className="min-w-0"><p className="font-medium">{e.title}</p>{e.detail ? <p className="text-xs text-muted-foreground">{e.detail}</p> : null}</div>
              </li>
            ))}
          </ol>
        )}
        {q.hasNextPage ? <Button variant="outline" size="sm" className="mt-4" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>Load older</Button> : null}
      </CardContent>
    </Card>
  );
}
