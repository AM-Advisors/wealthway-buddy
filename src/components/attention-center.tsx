import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, Loader2 } from "lucide-react";

import { getAttention } from "@/lib/attention.functions";
import {
  ATTENTION_GROUPS,
  GROUP_EMPTY,
  GROUP_TITLES,
  type AttentionGroup,
  type AttentionItem,
} from "@/lib/attention-model";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { WorkspaceKind } from "@/lib/session-resolution";

const GROUP_ICON: Record<AttentionGroup, typeof Clock> = {
  needs_you: AlertTriangle,
  harmonious_working: Loader2,
  waiting_third_party: Clock,
  recently_completed: CheckCircle2,
};

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function ItemRow({ item }: { item: AttentionItem }) {
  const due = formatDate(item.dueDate);
  const context = [item.fundName, item.clientName, item.onBehalfOf].filter(Boolean).join(" · ");

  return (
    <li>
      <Link
        to={item.href as never}
        className="flex items-start justify-between gap-4 rounded-lg border border-border/70 p-4 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{item.title}</span>
            {item.severity === "critical" && <Badge variant="destructive">Urgent</Badge>}
          </span>
          <span className="mt-1 block text-sm text-muted-foreground">{item.status}</span>
          {(context || due) && (
            <span className="mt-1 block text-xs text-muted-foreground">
              {context}
              {context && due ? " · " : ""}
              {due ? `Due ${due}` : ""}
            </span>
          )}
        </span>
        <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}

/**
 * Four plain sections answering: what needs you, what Harmonious is doing,
 * what is waiting on someone else, and what finished recently. Every row opens
 * the record where the work actually happens; nothing is decided here.
 */
export function AttentionCenter({ workspace }: { workspace?: WorkspaceKind }) {
  const load = useServerFn(getAttention);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["attention", workspace ?? "auto"],
    queryFn: () => load({ data: workspace ? { workspace } : {} }) as Promise<any>,
    refetchInterval: 120_000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">What needs your attention</CardTitle>
          <CardDescription>Loading…</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">What needs your attention</CardTitle>
          <CardDescription>
            We couldn&apos;t load this just now.{" "}
            <button type="button" className="underline" onClick={() => void refetch()}>
              Try again
            </button>
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!data?.groups) return null;

  const groups = data.groups as Record<AttentionGroup, AttentionItem[]>;
  const gaps = (data.gaps ?? []) as { area: string; message: string }[];

  return (
    <section className="space-y-6" aria-label="What needs your attention">
      {ATTENTION_GROUPS.map((group) => {
        const items = groups[group] ?? [];
        // Completed and waiting sections stay out of the way when empty.
        if (!items.length && group !== "needs_you") return null;
        const Icon = GROUP_ICON[group];
        return (
          <Card key={group}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Icon className="size-4 text-muted-foreground" aria-hidden />
                {GROUP_TITLES[group]}
              </CardTitle>
              {!items.length && <CardDescription>{GROUP_EMPTY[group]}</CardDescription>}
            </CardHeader>
            {items.length > 0 && (
              <CardContent>
                <ul className="space-y-3">
                  {items.map((item) => (
                    <ItemRow key={item.id} item={item} />
                  ))}
                </ul>
              </CardContent>
            )}
          </Card>
        );
      })}

      {gaps.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {gaps.map((gap) => `${gap.area}: ${gap.message}`).join(" ")}
        </p>
      )}
    </section>
  );
}
