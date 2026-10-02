import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CloseFilingsPanel } from "@/components/close-filings-panel";
import { approveFundCloseRequest } from "@/lib/close-filings.functions";
import { listAllCloseRequests, updateFundCloseRequestStatus } from "@/lib/fund-close-requests.functions";

export const Route = createFileRoute("/_authenticated/ops/close-requests")({
  head: () => ({
    meta: [
      { title: "Close requests - Harmonious Operations" },
      { name: "description", content: "Fund close requests submitted by fund managers, for Harmonious review." },
      { property: "og:title", content: "Close requests - Harmonious Operations" },
      { property: "og:description", content: "Review fund close requests from fund managers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const LABEL: Record<string, string> = { submitted: "Submitted", in_review: "In review", approved: "Approved", completed: "Completed", returned: "Returned" };

function Page() {
  const load = useServerFn(listAllCloseRequests);
  const q = useQuery({ queryKey: ["ops-close-requests"], queryFn: () => load() });
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Close requests</h1>
        <p className="text-sm text-muted-foreground">Submitted by fund managers. Approve a close, generate its Form D and state filing packets, then file them yourself and record the confirmation. Nothing is submitted, charged or moved automatically.</p>
      </div>
      {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> :
       q.error ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> :
       !q.data?.length ? <p className="text-sm text-muted-foreground">No close requests yet.</p> :
       q.data.map((r: any) => <Row key={r.id} r={r} />)}
    </div>
  );
}

function Row({ r }: { r: any }) {
  const qc = useQueryClient();
  const update = useServerFn(updateFundCloseRequestStatus);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const approve = useServerFn(approveFundCloseRequest);
  async function doApprove() {
    setBusy(true);
    try {
      await approve({ data: { id: r.id, note } });
      toast.success("Close approved. You can now generate the filings.");
      setNote("");
      await qc.invalidateQueries({ queryKey: ["ops-close-requests"] });
    } catch (e: any) { toast.error(e?.message ?? "Couldn't approve."); } finally { setBusy(false); }
  }
  async function set(status: "in_review" | "completed" | "returned") {
    setBusy(true);
    try {
      await update({ data: { id: r.id, status, note } });
      toast.success("Updated.");
      setNote("");
      await qc.invalidateQueries({ queryKey: ["ops-close-requests"] });
    } catch (e: any) { toast.error(e?.message ?? "Couldn't update."); } finally { setBusy(false); }
  }
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base">
            <Link to="/client/funds/$fundId" params={{ fundId: r.offering_id }} search={{ tab: "closes" }} className="hover:underline">{r.offerings?.name ?? "Fund"}</Link>
          </CardTitle>
          <CardDescription>
            {new Date(r.created_at).toLocaleDateString()} · {r.onboarding_ids.length} investor{r.onboarding_ids.length === 1 ? "" : "s"} · target {r.target_date ?? "not set"}
          </CardDescription>
        </div>
        <Badge variant="secondary">{LABEL[r.status] ?? r.status}</Badge>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {r.notes && <p>{r.notes}</p>}
        {r.staff_note && <p className="text-xs text-muted-foreground">Last note: {r.staff_note}</p>}
        {r.status !== "completed" && (
          <div className="flex flex-wrap gap-2">
            <Input placeholder="Note (required to return)" value={note} onChange={(e) => setNote(e.target.value)} className="max-w-sm" />
            {r.status === "submitted" && <Button size="sm" variant="outline" disabled={busy} onClick={() => set("in_review")}>Start review</Button>}
            {r.status === "in_review" && <Button size="sm" disabled={busy} onClick={doApprove}>Approve close</Button>}
            {r.status === "approved" && <Button size="sm" disabled={busy} onClick={() => set("completed")}>Mark completed</Button>}
            <Button size="sm" variant="destructive" disabled={busy} onClick={() => set("returned")}>Return</Button>
          </div>
        )}
        {(r.status === "approved" || r.status === "completed") && <CloseFilingsPanel requestId={r.id} canPrepare={r.status === "approved"} />}
      </CardContent>
    </Card>
  );
}
