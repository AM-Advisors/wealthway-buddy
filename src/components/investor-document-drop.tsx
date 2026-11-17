import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Loader2, Sparkles } from "lucide-react";

import { readNewInvestorDocumentFn } from "@/lib/investor-record.functions";
import { DOC_READ_ACCEPT, DOC_READ_MAX_BYTES, DOC_READ_MAX_FILES, DOC_READ_TYPES, type DocumentReading } from "@/lib/investor-doc-extract-model";
import { Badge } from "@/components/ui/badge";

export type FileReading = { fileName: string; reading: DocumentReading | null; error: string | null };

const typeFor = (f: File) => {
  if ((DOC_READ_TYPES as readonly string[]).includes(f.type)) return f.type;
  const n = f.name.toLowerCase();
  return n.endsWith(".pdf") ? "application/pdf" : n.endsWith(".png") ? "image/png" : /\.jpe?g$/.test(n) ? "image/jpeg" : n.endsWith(".webp") ? "image/webp" : null;
};
const toBase64 = (f: File) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
  r.onerror = () => reject(new Error("The file couldn't be opened."));
  r.readAsDataURL(f);
});

/**
 * Upload one or many investor documents; each is read with AI and the results
 * are handed back as suggestions. Files are read, never stored.
 */
export function InvestorDocumentDrop({ fundId, multiple, title, hint, onRead }: {
  fundId: string; multiple?: boolean; title: string; hint: string; onRead: (results: FileReading[]) => void;
}) {
  const read = useServerFn(readNewInvestorDocumentFn);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<FileReading[]>([]);

  const run = async (list: FileList | null) => {
    const files = Array.from(list ?? []).slice(0, DOC_READ_MAX_FILES);
    if (!files.length) return;
    setProgress({ done: 0, total: files.length });
    const out: FileReading[] = [];
    let next = 0;
    const worker = async () => {
      while (next < files.length) {
        const f = files[next++]!;
        const contentType = typeFor(f);
        let row: FileReading;
        if (!contentType) row = { fileName: f.name, reading: null, error: "Upload a PDF or a photo (PNG, JPG or WEBP)." };
        else if (f.size > DOC_READ_MAX_BYTES) row = { fileName: f.name, reading: null, error: "Over 10 MB. Upload a smaller copy." };
        else {
          try { row = { fileName: f.name, reading: await read({ data: { offeringId: fundId, fileName: f.name, contentType, base64: await toBase64(f) } }), error: null }; }
          catch (e) { row = { fileName: f.name, reading: null, error: (e as Error).message.replace(/^Forbidden:\s*/, "") }; }
        }
        out.push(row);
        setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
      }
    };
    await Promise.all([worker(), worker()]);
    const ordered = files.map((f) => out.find((r) => r.fileName === f.name)!).filter(Boolean);
    setResults(ordered);
    setProgress(null);
    onRead(ordered);
  };

  const busy = !!progress;
  return (
    <div className="space-y-2 rounded-md border border-dashed bg-muted/40 p-3">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>
      <label className={`inline-flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-muted ${busy ? "pointer-events-none opacity-60" : ""}`}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
        {busy ? `Reading ${progress!.done} of ${progress!.total}…` : multiple ? "Choose documents" : "Choose a document"}
        <input type="file" className="sr-only" accept={DOC_READ_ACCEPT} multiple={multiple} disabled={busy}
          aria-label={multiple ? "Choose investor documents to read" : "Choose an investor document to read"}
          onChange={(e) => { void run(e.target.files); e.target.value = ""; }} />
      </label>
      {results.length > 0 && !busy ? (
        <ul className="space-y-1 text-xs">
          {results.map((r, i) => (
            <li key={`${r.fileName}-${i}`} className="flex flex-wrap items-center gap-2">
              <span className="max-w-[16rem] truncate font-medium">{r.fileName}</span>
              {r.error ? <span className="text-destructive">{r.error}</span> : <>
                <Badge variant="secondary">{r.reading!.documentKind}</Badge>
                <span className="text-muted-foreground">{r.reading!.investors.length ? `${r.reading!.investors.length} investor${r.reading!.investors.length === 1 ? "" : "s"} found` : "No investor details found"}</span>
                {r.reading!.notes.map((n) => <span key={n} className="text-warning">· {n}</span>)}
              </>}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
