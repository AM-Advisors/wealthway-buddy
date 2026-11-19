import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { readFundRequestDocument, uploadFundRequestFile } from "@/lib/client-fund-request.functions";
import { DOC_KIND_LABEL, FUND_DOC_MAX_FILES, type FundDocReading } from "@/lib/fund-doc-extract-model";
import { applySuggestions, isOfferingDocKind, requestDocKindFor, requestSuggestions } from "@/lib/fund-request-ai-fill";
import type { FundRequest } from "@/lib/fund-request-model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

const READABLE = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const WORD = ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword"];
const typeFor = (f: File) => {
  if (READABLE.includes(f.type) || WORD.includes(f.type)) return f.type;
  const n = f.name.toLowerCase();
  return n.endsWith(".pdf") ? "application/pdf" : n.endsWith(".png") ? "image/png" : /\.jpe?g$/.test(n) ? "image/jpeg" : n.endsWith(".webp") ? "image/webp"
    : n.endsWith(".docx") ? WORD[0]! : n.endsWith(".doc") ? WORD[1]! : null;
};
const toBase64 = async (f: File) => {
  const buf = new Uint8Array(await f.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
};

type Read = { fileName: string; reading: FundDocReading | null; note: string | null };

/** Upload several fund documents, read them with AI and choose which answers fill the form. */
export function FundRequestAiReader({ clientId, request, onChange }: { clientId: string | null; request: FundRequest; onChange: (update: (r: FundRequest) => FundRequest) => void }) {
  const read = useServerFn(readFundRequestDocument);
  const upload = useServerFn(uploadFundRequestFile);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [reads, setReads] = useState<Read[]>([]);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Set<string> | null>(null);

  const suggestions = requestSuggestions(request, reads.filter((x) => x.reading).map((x) => ({ fileName: x.fileName, reading: x.reading! })));
  const chosen = picked ?? new Set(suggestions.filter((s) => s.status === "blank").map((s) => s.key));

  const run = async (list: FileList | null) => {
    if (!clientId) return;
    const files = Array.from(list ?? []).slice(0, FUND_DOC_MAX_FILES);
    if (!files.length) return;
    if ((list?.length ?? 0) > FUND_DOC_MAX_FILES) toast.warning(`Only the first ${FUND_DOC_MAX_FILES} files were read.`);
    setProgress({ done: 0, total: files.length });
    const out: Read[] = [];
    let next = 0;
    const worker = async () => {
      while (next < files.length) {
        const f = files[next++]!;
        const type = typeFor(f);
        let row: Read = { fileName: f.name, reading: null, note: null };
        if (!type) row.note = "Upload a PDF, Word document or photo.";
        else if (f.size > 10 * 1024 * 1024) row.note = "Over 10 MB. Upload a smaller copy.";
        else {
          const base64 = await toBase64(f);
          if (READABLE.includes(type)) {
            try { row.reading = await read({ data: { clientId, fileName: f.name, contentType: type, base64 } }); }
            catch (e) { row.note = (e as Error).message.replace(/^Forbidden:\s*/, ""); }
          } else row.note = "Saved. Word files can't be read automatically; save a PDF copy to read it.";
          try {
            const kind = row.reading ? requestDocKindFor(row.reading.documentKind, request) : "Other";
            const doc = await upload({ data: { clientId, kind, fileName: f.name, contentType: type, base64 } });
            onChange((r) => ({ ...r, documents: [...r.documents, doc], documents_path: r.documents_path || (isOfferingDocKind(doc.kind) ? "have" : r.documents_path) }));
          } catch (e) { row.note = `${row.note ? `${row.note} ` : ""}Not saved: ${(e as Error).message}`; }
        }
        out.push(row);
        setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
      }
    };
    await Promise.all([worker(), worker()]);
    setReads((prev) => [...prev, ...files.map((f) => out.find((r) => r.fileName === f.name)!).filter(Boolean)]);
    setPicked(null);
    setProgress(null);
  };

  const apply = () => {
    const use = suggestions.filter((s) => chosen.has(s.key) && !skip.has(s.key));
    if (!use.length) { toast.info("Tick at least one answer to use."); return; }
    onChange((r) => applySuggestions(r, use));
    setSkip(new Set());
    setPicked(null);
    toast.success(`${use.length} answer${use.length === 1 ? "" : "s"} filled in. Check each step, then save.`);
  };

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 size-4 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Start from your fund documents</p>
          <p className="text-sm text-muted-foreground">Upload the operating agreement, PPM, subscription agreement, EIN letter or term sheet, several at once. We read them, save them to this request, and suggest answers. You choose which answers to use.</p>
        </div>
      </div>
      <Input type="file" multiple aria-label="Fund documents to read" accept=".pdf,.doc,.docx,image/png,image/jpeg,image/webp" disabled={!clientId || !!progress}
        onChange={(e) => { void run(e.target.files); e.target.value = ""; }} />
      {!clientId && <p className="text-xs text-muted-foreground">Choose the client first.</p>}
      {progress && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Reading {progress.done} of {progress.total}…</p>}

      {reads.length > 0 && (
        <ul className="space-y-1 text-sm">
          {reads.map((x, i) => (
            <li key={`${x.fileName}-${i}`} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{x.fileName}</span>
              {x.reading && <Badge variant="secondary">{DOC_KIND_LABEL[x.reading.documentKind]}</Badge>}
              {x.note && <span className="text-xs text-muted-foreground">{x.note}</span>}
            </li>
          ))}
        </ul>
      )}

      {reads.some((x) => x.reading) && (suggestions.length === 0
        ? <p className="text-sm text-muted-foreground">No new answers found. Everything we read already matches the form.</p>
        : (
          <div className="space-y-2">
            <p className="text-sm font-medium">Suggested answers</p>
            {suggestions.map((s) => (
              <label key={s.key} className="flex items-start gap-3 rounded-md border bg-background p-2 text-sm">
                <Checkbox className="mt-0.5" checked={chosen.has(s.key)} onCheckedChange={(c) => {
                  const n = new Set(chosen); if (c === true) n.add(s.key); else n.delete(s.key); setPicked(n);
                }} />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{s.label}:</span> {s.value}
                  {s.status === "different" && <span className="block text-xs text-destructive">You entered “{s.current}”. Tick only if the document is right.</span>}
                  <span className="block text-xs text-muted-foreground">From {s.fileNames.join(", ")}</span>
                </span>
              </label>
            ))}
            <Button size="sm" onClick={apply}>Use ticked answers</Button>
          </div>
        ))}
    </div>
  );
}
