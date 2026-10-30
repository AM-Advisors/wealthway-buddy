import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ApprovalButton } from "@/components/approval-button";
import { launchStatusFn, decideLaunchFn, launchFundFn } from "@/lib/fund-setup.functions";
import { invalidateFund } from "@/lib/fund-query-keys";
import { Button } from "@/components/ui/button";
import { launchAction } from "@/lib/launch-action";

/** Self-serve launch for fund managers. The server re-checks every requirement. */
export function ManagerLaunchCard({ fundId, onNavigate }: { fundId: string; onNavigate?: (target: "setup" | "approvals" | "documents" | "banking" | "accounting") => void }) {
  const qc = useQueryClient();
  const status = useServerFn(launchStatusFn);
  const decide = useServerFn(decideLaunchFn);
  const launch = useServerFn(launchFundFn);
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ["launch-status", fundId], queryFn: () => status({ data: { offeringId: fundId } }) });
  const s = q.data;
  const items = s ? [
    ...s.blockers.filter(b => b.key !== "blocking_tasks_complete"),
    ...(s.openTasks ?? []).filter(t => !s.blockers.some(b => b.key === "economics_approved" && t.key === "economics_terms")),
  ] : [];
  if (q.isError) return <p role="alert" className="text-sm text-destructive">Launch status couldn't be loaded. Refresh the page to try again.</p>;
  if (!s || s.launchState === "launched") return null;
  const run = async () => {
    setBusy(true);
    try {
      if (s.launchState !== "ready") await decide({ data: { setupId: s.setupId, decision: "approved" } });
      await launch({ data: { setupId: s.setupId } });
      toast.success("Fund launched for investor onboarding");
      await invalidateFund(qc, fundId);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="text-lg">Launch</h2>
      {s.blockers.length ? (
        <>
          <p className="text-base text-muted-foreground">Finish these before launching:</p>
          <ul className="mt-3 divide-y text-base">{items.map((b) => {
            const action = launchAction(b.key, "section" in b ? b.section : undefined);
            return <li key={b.key} className="flex flex-wrap items-center justify-between gap-3 py-3"><span>{b.label}</span>{onNavigate && <Button variant="outline" onClick={() => onNavigate(action.target)}>{action.label}</Button>}</li>;
          })}</ul>
          <Button variant="outline" className="mt-3" disabled={q.isFetching} onClick={() => void invalidateFund(qc, fundId)}>{q.isFetching ? "Checking…" : "Check progress again"}</Button>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-base text-muted-foreground">Everything is complete. Next: launch the fund so investors can start.</p>
          <ApprovalButton disabled={busy} title="Launch this fund?" description="Investors with the fund link can start onboarding right away. Your settings stay as they are." confirmLabel="Launch fund" undoLabel="Undo launch" waitingTitle="Launch waiting to send" waitingNote="You have 5 seconds to undo. The fund is not launched yet." historyNote="The launch is recorded in the fund history." onApprove={() => void run()}>{busy ? "Launching…" : "Launch fund"}</ApprovalButton>
        </div>
      )}
    </section>
  );
}
