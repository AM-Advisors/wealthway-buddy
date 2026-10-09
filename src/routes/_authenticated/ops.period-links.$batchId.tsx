import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { applyPeriodLinkBatch, getPeriodLinkBatch, reviewPeriodLinkBatch } from "@/lib/journal-period-link.functions";

export const Route = createFileRoute("/_authenticated/ops/period-links/$batchId")({
  head: () => ({
    meta: [
      { title: "Journal period linking review - Harmonious" },
      { name: "description", content: "Independent review and application of a journal-to-period linking batch." },
      { property: "og:title", content: "Journal period linking review - Harmonious" },
      { property: "og:description", content: "Internal accounting control: review and apply period links." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

function Page() {
  const { batchId } = Route.useParams();
  const qc = useQueryClient();
  const fetchBatch = useServerFn(getPeriodLinkBatch);
  const review = useServerFn(reviewPeriodLinkBatch);
  const apply = useServerFn(applyPeriodLinkBatch);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ["period-link", batchId], queryFn: () => fetchBatch({ data: { batchId } }) });
  const b = q.data;

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try { await fn(); toast.success(ok); await qc.invalidateQueries({ queryKey: ["period-link", batchId] }); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  if (q.isLoading) return <p className="p-6 text-muted-foreground">Loading…</p>;
  if (q.error || !b) return <p className="p-6 text-destructive">{(q.error as Error)?.message ?? "Not found"}</p>;
  const isPreparer = b.me === b.prepared_by;
  const isReviewer = b.me === b.reviewed_by;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Journal period linking — {b.accounting_periods?.label}</CardTitle>
          <CardDescription>
            Adds a period reference only. Dates, amounts, lines and approvals never change. Preparer, reviewer and applier must be three different people.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex flex-wrap gap-2"><Badge>{b.status}</Badge><Badge variant="outline">{b.entry_count} journals</Badge><Badge variant="outline">hash {b.proposal_hash}</Badge></div>
          <p>Reason: {b.reason}</p>
          <p>Prepared {new Date(b.prepared_at).toLocaleString()}{b.reviewed_at && ` · reviewed ${new Date(b.reviewed_at).toLocaleString()} — “${b.review_note}”`}{b.applied_at && ` · applied ${new Date(b.applied_at).toLocaleString()}`}</p>
          {b.status === "prepared" && (
            isPreparer ? <p className="text-muted-foreground">You prepared this batch, so you cannot review it.</p> : (
              <div className="space-y-2">
                <Textarea placeholder="Review evidence / note (required)" value={note} onChange={(e) => setNote(e.target.value)} />
                <div className="flex gap-2">
                  <Button disabled={busy || note.trim().length < 3} onClick={() => run(() => review({ data: { batchId, decision: "approved", note } }), "Approved")}>Approve</Button>
                  <Button variant="outline" disabled={busy || note.trim().length < 3} onClick={() => run(() => review({ data: { batchId, decision: "rejected", note } }), "Rejected")}>Reject</Button>
                </div>
              </div>
            )
          )}
          {b.status === "approved" && (
            isPreparer || isReviewer ? <p className="text-muted-foreground">A third person must apply this batch.</p> :
              <Button disabled={busy} onClick={() => run(() => apply({ data: { batchId, expectedHash: b.proposal_hash } }), "Applied")}>Apply all {b.entry_count} links</Button>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Proposed journals</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground"><th>#</th><th>Date</th><th className="text-right">Debits</th><th className="text-right">Credits</th></tr></thead>
            <tbody>{b.proposal.map((x) => (
              <tr key={x.entry_id} className="border-t"><td>{x.entry_no}</td><td>{x.entry_date}</td><td className="text-right">{usd(x.debit_cents)}</td><td className="text-right">{usd(x.credit_cents)}</td></tr>
            ))}</tbody>
          </table>
          <p className="mt-3 text-sm text-muted-foreground">Excluded: {b.excluded.map((x) => `#${x.entry_no} (${x.reason})`).join("; ")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
