import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  createWireRequest,
  decideWireRequest,
  listWireRequestInvestors,
  listWireRequests,
} from "@/lib/wire-requests.functions";
import { getManagerFunds } from "@/lib/manager.functions";
import { money } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const PURPOSES = [
  { value: "investor_wire", label: "Investor wire" },
  { value: "capital_call", label: "Capital call" },
  { value: "distribution", label: "Distribution" },
  { value: "expense", label: "Fund expense" },
  { value: "other", label: "Other" },
];

const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900",
  approved: "bg-emerald-100 text-emerald-900",
  declined: "bg-rose-100 text-rose-900",
};

function statusLabel(status: string) {
  if (status === "pending") return "Waiting on you";
  if (status === "approved") return "Approved";
  return "Declined";
}

/** Fund managers ask for a wire amount to be approved. */
export function WireRequestForm() {
  const loadFunds = useServerFn(getManagerFunds);
  const loadInvestors = useServerFn(listWireRequestInvestors);
  const submit = useServerFn(createWireRequest);
  const queryClient = useQueryClient();

  const { data: fundData } = useQuery({ queryKey: ["manager-funds"], queryFn: () => loadFunds() });
  const funds = (fundData?.funds ?? []) as any[];

  const [offeringId, setOfferingId] = useState("");
  const [applicationId, setApplicationId] = useState("");
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("investor_wire");
  const [expected, setExpected] = useState("");
  const [note, setNote] = useState("");

  const { data: investorData } = useQuery({
    queryKey: ["wire-request-investors", offeringId],
    queryFn: () => loadInvestors({ data: { offering_id: offeringId } }),
    enabled: Boolean(offeringId),
  });

  const mutation = useMutation({
    mutationFn: () =>
      submit({
        data: {
          offering_id: offeringId,
          application_id: applicationId || null,
          amount_cents: Math.round(Number(amount) * 100),
          purpose: purpose as any,
          expected_date: expected || null,
          note: note.trim() || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Wire request sent for approval.");
      setAmount("");
      setNote("");
      setApplicationId("");
      setExpected("");
      queryClient.invalidateQueries({ queryKey: ["wire-requests"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not send that request."),
  });

  const amountNumber = Number(amount);
  const valid = offeringId && Number.isFinite(amountNumber) && amountNumber > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Request a wire</CardTitle>
        <CardDescription>
          Send an amount for approval. Pick a fund, and name an investor if the wire is for one person.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="wr-fund">Fund</Label>
            <select
              id="wr-fund"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={offeringId}
              onChange={(e) => {
                setOfferingId(e.target.value);
                setApplicationId("");
              }}
            >
              <option value="">Choose a fund…</option>
              {funds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wr-investor">Investor (optional)</Label>
            <select
              id="wr-investor"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={applicationId}
              onChange={(e) => setApplicationId(e.target.value)}
              disabled={!offeringId}
            >
              <option value="">Fund level — no single investor</option>
              {((investorData?.investors ?? []) as any[]).map((i) => (
                <option key={i.application_id} value={i.application_id}>
                  {i.name}
                  {i.commitment_cents ? ` — ${money(i.commitment_cents)}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wr-amount">Amount (USD)</Label>
            <Input
              id="wr-amount"
              inputMode="decimal"
              placeholder="250000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wr-purpose">Reason</Label>
            <select
              id="wr-purpose"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
            >
              {PURPOSES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wr-date">Expected date (optional)</Label>
            <Input id="wr-date" type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="wr-note">Note (optional)</Label>
          <Textarea
            id="wr-note"
            rows={2}
            maxLength={1000}
            placeholder="Anything the approver should know."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <Button disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? "Sending…" : "Send for approval"}
        </Button>
      </CardContent>
    </Card>
  );
}

/** The approval queue. Admins can approve or decline; managers see their own requests. */
export function WireRequestQueue({ compact = false }: { compact?: boolean }) {
  const load = useServerFn(listWireRequests);
  const decide = useServerFn(decideWireRequest);
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["wire-requests"],
    queryFn: () => load(),
    refetchInterval: 120_000,
  });

  const mutation = useMutation({
    mutationFn: (input: { id: string; status: "approved" | "declined"; review_note?: string }) =>
      decide({ data: input }),
    onSuccess: (_r, input) => {
      toast.success(input.status === "approved" ? "Wire approved." : "Wire declined.");
      queryClient.invalidateQueries({ queryKey: ["wire-requests"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save that decision."),
  });

  const all = (data?.requests ?? []) as any[];
  const rows = compact ? all.filter((r) => r.status === "pending").slice(0, 5) : all;
  const pendingCount = all.filter((r) => r.status === "pending").length;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            Wire requests
            {pendingCount > 0 ? <Badge className={STATUS_TONE["pending"]}>{pendingCount} waiting</Badge> : null}
          </CardTitle>
          <CardDescription>
            {compact
              ? "Amounts fund managers have sent for your approval."
              : "Approve or decline the amounts fund managers send in."}
          </CardDescription>
        </div>
        {compact ? (
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/wire">Open the full list</Link>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? <p className="text-sm text-muted-foreground">Loading requests…</p> : null}
        {!isLoading && rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No wire requests yet.</p>
        ) : null}

        {rows.map((r) => (
          <div key={r.id} className="rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-0.5">
                <p className="font-medium">
                  {money(r.amount_cents)} — {r.fund_name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {r.investor_name ? `For ${r.investor_name}. ` : "Fund level. "}
                  {(PURPOSES.find((p) => p.value === r.purpose)?.label ?? r.purpose)} · asked by{" "}
                  {r.requested_by_name}
                  {r.expected_date ? ` · expected ${r.expected_date}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={STATUS_TONE[r.status] ?? ""}>{statusLabel(r.status)}</Badge>
                {(r as any).settled_at ? (
                  <Badge variant="outline">
                    Seen on the bank statement {String((r as any).settled_at).slice(0, 10)}
                  </Badge>
                ) : null}
              </div>
            </div>


            {r.note ? <p className="mt-2 text-sm">{r.note}</p> : null}
            {r.review_note ? (
              <p className="mt-2 text-sm text-muted-foreground">Your note: {r.review_note}</p>
            ) : null}

            {data?.isAdmin && r.status === "pending" ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Input
                  className="max-w-xs"
                  placeholder="Note (optional)"
                  value={notes[r.id] ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                />
                <Button
                  size="sm"
                  disabled={mutation.isPending}
                  onClick={() =>
                    mutation.mutate({ id: r.id, status: "approved", review_note: notes[r.id] ?? "" })
                  }
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={mutation.isPending}
                  onClick={() =>
                    mutation.mutate({ id: r.id, status: "declined", review_note: notes[r.id] ?? "" })
                  }
                >
                  Decline
                </Button>
              </div>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
