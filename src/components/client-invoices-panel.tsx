import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { listMyInvoices, respondToInvoice } from "@/lib/invoices.functions";

const money = (cents: number | null | undefined) =>
  typeof cents === "number"
    ? (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })
    : "—";

const STATUS: Record<string, string> = {
  issued: "Awaiting payment",
  paid: "Paid",
  void: "Cancelled",
};

/** A client contact reviews, approves or disputes their own invoices. */
export function ClientInvoicesPanel() {
  const queryClient = useQueryClient();
  const load = useServerFn(listMyInvoices);
  const respond = useServerFn(respondToInvoice);

  const [signer, setSigner] = useState<Record<string, string>>({});
  const [reason, setReason] = useState<Record<string, string>>({});

  const { data } = useQuery({
    queryKey: ["my-invoices"],
    queryFn: () => load(),
    retry: false,
  });

  const act = useMutation({
    mutationFn: (input: any) => respond({ data: input }),
    onSuccess: (_r, input: any) => {
      toast.success(
        input.decision === "approved"
          ? "Thank you — your approval has been recorded."
          : "We've recorded your query and the team will be in touch.",
      );
      queryClient.invalidateQueries({ queryKey: ["my-invoices"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "That didn't save."),
  });

  const invoices = (data?.invoices ?? []) as any[];
  if (!invoices.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invoices</CardTitle>
        <CardDescription>
          Fees billed under your statement of work. Approve an invoice to authorise collection by
          wire or ACH; nothing is collected before you do.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {invoices.map((inv) => (
          <div key={inv.id} className="rounded-md border p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{inv.number ?? "Invoice"}</span>
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
              <span className="ml-auto font-medium">{money(Number(inv.total_cents))}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {inv.period_start} to {inv.period_end}
              {inv.due_date ? ` · due ${inv.due_date}` : ""}
            </p>
            <ul className="text-sm">
              {(inv.lines ?? []).map((l: any) => (
                <li key={l.id} className="flex justify-between gap-4">
                  <span>{l.label}</span>
                  <span>{money(Number(l.amount_cents))}</span>
                </li>
              ))}
            </ul>

            {inv.status === "issued" && inv.approval_status === "pending" ? (
              <div className="space-y-2 border-t pt-3">
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
                    act.mutate({ id: inv.id, decision: "disputed", reason: reason[inv.id] ?? "" })
                  }
                >
                  Raise a query
                </Button>
              </div>
            ) : null}

            {inv.approval_status === "disputed" && inv.dispute_reason ? (
              <p className="text-sm text-destructive">Your query: {inv.dispute_reason}</p>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
