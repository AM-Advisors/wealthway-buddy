import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { ActivityPanel } from "@/components/activity-panel";
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
import { Textarea } from "@/components/ui/textarea";
import {
  BILLING_STATUSES,
  deleteExpense,
  listExpenses,
  saveExpense,
  setExpenseBillingStatus,
} from "@/lib/expenses.functions";

const money = (cents: number | null | undefined) =>
  typeof cents === "number"
    ? (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })
    : "—";

const today = () => new Date().toISOString().slice(0, 10);

type Draft = {
  id?: string;
  clientId: string;
  offeringId: string;
  providerId: string;
  pricingItemId: string;
  description: string;
  amount: string;
  incurredOn: string;
  reference: string;
  note: string;
  billingStatus: string;
};

const emptyDraft: Draft = {
  clientId: "none",
  offeringId: "none",
  providerId: "none",
  pricingItemId: "none",
  description: "",
  amount: "",
  incurredOn: today(),
  reference: "",
  note: "",
  billingStatus: "unbilled",
};

const statusLabel = (v: string) =>
  BILLING_STATUSES.find((s) => s.value === v)?.label ?? v.replace(/_/g, " ");

/** Pass-through rate lines and the actual third-party costs logged against them. */
export function ExpensesBoard() {
  const queryClient = useQueryClient();
  const load = useServerFn(listExpenses);
  const save = useServerFn(saveExpense);
  const setStatus = useServerFn(setExpenseBillingStatus);
  const remove = useServerFn(deleteExpense);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [fundFilter, setFundFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["pass-through-expenses"],
    queryFn: () => load(),
    retry: false,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["pass-through-expenses"] });
    queryClient.invalidateQueries({ queryKey: ["contract-audit"] });
  };

  const saveMutation = useMutation({
    mutationFn: (input: Draft) =>
      save({
        data: {
          ...(input.id ? { id: input.id } : {}),
          clientId: input.clientId === "none" ? null : input.clientId,
          offeringId: input.offeringId === "none" ? null : input.offeringId,
          providerId: input.providerId === "none" ? null : input.providerId,
          pricingItemId: input.pricingItemId === "none" ? null : input.pricingItemId,
          description: input.description.trim(),
          amountCents: Math.round(Number(input.amount || 0) * 100),
          currency: "USD",
          incurredOn: input.incurredOn,
          reference: input.reference,
          note: input.note,
          billingStatus: input.billingStatus,
        },
      }),
    onSuccess: () => {
      toast.success("Cost recorded.");
      setDraft(null);
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "That cost couldn't be saved."),
  });

  const statusMutation = useMutation({
    mutationFn: (input: { id: string; billingStatus: string }) => setStatus({ data: input }),
    onSuccess: () => {
      toast.success("Billing status updated.");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "That change couldn't be saved."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Cost removed.");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "That cost couldn't be removed."),
  });

  const canManage = Boolean(data?.canManage);
  const providers = (data?.providers ?? []) as any[];
  const funds = (data?.funds ?? []) as any[];
  const clients = (data?.clients ?? []) as any[];
  const rateLines = (data?.rateLines ?? []) as any[];

  const expenses = useMemo(() => {
    const rows = (data?.expenses ?? []) as any[];
    const term = search.trim().toLowerCase();
    return rows.filter((e) => {
      if (fundFilter !== "all" && e.offering_id !== fundFilter) return false;
      if (providerFilter !== "all" && e.provider_id !== providerFilter) return false;
      if (statusFilter !== "all" && e.billing_status !== statusFilter) return false;
      if (!term) return true;
      return [e.description, e.reference, e.providerName, e.fundName, e.clientName]
        .filter(Boolean)
        .some((v: string) => String(v).toLowerCase().includes(term));
    });
  }, [data, fundFilter, providerFilter, statusFilter, search]);

  const total = expenses.reduce((sum, e) => sum + Number(e.amount_cents ?? 0), 0);
  const unbilled = expenses
    .filter((e) => e.billing_status === "unbilled")
    .reduce((sum, e) => sum + Number(e.amount_cents ?? 0), 0);

  const downloadCsv = () => {
    const header = [
      "Date",
      "Description",
      "Client",
      "Fund",
      "Provider",
      "Rate line",
      "Amount",
      "Reference",
      "Billing status",
    ];
    const rows = expenses.map((e) => [
      e.incurred_on,
      e.description,
      e.clientName ?? "",
      e.fundName ?? "",
      e.providerName ?? "",
      e.rateLabel ?? "",
      (Number(e.amount_cents ?? 0) / 100).toFixed(2),
      e.reference ?? "",
      statusLabel(e.billing_status),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `pass-through-expenses-${today()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Pass-through rate lines</CardTitle>
          <CardDescription>
            Costs Harmonious passes through at actual cost. Amounts come from the rate card; edit
            them on the Standard rate card tab.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {rateLines.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No pass-through lines on the rate card yet.
            </p>
          ) : null}
          {rateLines.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
              <span className="font-medium">{i.label}</span>
              {i.unit ? <span className="text-muted-foreground">· {i.unit}</span> : null}
              <Badge variant="outline">{i.versionLabel ?? "rate card"}</Badge>
              {i.versionStatus ? <Badge variant="secondary">{i.versionStatus}</Badge> : null}
              <span className="ml-auto font-medium">{money(i.amount_cents)}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Costs incurred</CardTitle>
            <CardDescription>
              Actual third-party costs recorded against a fund or client, ready to be passed on.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={downloadCsv} disabled={expenses.length === 0}>
              Download CSV
            </Button>
            {canManage ? (
              <Button size="sm" onClick={() => setDraft({ ...emptyDraft })}>
                Record a cost
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-4">
            <Input
              placeholder="Search description, reference…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select value={fundFilter} onValueChange={setFundFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All funds" />
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
            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All providers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All providers</SelectItem>
                {providers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Any status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any status</SelectItem>
                {BILLING_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="text-sm text-muted-foreground">
            {expenses.length} cost{expenses.length === 1 ? "" : "s"} · {money(total)} total ·{" "}
            {money(unbilled)} not yet billed
          </p>

          {isLoading ? <p className="text-sm text-muted-foreground">Loading costs…</p> : null}
          {error ? (
            <p className="text-sm text-muted-foreground">
              {(error as any)?.message ?? "Costs aren't available to you."}
            </p>
          ) : null}
          {!isLoading && !error && expenses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No costs match these filters.</p>
          ) : null}

          {expenses.map((e) => (
            <div key={e.id} className="rounded-lg border p-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{e.description}</span>
                <Badge variant="outline">{statusLabel(e.billing_status)}</Badge>
                {typeof e.variance === "number" && e.variance !== 0 ? (
                  <Badge variant="destructive">
                    {e.variance > 0 ? "Above" : "Below"} rate line by {money(Math.abs(e.variance))}
                  </Badge>
                ) : null}
                <span className="ml-auto text-sm font-medium">{money(e.amount_cents)}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {e.incurred_on} · {e.providerName ?? "No provider"} ·{" "}
                {e.fundName ?? e.clientName ?? "No fund"}
                {e.rateLabel ? ` · ${e.rateLabel}` : ""}
                {e.reference ? ` · Ref ${e.reference}` : ""}
              </p>
              {e.note ? <p className="text-sm text-muted-foreground">{e.note}</p> : null}
              {canManage ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={e.billing_status}
                    onValueChange={(v) => statusMutation.mutate({ id: e.id, billingStatus: v })}
                  >
                    <SelectTrigger className="h-8 w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BILLING_STATUSES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setDraft({
                        id: e.id,
                        clientId: e.client_id ?? "none",
                        offeringId: e.offering_id ?? "none",
                        providerId: e.provider_id ?? "none",
                        pricingItemId: e.pricing_item_id ?? "none",
                        description: e.description ?? "",
                        amount: (Number(e.amount_cents ?? 0) / 100).toString(),
                        incurredOn: e.incurred_on ?? today(),
                        reference: e.reference ?? "",
                        note: e.note ?? "",
                        billingStatus: e.billing_status ?? "unbilled",
                      })
                    }
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteMutation.mutate(e.id)}
                    disabled={deleteMutation.isPending}
                  >
                    Remove
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>

      {draft && canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>{draft.id ? "Edit cost" : "Record a cost"}</CardTitle>
            <CardDescription>
              Record what a provider actually charged, so it can be passed on accurately.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>What it was for</Label>
                <Input
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  placeholder="e.g. Delaware certificate of formation"
                />
              </div>
              <div className="space-y-2">
                <Label>Amount (USD)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.amount}
                  onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Date incurred</Label>
                <Input
                  type="date"
                  value={draft.incurredOn}
                  onChange={(e) => setDraft({ ...draft, incurredOn: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Provider</Label>
                <Select
                  value={draft.providerId}
                  onValueChange={(v) => setDraft({ ...draft, providerId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No provider</SelectItem>
                    {providers.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Client</Label>
                <Select
                  value={draft.clientId}
                  onValueChange={(v) => setDraft({ ...draft, clientId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No client" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No client</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Fund</Label>
                <Select
                  value={draft.offeringId}
                  onValueChange={(v) => setDraft({ ...draft, offeringId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No fund" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No fund</SelectItem>
                    {funds.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Related rate line</Label>
                <Select
                  value={draft.pricingItemId}
                  onValueChange={(v) => setDraft({ ...draft, pricingItemId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Not linked" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not linked</SelectItem>
                    {rateLines.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.label} — {money(i.amount_cents)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Invoice or reference</Label>
                <Input
                  value={draft.reference}
                  onChange={(e) => setDraft({ ...draft, reference: e.target.value })}
                  placeholder="Invoice number"
                />
              </div>
              <div className="space-y-2">
                <Label>Billing status</Label>
                <Select
                  value={draft.billingStatus}
                  onValueChange={(v) => setDraft({ ...draft, billingStatus: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BILLING_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Note</Label>
              <Textarea
                value={draft.note}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                placeholder="Anything the team should know about this cost."
              />
            </div>
            <div className="flex gap-2">
              <Button
                disabled={saveMutation.isPending || draft.description.trim().length < 2}
                onClick={() => saveMutation.mutate(draft)}
              >
                {saveMutation.isPending ? "Saving…" : "Save cost"}
              </Button>
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <ActivityPanel areas={["expense", "pricing"]} title="Recent pricing and expense activity" />
    </div>
  );
}
