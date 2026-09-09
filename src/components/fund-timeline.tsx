import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TIMELINE_KINDS, TIMELINE_STATUSES, getFundTimeline } from "@/lib/timeline.functions";

export function kindLabel(kind: string) {
  return TIMELINE_KINDS.find((k) => k.key === kind)?.label ?? "Milestone";
}

export function statusLabel(status: string) {
  return TIMELINE_STATUSES.find((s) => s.key === status)?.label ?? "Scheduled";
}

export function longDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function daysAway(value: string) {
  const target = new Date(`${value}T00:00:00`).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((target - today.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff > 1) return `In ${diff} days`;
  if (diff === -1) return "Yesterday";
  return `${Math.abs(diff)} days ago`;
}

export function FundTimeline({
  offeringId,
  canManage,
}: {
  offeringId: string;
  canManage?: boolean;
}) {
  const load = useServerFn(getFundTimeline);
  const { data, isLoading } = useQuery({
    queryKey: ["fund-timeline", offeringId],
    queryFn: () => load({ data: { offering_id: offeringId } }),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const events = (data?.events ?? []) as any[];
  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-sm text-muted-foreground">
          {canManage
            ? "No key dates yet. Add closing, wire deadline and launch dates on the fund timeline page."
            : "The fund's key dates have not been shared yet."}
        </CardContent>
      </Card>
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const next = events.find(
    (e) => e.status !== "done" && new Date(`${e.event_date}T00:00:00`).getTime() >= today.getTime(),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Key dates</CardTitle>
        <CardDescription>
          {next
            ? `Next up: ${next.title} — ${longDate(next.event_date)} (${daysAway(next.event_date)}).`
            : "Every date the fund has shared."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="relative space-y-6 border-l pl-6">
          {events.map((event) => {
            const past = new Date(`${event.event_date}T00:00:00`).getTime() < today.getTime();
            return (
              <li key={event.id} className="relative">
                <span
                  className={`absolute -left-[27px] top-1.5 h-3 w-3 rounded-full border-2 border-background ${
                    event.status === "done" || past ? "bg-muted-foreground" : "bg-primary"
                  }`}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{event.title}</span>
                  <Badge variant="outline">{kindLabel(event.kind)}</Badge>
                  {event.status !== "scheduled" ? (
                    <Badge variant="secondary">{statusLabel(event.status)}</Badge>
                  ) : null}
                  {event.is_published ? null : <Badge variant="secondary">Hidden</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">
                  {longDate(event.event_date)}
                  {event.event_time ? ` · ${event.event_time}` : ""} · {daysAway(event.event_date)}
                </p>
                {event.description ? (
                  <p className="mt-1 whitespace-pre-wrap text-sm">{event.description}</p>
                ) : null}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
