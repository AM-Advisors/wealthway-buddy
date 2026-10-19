import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { closeFundFn, decideReopenFn, fundStatusFn, requestReopenFn } from "@/lib/fund-status.functions";
import { invalidateFund } from "@/lib/fund-query-keys";

const LABEL: Record<string, string> = { closed: "Closed", reopen_requested: "Reopen requested", reopen_approved: "Reopened", reopen_rejected: "Reopen declined" };

/** Open/closed status. Closing is immediate; reopening needs another fund manager's approval. The server decides authority. */
export function FundStatusCard({ fundId }: { fundId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(fundStatusFn);
  const close = useServerFn(closeFundFn);
  const request = useServerFn(requestReopenFn);
  const decide = useServerFn(decideReopenFn);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ["fund-status", fundId], queryFn: () => load({ data: { offeringId: fundId } }) });
  if (q.isError) return <p role="alert" className="text-sm text-destructive">Fund status couldn't be loaded.</p>;
  const s = q.data;
  if (!s) return null;
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try { await fn(); toast.success(done); setReason(""); await qc.invalidateQueries({ queryKey: ["fund-status", fundId] }); await invalidateFund(qc, fundId); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const ok = reason.trim().length >= 3 && !busy;
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2"><h2 className="text-lg">Fund status</h2><Badge variant={s.status === "open" ? "default" : "outline"}>{s.status === "open" ? "Open" : "Closed"}</Badge></div>
      {s.status === "closed" ? <p className="text-sm text-muted-foreground">New investments are refused and fund documents are hidden from prospective investors. Existing investors keep their own documents.{s.closedReason ? ` Reason: ${s.closedReason}` : ""}</p> : null}
      {s.pending ? (
        <div className="space-y-2 rounded-md border p-3 text-sm">
          <p><b>{s.pending.requestedBy}</b> asked to reopen: {s.pending.reason}</p>
          {s.canApprove ? (
            <>
              <Textarea placeholder="Reason for your decision" value={reason} onChange={(e) => setReason(e.target.value)} />
              <div className="flex gap-2">
                <Button size="sm" disabled={!ok} onClick={() => run(() => decide({ data: { requestId: s.pending!.id, approve: true, reason } }), "Fund reopened")}>Approve reopen</Button>
                <Button size="sm" variant="outline" disabled={!ok} onClick={() => run(() => decide({ data: { requestId: s.pending!.id, approve: false, reason } }), "Reopen declined")}>Decline</Button>
              </div>
              {s.pending.mine ? <p className="text-xs text-muted-foreground">A different fund manager needs to approve this.</p> : null}
            </>
          ) : <p className="text-xs text-muted-foreground">Waiting for a fund manager to approve.</p>}
        </div>
      ) : (
        <div className="space-y-2">
          <Textarea placeholder={s.status === "open" ? "Reason for closing" : "Reason for reopening"} value={reason} onChange={(e) => setReason(e.target.value)} />
          {s.status === "open"
            ? <Button size="sm" variant="destructive" disabled={!ok} onClick={() => { if (window.confirm("Close this fund to new investments?")) void run(() => close({ data: { offeringId: fundId, reason } }), "Fund closed"); }}>Close fund</Button>
            : <Button size="sm" disabled={!ok} onClick={() => run(() => request({ data: { offeringId: fundId, reason } }), "Reopen request sent for approval")}>Request to reopen</Button>}
        </div>
      )}
      {s.history.length ? (
        <ul className="space-y-1 border-t pt-2 text-xs text-muted-foreground">
          {s.history.map((h) => <li key={h.id}>{new Date(h.at).toLocaleString()} · {LABEL[h.action] ?? h.action} by {h.by}{h.selfApproved ? " (self-approved)" : ""}: {h.reason}</li>)}
        </ul>
      ) : null}
    </section>
  );
}
