import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { decideOnboardingProofFn, onboardingProofUrlFn } from "@/lib/accreditation-step.functions";

/** Open, approve, or ask for more on one uploaded accreditation proof. */
export function OnboardingProofReview({ documentId, reviewable, onDone }: { documentId: string; reviewable: boolean; onDone: () => void }) {
  const openUrl = useServerFn(onboardingProofUrlFn);
  const decide = useServerFn(decideOnboardingProofFn);
  const [mode, setMode] = useState<null | "approved" | "more_needed">(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const open = async () => {
    try { const r = await openUrl({ data: { documentId } }); window.open(r.url, "_blank", "noopener"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't open the file."); }
  };
  const submit = async () => {
    if (!mode) return;
    setBusy(true);
    try {
      await decide({ data: { documentId, decision: mode, notes } });
      toast.success(mode === "approved" ? "Accreditation approved" : "Asked the investor for more proof");
      setMode(null); setNotes(""); onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save the review."); }
    finally { setBusy(false); }
  };
  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={open}>Open file</Button>
        {reviewable && <>
          <Button size="sm" onClick={() => setMode("approved")}>Approve</Button>
          <Button size="sm" variant="outline" onClick={() => setMode("more_needed")}>Request more</Button>
        </>}
      </div>
      {mode && <div className="space-y-2">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={mode === "approved" ? "Short reason (optional), e.g. statement shows assets over $1M" : "What's missing?"} />
        <div className="flex gap-2">
          <Button size="sm" disabled={busy} onClick={submit}>{mode === "approved" ? "Confirm approval" : "Send request"}</Button>
          <Button size="sm" variant="ghost" onClick={() => setMode(null)}>Cancel</Button>
        </div>
      </div>}
    </div>
  );
}
