import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { acceptSubscriptionFn, closeInvestmentFn, reviewDetailFn } from "@/lib/investor-onboarding.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const money = (c?: number | null) => (c == null ? "-" : `$${(c / 100).toLocaleString()}`);

/** Staff-only: accept the subscription and close/admit from the investor page. Server gates stay authoritative. */
export function AcceptCloseCard({ onboardingId }: { onboardingId: string }) {
  const qc = useQueryClient();
  const detailFn = useServerFn(reviewDetailFn);
  const acceptFn = useServerFn(acceptSubscriptionFn);
  const closeFn = useServerFn(closeInvestmentFn);
  const [signer, setSigner] = useState("");
  const [capacity, setCapacity] = useState("");
  const q = useQuery({ queryKey: ["onboarding-review", onboardingId], queryFn: () => detailFn({ data: { onboardingId } }) });
  const refresh = () => qc.invalidateQueries({ predicate: (x) => ["onboarding-review", "onboarding-queue", "fund-investor", "fund-investor-records", "investor-record", "investment-readiness", "onboarding"].includes(String(x.queryKey[0])) });
  const err = (e: unknown) => toast.error(String((e as Error)?.message ?? e).replace(/^Forbidden:\s*/, ""));
  const accept = useMutation({ mutationFn: () => acceptFn({ data: { onboardingId, signerName: signer.trim(), capacity: capacity.trim() } }), onSuccess: () => { toast.success("Subscription accepted."); refresh(); }, onError: err });
  const close = useMutation({ mutationFn: () => closeFn({ data: { onboardingId } }), onSuccess: () => { toast.success("Investment closed and admitted."); refresh(); }, onError: err });

  const o: any = (q.data as any)?.onboarding;
  if (!o) return null;
  const funded = o.funding_status === "funded";
  const accepted = Boolean(o.accepted_at) || o.stage === "accepted";
  const closed = o.stage === "closed";

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
        {closed ? <p className="text-muted-foreground">This investment is closed and admitted.</p> : !funded ? <p className="text-muted-foreground">Record the wire in the fund's Accounting tab first. Then accept and close here.</p> : !accepted ? <>
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
