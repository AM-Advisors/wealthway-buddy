import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { downloadInvoice, printInvoice } from "@/components/invoice-document";
import { declareInvoicePayment, listMyInvoices, respondToInvoice } from "@/lib/invoices.functions";

export const Route = createFileRoute("/_authenticated/client/invoices")({
  head: () => ({
    meta: [
      { title: "Your invoices — Harmonious" },
      {
        name: "description",
        content:
          "View and pay your Harmonious invoices, including fund wire fees and closing costs, and confirm the transfer you sent.",
      },
      { property: "og:title", content: "Your invoices — Harmonious" },
      {
        property: "og:description",
        content: "Approve invoices, pay wire fees and closing costs, and confirm your transfer.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientInvoicesRoute,
});

function ClientInvoicesRoute() {
  return <ClientInvoicesPage />;
}

const money = (cents: number | null | undefined) =>
  typeof cents === "number"
    ? (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })
    : "—";

const today = () => new Date().toISOString().slice(0, 10);

const STATUS: Record<string, string> = {
  issued: "Awaiting payment",
  paid: "Paid",
  void: "Cancelled",
};

function feeKind(line: any): string | null {
  const ref = String(line?.source_ref ?? "");
  if (ref.startsWith("wire_fee:")) return "Wire fee";
  if (ref.startsWith("closing_cost:")) return "Closing cost";
  return null;
}

function ClientInvoicesPage() {
  const queryClient = useQueryClient();
  const load = useServerFn(listMyInvoices);
  const respond = useServerFn(respondToInvoice);
  const declare = useServerFn(declareInvoicePayment);

  const [signer, setSigner] = useState<Record<string, string>>({});
  const [reason, setReason] = useState<Record<string, string>>({});
  const [pay, setPay] = useState<Record<string, { method: string; paidOn: string; reference: string; note: string }>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["my-invoices"],
    queryFn: () => load(),
    retry: false,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["my-invoices"] });

  const act = useMutation({
    mutationFn: (input: any) => respond({ data: input }),
    onSuccess: (_r, input: any) => {
      toast.success(
        input.decision === "approved"
          ? "Thank you — your approval has been recorded."
          : "We've recorded your query and the team will be in touch.",
      );
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "That didn't save."),
  });

  const confirmPayment = useMutation({
    mutationFn: (input: any) => declare({ data: input }),
    onSuccess: () => {
      toast.success("Thanks — we'll confirm once the funds arrive.");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "That didn't save."),
  });

  const invoices = (data?.invoices ?? []) as any[];
  const open = invoices.filter((i) => i.status === "issued");
  const outstanding = open.reduce((sum, i) => sum + Number(i.total_cents ?? 0), 0);
  const feeTotal = open.reduce(
    (sum, i) =>
      sum +
      (i.lines ?? [])
        .filter((l: any) => feeKind(l))
        .reduce((s: number, l: any) => s + Number(l.amount_cents ?? 0), 0),
    0,
  );

  const payState = (id: string) =>
    pay[id] ?? { method: "wire", paidOn: today(), reference: "", note: "" };
  const setPayField = (id: string, field: string, value: string) =>
    setPay((s) => ({ ...s, [id]: { ...payState(id), [field]: value } }));

  return (
    <div>
      <div>
        <h2 className="text-2xl">Your invoices</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Fees billed under your statement of work, including fund wire fees and closing costs.
          Approve an invoice, send the transfer, then confirm it here. Harmonious facilitates
          payments and keeps the records; it does not hold your money.
        </p>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Awaiting payment</CardDescription>
            <CardTitle className="text-2xl">{open.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total outstanding</CardDescription>
            <CardTitle className="text-2xl">{money(outstanding)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Wire fees and closing costs</CardDescription>
            <CardTitle className="text-2xl">{money(feeTotal)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">Loading your invoices…</p>
      ) : invoices.length === 0 ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Nothing to pay right now</CardTitle>
            <CardDescription>
              When Harmonious issues an invoice it appears here with every fee itemised.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="mt-6 space-y-4">
          {invoices.map((inv) => {
            const state = payState(inv.id);
            const fees = (inv.lines ?? []).filter((l: any) => feeKind(l));
            return (
              <Card key={inv.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-base">{inv.number ?? "Invoice"}</CardTitle>
                    <Badge variant={inv.status === "paid" ? "secondary" : "default"}>
                      {STATUS[inv.status] ?? inv.status}
                    </Badge>
                    {inv.overdue ? <Badge variant="destructive">Overdue</Badge> : null}
                    {inv.approval_status === "approved" ? (
                      <Badge variant="outline">Approved by {inv.client_signer_name}</Badge>
                    ) : null}
                    {inv.approval_status === "disputed" ? (
                      <Badge variant="destructive">Queried</Badge>
                    ) : null}
                    {inv.client_payment_declared_at ? (
                      <Badge variant="outline">Payment confirmed by you</Badge>
                    ) : null}
                    <span className="ml-auto font-medium">{money(Number(inv.total_cents))}</span>
                  </div>
                  <CardDescription>
                    {inv.period_start} to {inv.period_end}
                    {inv.due_date ? ` · due ${inv.due_date}` : ""}
                    {fees.length ? ` · ${fees.length} fund fee${fees.length > 1 ? "s" : ""}` : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="text-sm">
                    {(inv.lines ?? []).map((l: any) => (
                      <li key={l.id} className="flex justify-between gap-4 border-b py-1 last:border-0">
                        <span>
                          {l.label}
                          {feeKind(l) ? (
                            <span className="ml-2 text-xs text-muted-foreground">{feeKind(l)}</span>
                          ) : null}
                        </span>
                        <span>{money(Number(l.amount_cents))}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => downloadInvoice(inv)}>
                      Download invoice
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (!printInvoice(inv)) {
                          toast.error("Your browser blocked the print window — allow pop-ups and try again.");
                        }
                      }}
                    >
                      Print or save as PDF
                    </Button>
                  </div>



                  {inv.status === "issued" && inv.approval_status === "pending" ? (
                    <div className="space-y-2 rounded-md border p-3">
                      <p className="text-sm font-medium">Step 1 — approve this invoice</p>
                      <Label htmlFor={`signer-${inv.id}`}>Type your full name to approve</Label>
                      <Input
                        id={`signer-${inv.id}`}
                        value={signer[inv.id] ?? ""}
                        onChange={(e) => setSigner((s) => ({ ...s, [inv.id]: e.target.value }))}
                        placeholder="Full name"
                      />
                      <Button
                        size="sm"
                        disabled={act.isPending}
                        onClick={() =>
                          act.mutate({
                            id: inv.id,
                            decision: "approved",
                            signerName: signer[inv.id] ?? "",
                          })
                        }
                      >
                        Approve this invoice
                      </Button>
                      <Label htmlFor={`reason-${inv.id}`}>Or tell us what looks wrong</Label>
                      <Textarea
                        id={`reason-${inv.id}`}
                        rows={2}
                        value={reason[inv.id] ?? ""}
                        onChange={(e) => setReason((s) => ({ ...s, [inv.id]: e.target.value }))}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={act.isPending}
                        onClick={() =>
                          act.mutate({
                            id: inv.id,
                            decision: "disputed",
                            reason: reason[inv.id] ?? "",
                          })
                        }
                      >
                        Raise a query
                      </Button>
                    </div>
                  ) : null}

                  {inv.status === "issued" &&
                  inv.approval_status === "approved" &&
                  !inv.client_payment_declared_at ? (
                    <div className="space-y-3 rounded-md border p-3">
                      <p className="text-sm font-medium">Step 2 — pay and confirm</p>
                      <p className="text-sm text-muted-foreground">
                        Send the payment from your fund's operating account using the remittance
                        details your Harmonious contact provided, then confirm it below so we can
                        match it on arrival.
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label>How you paid</Label>
                          <div className="flex gap-2">
                            {(["wire", "ach"] as const).map((m) => (
                              <Button
                                key={m}
                                type="button"
                                size="sm"
                                variant={state.method === m ? "default" : "outline"}
                                onClick={() => setPayField(inv.id, "method", m)}
                              >
                                {m === "wire" ? "Wire" : "ACH"}
                              </Button>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`paid-${inv.id}`}>Date sent</Label>
                          <Input
                            id={`paid-${inv.id}`}
                            type="date"
                            value={state.paidOn}
                            max={today()}
                            onChange={(e) => setPayField(inv.id, "paidOn", e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`ref-${inv.id}`}>Bank reference (optional)</Label>
                          <Input
                            id={`ref-${inv.id}`}
                            value={state.reference}
                            onChange={(e) => setPayField(inv.id, "reference", e.target.value)}
                            placeholder="Confirmation or trace number"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`note-${inv.id}`}>Anything we should know</Label>
                          <Input
                            id={`note-${inv.id}`}
                            value={state.note}
                            onChange={(e) => setPayField(inv.id, "note", e.target.value)}
                          />
                        </div>
                      </div>
                      <Button
                        size="sm"
                        disabled={confirmPayment.isPending}
                        onClick={() =>
                          confirmPayment.mutate({
                            id: inv.id,
                            method: state.method,
                            paidOn: state.paidOn,
                            reference: state.reference,
                            note: state.note,
                          })
                        }
                      >
                        Confirm payment sent
                      </Button>
                    </div>
                  ) : null}

                  {inv.client_payment_declared_at ? (
                    <p className="text-sm text-muted-foreground">
                      You confirmed a {inv.client_payment_method === "ach" ? "ACH" : "wire"} sent on{" "}
                      {inv.client_paid_on}
                      {inv.client_payment_reference ? ` · ${inv.client_payment_reference}` : ""}.
                      {inv.status === "paid"
                        ? " Harmonious has matched this payment."
                        : " We'll mark the invoice paid once the funds arrive."}
                    </p>
                  ) : null}

                  {inv.approval_status === "disputed" && inv.dispute_reason ? (
                    <p className="text-sm text-destructive">Your query: {inv.dispute_reason}</p>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
