import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getCapTablePlanUsage } from "@/lib/founder-cap-table.functions";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

function num(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export function CapTablePlanUsage() {
  const load = useServerFn(getCapTablePlanUsage);
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["cap-table-plan-usage"],
    queryFn: () => load(),
  });

  const rows = (data?.rows ?? []) as any[];
  const term = search.trim().toLowerCase();
  const filtered = rows.filter((r) => !term || r.clientName.toLowerCase().includes(term));
  const overLimit = rows.filter((r) => r.overLimit > 0).length;
  const pending = rows.reduce((sum, r) => sum + r.pendingTransfers, 0);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cap table plans</h1>
          <p className="text-sm text-muted-foreground">
            Each client's cap table plan, how much of it they use and what is waiting on them.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin">Back</Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Clients on a plan</CardDescription>
            <CardTitle className="text-2xl">{rows.filter((r) => r.plan).length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Over their stakeholder allowance</CardDescription>
            <CardTitle className="text-2xl">{overLimit}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Transfers awaiting client approval</CardDescription>
            <CardTitle className="text-2xl">{pending}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search a client"
        className="max-w-sm"
      />

      <Card>
        <CardContent className="overflow-x-auto pt-6">
          {error ? (
            <p className="text-sm text-destructive">
              {error instanceof Error ? error.message : "Could not load plan usage."}
            </p>
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground">Loading plan usage…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cap table clients yet.</p>
          ) : (
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Client</th>
                  <th className="py-2 pr-3 font-medium">Plan</th>
                  <th className="py-2 pr-3 font-medium">Stakeholders</th>
                  <th className="py-2 pr-3 font-medium">Holdings</th>
                  <th className="py-2 pr-3 font-medium">Shares outstanding</th>
                  <th className="py-2 pr-3 font-medium">Pending transfers</th>
                  <th className="py-2 pr-3 font-medium">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.clientId} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium">{r.clientName}</td>
                    <td className="py-2 pr-3">
                      {r.plan ? (
                        <Badge variant="secondary">{r.plan.label}</Badge>
                      ) : (
                        <Badge variant="outline">No plan in scope</Badge>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {r.stakeholders}
                      {r.plan?.stakeholders != null ? ` / ${r.plan.stakeholders}` : ""}
                      {r.overLimit > 0 ? (
                        <Badge variant="destructive" className="ml-2">
                          {r.overLimit} over
                        </Badge>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">{r.holdings}</td>
                    <td className="py-2 pr-3">{num(Number(r.shares ?? 0))}</td>
                    <td className="py-2 pr-3">{r.pendingTransfers || "—"}</td>
                    <td className="py-2 pr-3">
                      {r.lastActivity ? new Date(r.lastActivity).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
