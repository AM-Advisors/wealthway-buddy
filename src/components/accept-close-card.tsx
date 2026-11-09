import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { acceptSubscriptionFn, applyBankActivityFn, closeInvestmentFn, reviewDetailFn, taggedDepositsFn } from "@/lib/investor-onboarding.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const money = (c?: number | null) => (c == null ? "-" : `$${(c / 100).toLocaleString()}`);

/** Staff-only: match tagged wires, accept the subscription and close/admit from the investor page. Server gates stay authoritative. */
export function AcceptCloseCard({ onboardingId }: { onboardingId: string }) {
  const qc = useQueryClient();
  const detailFn = useServerFn(reviewDetailFn);
  const depositsFn = useServerFn(taggedDepositsFn);
  const matchFn = useServerFn(applyBankActivityFn);
  const acceptFn = useServerFn(acceptSubscriptionFn);
  const closeFn = useServerFn(closeInvestmentFn);
  const [signer, setSigner] = useState("");
  const [capacity, setCapacity] = useState("");
  const q = useQuery({ queryKey: ["onboarding-review", onboardingId], queryFn: () => detailFn({ data: { onboardingId } }) });
  const dq = useQuery({ queryKey: ["onboarding-review", onboardingId, "deposits"], queryFn: () => depositsFn({ data: { onboardingId } }) });
  const refresh = () => qc.invalidateQueries({ predicate: (x) => ["onboarding-review", "onboarding-queue", "fund-investor", "fund-investor-records", "investor-record", "investment-readiness", "onboarding"].includes(String(x.queryKey[0])) });
  const err = (e: unknown) => toast.error(String((e as Error)?.message ?? e).replace(/^Forbidden:\s*/, ""));
  const match = useMutation({
    mutationFn: (bankTransactionId: string) => matchFn({ data: { bankTransactionId, onboardingId } }),
    onSuccess: (r: any) => {
      if (r?.matched === false) toast.error(r.reason ?? "This wire couldn't be matched.");
      else toast.success(r?.fundingStatus === "funded" ? "Wire matched. Funds reconciled." : "Wire matched. The amount doesn't equal the commitment yet; an exception was raised.");
      refresh();
    },
    onError: err,
  });
  const accept = useMutation({ mutationFn: () => acceptFn({ data: { onboardingId, signerName: signer.trim(), capacity: capacity.trim() } }), onSuccess: () => { toast.success("Subscription accepted."); refresh(); }, onError: err });
  const close = useMutation({ mutationFn: () => closeFn({ data: { onboardingId } }), onSuccess: () => { toast.success("Investment closed and admitted."); refresh(); }, onError: err });

  const o: any = (q.data as any)?.onboarding;
  if (!o) return null;
  const funded = o.funding_status === "funded";
  const accepted = Boolean(o.accepted_at) || o.stage === "accepted";
  const closed = o.stage === "closed";
  const deposits = ((dq.data as any)?.deposits ?? []) as { bankTransactionId: string; postedOn: string; amountCents: number; description: string; source: string; matched: boolean; matchedHere: boolean }[];
  const unmatched = deposits.filter((d) => !d.matched);

  return (
    <Card className="md:col-span-2">
      <CardHeader><CardTitle className="text-base">Accept & close investment</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-2">
          <Badge variant={funded ? "default" : "outline"}>{funded ? "Funds reconciled" : "Funds not reconciled"}</Badge>
          <Badge variant={accepted ? "default" : "outline"}>{accepted ? "Accepted" : "Not accepted"}</Badge>
          <Badge variant={closed ? "default" : "outline"}>{closed ? "Closed" : "Not closed"}</Badge>
          <span className="text-muted-foreground">Received {money(o.funded_amount_cents)} of {money(o.accepted_amount_cents ?? o.requested_amount_cents)}</span>
        </div>

        <div className="space-y-2">
          <p className="font-medium">Wires in the fund's books for this investor</p>
          {dq.isLoading ? <p className="text-muted-foreground">Loading wires…</p> : !deposits.length ? (
            <p className="text-muted-foreground">No wire is assigned to this investor yet. In the fund's Accounting tab, assign the deposit to this investor as a Capital contribution and apply the statement.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {deposits.map((d) => (
                <li key={d.bankTransactionId} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="font-medium">{money(d.amountCents)} · {d.postedOn}</p>
                    <p className="truncate text-muted-foreground">{d.description}{d.source ? ` · ${d.source}` : ""}</p>
                  </div>
                  {d.matchedHere ? <Badge>Counted toward funding</Badge> : d.matched ? <Badge variant="outline">Matched to another investment</Badge> : (
                    <Button size="sm" disabled={match.isPending} onClick={() => { if (window.confirm(`Count this ${money(d.amountCents)} wire toward this investor's funding?`)) match.mutate(d.bankTransactionId); }}>
                      {match.isPending ? "Matching…" : "Match wire"}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {closed ? <p className="text-muted-foreground">This investment is closed and admitted.</p> : !funded ? <p className="text-muted-foreground">{unmatched.length ? "Match the wire above, then accept and close here." : "Once the wire is matched, accept and close here."}</p> : !accepted ? <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="acc-signer">Accepting signer</Label><Input id="acc-signer" value={signer} onChange={(e) => setSigner(e.target.value)} /></div>
            <div><Label htmlFor="acc-cap">Capacity</Label><Input id="acc-cap" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="General Partner" /></div>
          </div>
          <Button disabled={accept.isPending || signer.trim().length < 2 || capacity.trim().length < 2} onClick={() => accept.mutate()}>{accept.isPending ? "Accepting…" : "Accept subscription"}</Button>
        </> : <Button disabled={close.isPending} onClick={() => close.mutate()}>{close.isPending ? "Closing…" : "Close and admit"}</Button>}
      </CardContent>
    </Card>
  );
}
