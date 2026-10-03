import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { getOutreachList } from "@/lib/sales-hub.functions";
import { channelLabel, stageLabel, type PeriodValue } from "@/components/sales/sales-ui";

export type OutreachFilter = { ownerId?: string; channel?: string; serviceKey?: string; contactId?: string };

/** Drill-down list: the actual messages, when and how. */
export function OutreachFeed({ period, filter }: { period: PeriodValue; filter: OutreachFilter }) {
  const load = useServerFn(getOutreachList);
  const q = useQuery({ queryKey: ["sales-outreach-list", period, filter], queryFn: () => load({ data: { ...period, ...filter } }) });
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  if (!q.data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!q.data.length) return <p className="text-sm text-muted-foreground">No outreach matches.</p>;
  return (
    <ul className="divide-y">
      {q.data.map((m) => (
        <li key={m.id} className="py-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="outline">{channelLabel(m.channel)}</Badge>
            <Badge variant={m.direction === "inbound" ? "default" : "secondary"}>{m.direction === "inbound" ? "Reply" : "Sent"}</Badge>
            <span className="font-medium text-foreground">{m.contactName}</span>
            {m.organization && <span className="text-muted-foreground">· {m.organization}</span>}
            <span className="ml-auto text-xs text-muted-foreground">{new Date(m.occurredAt).toLocaleString()} · {m.ownerName}{m.source === "pulled_in" ? " · pulled in" : ""}{m.visibility === "private" ? " · private" : ""}</span>
          </div>
          {m.subject && <div className="mt-1 text-sm font-medium text-foreground">{m.subject}</div>}
          {m.body && <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{m.body}</p>}
          {m.stageAfter && <div className="mt-1 text-xs text-muted-foreground">Stage: {stageLabel(m.stageAfter)}</div>}
        </li>
      ))}
    </ul>
  );
}
