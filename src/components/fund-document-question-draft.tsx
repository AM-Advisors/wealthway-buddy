import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileSearch, Loader2, RotateCcw } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { draftDocumentQuestionsFn, resetQuestionAiFn } from "@/lib/fund-question-ai.functions";
import type { DocumentQuestion } from "@/lib/fund-question-ai-model";

export type DocumentQuestionsResult = {
  title: string; questions: DocumentQuestion[]; sourceNote: string;
  sourceDocuments: { id: string; documentId: string; version: number; title: string; fileName: string }[];
  warnings: string[]; alreadyCovered: { label: string; existingKey: string; sourceReference: string }[];
};

export function FundDocumentQuestionDraft({ offeringId, documents, blocked, staff, disabled, onDraft, onReset }: {
  offeringId: string; documents: { id: string; title: string; version: number; approval: string }[];
  blocked: string | null; staff: boolean; disabled: boolean; onDraft: (draft: DocumentQuestionsResult) => void; onReset: () => void;
}) {
  const draftFn = useServerFn(draftDocumentQuestionsFn);
  const resetFn = useServerFn(resetQuestionAiFn);
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DocumentQuestionsResult | null>(null);
  async function generate() {
    setPending(true); setError(null); setResult(null);
    try {
      const response = await draftFn({ data: { offeringId, versionIds: selected } });
      if (!response.ok) throw new Error("The agreements could not be read.");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("AI returned no questions.");
      const decoder = new TextDecoder();
      let buffer = ""; let received = false;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
          for (const line of lines.filter((line) => line.trim())) {
            const event = JSON.parse(line) as { error?: string; result?: DocumentQuestionsResult };
            if (event.error) throw new Error(event.error);
            if (event.result) { received = true; setResult(event.result); }
          }
        }
      } finally { reader.releaseLock(); }
      if (!received) throw new Error("AI returned no readable questions. Nothing was changed.");
    } catch (error) { setError(error instanceof Error ? error.message : "The agreements could not be read."); }
    finally { setPending(false); }
  }
  return <div className="space-y-3 border-y py-4">
    <h4 className="font-heading font-semibold text-primary">Questions from custom agreements</h4>
    <div className="max-h-60 space-y-2 overflow-y-auto">
      {documents.map((doc) => <label key={doc.id} className="flex items-start gap-3 text-sm">
        <input className="mt-1 shrink-0" type="checkbox" checked={selected.includes(doc.id)} disabled={pending || disabled || (!selected.includes(doc.id) && selected.length >= 3)} onChange={(e) => setSelected((current) => e.target.checked ? [...current, doc.id] : current.filter((id) => id !== doc.id))} />
        <span className="min-w-0 break-words">{doc.title} · v{doc.version} <Badge variant="outline">{doc.approval === "approved" ? "Approved document" : "Document awaiting review"}</Badge></span>
      </label>)}
      {!documents.length && <p className="text-sm text-muted-foreground">No custom agreements uploaded.</p>}
    </div>
    {blocked && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{blocked}</p>{staff && <Button size="sm" variant="outline" onClick={async () => { try { await resetFn({ data: { offeringId } }); onReset(); } catch (e) { setError(e instanceof Error ? e.message : "Could not restore access."); } }}><RotateCcw className="size-4" />Access restored</Button>}</div>}
    {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
    <Button size="sm" variant="outline" disabled={!selected.length || pending || disabled || !!blocked} onClick={() => void generate()}>{pending ? <Loader2 className="size-4 animate-spin" /> : <FileSearch className="size-4" />}{pending ? "Reading agreements…" : "Read agreements with AI"}</Button>
    {result && <div className="space-y-3">
      <Badge variant="secondary">AI draft, not saved or approved</Badge>
      {result.warnings.map((warning, i) => <p key={i} className="text-sm text-destructive">{warning}</p>)}
      {!!result.alreadyCovered.length && <details><summary className="cursor-pointer text-sm font-medium">Possible matches to existing questions ({result.alreadyCovered.length})</summary><ul className="mt-2 space-y-2 text-xs text-muted-foreground">{result.alreadyCovered.map((match, i) => <li key={i}>{match.label} · {match.sourceReference}</li>)}</ul></details>}
      <p className="text-sm">{result.questions.length} questions in the combined draft.</p>
      <Button size="sm" disabled={disabled} onClick={() => { onDraft(result); setResult(null); }}>Review suggested questions</Button>
    </div>}
  </div>;
}