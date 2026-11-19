import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { setTestInvestorFn } from "@/lib/test-investor.functions";
import { isEmployeeEmail } from "@/lib/test-investor";

export function TestInvestorBadge({ className }: { className?: string }) {
  return <Badge variant="outline" className={className ?? "border-accent text-foreground"} title="Goes through every step but is never counted in fund totals, cap tables, filings or tax reports.">Test investor</Badge>;
}

/** Badge for everyone; staff may mark or unmark (Harmonious emails always stay test investors). */
export function TestInvestorControl({ onboardingId, isTest, email, canChange }: { onboardingId: string; isTest: boolean; email?: string | null; canChange: boolean }) {
  const save = useServerFn(setTestInvestorFn);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = isTest && isEmployeeEmail(email);
  async function confirm() {
    setBusy(true);
    try {
      await save({ data: { onboardingId, isTest: !isTest, reason } });
      toast.success(isTest ? "Now counted as a real investor." : "Marked as a test investor. They're no longer counted in fund totals.");
      setOpen(false); setReason("");
      await qc.invalidateQueries();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  if (!isTest && !canChange) return null;
  return (
    <>
      {isTest && <TestInvestorBadge />}
      {canChange && !locked && (
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>{isTest ? "Count as real investor" : "Mark as test investor"}</Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isTest ? "Count as a real investor?" : "Mark as a test investor?"}</DialogTitle>
            <DialogDescription>
              {isTest
                ? "This investment will count again in fund totals, the cap table, filings and tax reports."
                : "They can still go through every step, but this investment won't count in fund totals, the cap table, filings or tax reports."}
            </DialogDescription>
          </DialogHeader>
          <label className="text-sm font-medium" htmlFor="test-investor-reason">Reason</label>
          <Textarea id="test-investor-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: internal walkthrough account" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={busy || reason.trim().length < 3} onClick={confirm}>{busy ? "Saving…" : "Confirm"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
