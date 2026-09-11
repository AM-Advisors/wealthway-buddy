import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** One compact number tile, used on every dashboard so they read the same way. */
export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-semibold leading-tight">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export type NeedsYouItem = {
  id: string;
  title: string;
  detail?: string;
  to: string;
  /** overdue = past its date, soon = due shortly, open = simply waiting on you. */
  urgency?: "overdue" | "soon" | "open";
  actionLabel?: string;
};

const urgencyStyles: Record<NonNullable<NeedsYouItem["urgency"]>, string> = {
  overdue: "border-destructive/40 bg-destructive/5",
  soon: "border-amber-400/50 bg-amber-50 dark:bg-amber-950/20",
  open: "border-border bg-card",
};

const urgencyIcon = {
  overdue: AlertTriangle,
  soon: Clock,
  open: Clock,
} as const;

/** The short "do this first" strip that sits at the top of a dashboard. */
export function NeedsYou({
  items,
  title = "Needs you today",
  emptyMessage = "Nothing is waiting on you right now.",
  limit = 6,
}: {
  items: NeedsYouItem[];
  title?: string;
  emptyMessage?: string;
  limit?: number;
}) {
  const shown = items.slice(0, limit);
  const rest = items.length - shown.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>
          {items.length === 0
            ? emptyMessage
            : `${items.length} item${items.length === 1 ? "" : "s"} waiting on you.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden /> You are all clear.
          </p>
        ) : (
          <div className="space-y-2">
            {shown.map((item) => {
              const urgency = item.urgency ?? "open";
              const Icon = urgencyIcon[urgency];
              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2",
                    urgencyStyles[urgency],
                  )}
                >
                  <div className="flex items-start gap-2">
                    <Icon
                      className={cn(
                        "mt-0.5 h-4 w-4",
                        urgency === "overdue"
                          ? "text-destructive"
                          : urgency === "soon"
                            ? "text-amber-600"
                            : "text-muted-foreground",
                      )}
                      aria-hidden
                    />
                    <div>
                      <p className="text-sm font-medium">{item.title}</p>
                      {item.detail ? (
                        <p className="text-xs text-muted-foreground">{item.detail}</p>
                      ) : null}
                    </div>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link to={item.to as never}>{item.actionLabel ?? "Open"}</Link>
                  </Button>
                </div>
              );
            })}
            {rest > 0 ? (
              <p className="text-xs text-muted-foreground">And {rest} more further down the page.</p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
