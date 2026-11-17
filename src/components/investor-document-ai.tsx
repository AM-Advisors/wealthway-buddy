import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { readInvestorDocumentFn, resolveSuggestionFn } from "@/lib/investor-record.functions";
import { completeTaxFormOutsideFn, managerReviewUploadFn, uploadOnboardingDocForFn } from "@/lib/investor-extras.functions";
import { markOutsideSubscriptionFn, recordPriorDocFn, startPriorUploadFn } from "@/lib/prior-signed-documents.functions";
import { SAVE_TARGETS, USE_LABEL, guessSaveTarget, saveTarget, type SaveTargetKey } from "@/lib/investor-document-save-model";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Found = { label: string; value: unknown; suggested: boolean; suggestionId?: string | null; editValue?: string; decision?: "approved" | "denied" | "updated"; appliedValue?: string | undefined };
type Saved = { target: SaveTargetKey; documentId: string | null; signedOn: string | null; used?: boolean };
type Result = { file: string; blob: File; documentKind: string; summary: string; found: Found[]; saveAs: SaveTargetKey | ""; signedOn: string; saved?: Saved };
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
export function InvestorDocumentAi({ onboardingId, fundId }: { onboardingId: string; fundId: string }) {
  const uploadDoc = useServerFn(uploadOnboardingDocForFn);
  const startPrior = useServerFn(startPriorUploadFn);
  const recordPrior = useServerFn(recordPriorDocFn);
  const reviewUpload = useServerFn(managerReviewUploadFn);
  const taxOutside = useServerFn(completeTaxFormOutsideFn);
  const markOutside = useServerFn(markOutsideSubscriptionFn);
  const [saving, setSaving] = useState<number | null>(null);
  const patch = (ri: number, p: Partial<Result>) => setResults((l) => l.map((r, i) => (i === ri ? { ...r, ...p } : r)));

  async function save(ri: number) {
    const r = results[ri]!;
    const t = r.saveAs ? saveTarget(r.saveAs) : null;
    if (!t) { toast.error("Choose what this document is."); return; }
    if (t.store === "prior" && !r.signedOn) { toast.error("Enter the date it was signed."); return; }
    setSaving(ri);
    try {
      let documentId: string | null = null;
      if (t.store === "upload") {
        documentId = (await uploadDoc({ data: { onboardingId, kind: t.key as any, fileName: r.file, contentType: r.blob.type || "application/pdf", base64: await toBase64(r.blob) } })).id;
      } else {
        const up = await startPrior({ data: { fundId, onboardingId, fileName: r.file } });
        const put = await supabase.storage.from("signed-documents").uploadToSignedUrl(up.path, up.token, r.blob, { contentType: r.blob.type || "application/pdf" });
        if (put.error) throw new Error("The file didn't upload. Try again.");
        await recordPrior({ data: { fundId, onboardingId, path: up.path, fileName: r.file, kind: t.key as any, title: t.label, signedOn: r.signedOn, note: "Saved from Read documents with AI" } });
      }
      patch(ri, { saved: { target: t.key, documentId, signedOn: r.signedOn || null } });
      toast.success(`Saved to the investor's documents as ${t.label}.`);
      await qc.invalidateQueries();
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(null); }
  }

  async function use(ri: number) {
    const r = results[ri]!;
    const sv = r.saved; const t = sv ? saveTarget(sv.target) : null;
    if (!sv || !t?.use) return;
    if (!window.confirm(`${USE_LABEL[t.use]}? This is recorded in the investor's history.`)) return;
    setSaving(ri);
    try {
      if (t.use === "tax_outside" && sv.documentId) await taxOutside({ data: { id: sv.documentId, note: "Signed copy read and saved from Read documents with AI" } });
      else if ((t.use === "accept_accreditation" || t.use === "accept_copy") && sv.documentId) await reviewUpload({ data: { id: sv.documentId, status: "accepted", note: null } });
      else if (t.use === "subscription_outside") await markOutside({ data: { fundId, onboardingId, marked: true, signedOn: sv.signedOn, note: "Signed copy saved from Read documents with AI" } });
      patch(ri, { saved: { ...sv, used: true } });
      toast.success("Done. The investor's steps are updated.");
      await qc.invalidateQueries();
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(null); }
  }

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
        const today = new Date().toISOString().slice(0, 10);
        const dated = r.found.find((f) => /date/i.test(f.label) && /^\d{4}-\d{2}-\d{2}$/.test(String(f.value ?? "")));
        setResults((p) => [{ file: file.name, blob: file, ...r, saveAs: guessSaveTarget(r.documentKind) ?? "", signedOn: dated && String(dated.value) <= today ? String(dated.value) : "" }, ...p]);
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
        <CardDescription>Upload subscription agreements, W-9s, IDs, accreditation letters or entity documents (PDF or image). Approve, Deny or Update each suggested detail, then save the file to the investor's documents and put it to use. Nothing changes on the record until you approve or save it. Tax numbers are never read.</CardDescription>
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
            <SaveRow r={r} busy={saving === i} onChange={(p) => patch(i, p)} onSave={() => void save(i)} onUse={() => void use(i)} />
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

function SaveRow({ r, busy, onChange, onSave, onUse }: { r: Result; busy: boolean; onChange: (p: Partial<Result>) => void; onSave: () => void; onUse: () => void }) {
  const t = r.saveAs ? saveTarget(r.saveAs) : null;
  if (r.saved) {
    const st = saveTarget(r.saved.target)!;
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-muted/50 p-2">
        <Badge variant="secondary">Saved as {st.label}</Badge>
        {st.use && !r.saved.used && <Button size="sm" className="h-7 px-2 text-xs" disabled={busy} onClick={onUse}>{USE_LABEL[st.use]}</Button>}
        {r.saved.used && <Badge variant="outline">In use</Badge>}
        {!st.use && <span className="text-xs text-muted-foreground">{st.key === "identification" ? "Review identity in the Verification section." : "Kept with the investor's signed documents."}</span>}
      </div>
    );
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-muted/50 p-2">
      <label className="text-xs text-muted-foreground" htmlFor={`save-${r.file}`}>Save as</label>
      <select id={`save-${r.file}`} className="h-8 rounded-md border bg-background px-2 text-sm" value={r.saveAs} onChange={(e) => onChange({ saveAs: e.target.value as SaveTargetKey | "" })}>
        <option value="">Choose…</option>
        {SAVE_TARGETS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
      {t?.store === "prior" && <Input type="date" aria-label="Date signed" className="h-8 w-40" value={r.signedOn} max={new Date().toISOString().slice(0, 10)} onChange={(e) => onChange({ signedOn: e.target.value })} />}
      <Button size="sm" className="h-8" disabled={busy || !t || (t.store === "prior" && !r.signedOn)} onClick={onSave}>{busy ? "Saving…" : "Save to investor's documents"}</Button>
    </div>
  );
}
