import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UPDATE_KIND_LABELS } from "@/lib/crm-model";
import { getManagerUpdates } from "@/lib/crm.functions";

export function when(at: string) {
  const d = new Date(at);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString();
}

/**
 * One combined feed for a fund manager: Fund progress, investor messages,
 * replies from Harmonious, deal and campaign changes. Refreshes every minute.
 */
export function FundUpdatesFeed({ offeringId, limit = 8 }: { offeringId?: string; limit?: number }) {
  const load = useServerFn(getManagerUpdates);
  const q = useQuery({
    queryKey: ["manager-updates", offeringId ?? "all", limit],
    queryFn: () => load({ data: { offeringId, limit } }),
    refetchInterval: 60_000,
  });
  const items = q.data?.items ?? [];
  const last = q.data?.lastReadAt ?? null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="h-4 w-4" aria-hidden /> Updates
          {!offeringId && (q.data?.unread ?? 0) > 0 ? <Badge>{q.data!.unread} new</Badge> : null}
        </CardTitle>
        <Link to="/manager/updates" className="text-sm text-primary hover:underline">See all</Link>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No updates yet. Fund progress, messages and deal changes will appear here.</p>
        ) : (
          <ul className="divide-y">
            {items.map((u) => (
              <li key={u.id}>
                <a href={u.path} className="block py-2 hover:text-primary">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      {(!last || u.at > last) && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="New" />}
                      <span className="truncate text-sm font-medium">{u.headline}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{when(u.at)}</span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {UPDATE_KIND_LABELS[u.kind]}{!offeringId && u.fundName ? ` · ${u.fundName}` : ""}{u.detail ? ` · ${u.detail}` : ""}
                  </p>
                </a>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
