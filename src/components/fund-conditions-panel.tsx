import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  acknowledgeFeeThreshold,
  clearFundCondition,
  getFundConditions,
} from "@/lib/fund-conditions.functions";

/**
 * The conditions from the client's statement of work for one fund, what each
 * one currently looks like, and — for the Harmonious team with contract
 * authority — the record needed to clear one or accept an added fee.
 */
export function FundConditionsPanel({ offeringId }: { offeringId: string }) {
  const load = useServerFn(getFundConditions);
  const clear = useServerFn(clearFundCondition);
  const ack = useServerFn(acknowledgeFeeThreshold);
  const queryClient = useQueryClient();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const conditions = useQuery({
    queryKey: ["fund-conditions", offeringId],
    queryFn: () => load({ data: { offeringId } }),
    retry: false,
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["fund-conditions", offeringId] });

  const clearOne = useMutation({
    mutationFn: (vars: { ruleKey: string; reason: string }) =>
      clear({ data: { offeringId, ruleKey: vars.ruleKey, reason: vars.reason } }),
    onSuccess: () => {
      toast.success("Recorded.");
      setOpenKey(null);
      setReason("");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "That didn't save."),
  });

  const acknowledge = useMutation({
    mutationFn: (note: string) => ack({ data: { offeringId, note } }),
    onSuccess: () => {
      toast.success("Fee acknowledged.");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "That didn't save."),
  });

  if (conditions.isLoading) return <p className="text-sm text-muted-foreground">Checking…</p>;
  if (conditions.isError || !conditions.data)
    return <p className="text-sm text-muted-foreground">Conditions aren't available.</p>;

  const data = conditions.data;

  return (
    <div className="space-y-3">
      {!data.configured ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          The engagement scope for this fund hasn't been recorded yet. New investors and funding
          stay paused until Harmonious records the statement of work.
        </div>
      ) : null}

      {data.blocking.length ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          {data.blocking.length} condition{data.blocking.length === 1 ? "" : "s"} in the agreement
          {data.blocking.length === 1 ? " is" : " are"} not met, so new investors and funding are
          paused for this fund.
        </div>
      ) : null}

      {data.feeNotice ? (
        <div className="space-y-2 rounded-md border p-3 text-sm">
          <p>
            This fund has {data.feeNotice.investors} investors, above the{" "}
            {data.feeNotice.threshold} in the statement of work. The additional per-investor fee
            applies to {data.feeNotice.over} of them.
          </p>
          {data.feeNotice.acknowledged ? (
            <p className="text-xs text-muted-foreground">
              Acknowledged by Harmonious
              {data.feeNotice.acknowledgedAt
                ? ` on ${new Date(data.feeNotice.acknowledgedAt).toLocaleDateString()}`
                : ""}
              .
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Onboarding of further investors is paused until Harmonious acknowledges the fee.
              </p>
              {data.canClear ? (
                <Button
                  size="sm"
                  disabled={acknowledge.isPending}
                  onClick={() => acknowledge.mutate("")}
                >
                  Acknowledge the additional fee
                </Button>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {data.findings.map((finding) => (
        <div key={finding.key} className="rounded-md border p-3">
          <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-56">
              <p className="text-sm font-medium">{finding.label}</p>
              {finding.description ? (
                <p className="text-xs text-muted-foreground">{finding.description}</p>
              ) : null}
              {finding.sourceReference ? (
                <p className="mt-1 text-xs text-muted-foreground">{finding.sourceReference}</p>
              ) : null}
              {finding.clearedAt ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Cleared by Harmonious on {new Date(finding.clearedAt).toLocaleDateString()}
                  {finding.clearedReason ? ` — ${finding.clearedReason}` : ""}
                </p>
              ) : null}
            </div>
            <div className="ml-auto text-right">
              <Badge
                variant={
                  finding.state === "pass"
                    ? "default"
                    : finding.state === "attention"
                      ? finding.clearedAt
                        ? "outline"
                        : "destructive"
                      : "outline"
                }
              >
                {finding.state === "pass"
                  ? "Met"
                  : finding.state === "attention"
                    ? finding.clearedAt
                      ? "Cleared"
                      : "Needs attention"
                    : "Confirm"}
              </Badge>
              <p className="mt-1 max-w-64 text-xs text-muted-foreground">{finding.detail}</p>
            </div>
          </div>

          {data.canClear && finding.state === "attention" && !finding.clearedAt ? (
            <div className="mt-3 space-y-2 border-t pt-3">
              {openKey === finding.key ? (
                <>
                  <Textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Record why this condition can be cleared for this fund."
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={reason.trim().length < 5 || clearOne.isPending}
                      onClick={() => clearOne.mutate({ ruleKey: finding.key, reason })}
                    >
                      Record and clear
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setOpenKey(null)}>
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setOpenKey(finding.key)}>
                  Clear this condition
                </Button>
              )}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
