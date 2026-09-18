import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DISTRIBUTION_TYPE_LABELS } from "@/lib/distributions-model";
import {
  managerApproveDistributionFn,
  managerDistributionBoardFn,
} from "@/lib/distributions.functions";

const money = (cents: number | null | undefined) =>
  typeof cents === "number"
    ? (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })
    : "—";

/** What a fund manager sees: progress and totals, never an investor's bank details. */
export function ManagerDistributions({ offeringId }: { offeringId?: string } = {}) {
  const queryClient = useQueryClient();
  const load = useServerFn(managerDistributionBoardFn);
  const approve = useServerFn(managerApproveDistributionFn);

  const { data, isLoading, error } = useQuery({
    queryKey: ["manager-distributions", offeringId ?? "all"],
    queryFn: () => load({ data: { offeringId: offeringId ?? null } }),
    retry: false,
  });

  const approveM = useMutation({
    mutationFn: (batchId: string) => approve({ data: { batchId } }),
    onSuccess: () => {
      toast.success("Approved. Harmonious gives the final approval before anything is sent.");
      queryClient.invalidateQueries({ queryKey: ["manager-distributions"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "That approval didn't go through."),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading distributions…</p>;
  if (error) {
    return (
      <p className="text-sm text-destructive">
        {(error as any)?.message ?? "These distributions aren't available to you."}
      </p>
    );
  }

  const batches = (data?.batches ?? []) as any[];
  const lines = (data?.lines ?? []) as any[];

  return (
    <div className="space-y-4">
      {batches.length === 0 ? (
        <p className="text-sm text-muted-foreground">No distributions have been proposed yet.</p>
      ) : null}

      {batches.map((b) => (
        <Card key={b.id}>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">{b.title}</CardTitle>
              <Badge variant="secondary">{String(b.status).replace(/_/g, " ")}</Badge>
              <Badge variant="outline">
                {DISTRIBUTION_TYPE_LABELS[b.distributionType as keyof typeof DISTRIBUTION_TYPE_LABELS] ??
                  b.distributionType}
              </Badge>
              <Badge variant="outline">{b.recipientCount} investors</Badge>
            </div>
            <CardDescription>
              {money(b.totalGrossCents)} gross · {money(b.totalWithholdingCents)} withheld ·{" "}
              {money(b.totalNetCents)} paid out ·{" "}
              {b.managerApproved ? "you have approved this" : "waiting on your approval"}
              {b.finalApproved ? " · Harmonious has given final approval" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button size="sm" disabled={b.managerApproved} onClick={() => approveM.mutate(b.id)}>
              {b.managerApproved ? "Approved" : "Approve this distribution"}
            </Button>
            <ul className="text-sm text-muted-foreground">
              {lines.map((l) => (
                <li key={l.id}>
                  {l.displayName ?? "Investor"} — {money(l.grossCents)} gross,{" "}
                  {money(l.withholdingCents)} withheld, {money(l.netCents)} net ·{" "}
                  {String(l.paymentState).replace(/_/g, " ")}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Investor bank details are held by Harmonious and are not shown here.
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
