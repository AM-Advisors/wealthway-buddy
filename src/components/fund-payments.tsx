import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { billFundFees, getFundBilling } from "@/lib/fund-billing.functions";
import { issueInvoice, recordInvoicePayment } from "@/lib/invoices.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function money(cents?: number | null) {
  return ((Number(cents ?? 0)) / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

const STATE_LABEL: Record<string, string> = {
  unbilled: "Not yet invoiced",
  drafted: "On a draft invoice",
  invoiced: "Invoiced",
  paid: "Paid",
};

const today = () => new Date().toISOString().slice(0, 10);

/** One fund's wire fees and closing costs: invoice them, record payment, see the trail. */
export function FundPayments({ fundId, backTo }: { fundId: string; backTo: "admin" | "manager" }) {
  const qc = useQueryClient();
  const load = useServerFn(getFundBilling);
  const bill = useServerFn(billFundFees);
  const issue = useServerFn(issueInvoice);
  const pay = useServerFn(recordInvoicePayment);

  const [selected, setSelected] = useState<string[]>([]);
  const [netDays, setNetDays] = useState(30);
  const [note, setNote] = useState("");
  const [payRef, setPayRef] = useState<Record<string, string>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ["fund-billing", fundId],
    queryFn: () => load({ data: { offeringId: fundId } }),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["fund-billing", fundId] });
    qc.invalidateQueries({ queryKey: ["invoices"] });
  };

  const billMut = useMutation({
    mutationFn: (vars: any) => bill({ data: vars }),
    onSuccess: (r: any) => {
      toast.success(`Draft invoice prepared for ${money(r.totalCents)}.`);
      setSelected([]);
      setNote("");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "That didn't work."),
  });
  const issueMut = useMutation({
    mutationFn: (id: string) => issue({ data: { id, issueDate: today(), netDays } }),
    onSuccess: (r: any) => {
      toast.success(`Invoice ${r.number} issued, due ${r.dueDate}.`);
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "That didn't work."),
  });
  const payMut = useMutation({
    mutationFn: (vars: { id: string; reference: string }) =>
      pay({ data: { id: vars.id, paidOn: today(), reference: vars.reference } }),
    onSuccess: () => {
      toast.success("Payment recorded.");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "That didn't work."),
  });

  const unbilled = useMemo(
    () => ((data?.events ?? []) as any[]).filter((e) => e.state === "unbilled"),
    [data],
  );
  const openInvoices = useMemo(() => {
    const map = new Map<string, any>();
    for (const e of ((data?.events ?? []) as any[])) {
      if (!e.invoice) continue;
      const row = map.get(e.invoice.id) ?? { ...e.invoice, feeCents: 0, count: 0 };
      row.feeCents += Number(e.cents ?? 0);
      row.count += 1;
      map.set(e.invoice.id, row);
    }
    return Array.from(map.values());
  }, [data]);

  if (isLoading) return <p className="p-6 text-sm text-muted-foreground">Loading fund payments…</p>;
  if (error) {
    return (
      <p className="p-6 text-sm text-destructive">
        {(error as Error).message || "That didn't load."}
      </p>
    );
  }
  if (!data) return null;

  const selectedTotal = unbilled
    .filter((e) => selected.includes(e.ref))
    .reduce((s, e) => s + Number(e.cents ?? 0), 0);

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link
            to={backTo === "admin" ? "/admin/fund/$fundId" : "/manager/fund/$fundId"}
            params={{ fundId }}
          >
            ← Back to the fund
          </Link>
        </Button>
        <h1 className="text-3xl">Fund payments</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {data.fund.name}
          {data.clientName ? ` · ${data.clientName}` : ""} — wire fees and closing costs earned on
          this fund, what has been invoiced, and what has been paid. Harmonious facilitates and
          records these payments; it does not hold client money.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Not yet invoiced", data.totals.unbilledCents],
          ["On draft invoices", data.totals.draftedCents],
          ["Invoiced", data.totals.invoicedCents],
          ["Paid", data.totals.paidCents],
        ].map(([label, cents]) => (
          <Card key={String(label)}>
            <CardHeader className="pb-2">
              <CardDescription>{label as string}</CardDescription>
              <CardTitle className="text-2xl">{money(cents as number)}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">This fund's rates</CardTitle>
          <CardDescription>
            Set from the client's agreed rates on the fund's fee settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-6 text-sm">
          <span>
            Wire fee <strong>{money(data.fund.wireFeeCents)}</strong> ({data.fund.wireFeeSource})
          </span>
          <span>
            Closing cost <strong>{money(data.fund.closingCostCents)}</strong> (
            {data.fund.closingCostSource})
          </span>
          <span>{data.activeSow ? data.activeSow.title : "No active statement of work"}</span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fees earned but not invoiced</CardTitle>
          <CardDescription>
            One wire fee for each settled investor funding, one closing cost for each closing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {unbilled.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing outstanding — every fee on this fund is already on an invoice.
            </p>
          ) : (
            <>
              {unbilled.map((e: any) => (
                <label
                  key={e.ref}
                  className="flex items-start gap-3 rounded-md border p-3 text-sm"
                >
                  <Checkbox
                    checked={selected.includes(e.ref)}
                    onCheckedChange={(v) =>
                      setSelected(
                        v ? [...selected, e.ref] : selected.filter((r) => r !== e.ref),
                      )
                    }
                    disabled={!data.canManage}
                  />
                  <span className="flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <strong>{e.label}</strong>
                      <Badge variant="outline">{e.kindLabel}</Badge>
                      {e.custom ? <Badge variant="secondary">One-off rate</Badge> : null}
                    </span>
                    <span className="block text-muted-foreground">
                      {e.description} · {e.occurredOn}
                    </span>
                  </span>
                  <span className="font-medium">{money(e.cents)}</span>
                </label>
              ))}

              {data.canManage ? (
                <div className="space-y-3 rounded-md border p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="net-days">Payable within (days)</Label>
                      <Input
                        id="net-days"
                        type="number"
                        min={0}
                        max={180}
                        value={netDays}
                        onChange={(ev) => setNetDays(Number(ev.target.value || 0))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="fee-note">Note on the invoice</Label>
                      <Textarea
                        id="fee-note"
                        rows={2}
                        value={note}
                        onChange={(ev) => setNote(ev.target.value)}
                        placeholder="Optional"
                      />
                    </div>
                  </div>
                  <Button
                    disabled={selected.length === 0 || billMut.isPending}
                    onClick={() =>
                      billMut.mutate({ offeringId: fundId, refs: selected, netDays, note })
                    }
                  >
                    Put {selected.length || "no"} fee{selected.length === 1 ? "" : "s"} on a draft
                    invoice ({money(selectedTotal)})
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Invoicing these fees needs legal, compliance, finance, client success or admin
                  authority.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invoices carrying this fund's fees</CardTitle>
          <CardDescription>Issue a draft, then record the payment when it lands.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {openInvoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invoices yet for this fund.</p>
          ) : (
            openInvoices.map((inv: any) => (
              <div key={inv.id} className="space-y-2 rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{inv.number ?? "Draft invoice"}</strong>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        inv.status === "paid"
                          ? "default"
                          : inv.status === "issued"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {inv.status}
                    </Badge>
                    {inv.approvalStatus ? (
                      <Badge variant="outline">client: {inv.approvalStatus}</Badge>
                    ) : null}
                  </div>
                </div>
                <p className="text-muted-foreground">
                  {inv.count} fund fee{inv.count === 1 ? "" : "s"} · {money(inv.feeCents)}
                  {inv.dueDate ? ` · due ${inv.dueDate}` : ""}
                  {inv.paidOn ? ` · paid ${inv.paidOn}` : ""}
                </p>
                {data.canManage ? (
                  <div className="flex flex-wrap items-end gap-2">
                    {inv.status === "draft" ? (
                      <Button
                        size="sm"
                        disabled={issueMut.isPending}
                        onClick={() => issueMut.mutate(inv.id)}
                      >
                        Issue it
                      </Button>
                    ) : null}
                    {inv.status === "issued" ? (
                      <>
                        <div className="w-56">
                          <Label htmlFor={`ref-${inv.id}`}>Payment reference</Label>
                          <Input
                            id={`ref-${inv.id}`}
                            value={payRef[inv.id] ?? ""}
                            onChange={(ev) =>
                              setPayRef({ ...payRef, [inv.id]: ev.target.value })
                            }
                            placeholder="Wire or ACH reference"
                          />
                        </div>
                        <Button
                          size="sm"
                          disabled={payMut.isPending || !(payRef[inv.id] ?? "").trim()}
                          title="Enter the wire or ACH reference first"
                          onClick={() =>
                            payMut.mutate({ id: inv.id, reference: (payRef[inv.id] ?? "").trim() })
                          }
                        >
                          Record payment
                        </Button>
                      </>
                    ) : null}
                    <Button asChild size="sm" variant="outline">
                      <Link to="/admin/pricing">Open in Pricing and agreements</Link>
                    </Button>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Trail</CardTitle>
          <CardDescription>Who did what to this fund's fees, and when.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(data.trail as any[]).length === 0 ? (
            <p className="text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            (data.trail as any[]).map((t) => (
              <div key={t.id} className="flex flex-wrap justify-between gap-2 border-b pb-1">
                <span>
                  {t.area} — {t.action}
                  {t.target ? ` · ${t.target}` : ""}
                </span>
                <span className="text-muted-foreground">
                  {t.actor_role ?? "staff"} · {new Date(t.created_at).toLocaleString()}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Every fee here is billed once: once a fee is on an invoice it cannot be added again, and
        each step is written to the audit trail with who, when and the amounts.
      </p>
    </main>
  );
}
