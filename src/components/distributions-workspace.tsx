import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Textarea } from "@/components/ui/textarea";
import { DISTRIBUTION_TYPE_LABELS, OPERATIONS_STAGE_LABELS } from "@/lib/distributions-model";
import {
  approveDistributionReconciliationFn,
  approveDistributionReversalFn,
  cancelDistributionFn,
  reconcileDistributionPaymentFn,
  reverseDistributionPaymentFn,
  reviewDistributionWithholdingFn,
  distributionExecutionCheckFn,
  distributionsWorkspaceFn,
  executeDistributionPaymentFn,
  finalApproveDistributionFn,
  postDistributionPaymentFn,
  publishDistributionNoticeFn,
  resolveDistributionExceptionFn,
  reviewDistributionFn,
} from "@/lib/distributions.functions";

const money = (cents: number | null | undefined) =>
  typeof cents === "number"
    ? (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })
    : "—";

/** Everything Harmonious needs to move a distribution safely from proposal to posted. */
export function DistributionsWorkspace() {
  const queryClient = useQueryClient();
  const load = useServerFn(distributionsWorkspaceFn);
  const review = useServerFn(reviewDistributionFn);
  const finalApprove = useServerFn(finalApproveDistributionFn);
  const cancel = useServerFn(cancelDistributionFn);
  const check = useServerFn(distributionExecutionCheckFn);
  const execute = useServerFn(executeDistributionPaymentFn);
  const post = useServerFn(postDistributionPaymentFn);
  const notice = useServerFn(publishDistributionNoticeFn);
  const resolve = useServerFn(resolveDistributionExceptionFn);
  const reviewWithholding = useServerFn(reviewDistributionWithholdingFn);
  const reconcile = useServerFn(reconcileDistributionPaymentFn);
  const approveRec = useServerFn(approveDistributionReconciliationFn);
  const requestReversal = useServerFn(reverseDistributionPaymentFn);
  const approveReversal = useServerFn(approveDistributionReversalFn);

  const [bucket, setBucket] = useState("all");
  const [search, setSearch] = useState("");
  const [resolutions, setResolutions] = useState<Record<string, string>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ["distributions-workspace"],
    queryFn: () => load({ data: {} }),
    retry: false,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["distributions-workspace"] });

  const act = (fn: (input: any) => Promise<any>, success: string) =>
    useMutationLike(fn, success, refresh);

  const reviewM = act(review, "Sent for approval.");
  const approveM = act(finalApprove, "Approved. Payments can now be released.");
  const cancelM = act(cancel, "Distribution cancelled.");
  const executeM = act(execute, "Bank transfer recorded. It completes only after reconciliation and posting.");
  const withholdingM = act(reviewWithholding, "Withholding reviewed.");
  const reconcileM = act(reconcile, "Match prepared. A second person must approve it.");
  const approveRecM = act(approveRec, "Reconciliation approved; journal prepared.");
  const reversalM = act(requestReversal, "Reversal requested. A second person must approve it.");
  const approveReversalM = act(approveReversal, "Reversal approved and recorded.");
  const postM = act(post, "Posted to the ledger and the investor's capital account.");
  const noticeM = act(notice, "Distribution notice published.");
  const resolveM = act(resolve, "Exception closed.");

  const lines = useMemo(() => {
    const all = (data?.lines ?? []) as any[];
    const term = search.trim().toLowerCase();
    return all.filter((l) => {
      if (bucket !== "all" && l.stage !== bucket) return false;
      if (!term) return true;
      return String(l.displayName ?? "").toLowerCase().includes(term);
    });
  }, [data, bucket, search]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading distributions…</p>;
  if (error) {
    return (
      <p className="text-sm text-destructive">
        {(error as any)?.message ?? "This workspace isn't available to you."}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Distributions and payments</CardTitle>
          <CardDescription>
            Harmonious never sends money from here. Once a distribution is approved for payment, a
            finance colleague makes the transfer at the bank and records it. It only counts as
            completed after the bank payment is matched, a second person approves the match and the
            accounting is posted.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="w-64">
            <Label>Show</Label>
            <Select value={bucket} onValueChange={setBucket}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everything</SelectItem>
                {Object.entries(OPERATIONS_STAGE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-64">
            <Label>Search</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Investor" />
          </div>
        </CardContent>
      </Card>

      {((data?.batches ?? []) as any[]).map((b) => (
        <Card key={b.id}>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">
                {b.title} · {money(b.totalGrossCents)} gross
              </CardTitle>
              <Badge variant={b.balances ? "default" : "destructive"}>
                {b.balances ? "Balances" : "Does not balance"}
              </Badge>
              <Badge variant="secondary">{b.status.replace(/_/g, " ")}</Badge>
              <Badge variant="outline">
                {DISTRIBUTION_TYPE_LABELS[b.distributionType as keyof typeof DISTRIBUTION_TYPE_LABELS] ??
                  b.distributionType}
              </Badge>
              <Badge variant="outline">{b.recipientCount} investors</Badge>
            </div>
            <CardDescription>
              Declared {money(b.declaredAmountCents)} · withholding {money(b.totalWithholdingCents)} ·
              net {money(b.totalNetCents)}
              {b.reserveCents ? ` · reserve ${money(b.reserveCents)}` : ""}
              {b.managerApproved ? " · manager approved" : " · awaiting manager"}
              {b.finalApproved ? " · final approved" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => reviewM.run({ batchId: b.id })}>
              Send for approval
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={b.withholdingReviewed}
              onClick={() => withholdingM.run({ batchId: b.id })}
            >
              {b.withholdingReviewed ? "Withholding reviewed" : "Review withholding"}
            </Button>
            <Button size="sm" onClick={() => approveM.run({ batchId: b.id })}>
              Final approval
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => cancelM.run({ batchId: b.id, reason: "Cancelled by Harmonious" })}
            >
              Cancel
            </Button>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Investor payments</CardTitle>
          <CardDescription>
            Each payment carries its own approval, destination check and accounting posting.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing to show here.</p>
          ) : null}
          {lines.map((l) => (
            <div key={l.id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{l.displayName ?? "Investor"}</span>
                <Badge variant={l.stage === "exception" ? "destructive" : "outline"}>
                  {l.stageLabel ?? l.stage}
                </Badge>
                {l.matchOutcome ? <Badge variant="secondary">Match: {String(l.matchOutcome).toLowerCase()}</Badge> : null}
                <span className="text-sm text-muted-foreground">
                  {money(l.grossCents)} gross · {money(l.withholdingCents)} withheld ·{" "}
                  {money(l.netCents)} net
                  {l.destinationEnding ? ` · to account ending ${l.destinationEnding}` : " · no destination on file"}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      const res: any = await check({ data: { lineId: l.id } });
                      toast.message(
                        res.blockers.length === 0
                          ? "Ready: the transfer can be made at the bank and then recorded here."
                          : `Blocked: ${res.blockers.join(" ")}`,
                      );
                    } catch (e: any) {
                      toast.error(e?.message ?? "That check didn't run.");
                    }
                  }}
                >
                  Check readiness
                </Button>
                {l.stage === "approved_for_payment" ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      const ref = window.prompt(
                        "You made this transfer at the bank yourself. Enter the bank's reference for it:",
                      );
                      if (ref) executeM.run({ lineId: l.id, externalReference: ref });
                    }}
                  >
                    Record bank transfer made outside Harmonious
                  </Button>
                ) : null}
                {l.paymentId && !l.reconciliationPrepared ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const id = window.prompt("Bank transaction to match (its ID from the bank feed):");
                      if (id) reconcileM.run({ paymentId: l.paymentId, bankTransactionId: id.trim() });
                    }}
                  >
                    Match to bank transaction
                  </Button>
                ) : null}
                {l.reconciliationPrepared && !l.reconciliationApproved ? (
                  <Button size="sm" variant="outline" onClick={() => approveRecM.run({ paymentId: l.paymentId })}>
                    Approve reconciliation
                  </Button>
                ) : null}
                {l.paymentId && !l.reversalRequested ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const reason = window.prompt("Why is this payment being reversed?");
                      if (reason) reversalM.run({ paymentId: l.paymentId, reason });
                    }}
                  >
                    Request reversal
                  </Button>
                ) : null}
                {l.reversalRequested ? (
                  <Button size="sm" variant="ghost" onClick={() => approveReversalM.run({ paymentId: l.paymentId })}>
                    Approve reversal
                  </Button>
                ) : null}
                <Button size="sm" variant="outline" onClick={() => noticeM.run({ lineId: l.id })}>
                  Publish notice
                </Button>
                {l.reconciliationApproved && l.stage === "accounting_required" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={postM.pending}
                    onClick={() => postM.run({ paymentId: l.paymentId })}
                  >
                    Post to the ledger
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Open exceptions</CardTitle>
          <CardDescription>Nothing here resolves itself; each needs a written explanation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {((data?.exceptions ?? []) as any[]).length === 0 ? (
            <p className="text-sm text-muted-foreground">No open exceptions.</p>
          ) : null}
          {((data?.exceptions ?? []) as any[]).map((e) => (
            <div key={e.id} className="space-y-2 rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={e.severity === "blocking" ? "destructive" : "secondary"}>
                  {String(e.kind).replace(/_/g, " ")}
                </Badge>
                <span className="text-sm text-muted-foreground">{e.detail}</span>
              </div>
              <Textarea
                rows={2}
                value={resolutions[e.id] ?? ""}
                placeholder="How was this resolved?"
                onChange={(ev) => setResolutions((r) => ({ ...r, [e.id]: ev.target.value }))}
              />
              <Button
                size="sm"
                onClick={() =>
                  resolveM.run({ exceptionId: e.id, resolution: resolutions[e.id] ?? "" })
                }
              >
                Close exception
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Posting to the ledger is a separate act by a second person. Only then does an investor's
        capital account change.
      </p>

    </div>
  );
}

/** Small helper so each action shares the same toast and refresh behaviour. */
function useMutationLike(fn: (input: any) => Promise<any>, success: string, refresh: () => void) {
  const mutation = useMutation({
    mutationFn: (input: any) => fn({ data: input } as any),
    onSuccess: () => {
      toast.success(success);
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "That didn't go through."),
  });
  return { run: (input: any) => mutation.mutate(input), pending: mutation.isPending };
}
