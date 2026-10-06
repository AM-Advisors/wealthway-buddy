import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { readInvestorDocumentFn } from "@/lib/investor-record.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Result = { file: string; documentKind: string; summary: string; found: { label: string; value: unknown; suggested: boolean }[] };
const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp";

function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Couldn't read the file."));
    r.readAsDataURL(file);
  });
}

/** Harmonious-only: read investor documents with AI and turn findings into suggested updates. */
export function InvestorDocumentAi({ onboardingId }: { onboardingId: string }) {
  const read = useServerFn(readInvestorDocumentFn);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);

  async function run(files: FileList | null) {
    for (const file of Array.from(files ?? [])) {
      if (file.size > 10 * 1024 * 1024) { toast.error(`${file.name} is over 10 MB.`); continue; }
      setBusy(file.name);
      try {
        const r = await read({ data: { onboardingId, fileName: file.name, mimeType: file.type || "application/pdf", base64: await toBase64(file) } });
        setResults((p) => [{ file: file.name, ...r }, ...p]);
        const n = r.found.filter((f) => f.suggested).length;
        toast.success(n ? `${n} suggested update${n === 1 ? "" : "s"} from ${file.name}` : `Nothing new found in ${file.name}`);
      } catch (e) { toast.error((e as Error).message); }
    }
    setBusy(null);
    await qc.invalidateQueries();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Read documents with AI</CardTitle>
        <CardDescription>Upload subscription agreements, W-9s, IDs, accreditation letters or entity documents (PDF or image). What the AI finds becomes suggested updates to review on the Overview tab. Nothing changes until you accept it. Tax numbers are never read.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="inline-flex">
          <input type="file" accept={ACCEPT} multiple className="hidden" disabled={!!busy} onChange={(e) => { void run(e.target.files); e.target.value = ""; }} />
          <Button asChild disabled={!!busy}><span className="cursor-pointer">{busy ? `Reading ${busy}…` : "Choose documents"}</span></Button>
        </label>
        {results.map((r, i) => (
          <div key={i} className="rounded-md border p-3 text-sm">
            <p className="font-medium">{r.file} · {r.documentKind}</p>
            {r.summary ? <p className="text-xs text-muted-foreground">{r.summary}</p> : null}
            {r.found.length ? <ul className="mt-2 space-y-1">{r.found.map((f, j) => (
              <li key={j} className="flex flex-wrap items-center gap-2"><span className="capitalize text-muted-foreground">{f.label}:</span><span>{String(f.value)}</span>
                <Badge variant={f.suggested ? "default" : "secondary"}>{f.suggested ? "Suggested" : "Already matches"}</Badge></li>
            ))}</ul> : <p className="mt-2 text-xs text-muted-foreground">No investor details found.</p>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
