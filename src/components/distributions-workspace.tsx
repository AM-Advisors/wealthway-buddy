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
import { DISTRIBUTION_BUCKET_LABELS, DISTRIBUTION_TYPE_LABELS } from "@/lib/distributions-model";
import {
  cancelDistributionFn,
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

  const [bucket, setBucket] = useState("all");
  const [search, setSearch] = useState("");
  const [resolutions, setResolutions] = useState<Record<string, string>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ["distributions-workspace"],
    queryFn: () => load({ data: {} }),
    retry: false,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["distributions-workspace"] });

  const act = <T,>(fn: (input: T) => Promise<any>, success: string) =>
    useMutationLike(fn, success, refresh);

  const reviewM = act(review, "Sent for approval.");
  const approveM = act(finalApprove, "Approved. Payments can now be released.");
  const cancelM = act(cancel, "Distribution cancelled.");
  const executeM = act(execute, "Payment released to the bank.");
  const postM = act(post, "Posted to the ledger and the investor's capital account.");
  const noticeM = act(notice, "Distribution notice published.");
  const resolveM = act(resolve, "Exception closed.");

  const lines = useMemo(() => {
    const all = (data?.lines ?? []) as any[];
    const term = search.trim().toLowerCase();
    return all.filter((l) => {
      if (bucket !== "all" && l.bucket !== bucket) return false;
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
            Nothing is sent until the amounts balance to the cent, the destination is verified, the
            manager and two Harmonious people have approved it and no compliance hold is in place.
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
                {Object.entries(DISTRIBUTION_BUCKET_LABELS).map(([value, label]) => (
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
                <Badge variant="outline">
                  {DISTRIBUTION_BUCKET_LABELS[l.bucket as keyof typeof DISTRIBUTION_BUCKET_LABELS] ??
                    l.bucket}
                </Badge>
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
                          ? "Ready to send."
                          : `Blocked: ${res.blockers.join(" ")}`,
                      );
                    } catch (e: any) {
                      toast.error(e?.message ?? "That check didn't run.");
                    }
                  }}
                >
                  Check readiness
                </Button>
                <Button size="sm" onClick={() => executeM.run({ lineId: l.id })}>
                  Release payment
                </Button>
                <Button size="sm" variant="outline" onClick={() => noticeM.run({ lineId: l.id })}>
                  Publish notice
                </Button>
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
        Posting a payment to the ledger is a separate act by a second person:{" "}
        <button
          type="button"
          className="underline"
          onClick={() => toast.message("Open a payment from the audit trail to post it.")}
        >
          how posting works
        </button>
        . Use {postM.pending ? "…" : "the audit trail"} to trace any payment end to end.
      </p>
    </div>
  );
}

/** Small helper so each action shares the same toast and refresh behaviour. */
function useMutationLike<T>(fn: (input: T) => Promise<any>, success: string, refresh: () => void) {
  const mutation = useMutation({
    mutationFn: (input: T) => fn({ data: input } as any),
    onSuccess: () => {
      toast.success(success);
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "That didn't go through."),
  });
  return { run: (input: T) => mutation.mutate(input), pending: mutation.isPending };
}
