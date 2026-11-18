import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OfferingDocumentReader } from "@/components/offering-document-reader";

/**
 * Opens the document before an investor can acknowledge it. "I acknowledge and agree"
 * unlocks only after the reader reports the end was reached (or a downloaded copy was confirmed).
 * Once acknowledged, the same button reopens the document read-only.
 */
export function AcknowledgeDocumentDialog({
  onboardingId,
  documentId,
  title,
  acknowledged,
  pending,
  onAcknowledge,
}: {
  onboardingId: string;
  documentId: string;
  title: string;
  acknowledged: boolean;
  pending?: boolean;
  onAcknowledge: () => Promise<unknown> | void;
}) {
  const [open, setOpen] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [saving, setSaving] = useState(false);
  const busy = saving || !!pending;

  const agree = async () => {
    setSaving(true);
    try {
      await onAcknowledge();
      setOpen(false);
    } catch {
      // The caller already shows the error; keep the document open so the investor can retry.
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button size="sm" variant={acknowledged ? "outline" : "default"} onClick={() => { setReachedEnd(false); setOpen(true); }}>
        {acknowledged ? "View document" : "Read and acknowledge"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {acknowledged ? "You've already acknowledged this document." : "Read the document to the end, then select I acknowledge and agree."}
            </DialogDescription>
          </DialogHeader>
          {open ? <OfferingDocumentReader documentId={documentId} onboardingId={onboardingId} title={title} onReachedEnd={() => setReachedEnd(true)} /> : null}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
            {!acknowledged ? (
              <Button disabled={!reachedEnd || busy} onClick={agree}>
                {busy ? "Saving…" : "I acknowledge and agree"}
              </Button>
            ) : null}
          </DialogFooter>
          {!acknowledged && !reachedEnd ? <p className="text-xs text-muted-foreground">The button unlocks once you reach the end of the document.</p> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
