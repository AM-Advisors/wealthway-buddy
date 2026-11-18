import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { createInvestorFromDocumentFn, confirmDocumentOwnerFn, documentOwnerOptionsFn, readInvestorDocumentFn, recentDocumentReadsFn, recordDocumentStepFn, resolveSuggestionFn } from "@/lib/investor-record.functions";
import { completeTaxFormOutsideFn, managerReviewUploadFn, uploadOnboardingDocForFn } from "@/lib/investor-extras.functions";
import { markOutsideSubscriptionFn, recordPriorDocFn, startPriorUploadFn } from "@/lib/prior-signed-documents.functions";
import { SAVE_TARGETS, USE_LABEL, saveTarget, type DocumentReadResult, type FoundRow, type SaveTargetKey } from "@/lib/investor-document-save-model";
import { supabase } from "@/integrations/supabase/client";
import { draftFromDocument, draftProblems, partyKey, type NewInvestorDraft } from "@/lib/doc-to-new-investor";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DriveDocumentPicker } from "@/components/drive-document-picker";

type Found = FoundRow & { decision?: "approved" | "denied" | "updated"; appliedValue?: string | undefined };
type Owner = "match" | "needs" | "confirmed" | "moved";
type Saved = { target: SaveTargetKey; documentId: string | null; signedOn: string | null; used?: boolean };
type Result = {
  file: string; blob: File; read: DocumentReadResult; found: Found[];
  saveAs: SaveTargetKey | ""; signedOn: string; owner: Owner; ownerOnboardingId: string; ownerLabel: string | null;
  within: "entity" | "signer" | "owner" | ""; signedConfirmed: boolean; saveDuplicate: boolean; saved?: Saved; changingType?: boolean;
};
const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp";
const ROLE_LABEL: Record<string, string> = { investing_party: "investing party", person: "investor", joint: "joint investor", signer: "signer", owner: "owner" };

function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Couldn't read the file."));
    r.readAsDataURL(file);
  });
}

/** Harmonious-only: read investor documents with AI, confirm type and owner, review details, save and use. */
export function InvestorDocumentAi({ onboardingId, fundId }: { onboardingId: string; fundId: string }) {
  const read = useServerFn(readInvestorDocumentFn);
  const confirmOwner = useServerFn(confirmDocumentOwnerFn);
  const ownerOptions = useServerFn(documentOwnerOptionsFn);
  const createFromDoc = useServerFn(createInvestorFromDocumentFn);
  const [newPick, setNewPick] = useState<{ ri: number; draft: NewInvestorDraft } | null>(null);
  const recent = useServerFn(recentDocumentReadsFn);
  const logStep = useServerFn(recordDocumentStepFn);
  const resolve = useServerFn(resolveSuggestionFn);
  const uploadDoc = useServerFn(uploadOnboardingDocForFn);
  const startPrior = useServerFn(startPriorUploadFn);
  const recordPrior = useServerFn(recordPriorDocFn);
  const reviewUpload = useServerFn(managerReviewUploadFn);
  const taxOutside = useServerFn(completeTaxFormOutsideFn);
  const markOutside = useServerFn(markOutsideSubscriptionFn);
  const qc = useQueryClient();
  const [expected, setExpected] = useState<SaveTargetKey | "">("");
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const [working, setWorking] = useState<number | null>(null);
  const [movePick, setMovePick] = useState<{ ri: number; value: string } | null>(null);
  const recentQ = useQuery({ queryKey: ["doc-ai-recent", onboardingId], queryFn: () => recent({ data: { onboardingId } }) });
  const optionsQ = useQuery({ queryKey: ["doc-ai-owner-options", onboardingId], queryFn: () => ownerOptions({ data: { onboardingId } }), enabled: !!movePick });
  const patch = (ri: number, p: Partial<Result>) => setResults((l) => l.map((r, i) => (i === ri ? { ...r, ...p } : r)));
  const refreshRecent = () => qc.invalidateQueries({ queryKey: ["doc-ai-recent", onboardingId] });

  async function run(files: FileList | File[] | null) {
    for (const file of Array.from(files ?? [])) {
      if (file.size > 10 * 1024 * 1024) { toast.error(`${file.name} is over 10 MB.`); continue; }
      setBusy(file.name);
      try {
        const r = await read({ data: { onboardingId, fileName: file.name, mimeType: (file.type || "application/pdf") as any, base64: await toBase64(file), expectedKind: expected || null } });
        const today = new Date().toISOString().slice(0, 10);
        setResults((p) => [{
          file: file.name, blob: file, read: r, found: r.found, saveAs: (expected || r.suggestedType || "") as SaveTargetKey | "",
          signedOn: r.documentDate && r.documentDate <= today ? r.documentDate : "",
          owner: r.owner.status === "match" ? "match" : "needs", ownerOnboardingId: onboardingId, ownerLabel: null,
          within: "", signedConfirmed: false, saveDuplicate: false,
        }, ...p]);
        if (r.owner.status !== "match") toast.message(`Confirm who ${file.name} belongs to.`);
      } catch (e) { toast.error((e as Error).message); }
    }
    setBusy(null);
    void refreshRecent();
  }

  async function ownerDecision(ri: number, targetOnboardingId: string, label: string | null) {
    const r = results[ri]!;
    setWorking(ri);
    try {
      const out = await confirmOwner({ data: { onboardingId, targetOnboardingId, fileName: r.file, values: r.read.values, within: r.within || null } });
      patch(ri, { found: out.found, owner: targetOnboardingId === onboardingId ? "confirmed" : "moved", ownerOnboardingId: targetOnboardingId, ownerLabel: label });
      setMovePick(null);
      toast.success(targetOnboardingId === onboardingId ? "Owner confirmed." : `Moved to ${label ?? "the other investor"}. Nothing was saved here.`);
      void refreshRecent(); await qc.invalidateQueries();
    } catch (e) { toast.error((e as Error).message); } finally { setWorking(null); }
  }

  async function addNewInvestor(ri: number, draft: NewInvestorDraft) {
    const r = results[ri]!;
    const problems = draftProblems(draft);
    if (problems.length) { toast.error(problems[0]!); return; }
    setWorking(ri);
    try {
      const out = await createFromDoc({ data: { onboardingId, fileName: r.file, values: r.read.values, draft } });
      patch(ri, { found: out.found, owner: "moved", ownerOnboardingId: out.onboardingId, ownerLabel: out.label });
      setNewPick(null);
      toast.success(`Added ${out.label} to this fund and moved ${r.file} to them. No email was sent.`);
      // Other files in this upload that name the same new person go to them too.
      const key = partyKey(draft);
      for (let j = 0; j < results.length; j++) {
        const o = results[j]!;
        if (j === ri || o.owner !== "needs" || !key || partyKey(draftFromDocument(o.read.values, o.read.names)) !== key) continue;
        try {
          const m = await confirmOwner({ data: { onboardingId, targetOnboardingId: out.onboardingId, fileName: o.file, values: o.read.values, within: o.within || null } });
          patch(j, { found: m.found, owner: "moved", ownerOnboardingId: out.onboardingId, ownerLabel: out.label });
          toast.message(`${o.file} also moved to ${out.label}.`);
        } catch (e) { toast.error(`${o.file}: ${(e as Error).message}`); }
      }
      void refreshRecent(); await qc.invalidateQueries();
    } catch (e) { toast.error(`${(e as Error).message} If they're already on the fund, use "Belongs to someone else".`); } finally { setWorking(null); }
  }

  async function decide(ri: number, fi: number, f: Found, action: "accept" | "reject" | "update", value?: string, quiet = false) {
    if (!f.suggestionId) return;
    setDeciding(f.suggestionId);
    try {
      await resolve({ data: { id: f.suggestionId, action, value: value ?? null } });
      const decision: Found["decision"] = action === "accept" ? "approved" : action === "reject" ? "denied" : "updated";
      setResults((p) => p.map((r, i) => i !== ri ? r : { ...r, found: r.found.map((x, j) => j !== fi ? x : { ...x, decision, appliedValue: value }) }));
      setEditing(null);
      if (!quiet) toast.success(action === "accept" ? `${f.label} saved to the investor record` : action === "reject" ? `${f.label} suggestion denied` : `${f.label} updated on the investor record`);
    } catch (e) { toast.error((e as Error).message); throw e; }
    finally { setDeciding(null); }
  }

  async function approveAll(ri: number) {
    const r = results[ri]!;
    let n = 0;
    for (const [fi, f] of r.found.entries()) {
      if (!f.suggested || !f.suggestionId || f.decision) continue;
      try { await decide(ri, fi, f, "accept", undefined, true); n++; } catch { break; }
    }
    if (n) toast.success(`${n} detail${n === 1 ? "" : "s"} approved.`);
    await qc.invalidateQueries();
  }

  async function save(ri: number) {
    const r = results[ri]!;
    const t = r.saveAs ? saveTarget(r.saveAs) : null;
    if (!t) { toast.error("Choose what this document is."); return; }
    if (t.store === "prior" && !r.signedOn) { toast.error("Enter the date it was signed."); return; }
    const target = r.ownerOnboardingId;
    setWorking(ri);
    try {
      let documentId: string | null = null;
      if (t.store === "upload") {
        documentId = (await uploadDoc({ data: { onboardingId: target, kind: t.key as any, fileName: r.file, contentType: r.blob.type || "application/pdf", base64: await toBase64(r.blob) } })).id;
      } else {
        const up = await startPrior({ data: { fundId, onboardingId: target, fileName: r.file } });
        const put = await supabase.storage.from("signed-documents").uploadToSignedUrl(up.path, up.token, r.blob, { contentType: r.blob.type || "application/pdf" });
        if (put.error) throw new Error("The file didn't upload. Try again.");
        await recordPrior({ data: { fundId, onboardingId: target, path: up.path, fileName: r.file, kind: (t.key === "fund_operating_agreement" ? "operating_agreement" : t.key) as any, title: t.label, signedOn: r.signedOn, note: "Saved from Read documents with AI" } });
      }
      await logStep({ data: { onboardingId: target, fileName: r.file, step: "saved", type: t.key } }).catch(() => null);
      const sv = { target: t.key, documentId, signedOn: r.signedOn || null };
      // One approval: saving also applies the document everywhere (no second click).
      let used = false;
      const needsSigned = t.use === "tax_outside" || t.use === "subscription_outside";
      if (t.use && (!needsSigned || r.read.signed !== false)) {
        if (t.use === "tax_outside" && documentId) await taxOutside({ data: { id: documentId, note: "Signed copy approved from Read documents with AI" } });
        else if ((t.use === "accept_accreditation" || t.use === "accept_copy") && documentId) await reviewUpload({ data: { id: documentId, status: "accepted", note: null } });
        else if (t.use === "subscription_outside") await markOutside({ data: { fundId, onboardingId: target, marked: true, signedOn: r.signedOn, note: "Signed copy approved from Read documents with AI" } });
        await logStep({ data: { onboardingId: target, fileName: r.file, step: "used", type: t.key, use: t.use } }).catch(() => null);
        used = true;
      }
      patch(ri, { saved: { ...sv, used }, changingType: false });
      toast.success(used ? `Approved and filed as ${t.label}.` : `Saved as ${t.label}.`);
      void refreshRecent(); await qc.invalidateQueries();
    } catch (e) { toast.error((e as Error).message); } finally { setWorking(null); }
  }

  async function use(ri: number) {
    const r = results[ri]!;
    const sv = r.saved; const t = sv ? saveTarget(sv.target) : null;
    if (!sv || !t?.use) return;
    if (!window.confirm(`${USE_LABEL[t.use]}? This is recorded in the investor's history.`)) return;
    const target = r.ownerOnboardingId;
    setWorking(ri);
    try {
      if (t.use === "tax_outside" && sv.documentId) await taxOutside({ data: { id: sv.documentId, note: "Signed copy read and saved from Read documents with AI" } });
      else if ((t.use === "accept_accreditation" || t.use === "accept_copy") && sv.documentId) await reviewUpload({ data: { id: sv.documentId, status: "accepted", note: null } });
      else if (t.use === "subscription_outside") await markOutside({ data: { fundId, onboardingId: target, marked: true, signedOn: sv.signedOn, note: "Signed copy saved from Read documents with AI" } });
      await logStep({ data: { onboardingId: target, fileName: r.file, step: "used", type: t.key, use: t.use } }).catch(() => null);
      patch(ri, { saved: { ...sv, used: true } });
      toast.success("Done. The investor's steps are updated.");
      void refreshRecent(); await qc.invalidateQueries();
    } catch (e) { toast.error((e as Error).message); } finally { setWorking(null); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Read documents with AI</CardTitle>
        <CardDescription>Pick what you're uploading (or let AI decide), choose files from your computer or the Harmonious Google Drive, confirm who it belongs to, review each detail, then save it to the investor's documents and put it to use. Nothing changes until you click. Tax and account numbers are never read.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="doc-ai-kind" className="text-sm">What is this?</label>
          <select id="doc-ai-kind" className="h-9 rounded-md border bg-background px-2 text-sm" value={expected} onChange={(e) => setExpected(e.target.value as SaveTargetKey | "")}>
            <option value="">Let AI decide</option>
            {SAVE_TARGETS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
          <label className="inline-flex">
            <input type="file" accept={ACCEPT} multiple className="hidden" disabled={!!busy} onChange={(e) => { void run(e.target.files); e.target.value = ""; }} />
            <Button asChild disabled={!!busy}><span className="cursor-pointer">{busy ? `Reading ${busy}…` : "Choose documents"}</span></Button>
          </label>
          <DriveDocumentPicker onboardingId={onboardingId} disabled={!!busy} onPicked={(files) => run(files)} />
        </div>

        {results.map((r, i) => {
          const ownerOk = r.owner !== "needs";
          const pending = r.found.filter((f) => f.suggested && f.suggestionId && !f.decision).length;
          const steps = [
            ["Read", true], ["Type", !!r.saveAs], ["Owner", ownerOk], ["Details", ownerOk && pending === 0], ["Saved", !!r.saved], ["In use", !!r.saved?.used],
          ] as const;
          return (
            <div key={`${r.file}-${i}`} className="space-y-2 rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{r.file}</p>
                <Badge variant="secondary">{r.read.documentKind}</Badge>
                {r.read.signed === false && <Badge variant="destructive">Unsigned</Badge>}
                {r.read.signed === true && <Badge variant="outline">Signed</Badge>}
                {r.read.duplicate && <Badge variant="outline">Already saved on {r.read.duplicate.savedAt}</Badge>}
              </div>
              <ol className="flex flex-wrap gap-1 text-xs" aria-label="Progress">
                {steps.map(([label, done]) => <li key={label} className={`rounded-full border px-2 py-0.5 ${done ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}>{label}</li>)}
              </ol>
              {r.read.summary ? <p className="text-xs text-muted-foreground">{r.read.summary}</p> : null}
              {r.read.typeMismatch && r.read.detectedType && (
                <p className="rounded-md bg-muted p-2 text-xs">This looks like a <b>{saveTarget(r.read.detectedType)?.label}</b>, not a {saveTarget(r.saveAs || "other")?.label}.{" "}
                  {!r.saved && <Button size="sm" variant="link" className="h-auto p-0 text-xs" onClick={() => patch(i, { saveAs: r.read.detectedType! })}>Use {saveTarget(r.read.detectedType)?.label}</Button>}
                </p>
              )}
              {r.read.warnings.map((w) => <p key={w} className="text-xs text-destructive">{w}</p>)}

              {/* Owner */}
              <div className="rounded-md bg-muted/50 p-2">
                {r.owner === "match" && <p className="text-xs"><Badge className="mr-1">Matches</Badge>{r.read.owner.matchedName} ({ROLE_LABEL[r.read.owner.matchedRole ?? ""] ?? "investor"})</p>}
                {r.owner === "confirmed" && <p className="text-xs"><Badge variant="outline" className="mr-1">Owner confirmed</Badge>You confirmed this belongs to this investor{r.within ? ` (${r.within})` : ""}.</p>}
                {r.owner === "moved" && <p className="text-xs"><Badge variant="outline" className="mr-1">Moved</Badge>Belongs to {r.ownerLabel}. Saves go to that investor.</p>}
                {r.owner === "needs" && (
                  <div className="space-y-2 text-xs">
                    <p><Badge variant="destructive" className="mr-1">{r.read.owner.status === "unknown" ? "No name found" : "Different name"}</Badge>
                      {r.read.names.length ? `Document names: ${r.read.names.map((n) => n.name).join(", ")}` : "Confirm who this document belongs to."}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <select aria-label="Whose document within this investment" className="h-8 rounded-md border bg-background px-2" value={r.within} onChange={(e) => patch(i, { within: e.target.value as Result["within"] })}>
                        <option value="">Whose document? (optional)</option>
                        <option value="entity">The entity or trust</option>
                        <option value="signer">A signer</option>
                        <option value="owner">A beneficial owner</option>
                      </select>
                      <Button size="sm" className="h-8" disabled={working === i} onClick={() => void ownerDecision(i, onboardingId, null)}>It's this investor</Button>
                      <Button size="sm" variant="outline" className="h-8" disabled={working === i} onClick={() => setMovePick({ ri: i, value: "" })}>Belongs to someone else</Button>
                      <Button size="sm" variant="outline" className="h-8" disabled={working === i} onClick={() => setNewPick({ ri: i, draft: draftFromDocument(r.read.values, r.read.names) })}>Add as a new investor</Button>
                    </div>
                    {newPick?.ri === i && <NewInvestorForm draft={newPick.draft} busy={working === i} onChange={(d) => setNewPick({ ri: i, draft: d })} onCancel={() => setNewPick(null)} onSave={() => void addNewInvestor(i, newPick.draft)} />}
                    {movePick?.ri === i && (
                      <div className="flex flex-wrap items-center gap-2">
                        <SearchableSelect aria-label="Investor in this fund" className="w-72" placeholder={optionsQ.isLoading ? "Loading investors…" : "Choose an investor in this fund…"}
                          options={(optionsQ.data ?? []).filter((o) => o.value !== onboardingId)} value={movePick.value} onValueChange={(v) => setMovePick({ ri: i, value: v })} />
                        <Button size="sm" className="h-8" disabled={!movePick.value || working === i} onClick={() => void ownerDecision(i, movePick.value, optionsQ.data?.find((o) => o.value === movePick.value)?.label ?? null)}>Move here</Button>
                        <Button size="sm" variant="ghost" className="h-8" onClick={() => setMovePick(null)}>Cancel</Button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Details */}
              {ownerOk && (r.found.length ? <>
                {pending > 1 && <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={!!deciding} onClick={() => void approveAll(i)}>Approve all {pending} suggested</Button>}
                <ul className="space-y-2">{r.found.map((f, j) => {
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
                          <Button size="sm" className="h-7 px-2 text-xs" disabled={busyRow} onClick={() => void decide(i, j, f, "accept").then(() => qc.invalidateQueries(), () => null)}>Approve</Button>
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={busyRow} onClick={() => void decide(i, j, f, "reject").catch(() => null)}>Deny</Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={busyRow} onClick={() => setEditing({ id: f.suggestionId!, value: f.editValue ?? String(f.value ?? "") })}>Update</Button>
                        </span>}
                      </div>
                      {isEditing && editing && <div className="flex flex-wrap items-center gap-2 pl-1">
                        <Input aria-label={`Corrected ${f.label}`} className="h-8 max-w-xs" value={editing.value} maxLength={300} autoFocus onChange={(e) => setEditing({ ...editing, value: e.target.value })} />
                        <Button size="sm" className="h-8" disabled={busyRow || !editing.value.trim()} onClick={() => void decide(i, j, f, "update", editing.value.trim()).then(() => qc.invalidateQueries(), () => null)}>{busyRow ? "Saving…" : "Save correction"}</Button>
                        <Button size="sm" variant="ghost" className="h-8" disabled={busyRow} onClick={() => setEditing(null)}>Cancel</Button>
                      </div>}
                    </li>);
                })}</ul>
              </> : <p className="text-xs text-muted-foreground">No investor details found.</p>)}

              {ownerOk && <SaveRow r={r} busy={working === i} onChange={(p) => patch(i, p)} onSave={() => void save(i)} onUse={() => void use(i)} />}
            </div>
          );
        })}

        {(recentQ.data ?? []).length > 0 && (
          <details className="rounded-md border p-2 text-xs">
            <summary className="cursor-pointer font-medium">Recently read documents</summary>
            <ul className="mt-2 space-y-1">
              {(recentQ.data ?? []).map((e, k) => (
                <li key={k} className="flex flex-wrap gap-2">
                  <span className="text-muted-foreground">{new Date(e.at).toLocaleString()}</span>
                  <span className="font-medium">{e.fileName}</span>
                  <span>{EVENT_LABEL[e.event] ?? e.event}{e.type ? ` · ${saveTarget(e.type)?.label ?? e.type}` : ""}{e.owner && e.event === "document_read_with_ai" ? ` · owner ${e.owner === "match" ? "matched" : "needed confirmation"}` : ""}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

function NewInvestorForm({ draft, busy, onChange, onCancel, onSave }: { draft: NewInvestorDraft; busy: boolean; onChange: (d: NewInvestorDraft) => void; onCancel: () => void; onSave: () => void }) {
  const f = (k: keyof NewInvestorDraft, label: string) => (
    <label className="space-y-1"><span className="text-muted-foreground">{label}</span>
      <Input className="h-8" value={draft[k]} onChange={(e) => onChange({ ...draft, [k]: e.target.value })} /></label>
  );
  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3">
      <p className="font-medium">New investor, filled in from this document. Check everything before adding.</p>
      <label className="block space-y-1"><span className="text-muted-foreground">Investing as</span>
        <select aria-label="Investing as" className="h-8 w-full rounded-md border bg-background px-2" value={draft.type} onChange={(e) => onChange({ ...draft, type: e.target.value as NewInvestorDraft["type"] })}>
          <option value="individual">An individual</option><option value="entity">A company</option><option value="trust">A trust</option>
        </select></label>
      <div className="grid gap-2 sm:grid-cols-3">
        {draft.type !== "individual" && f("legalName", "Entity or trust legal name")}
        {f("firstName", draft.type === "individual" ? "First name" : "Signer first name")}
        {f("middleName", "Middle name")}
        {f("lastName", draft.type === "individual" ? "Last name" : "Signer last name")}
        {f("email", "Email (optional)")}{f("phone", "Phone")}{f("dateOfBirth", "Birthday (YYYY-MM-DD)")}
        {f("addressLine1", "Address")}{f("city", "City")}{f("region", "State")}{f("postalCode", "ZIP")}{f("country", "Country")}{f("citizenship", "Citizenship")}
      </div>
      <p className="text-muted-foreground">No email or invitation is sent. Tax and account numbers are never copied.</p>
      <div className="flex gap-2"><Button size="sm" className="h-8" disabled={busy} onClick={onSave}>Add investor</Button><Button size="sm" variant="ghost" className="h-8" onClick={onCancel}>Cancel</Button></div>
    </div>
  );
}

const EVENT_LABEL: Record<string, string> = {
  document_owner_new_investor: "Added as a new investor",
  document_read_with_ai: "Read", document_owner_confirmed: "Owner confirmed", document_owner_moved: "Moved to another investor",
  document_owner_moved_here: "Moved here from another investor", document_saved_from_ai: "Saved", document_used_from_ai: "Put to use",
};

function SaveRow({ r, busy, onChange, onSave, onUse }: { r: Result; busy: boolean; onChange: (p: Partial<Result>) => void; onSave: () => void; onUse: () => void }) {
  const t = r.saveAs ? saveTarget(r.saveAs) : null;
  if (r.saved && !r.changingType) {
    const st = saveTarget(r.saved.target)!;
    const needsSigned = st.use === "tax_outside" || st.use === "subscription_outside";
    const signedOk = !needsSigned || r.read.signed === true || r.signedConfirmed;
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 p-2">
        <Badge variant="secondary">Saved as {st.label}</Badge>
        {st.use && !r.saved.used && needsSigned && r.read.signed !== true && (
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={r.signedConfirmed} onChange={(e) => onChange({ signedConfirmed: e.target.checked })} /> I checked it's signed</label>
        )}
        {st.use && !r.saved.used && <Button size="sm" className="h-7 px-2 text-xs" disabled={busy || !signedOk} onClick={onUse}>{USE_LABEL[st.use]}</Button>}
        {r.saved.used && <Badge variant="outline">In use</Badge>}
        {!st.use && <span className="text-xs text-muted-foreground">{st.key === "identification" ? "Review identity in the Verification section." : "Kept with the investor's signed documents."}</span>}
        {!r.saved.used && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onChange({ changingType: true })}>Wrong type? Save as another</Button>}
      </div>
    );
  }
  const dupBlocks = !!r.read.duplicate && !r.saveDuplicate && !r.saved;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 p-2">
      <label className="text-xs text-muted-foreground" htmlFor={`save-${r.file}`}>Save as</label>
      <select id={`save-${r.file}`} className="h-8 rounded-md border bg-background px-2 text-sm" value={r.saveAs} onChange={(e) => onChange({ saveAs: e.target.value as SaveTargetKey | "" })}>
        <option value="">Choose…</option>
        {SAVE_TARGETS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
      {t?.store === "prior" && <Input type="date" aria-label="Date signed" className="h-8 w-40" value={r.signedOn} max={new Date().toISOString().slice(0, 10)} onChange={(e) => onChange({ signedOn: e.target.value })} />}
      {dupBlocks
        ? <><span className="text-xs">Already saved on {r.read.duplicate!.savedAt}. See the documents list below.</span><Button size="sm" variant="outline" className="h-8" onClick={() => onChange({ saveDuplicate: true })}>Save another copy</Button></>
        : <Button size="sm" className="h-8" disabled={busy || !t || (t.store === "prior" && !r.signedOn)} onClick={onSave}>{busy ? "Saving…" : r.saved ? "Save as corrected type" : "Approve & file"}</Button>}
      {r.saved && <Button size="sm" variant="ghost" className="h-8" onClick={() => onChange({ changingType: false })}>Cancel</Button>}
    </div>
  );
}
