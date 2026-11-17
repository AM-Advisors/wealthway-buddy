import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { readInvestorDocumentFn, resolveSuggestionFn } from "@/lib/investor-record.functions";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Found = { label: string; value: unknown; suggested: boolean; suggestionId?: string | null; editValue?: string; decision?: "approved" | "denied" | "updated"; appliedValue?: string | undefined };
type Result = { file: string; documentKind: string; summary: string; found: Found[] };
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
  const resolve = useServerFn(resolveSuggestionFn);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);

  async function decide(ri: number, fi: number, f: Found, action: "accept" | "reject" | "update", value?: string) {
    if (!f.suggestionId) return;
    setDeciding(f.suggestionId);
    try {
      await resolve({ data: { id: f.suggestionId, action, value: value ?? null } });
      const decision: Found["decision"] = action === "accept" ? "approved" : action === "reject" ? "denied" : "updated";
      setResults((p) => p.map((r, i) => i !== ri ? r : { ...r, found: r.found.map((x, j) => j !== fi ? x : { ...x, decision, appliedValue: value }) }));
      setEditing(null);
      toast.success(action === "accept" ? `${f.label} saved to the investor record` : action === "reject" ? `${f.label} suggestion denied` : `${f.label} updated on the investor record`);
      await qc.invalidateQueries();
    } catch (e) { toast.error((e as Error).message); }
    finally { setDeciding(null); }
  }

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
        <CardDescription>Upload subscription agreements, W-9s, IDs, accreditation letters or entity documents (PDF or image). Approve, Deny or Update each suggested detail right here, or later on the Overview tab. Nothing changes on the record until you approve or update it. Tax numbers are never read.</CardDescription>
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
            {r.found.length ? <ul className="mt-2 space-y-2">{r.found.map((f, j) => {
              const busyRow = !!f.suggestionId && deciding === f.suggestionId;
              const isEditing = !!f.suggestionId && editing?.id === f.suggestionId;
              return (
              <li key={j} className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="capitalize text-muted-foreground">{f.label}:</span>
                  <span className={f.decision === "denied" || f.decision === "updated" ? "line-through text-muted-foreground" : undefined}>{String(f.value)}</span>
                  {f.decision === "updated" && <span className="font-medium">{f.appliedValue}</span>}
                  {f.decision ? <Badge variant="outline">{f.decision === "approved" ? "Approved" : f.decision === "denied" ? "Denied" : "Updated"}</Badge>
                    : <Badge variant={f.suggested ? "default" : "secondary"}>{f.suggested ? "Suggested" : "Already matches"}</Badge>}
                  {f.suggested && f.suggestionId && !f.decision && !isEditing && <span className="flex flex-wrap gap-1">
                    <Button size="sm" className="h-7 px-2 text-xs" disabled={busyRow} onClick={() => void decide(i, j, f, "accept")}>Approve</Button>
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={busyRow} onClick={() => void decide(i, j, f, "reject")}>Deny</Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={busyRow} onClick={() => setEditing({ id: f.suggestionId!, value: f.editValue ?? String(f.value ?? "") })}>Update</Button>
                  </span>}
                </div>
                {isEditing && editing && <div className="flex flex-wrap items-center gap-2 pl-1">
                  <Input aria-label={`Corrected ${f.label}`} className="h-8 max-w-xs" value={editing.value} maxLength={300} autoFocus onChange={(e) => setEditing({ ...editing, value: e.target.value })} />
                  <Button size="sm" className="h-8" disabled={busyRow || !editing.value.trim()} onClick={() => void decide(i, j, f, "update", editing.value.trim())}>{busyRow ? "Saving…" : "Save correction"}</Button>
                  <Button size="sm" variant="ghost" className="h-8" disabled={busyRow} onClick={() => setEditing(null)}>Cancel</Button>
                </div>}
              </li>);
            })}</ul> : <p className="mt-2 text-xs text-muted-foreground">No investor details found.</p>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
