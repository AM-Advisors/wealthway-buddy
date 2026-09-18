import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  acceptSubscriptionFn,
  approveToFundFn,
  closeInvestmentFn,
  raiseExceptionFn,
  resolveExceptionFn,
  reviewDetailFn,
  reviewQueueFn,
} from "@/lib/investor-onboarding.functions";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const money = (cents: number | null | undefined) =>
  cents == null ? "—" : `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export function InvestorOnboardingOps() {
  const qc = useQueryClient();
  const queueFn = useServerFn(reviewQueueFn);
  const detailFn = useServerFn(reviewDetailFn);
  const approveFn = useServerFn(approveToFundFn);
  const acceptFn = useServerFn(acceptSubscriptionFn);
  const closeFn = useServerFn(closeInvestmentFn);
  const raiseFn = useServerFn(raiseExceptionFn);
  const resolveFn = useServerFn(resolveExceptionFn);

  const [selected, setSelected] = useState<string | null>(null);
  const [signer, setSigner] = useState("");
  const [capacity, setCapacity] = useState("");

  const queue = useQuery({ queryKey: ["onboarding-queue"], queryFn: () => queueFn({ data: {} }) });
  const detail = useQuery({
    queryKey: ["onboarding-review", selected],
    queryFn: () => detailFn({ data: { onboardingId: selected! } }),
    enabled: Boolean(selected),
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["onboarding-queue"] });
    void qc.invalidateQueries({ queryKey: ["onboarding-review", selected] });
  };
  const act = (fn: (v: any) => Promise<unknown>, ok: string) =>
    useMutation({
      mutationFn: (v: any) => fn(v),
      onSuccess: () => {
        toast.success(ok);
        refresh();
      },
      onError: (e: any) => toast.error(String(e?.message ?? e).replace(/^Forbidden:\s*/, "")),
    });

  const approve = act(approveFn, "Approved to fund.");
  const accept = act(acceptFn, "Subscription accepted.");
  const close = act(closeFn, "Investment closed and admitted.");
  const raise = act(raiseFn, "Issue raised.");
  const resolve = act(resolveFn, "Issue resolved.");

  const items: any[] = (queue.data as any)?.items ?? [];
  const d: any = detail.data;

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Review queue</CardTitle>
          <CardDescription>Every investor waiting on Harmonious.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {queue.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
          {items.length === 0 && !queue.isLoading ? (
            <p className="text-sm text-muted-foreground">Nothing is waiting right now.</p>
          ) : null}
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelected(item.id)}
              className={`w-full rounded-md border p-3 text-left text-sm ${
                selected === item.id ? "border-primary bg-primary/5" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{item.investorName ?? "Investor"}</span>
                <Badge variant="outline">{String(item.bucket ?? item.stage).replace(/_/g, " ")}</Badge>
              </div>
              <div className="text-muted-foreground">
                {item.offeringName ?? item.offeringId} · {money(item.requestedAmountCents)}
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Investment review</CardTitle>
          <CardDescription>
            Approval, acceptance and closing stay with Harmonious.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {!selected ? (
            <p className="text-sm text-muted-foreground">Choose an investor on the left.</p>
          ) : detail.isLoading || !d ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                {(d.requirements ?? []).map((r: any) => (
                  <div key={r.key} className="flex items-center justify-between rounded-md border p-2 text-sm">
                    <span>{r.label}</span>
                    <Badge variant="outline">{String(r.state).replace(/_/g, " ")}</Badge>
                  </div>
                ))}
              </div>

              <div className="text-sm text-muted-foreground">
                Requested {money(d.onboarding?.requested_amount_cents)} · Accepted{" "}
                {money(d.onboarding?.accepted_amount_cents)} · Received{" "}
                {money(d.onboarding?.funded_amount_cents)}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!d.canApproveToFund}
                  onClick={() => approve.mutate({ data: { onboardingId: selected } })}
                >
                  Approve to fund
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    raise.mutate({
                      data: { onboardingId: selected, type: "information_requested", severity: "blocking" },
                    })
                  }
                >
                  Request more information
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="signer">Accepting signer</Label>
                  <Input id="signer" value={signer} onChange={(e) => setSigner(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="cap">Capacity</Label>
                  <Input id="cap" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={signer.trim().length < 2 || capacity.trim().length < 2}
                  onClick={() =>
                    accept.mutate({
                      data: { onboardingId: selected, signerName: signer.trim(), capacity: capacity.trim() },
                    })
                  }
                >
                  Accept subscription
                </Button>
                <Button variant="secondary" onClick={() => close.mutate({ data: { onboardingId: selected } })}>
                  Close and admit
                </Button>
              </div>

              {(d.exceptions ?? []).filter((e: any) => e.status === "open").length > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Open issues</h3>
                  {(d.exceptions ?? [])
                    .filter((e: any) => e.status === "open")
                    .map((e: any) => (
                      <div key={e.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                        <span>
                          {String(e.exception_type).replace(/_/g, " ")} — {e.detail ?? "no detail"}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            resolve.mutate({ data: { exceptionId: e.id, resolution: "Resolved by Harmonious" } })
                          }
                        >
                          Resolve
                        </Button>
                      </div>
                    ))}
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
