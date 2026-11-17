import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { openExceptionsFn, resolveExceptionFn } from "@/lib/investor-onboarding.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Staff resolve an investment's open issues right on the investor page, using the existing resolve action (note required). */
export function ResolveExceptionsDialog({ onboardingId, open, onOpenChange, onResolved }: { onboardingId: string; open: boolean; onOpenChange: (open: boolean) => void; onResolved: () => void }) {
  const list = useServerFn(openExceptionsFn);
  const resolve = useServerFn(resolveExceptionFn);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["open-exceptions", onboardingId], queryFn: () => list({ data: { onboardingId } }), enabled: open });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const submit = async (id: string) => {
    const resolution = (notes[id] ?? "").trim();
    if (resolution.length < 2) { toast.error("Add a short note saying how it was resolved."); return; }
    setBusy(id);
    try {
      await resolve({ data: { exceptionId: id, resolution } });
      toast.success("Issue resolved.");
      setNotes((n) => { const { [id]: _, ...rest } = n; return rest; });
      await qc.invalidateQueries({ queryKey: ["open-exceptions", onboardingId] });
      onResolved();
      const left = (await qc.fetchQuery({ queryKey: ["open-exceptions", onboardingId], queryFn: () => list({ data: { onboardingId } }) })) ?? [];
      if (!left.length) onOpenChange(false);
    } catch (e) {
      toast.error(String((e as Error)?.message ?? e).replace(/^Forbidden:\s*/, ""));
    } finally { setBusy(null); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Resolve open issues</DialogTitle>
          <DialogDescription>Say how each issue was resolved. The note is saved to this investment's history.</DialogDescription>
        </DialogHeader>
        {q.isLoading ? <p className="text-sm text-muted-foreground">Loading issues…</p>
          : q.isError ? <p className="text-sm text-destructive">{String((q.error as Error)?.message ?? "Couldn't load the open issues.")}</p>
          : !q.data?.length ? <p className="text-sm text-muted-foreground">No open issues. This investment isn't blocked anymore.</p>
          : <ul className="space-y-4">
            {q.data.map((e) => (
              <li key={e.id} className="space-y-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{e.label}</p>
                  {e.severity === "blocking" ? <Badge variant="destructive">Blocking</Badge> : <Badge variant="outline">{e.severity}</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">{e.reason}</p>
                <p className="text-xs text-muted-foreground">Raised {new Date(e.raisedAt).toLocaleString()}</p>
                <Label htmlFor={`resolve-${e.id}`}>How was it resolved?</Label>
                <Textarea id={`resolve-${e.id}`} rows={2} value={notes[e.id] ?? ""} onChange={(ev) => setNotes((n) => ({ ...n, [e.id]: ev.target.value }))} placeholder="For example: full amount received across two wires" />
                <div className="flex justify-end"><Button size="sm" disabled={busy === e.id} onClick={() => submit(e.id)}>{busy === e.id ? "Resolving…" : "Resolve issue"}</Button></div>
              </li>
            ))}
          </ul>}
      </DialogContent>
    </Dialog>
  );
}
