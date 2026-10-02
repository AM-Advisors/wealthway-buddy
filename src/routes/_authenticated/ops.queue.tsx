import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { opsWorkQueueFn } from "@/lib/ops-work-queue.functions";

export const Route = createFileRoute("/_authenticated/ops/queue")({
  head: () => ({
    meta: [
      { title: "Work queue - Harmonious Operations" },
      { name: "description", content: "Everything waiting on Harmonious across all clients and funds." },
      { property: "og:title", content: "Work queue - Harmonious Operations" },
      { property: "og:description", content: "Everything waiting on Harmonious across all clients and funds." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: QueuePage,
});

const TYPES: Record<string, string> = {
  task_review: "Task review",
  close_request: "Close request",
  payment: "Payment to confirm",
  filing: "Filing",
  pricing: "Pricing approval",
  message: "Message",
  stuck_fund: "Stuck fund",
};
const AGES = [
  { key: "all", label: "Any age", days: 0 },
  { key: "3", label: "3+ days", days: 3 },
  { key: "7", label: "7+ days", days: 7 },
  { key: "14", label: "14+ days", days: 14 },
];

function QueuePage() {
  const load = useServerFn(opsWorkQueueFn);
  const q = useQuery({ queryKey: ["ops-work-queue"], queryFn: () => load() });
  const [type, setType] = useState("all");
  const [client, setClient] = useState("all");
  const [owner, setOwner] = useState("all");
  const [age, setAge] = useState("all");
  const items = q.data?.items ?? [];
  const clients = useMemo(() => [...new Map(items.filter((i) => i.clientId).map((i) => [i.clientId!, i.clientName ?? "Client"])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [items]);
  const minDays = AGES.find((a) => a.key === age)?.days ?? 0;
  const shown = items.filter((i) =>
    (type === "all" || i.type === type) &&
    (client === "all" || i.clientId === client) &&
    (owner === "all" || (owner === "none" ? i.assignees.length === 0 : i.assignees.includes(owner))) &&
    (!minDays || Date.now() - new Date(i.createdAt).getTime() >= minDays * 86_400_000));
  const sel = "h-9 rounded-md border bg-background px-2 text-sm";
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Work queue</h1>
        <p className="text-sm text-muted-foreground">Everything waiting on Harmonious across all clients. Open an item to handle it on its own screen; nothing is approved from here.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <select aria-label="Type" className={sel} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">All types</option>
          {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v} ({items.filter((i) => i.type === k).length})</option>)}
        </select>
        <select aria-label="Client" className={sel} value={client} onChange={(e) => setClient(e.target.value)}>
          <option value="all">All clients</option>
          {clients.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select aria-label="Assigned to" className={sel} value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="all">Anyone</option>
          <option value="none">Unassigned</option>
          {(q.data?.staff ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select aria-label="Age" className={sel} value={age} onChange={(e) => setAge(e.target.value)}>
          {AGES.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
        </select>
      </div>
      {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> :
       q.error ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> :
       shown.length === 0 ? <Card><CardContent className="py-6 text-sm text-muted-foreground">Nothing waiting. Nice.</CardContent></Card> : (
        <Card>
          <CardContent className="divide-y p-0">
            {shown.map((i) => {
              const days = Math.max(0, Math.floor((Date.now() - new Date(i.createdAt).getTime()) / 86_400_000));
              return (
                <Link key={i.id} to={i.href as any} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted">
                  <Badge variant={i.type === "stuck_fund" ? "destructive" : "outline"} className="whitespace-nowrap">{TYPES[i.type]}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{i.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{i.detail}{i.clientName ? ` · ${i.clientName}` : ""}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{days === 0 ? "Today" : `${days}d`}</span>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
