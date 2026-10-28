import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { approveQuestionSectionFn, listQuestionSectionsFn, saveQuestionSectionDraftFn } from "@/lib/fund-questionnaire-section.functions";
import { FundDocumentQuestionDraft, type DocumentQuestionsResult } from "./fund-document-question-draft";

type Q = { key: string; label: string; type: string; required?: boolean; options?: string[]; sourceReference?: string; sourceQuote?: string; prefillKey?: string | null };
const TYPES: [string, string][] = [["yes_no", "Yes / No"], ["text", "Written answer"], ["select", "Pick one"], ["multi_select", "Pick any"], ["number", "Number"], ["currency", "Dollar amount"], ["date", "Date"]];

/** Fund-specific questions use one explicit authorized staff approval. */
export function FundQuestionSectionCard({ offeringId }: { offeringId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listQuestionSectionsFn);
  const saveFn = useServerFn(saveQuestionSectionDraftFn);
  const approveFn = useServerFn(approveQuestionSectionFn);
  const key = ["fund-question-sections", offeringId];
  const q = useQuery({ queryKey: key, queryFn: () => list({ data: { offeringId } }) });
  const sections = q.data?.sections ?? [];
  const draft = sections.find((s: any) => s.status === "draft");
  const live = sections.find((s: any) => s.status === "approved");
  const shown: any = draft ?? live ?? null;
  const [title, setTitle] = useState("Additional fund questions");
  const [qs, setQs] = useState<Q[]>([]);
  const [aiDraft, setAiDraft] = useState<DocumentQuestionsResult | null>(null);
  const [dirty, setDirty] = useState(false);
  const [newVersion, setNewVersion] = useState(false);
  useEffect(() => { setTitle(shown?.title ?? "Additional fund questions"); setQs(((shown?.questions ?? []) as Q[]).map((x) => ({ ...x }))); setDirty(false); setNewVersion(false); setAiDraft(null); }, [shown?.id, shown?.prepared_at]);
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const save = useMutation({ mutationFn: (override?: Q[]) => saveFn({ data: { offeringId, sectionId: draft?.id ?? null, title, questions: (override ?? qs) as any, sourceNote: aiDraft?.sourceNote ?? shown?.source_note, sourceDocuments: aiDraft?.sourceDocuments ?? shown?.source_documents ?? [] } }), onSuccess: () => { toast.success("Draft saved"); setDirty(false); setAiDraft(null); void refresh(); }, onError: (e: Error) => toast.error(e.message) });
  const approve = useMutation({ mutationFn: () => { if (!draft || dirty) throw new Error("Save and review the current draft first."); return approveFn({ data: { sectionId: draft.id } }); }, onSuccess: () => { toast.success("Questions approved; investors now see them"); void refresh(); }, onError: (e: Error) => toast.error(e.message) });
  // Saves the current draft, then approves the saved version in one step.
  const saveApprove = useMutation({
    mutationFn: async () => {
      await saveFn({ data: { offeringId, sectionId: draft?.id ?? null, title, questions: qs as any, sourceNote: aiDraft?.sourceNote ?? shown?.source_note, sourceDocuments: aiDraft?.sourceDocuments ?? shown?.source_documents ?? [] } });
      const fresh: any = await list({ data: { offeringId } });
      const draftId = ((fresh?.sections ?? []) as any[]).find((s) => s.status === "draft")?.id;
      if (!draftId) throw new Error("Saved, but the draft could not be approved. Approve it from the approvals list.");
      return approveFn({ data: { sectionId: draftId } });
    },
    onSuccess: () => { toast.success("Questions saved and approved; investors now see them"); setDirty(false); setAiDraft(null); void refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (q.isPending) return null;
  if (q.isError || !q.data) return <p role="alert" className="text-sm text-destructive">{q.error?.message ?? "Could not load fund questions."}</p>;
  const staff = q.data.staff;
  const editable = q.data.canDraft && (!!draft || !live || newVersion);
  const asked = new Set<string>(shown?.alreadyAskedKeys ?? []);
  const upd = (i: number, p: Partial<Q>) => { setDirty(true); setQs((cur) => cur.map((x, j) => (j === i ? { ...x, ...p, ...(p.label !== undefined || p.type !== undefined ? { prefillKey: null } : {}) } : x))); };

  return (
    <section aria-label="Additional fund questions" className="space-y-4 rounded-2xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="flex-1 font-heading text-lg font-semibold text-primary">Additional fund questions</h3>
        <Badge variant={draft ? "secondary" : live ? "default" : "outline"}>{draft ? `Draft v${draft.version}, awaiting approval` : live ? `Approved v${live.version}` : "None yet"}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">{q.data.baseCount} standard questions · {qs.length} additional questions</p>
      {dirty && <Badge variant="outline">Unsaved changes</Badge>}
      {q.data.canDraft && !draft && live && !newVersion && <Button size="sm" variant="outline" onClick={() => { setNewVersion(true); setDirty(true); }}>Start a new version</Button>}
      {q.data.canDraft && <FundDocumentQuestionDraft offeringId={offeringId} documents={q.data.documents} blocked={q.data.aiBlocked} staff={staff} disabled={dirty || save.isPending || approve.isPending} onReset={() => void refresh()} onDraft={(result) => { setTitle(result.title); setQs(result.questions); setAiDraft(result); setNewVersion(true); setDirty(true); }} />}
      {shown?.source_note && <p className="rounded-lg bg-muted p-3 text-xs">{shown.source_note}</p>}
      {editable && <Input aria-label="Section title" value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} />}
      <ol className="space-y-4">
        {qs.map((x, i) => (
          <li key={x.key} className="space-y-2 rounded-xl border bg-background p-4">
            <div className="flex items-start gap-2">
              <span className="pt-2 text-sm text-muted-foreground">{i + 1}.</span>
              {editable ? <textarea className="min-h-16 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={x.label} onChange={(e) => upd(i, { label: e.target.value })} /> : <p className="flex-1 pt-2 text-sm">{x.label}</p>}
              {editable && <Button size="icon" variant="ghost" aria-label="Remove question" onClick={() => { setDirty(true); setQs((cur) => cur.filter((_, j) => j !== i)); }}><Trash2 className="size-4" /></Button>}
            </div>
            <div className="flex flex-wrap items-center gap-3 pl-6 text-xs">
              {editable ? (
                <select aria-label="Answer type" className="h-8 rounded-md border border-input bg-background px-2" value={x.type} onChange={(e) => upd(i, { type: e.target.value })}>
                  {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              ) : <Badge variant="outline">{TYPES.find(([v]) => v === x.type)?.[1] ?? x.type}</Badge>}
              {editable ? <label className="flex items-center gap-1"><input type="checkbox" checked={!!x.required} onChange={(e) => upd(i, { required: e.target.checked })} />Required</label> : x.required && <Badge variant="outline">Required</Badge>}
              {asked.has(x.key) && <Badge variant="secondary">Already asked, skipped</Badge>}
            </div>
            {(x.type === "select" || x.type === "multi_select") && (editable
              ? <Input className="ml-6 w-[calc(100%-1.5rem)]" aria-label="Answer choices" placeholder="Choices, separated by ;" value={(x.options ?? []).join("; ")} onChange={(e) => upd(i, { options: e.target.value.split(";").map((o) => o.trim()).filter(Boolean) })} />
              : <p className="pl-6 text-xs text-muted-foreground">{(x.options ?? []).join(" · ")}</p>)}
            {x.sourceReference && <details className="pl-6 text-xs text-muted-foreground"><summary className="cursor-pointer">{x.sourceReference}</summary><p className="mt-2">{x.sourceQuote}</p></details>}
            {x.prefillKey && <Badge className="ml-6" variant="outline">Recorded fact: {x.prefillKey.replace(/_/g, " ")}</Badge>}
          </li>
        ))}
      </ol>
      {editable && (
        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button size="sm" variant="outline" onClick={() => { setDirty(true); setQs((cur) => [...cur, { key: `fs_q${Date.now().toString(36)}`, label: "", type: "text", required: true }]); }}><Plus className="size-4" />Add question</Button>
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate(undefined)}><Save className="size-4" />Save draft</Button>
          {staff && (dirty || !draft) && <Button size="sm" variant="outline" disabled={saveApprove.isPending || save.isPending || approve.isPending} onClick={() => saveApprove.mutate(undefined)}><CheckCircle2 className="size-4" />{saveApprove.isPending ? "Saving…" : "Save & approve"}</Button>}
          {staff && draft && <Button size="sm" variant="outline" disabled={approve.isPending || save.isPending || dirty} onClick={() => approve.mutate()}><CheckCircle2 className="size-4" />Approve for investors</Button>}
        </div>
      )}
    </section>
  );
}
