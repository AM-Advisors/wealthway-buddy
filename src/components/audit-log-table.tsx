import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import type { AuditEntry } from "@/lib/audit-log.functions";

const RANGES = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last year" },
  { value: "all", label: "All time" },
];

const when = (value: string) =>
  value ? new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—";

const money = (cents: number | null) =>
  cents === null || cents === undefined
    ? ""
    : (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

function download(rows: AuditEntry[], name: string) {
  const header = ["When", "Category", "Summary", "Fund or client", "Person", "Status", "Amount", "Detail"];
  const body = rows.map((r) =>
    [
      new Date(r.at).toISOString(),
      r.category,
      r.summary,
      r.fundName ?? "",
      r.actor ?? "",
      r.status ?? "",
      r.amountCents === null ? "" : (r.amountCents / 100).toFixed(2),
      r.detail ?? "",
    ]
      .map(csvCell)
      .join(","),
  );
  const blob = new Blob([[header.map(csvCell).join(","), ...body].join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `harmonious-audit-${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/** One tab of the audit trail: filters, rows and a download. */
export function AuditLogTable({
  name,
  title,
  description,
  loader,
  funds,
}: {
  name: string;
  title: string;
  description: string;
  loader: any;
  funds: { id: string; name: string }[];
}) {
  const load = useServerFn(loader);
  const [range, setRange] = useState("90");
  const [fund, setFund] = useState("all");
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["audit-log", name, range, fund, applied],
    queryFn: () =>
      load({
        data: {
          days: range === "all" ? null : Number(range),
          offeringId: fund === "all" ? null : fund,
          search: applied || undefined,
          limit: 200,
        },
      }),
    retry: false,
  });

  const entries = useMemo(() => (data?.entries ?? []) as AuditEntry[], [data]);

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={entries.length === 0}
            onClick={() => download(entries, name)}
          >
            Download
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">Period</Label>
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Fund</Label>
            <Select value={fund} onValueChange={setFund}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All funds</SelectItem>
                {funds.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Search</Label>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setApplied(search.trim());
              }}
            >
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, reference or note"
              />
              <Button type="submit" variant="secondary">
                Go
              </Button>
            </form>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {isLoading ? <p className="text-sm text-muted-foreground">Loading records…</p> : null}
        {error ? (
          <p className="text-sm text-muted-foreground">
            {(error as any)?.message ?? "This trail isn't available to you."}
          </p>
        ) : null}
        {!isLoading && !error && entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing recorded for this period.</p>
        ) : null}

        {entries.map((entry) => (
          <div key={entry.id} className="rounded-lg border p-4 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{entry.category}</Badge>
              {entry.status ? (
                <Badge variant="secondary">{String(entry.status).replace(/_/g, " ")}</Badge>
              ) : null}
              <span className="text-sm font-medium">{entry.summary}</span>
              {entry.amountCents !== null ? (
                <span className="text-sm font-medium">{money(entry.amountCents)}</span>
              ) : null}
              <span className="ml-auto text-xs text-muted-foreground">{when(entry.at)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {entry.fundName ?? "No fund recorded"}
              {entry.actor ? ` · ${entry.actor}` : ""}
            </p>
            {entry.detail ? <p className="text-sm text-muted-foreground">{entry.detail}</p> : null}
          </div>
        ))}

        {entries.length >= 200 ? (
          <p className="text-xs text-muted-foreground">
            Showing the 200 most recent records. Narrow the period, fund or search to see more.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
