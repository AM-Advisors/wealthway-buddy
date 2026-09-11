import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

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
import { listInvoices } from "@/lib/invoices.functions";

const money = (cents: number | null | undefined) =>
  typeof cents === "number"
    ? (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })
    : "—";

const today = () => new Date().toISOString().slice(0, 10);

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/** Every invoice a client still owes, grouped by client, with the link they use to pay. */
export function UnpaidInvoicesBoard() {
  const load = useServerFn(listInvoices);
  const [clientFilter, setClientFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => load(),
    retry: false,
  });

  const portalLink = () =>
    typeof window === "undefined" ? "/client/invoices" : `${window.location.origin}/client/invoices`;

  const groups = useMemo(() => {
    const now = today();
    const unpaid = (data?.invoices ?? []).filter(
      (inv: any) => inv.status === "issued" || inv.status === "awaiting_payment",
    );
    const filtered = unpaid.filter((inv: any) => {
      if (clientFilter !== "all" && inv.client_id !== clientFilter) return false;
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        String(inv.invoice_number ?? "").toLowerCase().includes(q) ||
        String(inv.clientName ?? "").toLowerCase().includes(q)
      );
    });
    const byClient = new Map<string, { name: string; clientId: string; rows: any[] }>();
    for (const inv of filtered) {
      const key = inv.client_id ?? "unknown";
      if (!byClient.has(key)) {
        byClient.set(key, { name: inv.clientName, clientId: inv.client_id, rows: [] });
      }
      byClient.get(key)!.rows.push(inv);
    }
    const list = [...byClient.values()].map((g) => ({
      ...g,
      rows: g.rows.sort((a: any, b: any) => String(a.due_date).localeCompare(String(b.due_date))),
      total: g.rows.reduce((sum: number, r: any) => sum + (r.total_cents ?? 0), 0),
      overdue: g.rows.filter((r: any) => r.due_date && r.due_date < now).length,
    }));
    return list.sort((a, b) => b.total - a.total);
  }, [data, clientFilter, search]);

  const totals = useMemo(() => {
    const now = today();
    const rows = groups.flatMap((g) => g.rows);
    return {
      count: rows.length,
      amount: rows.reduce((sum: number, r: any) => sum + (r.total_cents ?? 0), 0),
      overdue: rows
        .filter((r: any) => r.due_date && r.due_date < now)
        .reduce((sum: number, r: any) => sum + (r.total_cents ?? 0), 0),
    };
  }, [groups]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading invoices…</p>;
  if (error)
    return (
      <p className="text-sm text-muted-foreground">
        {(error as any)?.message ?? "These invoices couldn't be loaded."}
      </p>
    );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Invoices awaiting payment</CardDescription>
            <CardTitle className="text-3xl">{totals.count}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total outstanding</CardDescription>
            <CardTitle className="text-3xl">{money(totals.amount)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Past the due date</CardDescription>
            <CardTitle className="text-3xl">{money(totals.overdue)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-64">
          <Label>Client</Label>
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clients</SelectItem>
              {(data?.clients ?? []).map((c: any) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-64">
          <Label>Search</Label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Invoice number or client"
          />
        </div>
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Nothing is awaiting payment right now.
          </CardContent>
        </Card>
      ) : null}

      {groups.map((group) => (
        <Card key={group.clientId ?? group.name}>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>{group.name}</CardTitle>
              {group.overdue > 0 ? (
                <Badge variant="destructive">{group.overdue} past due</Badge>
              ) : null}
              <span className="ml-auto text-lg font-medium">{money(group.total)}</span>
            </div>
            <CardDescription>
              {group.rows.length} invoice{group.rows.length === 1 ? "" : "s"} awaiting payment.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {group.rows.map((inv: any) => {
              const late = inv.due_date && inv.due_date < today();
              const days = inv.due_date ? daysBetween(today(), inv.due_date) : null;
              return (
                <div
                  key={inv.id}
                  className="flex flex-wrap items-center gap-3 rounded-md border p-3"
                >
                  <div className="min-w-56">
                    <p className="text-sm font-medium">
                      {inv.invoice_number ?? "Not numbered yet"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {inv.period_start} to {inv.period_end}
                      {inv.approved_by_name ? ` · approved by ${inv.approved_by_name}` : ""}
                    </p>
                  </div>
                  <div className="min-w-40">
                    <p className={`text-sm ${late ? "text-destructive" : ""}`}>
                      Due {inv.due_date ?? "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {days === null
                        ? "No due date recorded"
                        : days < 0
                          ? `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} late`
                          : days === 0
                            ? "Due today"
                            : `Due in ${days} day${days === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <span className="text-base font-medium">{money(inv.total_cents)}</span>
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(portalLink());
                          toast.success("Portal link copied. Send it to the client.");
                        } catch {
                          toast.error("The link couldn't be copied.");
                        }
                      }}
                    >
                      Copy portal link
                    </Button>
                    <Button asChild size="sm" variant="ghost">
                      <a href="/client/invoices" target="_blank" rel="noreferrer">
                        Open portal view
                      </a>
                    </Button>
                    <Button asChild size="sm" variant="ghost">
                      <Link to="/admin/pricing">Manage in Pricing</Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
