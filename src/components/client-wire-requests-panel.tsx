import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createClientWireRequest } from "@/lib/client-portal.functions";

const money = (cents: number | null | undefined) =>
  typeof cents === "number"
    ? (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })
    : "—";

const date = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString("en-US") : "—";

const STATUS: Record<string, string> = {
  pending: "With Harmonious for review",
  approved: "Approved",
  declined: "Declined",
  cancelled: "Cancelled",
};

const PURPOSES = [
  ["expense", "Fund expense"],
  ["capital_call", "Capital call"],
  ["distribution", "Distribution"],
  ["investor_wire", "Investor wire"],
  ["other", "Other"],
] as const;

/** Wire requests on the client's funds, plus a form to raise a new one. */
export function ClientWireRequestsPanel({
  requests,
  funds,
  canRequest,
}: {
  requests: any[];
  funds: any[];
  canRequest: boolean;
}) {
  const queryClient = useQueryClient();
  const create = useServerFn(createClientWireRequest);

  const [open, setOpen] = useState(false);
  const [offeringId, setOfferingId] = useState<string>(funds[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState<string>("expense");
  const [expectedDate, setExpectedDate] = useState("");
  const [note, setNote] = useState("");

  const submit = useMutation({
    mutationFn: () =>
      create({
        data: {
          offeringId,
          amountCents: Math.round(Number(amount) * 100),
          purpose: purpose as any,
          expectedDate: expectedDate || null,
          note: note || null,
        },
      }),
    onSuccess: () => {
      toast.success("Your wire request has gone to Harmonious for review.");
      setOpen(false);
      setAmount("");
      setNote("");
      setExpectedDate("");
      queryClient.invalidateQueries({ queryKey: ["client-portal"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "That didn't save."),
  });

  const amountValid = Number(amount) > 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Wire requests</CardTitle>
              <CardDescription>
                Requests to send money from your funds. A request is not an instruction: Harmonious
                runs its checks and records two separate approvals before anything is sent.
              </CardDescription>
            </div>
            {canRequest && funds.length > 0 && (
              <Button size="sm" onClick={() => setOpen((v) => !v)}>
                {open ? "Close" : "Request a wire"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!canRequest && (
            <p className="text-sm text-muted-foreground">
              This service is not currently included in your active scope. Request service.
            </p>
          )}

          {canRequest && open && (
            <div className="rounded-md border p-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="wire-fund">Fund</Label>
                  <select
                    id="wire-fund"
                    className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
                    value={offeringId}
                    onChange={(e) => setOfferingId(e.target.value)}
                  >
                    {funds.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="wire-purpose">Purpose</Label>
                  <select
                    id="wire-purpose"
                    className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                  >
                    {PURPOSES.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="wire-amount">Amount (USD)</Label>
                  <Input
                    id="wire-amount"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="25000"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="wire-date">Needed by</Label>
                  <Input
                    id="wire-date"
                    type="date"
                    value={expectedDate}
                    onChange={(e) => setExpectedDate(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="wire-note">What is this for?</Label>
                <Textarea
                  id="wire-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="mt-1"
                  rows={3}
                  placeholder="Who should be paid and why."
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Submitting sends this to Harmonious for review. No money moves until the checks pass
                and two authorised approvals are recorded.
              </p>
              <Button
                size="sm"
                disabled={!offeringId || !amountValid || submit.isPending}
                onClick={() => submit.mutate()}
              >
                {submit.isPending ? "Sending…" : "Send request"}
              </Button>
            </div>
          )}

          {requests.length === 0 && (
            <p className="text-sm text-muted-foreground">No wire requests yet.</p>
          )}

          {requests.map((r) => (
            <div key={r.id} className="rounded-md border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{money(Number(r.amount_cents))}</p>
                  <p className="text-xs text-muted-foreground">
                    {String(r.purpose ?? "").replace(/_/g, " ")}
                    {r.fundName ? ` · ${r.fundName}` : ""} · requested by {r.requestedByName} on{" "}
                    {date(r.created_at)}
                  </p>
                  {r.expected_date && (
                    <p className="text-xs text-muted-foreground">
                      Needed by {date(r.expected_date)}
                    </p>
                  )}
                  {r.note && <p className="mt-1 text-sm">{r.note}</p>}
                  {r.review_note && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Harmonious: {r.review_note}
                      {r.reviewed_at ? ` · ${date(r.reviewed_at)}` : ""}
                    </p>
                  )}
                </div>
                <Badge variant={r.status === "declined" ? "destructive" : "secondary"}>
                  {STATUS[String(r.status)] ?? String(r.status)}
                </Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
