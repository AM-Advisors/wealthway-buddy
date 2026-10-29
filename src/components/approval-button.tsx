import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Undo2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { pendingApproval } from "@/lib/pending-approval";

/** One confirmation, with undo before the existing authorized save is called. */
export function ApprovalButton({ title, description, onApprove, children, ...props }: Omit<ButtonProps, "onClick" | "title"> & { title: string; description: string; onApprove: () => void }) {
  const [open, setOpen] = useState(false);
  const [queued, setQueued] = useState(false);
  const cancel = useRef<(() => boolean) | null>(null);
  useEffect(() => () => { cancel.current?.(); }, []);
  const undo = () => { cancel.current?.(); cancel.current = null; setQueued(false); setOpen(false); };
  return <>
    <Button {...props} className={`min-h-11 whitespace-normal text-base ${props.className ?? ""}`} onClick={() => setOpen(true)}>{children}</Button>
    <AlertDialog open={open} onOpenChange={(value) => { if (!value) undo(); }}>
      <AlertDialogContent className="w-[calc(100%-2rem)] rounded-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-xl">{queued ? "Approval waiting to send" : title}</AlertDialogTitle>
          <AlertDialogDescription className="text-base leading-relaxed">{queued ? "You have 5 seconds to undo. Nothing has been approved yet." : description}</AlertDialogDescription>
        </AlertDialogHeader>
        <p className="text-base text-muted-foreground">Completed approvals stay in the history. Later changes need a new review.</p>
        <AlertDialogFooter className="gap-2">
          <Button variant="outline" className="min-h-11 text-base" onClick={undo}>{queued ? <><Undo2 />Undo approval</> : "Go back"}</Button>
          {!queued && <Button className="min-h-11 text-base" disabled={props.disabled} onClick={() => {
            if (cancel.current) return;
            setQueued(true);
            cancel.current = pendingApproval(() => { cancel.current = null; setQueued(false); setOpen(false); onApprove(); });
          }}><CheckCircle2 />Confirm approval</Button>}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}