import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listFundUpdates } from "@/lib/manager-updates.functions";

function when(at: string) {
  const d = new Date(at);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString();
}

/** Fund Setup progress for the manager's own Funds. Refreshes every minute. */
export function FundUpdatesFeed({ offeringId, limit = 8 }: { offeringId?: string; limit?: number }) {
  const load = useServerFn(listFundUpdates);
  const q = useQuery({
    queryKey: ["fund-updates", offeringId ?? "all", limit],
    queryFn: () => load({ data: { offeringId, limit } }),
    refetchInterval: 60_000,
  });
  const items = q.data ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><Bell className="h-4 w-4" aria-hidden /> Fund updates</CardTitle>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No updates yet. You'll see progress here as Harmonious completes setup steps.</p>
        ) : (
          <ul className="divide-y">
            {items.map((u) => (
              <li key={u.id}>
                <Link to="/manager/fund/$fundId" params={{ fundId: u.offeringId }} className="block py-2 hover:text-primary">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-medium">{u.headline}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{when(u.at)}</span>
                  </div>
                  {!offeringId && <p className="truncate text-xs text-muted-foreground">{u.fundName}</p>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
