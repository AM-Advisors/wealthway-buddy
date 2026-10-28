import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listPriorDocsFn, markOutsideSubscriptionFn, openPriorDocFn, outsideSubscriptionFn, recordPriorDocFn, startPriorUploadFn } from "@/lib/prior-signed-documents.functions";

const refreshFund = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries({ predicate: (q) => ["fund-investor", "fund-investor-grid", "fund-readiness"].includes(String(q.queryKey[0])) });

const KINDS: Record<string, string> = {
  subscription_agreement: "Subscription Agreement",
  operating_agreement: "Operating / Partnership Agreement",
  ppm_acknowledgment: "PPM acknowledgment",
  tax_form: "Tax form (W-9 / W-8)",
  side_letter: "Side letter",
  accreditation: "Accreditation evidence",
  other: "Other signed document",
};
type Kind = keyof typeof KINDS & ("subscription_agreement" | "operating_agreement" | "ppm_acknowledgment" | "tax_form" | "side_letter" | "accreditation" | "other");

/** Harmonious or the fund's managers load documents an investor already completed in another system. */
export function PriorSignedDocuments({ fundId, onboardingId }: { fundId: string; onboardingId: string }) {
  const qc = useQueryClient();
  const key = ["prior-signed-docs", onboardingId];
  const list = useServerFn(listPriorDocsFn);
  const start = useServerFn(startPriorUploadFn);
  const record = useServerFn(recordPriorDocFn);
  const open = useServerFn(openPriorDocFn);
  const q = useQuery({ queryKey: key, queryFn: () => list({ data: { fundId, onboardingId } }) });
  const [adding, setAdding] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<Kind>("subscription_agreement");
  const [title, setTitle] = useState("");
  const [signedOn, setSignedOn] = useState("");
  const [note, setNote] = useState("");
  const [replacesId, setReplacesId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const openForm = (setup?: () => void) => {
    setAdding(true);
    setup?.();
    // Wait for the form to render, then bring it into view and focus the file picker.
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      fileRef.current?.focus();
    });
  };

  const reset = () => { setAdding(false); setFile(null); setTitle(""); setSignedOn(""); setNote(""); setReplacesId(null); };
  const save = async () => {
    if (!file || !signedOn) { toast.error("Choose the file and the date it was signed."); return; }
    if (replacesId && !note.trim()) { toast.error("Give a reason for the replacement."); return; }
    setBusy(true);
    try {
      const up = await start({ data: { fundId, onboardingId, fileName: file.name } });
      const put = await supabase.storage.from("signed-documents").uploadToSignedUrl(up.path, up.token, file, { contentType: file.type || "application/pdf" });
      if (put.error) throw new Error("The file could not be uploaded.");
      await record({ data: { fundId, onboardingId, path: up.path, fileName: file.name, kind, title: title.trim() || KINDS[kind], signedOn, note: note.trim() || null, replacesId } });
      toast.success("Document saved to this investor.");
      reset();
      await qc.invalidateQueries({ queryKey: ["prior-signed-docs", onboardingId] });
      if (kind === "subscription_agreement") await refreshFund(qc);
    } catch (e) { toast.error(e instanceof Error ? e.message : "The document could not be saved."); }
    finally { setBusy(false); }
  };

  // An active signed Subscription Agreement is changed only through Replace, never loaded a second time.
  const hasActiveSub = (q.data ?? []).some((d) => d.kind === "subscription_agreement" && !d.replaced);
  const kindOptions = Object.entries(KINDS).filter(([k]) => !(hasActiveSub && !replacesId && k === "subscription_agreement"));
  return (
    <div className="space-y-4">
    <OutsideSubscription fundId={fundId} onboardingId={onboardingId} onLoad={() => { setAdding(true); setKind("subscription_agreement"); setTitle("Subscription Agreement"); }} />
    <section className="space-y-2" aria-label="Previously signed documents">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-medium">Signed before joining Harmonious</h4>
        {!adding && <Button size="sm" variant="outline" onClick={() => { setAdding(true); if (hasActiveSub) setKind("other"); }}>{(q.data ?? []).length ? "Load another document" : "Load a completed document"}</Button>}
      </div>
      <p className="text-xs text-muted-foreground">Upload documents this investor already completed elsewhere. They are kept permanently for the record and don't change the investor's steps.</p>
      {q.isError ? <p className="text-destructive">{(q.error as Error).message} <Button size="sm" variant="link" onClick={() => q.refetch()}>Retry</Button></p>
        : q.isLoading ? <p className="text-muted-foreground">Loading…</p>
        : (q.data ?? []).length ? (q.data ?? []).map((d) => (
          <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
            <div className="min-w-0">
              <p className="break-words font-medium">{d.title}</p>
              <p className="text-xs text-muted-foreground">{d.kindLabel} · Signed {d.signedOn} · Loaded by {d.uploadedBy}{d.replaced ? " · Replaced, retained copy" : ""}</p>
              {d.note && <p className="text-xs text-muted-foreground">{d.note}</p>}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={async () => {
                try { const r = await open({ data: { fundId, onboardingId, documentId: d.id } }); const a = document.createElement("a"); a.href = r.url; a.download = ""; a.rel = "noreferrer"; a.click(); }
                catch (e) { toast.error(e instanceof Error ? e.message : "The document could not be opened."); }
              }}>Download</Button>
              {!d.replaced && <Button size="sm" variant="ghost" onClick={() => { setAdding(true); setReplacesId(d.id); setKind(d.kind as Kind); setTitle(d.title); }}>Replace</Button>}
            </div>
          </div>
        )) : !adding && <p className="text-muted-foreground">No documents loaded.</p>}
      {adding && (
        <div className="space-y-2 rounded-lg border p-3">
          {replacesId && <p className="text-xs text-muted-foreground">Replacing a document. The earlier copy stays on record.</p>}
          <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
            <SelectTrigger aria-label="Document type"><SelectValue /></SelectTrigger>
            <SelectContent>{kindOptions.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
          </Select>
          <Input aria-label="Document name" placeholder={KINDS[kind]} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
          <label className="block text-xs text-muted-foreground">Date signed<Input type="date" value={signedOn} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setSignedOn(e.target.value)} /></label>
          <Input type="file" aria-label="Signed document file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <Input aria-label="Note" placeholder={replacesId ? "Reason for replacement (required)" : "Note (optional)"} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save document"}</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={reset}>Cancel</Button>
          </div>
        </div>
      )}
    </section>
    </div>
  );
}

function OutsideSubscription({ fundId, onboardingId, onLoad }: { fundId: string; onboardingId: string; onLoad: () => void }) {
  const qc = useQueryClient();
  const get = useServerFn(outsideSubscriptionFn);
  const mark = useServerFn(markOutsideSubscriptionFn);
  const q = useQuery({ queryKey: ["prior-signed-docs", onboardingId, "outside"], queryFn: () => get({ data: { fundId, onboardingId } }) });
  const [open, setOpen] = useState(false);
  const [signedOn, setSignedOn] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const s = q.data;
  const submit = async (marked: boolean) => {
    setBusy(true);
    try {
      await mark({ data: { fundId, onboardingId, marked, signedOn: marked ? signedOn : null, note: note.trim() || null } });
      toast.success(marked ? "Marked as signed outside the platform." : "Outside signing undone.");
      setOpen(false); setNote("");
      await qc.invalidateQueries({ queryKey: ["prior-signed-docs", onboardingId] });
      await refreshFund(qc);
    } catch (e) { toast.error(e instanceof Error ? e.message : "This could not be saved."); }
    finally { setBusy(false); }
  };
  if (q.isError) return <p className="text-sm text-destructive">{(q.error as Error).message} <Button size="sm" variant="link" onClick={() => q.refetch()}>Retry</Button></p>;
  if (!s) return null;
  return (
    <section className="space-y-2 rounded-lg border p-3" aria-label="Subscription Agreement signed outside the platform">
      <h4 className="font-medium">Subscription Agreement signed outside the platform</h4>
      {!s.marked ? (
        !open ? <div className="space-y-2"><p className="text-xs text-muted-foreground">Use this if the investor already signed their Subscription Agreement in another system.</p><Button size="sm" variant="outline" onClick={() => setOpen(true)}>Mark as signed outside the platform</Button></div>
        : <div className="space-y-2">
          <label className="block text-xs text-muted-foreground">Date signed<Input type="date" value={signedOn} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setSignedOn(e.target.value)} /></label>
          <Input aria-label="Note" placeholder="Note (optional), e.g. where it was signed" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2"><Button size="sm" disabled={busy || !signedOn} onClick={() => submit(true)}>{busy ? "Saving…" : "Confirm"}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button></div>
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <p>Signed outside the platform on {s.signedOn}.</p>
          {s.complete ? <p className="text-xs text-muted-foreground">Harmonious has loaded the signed copy. The Sign step counts as done; funding is unchanged.</p>
            : <p className="text-xs text-muted-foreground">Waiting for Harmonious to load the signed copy. Until then the Sign step stays open.</p>}
          <div className="flex flex-wrap gap-2">
            {!s.complete && s.isHarmonious && <Button size="sm" onClick={onLoad}>Load the signed copy</Button>}
            {!open ? <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Undo</Button>
              : <><Input aria-label="Reason" placeholder="Reason for undoing (required)" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} /><Button size="sm" variant="outline" disabled={busy || !note.trim()} onClick={() => submit(false)}>Confirm undo</Button><Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></>}
          </div>
        </div>
      )}
    </section>
  );
}
