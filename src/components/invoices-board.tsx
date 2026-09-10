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
  createInvoice,
  deleteInvoiceLine,
  INVOICE_STATUSES,
  issueInvoice,
  listInvoices,
  previewInvoice,
  recordInvoicePayment,
  saveInvoiceLine,
  voidInvoice,
} from "@/lib/invoices.functions";

const money = (cents: number | null | undefined) =>
  typeof cents === "number"
    ? (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })
    : "—";

const today = () => new Date().toISOString().slice(0, 10);

function monthStart() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

const statusLabel = (v: string) => INVOICE_STATUSES.find((s) => s.value === v)?.label ?? v;

/** Invoices built from each client's contracted fees, active services and third-party costs. */
export function InvoicesBoard() {
  const queryClient = useQueryClient();
  const load = useServerFn(listInvoices);
  const preview = useServerFn(previewInvoice);
  const create = useServerFn(createInvoice);
  const saveLine = useServerFn(saveInvoiceLine);
  const removeLine = useServerFn(deleteInvoiceLine);
  const issue = useServerFn(issueInvoice);
  const pay = useServerFn(recordInvoicePayment);
  const cancel = useServerFn(voidInvoice);

  const [clientId, setClientId] = useState("");
  const [periodStart, setPeriodStart] = useState(monthStart());
  const [periodEnd, setPeriodEnd] = useState(today());
  const [netDays, setNetDays] = useState("30");
  const [note, setNote] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [lineDraft, setLineDraft] = useState<{
    invoiceId: string;
    label: string;
    quantity: string;
    unit: string;
  } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => load(),
    retry: false,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
    queryClient.invalidateQueries({ queryKey: ["contract-audit"] });
    queryClient.invalidateQueries({ queryKey: ["pass-through-expenses"] });
  };

  const previewQuery = useQuery({
    queryKey: ["invoice-preview", clientId, periodStart, periodEnd],
    queryFn: () => preview({ data: { clientId, periodStart, periodEnd } }),
    enabled: Boolean(clientId) && Boolean(periodStart) && Boolean(periodEnd),
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          clientId,
          periodStart,
          periodEnd,
          netDays: Number(netDays || 30),
          note,
        },
      }),
    onSuccess: (res: any) => {
      toast.success("Draft invoice prepared.");
      setNote("");
      setOpenId(res?.id ?? null);
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "That invoice couldn't be prepared."),
  });

  const lineMutation = useMutation({
    mutationFn: (input: { invoiceId: string; label: string; quantity: number; unitCents: number }) =>
      saveLine({ data: input }),
    onSuccess: () => {
      toast.success("Line added.");
      setLineDraft(null);
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "That line couldn't be saved."),
  });

  const removeLineMutation = useMutation({
    mutationFn: (id: string) => removeLine({ data: { id } }),
    onSuccess: () => {
      toast.success("Line removed.");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "That line couldn't be removed."),
  });

  const issueMutation = useMutation({
    mutationFn: (input: { id: string; netDays: number }) =>
      issue({ data: { id: input.id, issueDate: today(), netDays: input.netDays } }),
    onSuccess: (res: any) => {
      toast.success(`Invoice ${res?.number} issued. Payment due ${res?.dueDate}.`);
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "That invoice couldn't be issued."),
  });

  const payMutation = useMutation({
    mutationFn: (input: { id: string; reference: string }) =>
      pay({ data: { id: input.id, paidOn: today(), reference: input.reference } }),
    onSuccess: () => {
      toast.success("Payment recorded.");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "That payment couldn't be recorded."),
  });

  const voidMutation = useMutation({
    mutationFn: (input: { id: string; reason: string }) => cancel({ data: input }),
    onSuccess: () => {
      toast.success("Invoice voided.");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "That invoice couldn't be voided."),
  });

  const canManage = Boolean(data?.canManage);
  const clients = (data?.clients ?? []) as any[];
  const invoices = useMemo(() => {
    return ((data?.invoices ?? []) as any[]).filter((inv) => {
      if (statusFilter !== "all" && inv.status !== statusFilter) return false;
      if (clientFilter !== "all" && inv.client_id !== clientFilter) return false;
      return true;
    });
  }, [data, statusFilter, clientFilter]);

  const outstanding = ((data?.invoices ?? []) as any[])
    .filter((i) => i.status === "issued")
    .reduce((s, i) => s + Number(i.total_cents ?? 0), 0);
  const overdue = ((data?.invoices ?? []) as any[]).filter((i) => i.overdue);

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading invoices…</div>;
  if (error) {
    return (
      <div className="text-sm text-muted-foreground">
        {(error as any)?.message ?? "Invoices aren't available to you."}
      </div>
    );
  }

  const previewData = previewQuery.data as any;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Awaiting payment</CardDescription>
            <CardTitle className="text-2xl">{money(outstanding)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Past the due date</CardDescription>
            <CardTitle className="text-2xl">{overdue.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Invoices on file</CardDescription>
            <CardTitle className="text-2xl">{(data?.invoices ?? []).length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Prepare an invoice</CardTitle>
          <CardDescription>
            Pulls the client's contracted fees on services that are in scope, plus third-party costs
            in the period that haven't been billed yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1">
              <Label>Client</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Period from</Label>
              <Input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Period to</Label>
              <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Payment terms (days)</Label>
              <Input
                type="number"
                min={0}
                value={netDays}
                onChange={(e) => setNetDays(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Note on the invoice (optional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>

          {clientId && previewData ? (
            <div className="rounded-md border p-3 text-sm">
              {previewData.lines.length === 0 ? (
                <p className="text-muted-foreground">
                  Nothing to bill for this period: no contracted fees on active services and no
                  unbilled third-party costs.
                </p>
              ) : (
                <>
                  <ul className="space-y-1">
                    {previewData.lines.map((l: any, i: number) => (
                      <li key={i} className="flex items-center justify-between gap-3">
                        <span>
                          {l.label}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {l.source === "rate" ? "Contracted fee" : "Third-party cost"}
                          </span>
                        </span>
                        <span className="tabular-nums">{money(l.amount_cents)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex justify-between border-t pt-2 font-medium">
                    <span>Total</span>
                    <span className="tabular-nums">{money(previewData.totalCents)}</span>
                  </div>
                  {previewData.skipped > 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {previewData.skipped} contracted fee(s) left off because the service isn't
                      active in the client's scope.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          <Button
            disabled={!canManage || !clientId || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            Prepare draft invoice
          </Button>
          {!canManage ? (
            <p className="text-xs text-muted-foreground">
              Read-only. Preparing or issuing invoices needs legal, compliance, finance, client
              success or admin authority.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3">
          <div>
            <CardTitle>Invoices</CardTitle>
            <CardDescription>Draft, issued, paid and voided invoices.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {INVOICE_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={clientFilter} onValueChange={setClientFilter}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clients</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invoices match those filters.</p>
          ) : null}
          {invoices.map((inv) => {
            const open = openId === inv.id;
            return (
              <div key={inv.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{inv.number ?? "Draft"}</span>
                      <Badge variant="outline">{statusLabel(inv.status)}</Badge>
                      {inv.overdue ? <Badge variant="destructive">Past due</Badge> : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {inv.clientName} · {inv.period_start} to {inv.period_end}
                      {inv.due_date ? ` · due ${inv.due_date}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium tabular-nums">{money(Number(inv.total_cents))}</span>
                    <Button variant="outline" size="sm" onClick={() => setOpenId(open ? null : inv.id)}>
                      {open ? "Hide" : "Open"}
                    </Button>
                  </div>
                </div>

                {open ? (
                  <div className="mt-3 space-y-3 border-t pt-3">
                    <ul className="space-y-1 text-sm">
                      {(inv.lines ?? []).map((l: any) => (
                        <li key={l.id} className="flex items-center justify-between gap-3">
                          <span>
                            {l.label}
                            {l.quantity > 1 ? ` × ${l.quantity}` : ""}
                            <span className="ml-2 text-xs text-muted-foreground">
                              {l.source === "rate"
                                ? "Contracted fee"
                                : l.source === "expense"
                                  ? "Third-party cost"
                                  : "Added by hand"}
                            </span>
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="tabular-nums">{money(Number(l.amount_cents))}</span>
                            {canManage && inv.status === "draft" ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeLineMutation.mutate(l.id)}
                              >
                                Remove
                              </Button>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {inv.note ? <p className="text-sm text-muted-foreground">{inv.note}</p> : null}

                    {canManage && inv.status === "draft" ? (
                      <div className="space-y-2">
                        {lineDraft?.invoiceId === inv.id ? (
                          <div className="grid gap-2 md:grid-cols-4">
                            <Input
                              placeholder="Description"
                              value={lineDraft.label}
                              onChange={(e) =>
                                setLineDraft({ ...lineDraft, label: e.target.value })
                              }
                            />
                            <Input
                              type="number"
                              min={1}
                              placeholder="Quantity"
                              value={lineDraft.quantity}
                              onChange={(e) =>
                                setLineDraft({ ...lineDraft, quantity: e.target.value })
                              }
                            />
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              placeholder="Amount each"
                              value={lineDraft.unit}
                              onChange={(e) => setLineDraft({ ...lineDraft, unit: e.target.value })}
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() =>
                                  lineMutation.mutate({
                                    invoiceId: inv.id,
                                    label: lineDraft.label.trim(),
                                    quantity: Number(lineDraft.quantity || 1),
                                    unitCents: Math.round(Number(lineDraft.unit || 0) * 100),
                                  })
                                }
                              >
                                Save line
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setLineDraft(null)}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setLineDraft({
                                invoiceId: inv.id,
                                label: "",
                                quantity: "1",
                                unit: "",
                              })
                            }
                          >
                            Add a line
                          </Button>
                        )}
                      </div>
                    ) : null}

                    {canManage ? (
                      <div className="flex flex-wrap gap-2">
                        {inv.status === "draft" ? (
                          <Button
                            size="sm"
                            onClick={() =>
                              issueMutation.mutate({
                                id: inv.id,
                                netDays: Number(inv.net_days ?? 30),
                              })
                            }
                          >
                            Issue invoice
                          </Button>
                        ) : null}
                        {inv.status === "issued" ? (
                          <Button
                            size="sm"
                            onClick={() => {
                              const reference =
                                window.prompt("Payment reference (optional)") ?? "";
                              payMutation.mutate({ id: inv.id, reference });
                            }}
                          >
                            Record payment
                          </Button>
                        ) : null}
                        {inv.status !== "paid" && inv.status !== "void" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const reason = window.prompt("Why is this invoice being voided?");
                              if (reason && reason.trim().length >= 3) {
                                voidMutation.mutate({ id: inv.id, reason: reason.trim() });
                              }
                            }}
                          >
                            Void
                          </Button>
                        ) : null}
                      </div>
                    ) : null}

                    {inv.status === "paid" ? (
                      <p className="text-sm text-muted-foreground">
                        Paid {inv.paid_on}
                        {inv.payment_reference ? ` · reference ${inv.payment_reference}` : ""}
                      </p>
                    ) : null}
                    {inv.status === "void" ? (
                      <p className="text-sm text-muted-foreground">Voided: {inv.void_reason}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <ActivityPanel areas={["invoice"]} title="Invoice history" />
    </div>
  );
}
