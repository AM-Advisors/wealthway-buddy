import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { applyFundSetupSuggestionFn, createSetupDocumentFn, fundSetupAiCurrentValuesFn, readFundSetupDocumentFn, uploadDocumentVersionFn } from "@/lib/fund-setup-canonical.functions";
import { DOC_READ_ACCEPT, DOC_READ_MAX_BYTES, DOC_READ_TYPES } from "@/lib/investor-doc-extract-model";
import {
  DOC_KIND_LABEL, FUND_DOC_MAX_FILES, GROUP_LABEL, displayFieldValue, documentCategoryFor, editableFieldValue, mergeFundReadings,
  type FieldRow, type FundDocReading, type FundFieldGroup,
} from "@/lib/fund-doc-extract-model";
import { invalidateFund } from "@/lib/fund-query-keys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type FileRead = { file: File; reading: FundDocReading | null; error: string | null; added?: boolean };
type Decision = "approved" | "updated" | "denied";

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
const srcText = (s: { fileName: string; page: number | null }[]) => s.map((x) => `${x.fileName}${x.page ? `, p. ${x.page}` : ""}`).join(" · ");

/** Read fund documents with AI and approve, deny or update each detail before anything saves. */
export function FundSetupAiReader({ offeringId }: { offeringId: string }) {
  const read = useServerFn(readFundSetupDocumentFn);
  const loadCurrent = useServerFn(fundSetupAiCurrentValuesFn);
  const apply = useServerFn(applyFundSetupSuggestionFn);
  const createDoc = useServerFn(createSetupDocumentFn);
  const uploadVersion = useServerFn(uploadDocumentVersionFn);
  const qc = useQueryClient();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [files, setFiles] = useState<FileRead[]>([]);
  const [rows, setRows] = useState<FieldRow[]>([]);
  const [multiClass, setMultiClass] = useState(false);
  const [decided, setDecided] = useState<Record<string, { d: Decision; value?: string }>>({});
  const [editing, setEditing] = useState<{ key: string; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = async (list: FileRead[]) => {
    const cur = await loadCurrent({ data: { offeringId } });
    setMultiClass(cur.hasMultipleClasses);
    setRows(mergeFundReadings(list.filter((f) => f.reading).map((f) => ({ fileName: f.file.name, reading: f.reading! })), cur.values));
  };

  const run = async (list: FileList | null) => {
    const picked = Array.from(list ?? []).slice(0, FUND_DOC_MAX_FILES);
    if (!picked.length) return;
    setProgress({ done: 0, total: picked.length });
    setDecided({});
    const out: FileRead[] = [];
    let next = 0;
    const worker = async () => {
      while (next < picked.length) {
        const f = picked[next++]!;
        const contentType = typeFor(f);
        let row: FileRead;
        if (!contentType) row = { file: f, reading: null, error: "Upload a PDF or a photo (PNG, JPG or WEBP)." };
        else if (f.size > DOC_READ_MAX_BYTES) row = { file: f, reading: null, error: "Over 10 MB. Upload a smaller copy." };
        else {
          try { row = { file: f, reading: await read({ data: { offeringId, fileName: f.name, contentType, base64: await toBase64(f) } }), error: null }; }
          catch (e) { row = { file: f, reading: null, error: (e as Error).message.replace(/^Forbidden:\s*/, "") }; }
        }
        out.push(row);
        setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
      }
    };
    await Promise.all([worker(), worker()]);
    const ordered = picked.map((f) => out.find((r) => r.file === f)!).filter(Boolean);
    setFiles(ordered);
    try { await refresh(ordered); } catch (e) { toast.error((e as Error).message); }
    setProgress(null);
  };

  const decide = async (row: FieldRow, action: "approve" | "update" | "deny", value: string | null) => {
    setBusy(row.key);
    try {
      const sources = row.candidates.flatMap((c) => (value == null || c.value === value || action === "deny" ? c.sources : []));
      await apply({ data: { offeringId, field: row.key, action, value, expectedCurrent: row.current, sources: sources.length ? sources : row.candidates.flatMap((c) => c.sources) } });
      setDecided((d) => ({ ...d, [row.key]: { d: (action === "deny" ? "denied" : action === "update" ? "updated" : "approved") as Decision, ...(value != null ? { value } : {}) } }));
      setEditing(null);
      if (action !== "deny") { invalidateFund(qc, offeringId); toast.success(`${row.label} saved${row.group === "fees" ? " as a draft for approval" : ""}.`); }
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  const addToDocuments = async (fr: FileRead) => {
    const category = fr.reading ? documentCategoryFor(fr.reading.documentKind) : null;
    if (!category) return;
    setBusy(fr.file.name);
    try {
      const doc: any = await createDoc({ data: { offeringId, category, title: category === "other" ? fr.file.name.replace(/\.[^.]+$/, "").slice(0, 200) : null } });
      const documentId = String(doc?.id ?? doc?.documentId ?? "");
      if (!documentId) throw new Error("The document couldn't be added.");
      const path = `${offeringId}/setup/${documentId}/${Date.now()}-${fr.file.name.replace(/[^\w.\-]+/g, "_")}`;
      const { error } = await supabase.storage.from("offering-files").upload(path, fr.file);
      if (error) throw new Error(error.message);
      await uploadVersion({ data: { documentId, filePath: path, fileName: fr.file.name, fileSizeBytes: fr.file.size } });
      setFiles((l) => l.map((x) => (x === fr ? { ...x, added: true } : x)));
      invalidateFund(qc, offeringId);
      toast.success("Added to Documents. It still needs approval there.");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  const groups = (Object.keys(GROUP_LABEL) as FundFieldGroup[]).map((g) => ({ g, items: rows.filter((r) => r.group === g) })).filter((x) => x.items.length);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><Sparkles className="h-5 w-5 text-accent" /> Read fund documents with AI</CardTitle>
        <CardDescription className="text-base">
          Add the Operating Agreement, PPM, Subscription Agreement, side letters, EIN letter, SS-4, wire instructions or term sheets. We read them together and suggest setup details. Nothing saves until you approve it. Bank account and tax numbers are never read.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-md border-2 border-dashed border-border p-6 text-center hover:bg-muted/40">
          {progress ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : <FileText className="h-6 w-6 text-muted-foreground" />}
          <span className="text-base font-medium">{progress ? `Reading ${progress.done} of ${progress.total}…` : "Choose files (up to 15)"}</span>
          <span className="text-sm text-muted-foreground">PDF or photo, 10 MB each. Files are read, not stored.</span>
          <input type="file" multiple accept={DOC_READ_ACCEPT} className="sr-only" disabled={!!progress} onChange={(e) => { void run(e.target.files); e.target.value = ""; }} />
        </label>

        {files.length > 0 && (
          <ul className="space-y-2">
            {files.map((f) => {
              const cat = f.reading ? documentCategoryFor(f.reading.documentKind) : null;
              return (
                <li key={f.file.name} className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
                  <span className="font-medium">{f.file.name}</span>
                  {f.reading ? <Badge variant="secondary">{DOC_KIND_LABEL[f.reading.documentKind]}</Badge> : <Badge variant="destructive">Not read</Badge>}
                  {f.error && <span className="text-destructive">{f.error}</span>}
                  {f.reading?.notes.map((n, i) => <span key={i} className="w-full text-muted-foreground">{n}</span>)}
                  {cat && (f.added ? <Badge variant="outline">Added to Documents</Badge> : (
                    <Button size="sm" variant="outline" className="ml-auto" disabled={busy === f.file.name} onClick={() => addToDocuments(f)}>Add to Documents</Button>
                  ))}
                </li>
              );
            })}
          </ul>
        )}

        {multiClass && rows.some((r) => r.group === "fees") && (
          <p className="rounded-md bg-muted p-3 text-sm">This fund has more than one class. Fees here save to the default terms. Set each class on Fees and terms.</p>
        )}

        {groups.map(({ g, items }) => (
          <div key={g} className="space-y-2">
            <h3 className="text-base font-semibold">{GROUP_LABEL[g]}</h3>
            <div className="divide-y rounded-md border">
              {items.map((r) => {
                const done = decided[r.key];
                const one = r.candidates[0]!;
                return (
                  <div key={r.key} className="space-y-2 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{r.label}</span>
                      {r.status === "matches" && <Badge variant="secondary">Already matches</Badge>}
                      {r.status === "suggested" && !done && <Badge>Suggested</Badge>}
                      {r.status === "conflict" && !done && <Badge variant="destructive">Documents disagree</Badge>}
                      {r.status === "reference" && <Badge variant="outline">For reference</Badge>}
                      {done && <Badge variant="outline">{done.d === "approved" ? "Approved" : done.d === "updated" ? "Updated" : "Denied"}</Badge>}
                    </div>
                    {r.status !== "reference" && r.status !== "matches" && <div className="text-sm text-muted-foreground">Now: {displayFieldValue(r.kind, r.current)}</div>}
                    {r.candidates.map((c) => (
                      <div key={c.value} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className={done?.d === "updated" ? "line-through" : ""}>{displayFieldValue(r.kind, c.value)}</span>
                        <span className="text-muted-foreground">({srcText(c.sources)})</span>
                        {r.status === "conflict" && !done && <Button size="sm" disabled={busy === r.key} onClick={() => decide(r, "approve", c.value)}>Use this</Button>}
                      </div>
                    ))}
                    {done?.d === "updated" && <div className="text-sm font-medium">{displayFieldValue(r.kind, done.value ?? null)}</div>}
                    {r.status === "reference" && (
                      <p className="text-sm text-muted-foreground">
                        {r.group === "banking" ? "Enter and verify bank details on the Banking step." : r.group === "tax" ? "Check this matches the fund's legal name on the Tax step." : r.group === "questions" ? "Use this when setting up investor questions." : "Set this on its own setup step."}
                      </p>
                    )}
                    {!done && (r.status === "suggested" || r.status === "conflict") && (
                      editing?.key === r.key ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Input className="max-w-sm" value={editing.text} onChange={(e) => setEditing({ key: r.key, text: e.target.value })} aria-label={`Corrected ${r.label}`} />
                          <Button size="sm" disabled={busy === r.key || !editing.text.trim()} onClick={() => decide(r, "update", r.kind === "cents" ? editing.text.replace(/[$,\s]/g, "") : editing.text)}>Save correction</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {r.status === "suggested" && <Button size="sm" disabled={busy === r.key} onClick={() => decide(r, "approve", one.value)}>Approve</Button>}
                          <Button size="sm" variant="outline" disabled={busy === r.key} onClick={() => decide(r, "deny", null)}>Deny</Button>
                          <Button size="sm" variant="outline" disabled={busy === r.key} onClick={() => setEditing({ key: r.key, text: editableFieldValue(r.kind, one.value) })}>Update</Button>
                        </div>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
