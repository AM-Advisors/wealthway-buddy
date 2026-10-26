import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { accreditationFileUrlFn, decideAccreditationFn, listPendingAccreditationsFn, rerunAccreditationAiFn } from "@/lib/accreditation-step.functions";
import { Badge } from "@/components/ui/badge";
import { VERDICT_LABELS, type Verdict } from "@/lib/accreditation-ai-model";

const MARK: Record<string, string> = { met: "✓", not_met: "✗", unclear: "?" };

function AiCard({ ai, onRerun, busy }: { ai: any; onRerun: () => void; busy: boolean }) {
  const v = (ai?.verdict ?? "unavailable") as Verdict;
  return (
    <div className="space-y-2 rounded-md bg-muted/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI pre-check</span>
        <Badge variant={v === "looks_complete" ? "default" : v === "mismatch" ? "destructive" : "secondary"}>{VERDICT_LABELS[v]}</Badge>
        {ai?.document_kind ? <span className="text-xs text-muted-foreground">{ai.document_kind}</span> : null}
        <Button size="sm" variant="ghost" className="ml-auto h-7" disabled={busy} onClick={onRerun}>{busy ? "Checking…" : ai ? "Re-run AI check" : "Run AI check"}</Button>
      </div>
      {ai?.summary && v !== "unavailable" ? <p className="text-xs">{ai.summary}</p> : null}
      {(ai?.criteria ?? []).length ? (
        <ul className="space-y-0.5 text-xs">{(ai.criteria as any[]).map((c, i) => <li key={i}><span className="inline-block w-4 font-semibold">{MARK[c.status] ?? "?"}</span>{c.label}{c.note ? <span className="text-muted-foreground"> · {c.note}</span> : null}</li>)}</ul>
      ) : null}
      {(ai?.red_flags ?? []).length ? <ul className="list-disc pl-4 text-xs text-destructive">{(ai.red_flags as string[]).map((f, i) => <li key={i}>{f}</li>)}</ul> : null}
      <p className="text-[11px] text-muted-foreground">AI can miss problems and can't confirm a document is genuine. You make the decision.</p>
    </div>
  );
}

/** Fund → Approvals: 506(c) accreditation paperwork the manager (or Harmonious) verifies. */
export function AccreditationReviews({ offeringId }: { offeringId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listPendingAccreditationsFn);
  const open = useServerFn(accreditationFileUrlFn);
  const decide = useServerFn(decideAccreditationFn);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const rerun = useServerFn(rerunAccreditationAiFn);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const runAi = async (documentId: string) => {
    setAiBusy(documentId);
    try { await rerun({ data: { documentId } }); qc.invalidateQueries({ queryKey: ["accreditation-reviews", offeringId] }); }
    catch (e) { toast.error((e as Error).message); } finally { setAiBusy(null); }
  };
  const q = useQuery({ queryKey: ["accreditation-reviews", offeringId], queryFn: () => list({ data: { offeringId } }), retry: false });
  if (!q.data?.length) return null;
  const run = async (applicationId: string, decision: "approved" | "rejected") => {
    try {
      await decide({ data: { applicationId, decision, notes: notes[applicationId] ?? "" } });
      toast.success(decision === "approved" ? "Accreditation verified" : "Sent back to the investor");
      qc.invalidateQueries({ queryKey: ["accreditation-reviews", offeringId] });
    } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Accreditation to verify</CardTitle>
        <CardDescription>This fund requires verified accreditation. Review each investor's paperwork, then verify or send it back. Files the AI pre-check found complete are listed first.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.data.map((r) => (
          <div key={r.applicationId} className="space-y-2 rounded-md border p-3 text-sm">
            <div className="flex items-center gap-2"><span className="font-medium">{r.investor}</span><Badge variant="outline">{VERDICT_LABELS[r.aiVerdict as Verdict]}</Badge></div>
            <div className="space-y-2">
              {r.documents.length ? r.documents.map((doc) => (
                <div key={doc.id} className="space-y-1">
                  <Button size="sm" variant="link" className="h-auto px-0" onClick={async () => {
                    try { const { url } = await open({ data: { documentId: doc.id } }); window.open(url, "_blank", "noopener"); } catch (e) { toast.error((e as Error).message); }
                  }}>{doc.name}</Button>
                  <AiCard ai={doc.ai} busy={aiBusy === doc.id} onRerun={() => void runAi(doc.id)} />
                </div>
              )) : <span className="text-muted-foreground">No files uploaded.</span>}
            </div>
            <Input placeholder="Note (required to send back)" value={notes[r.applicationId] ?? ""} onChange={(e) => setNotes({ ...notes, [r.applicationId]: e.target.value })} />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => run(r.applicationId, "approved")}>Verify</Button>
              <Button size="sm" variant="outline" onClick={() => run(r.applicationId, "rejected")}>Send back</Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
