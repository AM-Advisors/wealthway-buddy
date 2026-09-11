import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getClientPortalActivity } from "@/lib/client-activity.functions";

const CATEGORIES = [
  "Fund setup",
  "Document signing",
  "Invoice approvals",
  "Payments",
  "Service requests",
] as const;

const money = (cents: number | null) =>
  typeof cents === "number"
    ? (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })
    : null;

function stamp(iso: string) {
  const d = new Date(iso);
  return {
    day: d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" }),
    time: d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
  };
}

/** Read-only record of what each client has done in their own portal. */
export function ClientActivityBoard() {
  const load = useServerFn(getClientPortalActivity);
  const [clientId, setClientId] = useState("all");
  const [days, setDays] = useState("90");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["client-portal-activity", clientId, days],
    queryFn: () =>
      load({
        data: {
          clientId: clientId === "all" ? null : clientId,
          days: days === "all" ? null : Number(days),
          limit: 400,
        },
      }),
    retry: false,
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.events ?? []).filter((e) => {
      if (category !== "all" && e.category !== category) return false;
      if (!q) return true;
      return [e.clientName, e.summary, e.detail, e.person, e.fundName]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [data, category, search]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of data?.events ?? []) map.set(e.category, (map.get(e.category) ?? 0) + 1);
    return map;
  }, [data]);

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive">{(error as Error).message}</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
          <CardDescription>
            Narrow the record by client, period or the kind of activity.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="space-y-1">
            <Label>Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger>
                <SelectValue placeholder="All clients" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clients</SelectItem>
                {(data?.clients ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Period</Label>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="365">Last 12 months</SelectItem>
                <SelectItem value="all">Everything</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Activity</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everything</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="activity-search">Search</Label>
            <Input
              id="activity-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Client, fund, person or document"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <Badge key={c} variant="secondary">
            {c}: {counts.get(c) ?? 0}
          </Badge>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Portal activity</CardTitle>
          <CardDescription>
            Newest first. Times are shown in your own time zone. This is a record of what clients
            did themselves — Harmonious decisions stay in the audit log.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading activity…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No portal activity for these filters yet.
            </p>
          ) : (
            rows.map((e) => {
              const when = stamp(e.at);
              return (
                <div
                  key={e.id}
                  className="grid gap-2 rounded-md border p-4 md:grid-cols-[150px_1fr_auto]"
                >
                  <div className="text-sm">
                    <div className="font-medium">{when.day}</div>
                    <div className="text-muted-foreground">{when.time}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{e.category}</Badge>
                      <span className="font-medium">{e.summary}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {e.clientName}
                      {e.fundName ? ` · ${e.fundName}` : ""}
                      {e.person ? ` · ${e.person}` : ""}
                    </div>
                    {e.detail ? <p className="text-sm">{e.detail}</p> : null}
                  </div>
                  <div className="text-sm font-medium md:text-right">{money(e.amountCents)}</div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
