import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { listStarReferences, openStarReference, recordStarEvent } from "@/lib/compliance-star.functions";

type Step = { n: number; label: string; done: boolean; detail?: string; manual?: "path_chosen" | "gdpr_done" | "quality_result"; optional?: boolean };

/** Level 1 checklist from the CSA STAR Prep Kit. Data-backed steps tick themselves; manual steps are logged with person and date. */
export function StarChecklist({ d }: { d: any }) {
  const qc = useQueryClient();
  const rec = useServerFn(recordStarEvent);
  const [quality, setQuality] = useState("");
  const total = d.questions.length;
  const approved = d.questions.filter((x: any) => x.latest?.status === "approved").length;
  const m = d.manualSteps ?? {};
  const when = (s: any) => (s ? `${s.value} · ${new Date(s.at).toLocaleDateString()}` : undefined);
  const steps: Step[] = [
    { n: 1, label: "Choose the Level 1 path (self-assessment; a third-party audit is Level 2)", done: !!m.path_chosen, detail: when(m.path_chosen), manual: "path_chosen" },
    { n: 2, label: "Download the CAIQ from CSA and load it below", done: total > 0, detail: total ? `${total} questions loaded` : "Waiting for the CAIQ v4 spreadsheet" },
    { n: 3, label: "Answer every question, each approved by a second person", done: total > 0 && approved === total, detail: total ? `${approved} of ${total} approved` : undefined },
    { n: 4, label: "GDPR self-assessment (CSA offers it alongside Level 1)", done: !!m.gdpr_done, detail: when(m.gdpr_done), manual: "gdpr_done", optional: true },
    { n: 5, label: "Export and submit through CSA's online portal (done by a person)", done: !!d.submittedOn, detail: d.submittedOn ?? undefined },
    { n: 6, label: "Record CSA's quality-check result (Valid-AI-ted or manual review)", done: !!m.quality_result, detail: when(m.quality_result), manual: "quality_result" },
    { n: 7, label: "Record the public Registry link once it's live", done: !!d.registryUrl },
  ];
  const mark = async (action: string, value: string) => {
    try { await rec({ data: { action: action as any, value } }); toast.success("Step recorded."); await qc.invalidateQueries({ queryKey: ["star"] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Something went wrong."); }
  };
  return (
    <Card>
      <CardHeader><CardTitle>Level 1 checklist</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        {steps.map((s) => (
          <div key={s.n} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
            <div>
              <p><span className="mr-2 font-medium">{s.n}.</span>{s.label}{s.optional && <span className="text-muted-foreground"> (optional)</span>}</p>
              {s.detail && <p className="text-xs text-muted-foreground">{s.detail}</p>}
            </div>
            <div className="flex items-center gap-2">
              {d.canEdit && !s.done && s.manual === "path_chosen" && <Button size="sm" variant="outline" onClick={() => mark("path_chosen", "Level 1")}>Confirm Level 1</Button>}
              {d.canEdit && !s.done && s.manual === "gdpr_done" && <Button size="sm" variant="outline" onClick={() => mark("gdpr_done", "Completed")}>Mark done</Button>}
              {d.canEdit && !s.done && s.manual === "quality_result" && d.submittedOn && (
                <><Input className="h-8 w-48" value={quality} onChange={(e) => setQuality(e.target.value)} placeholder="e.g. Passed (Valid-AI-ted)" /><Button size="sm" variant="outline" disabled={quality.trim().length < 3} onClick={() => mark("quality_result", quality.trim())}>Save</Button></>
              )}
              <Badge variant={s.done ? "default" : "outline"}>{s.done ? "Done" : "Open"}</Badge>
            </div>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">Manual steps are logged with your name and the date and can't be edited afterwards.</p>
      </CardContent>
    </Card>
  );
}

export function StarReferenceLibrary() {
  const list = useServerFn(listStarReferences), open = useServerFn(openStarReference);
  const q = useQuery({ queryKey: ["star-refs"], queryFn: () => list() });
  if (!q.data?.length) return null;
  return (
    <Card>
      <CardHeader><CardTitle>CSA STAR Prep Kit</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="text-xs text-muted-foreground">CSA reference — not Harmonious evidence. These guides never count toward any control or answer and are never shown publicly.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {q.data.map((r) => (
            <button key={r.id} className="rounded-md border p-2 text-left hover:bg-muted" onClick={async () => {
              const w = window.open("", "_blank");
              try { const { url } = await open({ data: { id: r.id } }); if (w) w.location.href = url; else window.location.href = url; }
              catch (e) { w?.close(); toast.error(e instanceof Error ? e.message : "Could not open."); }
            }}>
              <p className="font-medium">{r.title}</p>
              <p className="text-xs text-muted-foreground">PDF · {(r.size_bytes / 1048576).toFixed(1)} MB</p>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
