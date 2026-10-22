import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getInvestorVerificationSummary } from "@/lib/investor-verification.functions";
import { decideComplianceCheck } from "@/lib/kyc-aml.functions";
import { canDecide, noteRequired, STATE_LABEL, type CheckState } from "@/lib/investor-verification-model";

const variant = (s: CheckState) => (s === "approved" ? "default" : s === "declined" ? "destructive" : s === "needs_review" ? "secondary" : "outline");

export function InvestorVerificationCard({ investorUserId, applicationId }: { investorUserId?: string; applicationId?: string }) {
  const load = useServerFn(getInvestorVerificationSummary);
  const key = ["investor-verification", investorUserId ?? applicationId];
  const q = useQuery({ queryKey: key, queryFn: () => load({ data: { investorUserId, applicationId } }), retry: false });
  if (!q.data?.items.length) return null;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Verification</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {q.data.items.map((i) => (
          <div key={i.applicationId} className="space-y-2 rounded-md border p-3 text-sm">
            <p className="font-medium">{i.fund}</p>
            <CheckRow kind="kyc" label="Identity (KYC/KYB)" item={i} check={i.kyc} matches={0} queryKey={key} />
            <CheckRow kind="aml" label="AML screening" item={i} check={i.aml} matches={i.aml.matches} queryKey={key} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function CheckRow({ kind, label, item, check, matches, queryKey }: { kind: "kyc" | "aml"; label: string; item: any; check: { state: CheckState; at: string | null; reason: string | null }; matches: number; queryKey: unknown[] }) {
  const qc = useQueryClient();
  const decide = useServerFn(decideComplianceCheck);
  const [open, setOpen] = useState<null | "approved" | "declined" | "info_requested">(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!open) return;
    setBusy(true);
    try {
      await decide({ data: { offeringId: item.offeringId, applicationId: item.applicationId, checkKind: kind, decision: open, note } });
      toast.success("Decision recorded");
      setOpen(null); setNote("");
      void qc.invalidateQueries({ queryKey });
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  const needNote = open ? noteRequired(open, check.state, matches) : false;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>{label}</span>
        <span className="flex items-center gap-2">
          <Badge variant={variant(check.state) as any}>{STATE_LABEL[kind][check.state]}</Badge>
          {check.at && <span className="text-xs text-muted-foreground">{new Date(check.at).toLocaleDateString("en-US")}</span>}
        </span>
      </div>
      {check.reason && <p className="text-xs text-muted-foreground">{check.reason}</p>}
      {canDecide(check.state) && !item.ownRecord && !open && (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setOpen("approved")}>Approve</Button>
          <Button size="sm" variant="outline" onClick={() => setOpen("info_requested")}>Request info</Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen("declined")}>Decline</Button>
        </div>
      )}
      {open && (
        <div className="space-y-2">
          <Textarea placeholder={needNote ? "Reason (required)" : "Note (optional)"} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || (needNote && note.trim().length < 3)} onClick={submit}>Confirm {open === "info_requested" ? "request" : open === "approved" ? "approval" : "decline"}</Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(null)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
