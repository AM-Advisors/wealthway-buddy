import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SELF_APPROVAL_EVENT } from "@/lib/self-approval-shared";
import { saveSelfApprovalReason } from "@/lib/self-approval-client";

export function SelfApprovalPrompt() {
  const [key, setKey] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    const on = (e: Event) => { setKey((e as CustomEvent<{ key: string }>).detail.key); setReason(""); };
    window.addEventListener(SELF_APPROVAL_EVENT, on);
    return () => window.removeEventListener(SELF_APPROVAL_EVENT, on);
  }, []);

  const ok = reason.trim().length >= 10;
  return (
    <Dialog open={!!key} onOpenChange={(o) => !o && setKey(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve your own work</DialogTitle>
          <DialogDescription>
            As a Super Admin you can skip the second approval. Say why. Your reason is saved permanently in the history.
          </DialogDescription>
        </DialogHeader>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. No second approver available today; reviewed figures against the bank statement." rows={4} maxLength={1000} />
        <p className="text-xs text-muted-foreground">At least 10 characters.</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setKey(null)}>Cancel</Button>
          <Button disabled={!ok} onClick={() => {
            saveSelfApprovalReason(key!, reason.trim());
            setKey(null);
            toast.success("Reason saved. Click approve again to finish.");
          }}>Save reason</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
