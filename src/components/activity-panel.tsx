import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listContractAudit } from "@/lib/contracts.functions";

const when = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—";

const short = (value: unknown) => {
  if (value === null || value === undefined) return null;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 220 ? `${text.slice(0, 220)}…` : text;
};

/** Recent entries from the shared audit trail, narrowed to one part of the console. */
export function ActivityPanel({
  areas,
  title = "Recent activity",
  description = "The last changes recorded here. Everything also appears in the full audit log.",
  limit = 15,
}: {
  areas: string[];
  title?: string;
  description?: string;
  limit?: number;
}) {
  const [open, setOpen] = useState(false);
  const load = useServerFn(listContractAudit);

  const { data, isLoading, error } = useQuery({
    queryKey: ["contract-audit", areas.join(","), limit],
    queryFn: () => load({ data: { areas, limit } }),
    enabled: open,
    retry: false,
  });

  const events = (data?.events ?? []) as any[];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen(!open)}>
          {open ? "Hide" : "Show"}
        </Button>
      </CardHeader>
      {open ? (
        <CardContent className="space-y-2">
          {isLoading ? <p className="text-sm text-muted-foreground">Loading activity…</p> : null}
          {error ? (
            <p className="text-sm text-muted-foreground">
              {(error as any)?.message ?? "Activity isn't available to you."}
            </p>
          ) : null}
          {!isLoading && !error && events.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing recorded here yet.</p>
          ) : null}
          {events.map((e) => (
            <div key={e.id} className="rounded-lg border p-3 text-sm space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{e.area}</Badge>
                <span className="font-medium">{e.action}</span>
                {e.target ? <span className="text-muted-foreground">· {e.target}</span> : null}
                <span className="ml-auto text-xs text-muted-foreground">{when(e.created_at)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                By {e.actor_role || "staff"}
              </p>
              {short(e.previous_value) ? (
                <p className="text-xs text-muted-foreground">Before: {short(e.previous_value)}</p>
              ) : null}
              {short(e.new_value) ? (
                <p className="text-xs text-muted-foreground">After: {short(e.new_value)}</p>
              ) : null}
            </div>
          ))}
        </CardContent>
      ) : null}
    </Card>
  );
}
