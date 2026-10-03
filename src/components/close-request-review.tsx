import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CloseFilingsPanel } from "@/components/close-filings-panel";
import { approveFundCloseRequest } from "@/lib/close-filings.functions";
import { updateFundCloseRequestStatus } from "@/lib/fund-close-requests.functions";

const LABEL: Record<string, string> = { submitted: "Submitted", in_review: "In review", approved: "Approved", completed: "Completed", returned: "Returned" };

export function CloseRequestReview({ r }: { r: any }) {
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
            <Link to="/ops/fund-setup/$fundId" params={{ fundId: r.offering_id }} search={{ tab: "closes" }} className="hover:underline">{r.offerings?.name ?? "Fund"}</Link>
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
