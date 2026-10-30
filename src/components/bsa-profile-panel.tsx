import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { BSA_DOC_KINDS, isReviewOverdue, type BsaDocKind } from "@/lib/bsa-profile";
import {
  addBsaOwnerFn, archiveBsaDocumentFn, getBsaProfileFn, openBsaDocumentFn, recordBsaDocumentFn,
  removeBsaOwnerFn, saveBsaProfileFn, startBsaUploadFn,
} from "@/lib/bsa-profile.functions";

const EVENT_LABEL: Record<string, string> = {
  updated: "Profile updated", reviewed: "Review completed", owner_added: "Owner added", owner_removed: "Owner removed",
  document_added: "Document added", document_opened: "Document opened", document_archived: "Document archived",
};

/** Harmonious staff only. Never render for fund managers, investors or View as client. */
export function BsaProfilePanel({ onboardingId }: { onboardingId: string }) {
  const qc = useQueryClient();
  const key = ["bsa-profile", onboardingId];
  const load = useServerFn(getBsaProfileFn);
  const save = useServerFn(saveBsaProfileFn);
  const addOwner = useServerFn(addBsaOwnerFn);
  const removeOwner = useServerFn(removeBsaOwnerFn);
  const startUpload = useServerFn(startBsaUploadFn);
  const record = useServerFn(recordBsaDocumentFn);
  const openDoc = useServerFn(openBsaDocumentFn);
  const archive = useServerFn(archiveBsaDocumentFn);
  const { data, isLoading, error } = useQuery({ queryKey: key, queryFn: () => load({ data: { onboardingId } }) });
  const [f, setF] = useState<Record<string, string>>({});
  const [owner, setOwner] = useState({ name: "", pct: "", role: "" });
  const [file, setFile] = useState<File | null>(null);
  const [docKind, setDocKind] = useState<BsaDocKind>("formation");
  const [docTitle, setDocTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); refresh(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading BSA profile…</p>;
  if (error || !data) return <p className="text-sm text-destructive">{(error as Error)?.message ?? "Unavailable."}</p>;
  const p: any = data.profile ?? {};
  const v = (k: string, col: string) => f[k] ?? p[col] ?? "";
  const set = (k: string) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const payload = (markReviewed: boolean) => ({ onboardingId, riskRating: v("risk", "risk_rating") || null, riskReason: v("reason", "risk_reason"), sourceOfFunds: v("sof", "source_of_funds"), sourceOfWealth: v("sow", "source_of_wealth"), nextReviewDate: v("next", "next_review_date") || null, markReviewed });
  const overdue = isReviewOverdue(p.next_review_date, new Date());

  return <div className="space-y-4">
    <p className="rounded-md border bg-muted/40 p-3 text-sm">Private to Harmonious staff. Fund managers and investors never see this page or its documents.</p>

    <Card><CardHeader><CardTitle className="flex flex-wrap items-center gap-2 text-base">Risk and source of funds
      {p.risk_rating ? <Badge variant={p.risk_rating === "high" ? "destructive" : "secondary"}>{p.risk_rating} risk</Badge> : null}
      {overdue ? <Badge variant="destructive">Review overdue</Badge> : null}
    </CardTitle></CardHeader>
    <CardContent className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1"><Label htmlFor="bsa-risk">Risk rating</Label>
        <select id="bsa-risk" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={v("risk", "risk_rating")} onChange={set("risk")}>
          <option value="">Not rated</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
        </select></div>
      <div className="space-y-1"><Label htmlFor="bsa-next">Next review date</Label><Input id="bsa-next" type="date" value={v("next", "next_review_date")} onChange={set("next")} /></div>
      <div className="space-y-1 sm:col-span-2"><Label htmlFor="bsa-reason">Reason for rating</Label><Textarea id="bsa-reason" value={v("reason", "risk_reason")} onChange={set("reason")} /></div>
      <div className="space-y-1"><Label htmlFor="bsa-sof">Source of funds</Label><Textarea id="bsa-sof" value={v("sof", "source_of_funds")} onChange={set("sof")} /></div>
      <div className="space-y-1"><Label htmlFor="bsa-sow">Source of wealth</Label><Textarea id="bsa-sow" value={v("sow", "source_of_wealth")} onChange={set("sow")} /></div>
      <p className="text-xs text-muted-foreground sm:col-span-2">{p.last_reviewed_at ? `Last reviewed ${new Date(p.last_reviewed_at).toLocaleDateString()}` : "Not reviewed yet."} If you leave the next review date blank, completing a review sets it: high 1 year, medium 2 years, low 3 years.</p>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button variant="outline" disabled={busy} onClick={() => run(() => save({ data: payload(false) }), "Saved")}>Save</Button>
        <Button disabled={busy} onClick={() => run(() => save({ data: payload(true) }), "Review recorded")}>Save and mark reviewed</Button>
      </div>
    </CardContent></Card>

    <Card><CardHeader><CardTitle className="text-base">Beneficial owners</CardTitle></CardHeader><CardContent className="space-y-3">
      {data.owners.length ? <ul className="divide-y text-sm">{data.owners.map((o: any) => <li key={o.id} className="flex items-center justify-between gap-2 py-2">
        <span>{o.full_name}{o.ownership_percent != null ? ` · ${Number(o.ownership_percent)}%` : ""}{o.role ? ` · ${o.role}` : ""}</span>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => removeOwner({ data: { onboardingId, ownerId: o.id } }), "Owner removed")}>Remove</Button>
      </li>)}</ul> : <p className="text-sm text-muted-foreground">No owners listed.</p>}
      <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
        <Input aria-label="Owner name" placeholder="Full name" value={owner.name} onChange={(e) => setOwner({ ...owner, name: e.target.value })} />
        <Input aria-label="Ownership percent" placeholder="% owned" type="number" value={owner.pct} onChange={(e) => setOwner({ ...owner, pct: e.target.value })} />
        <Input aria-label="Role" placeholder="Role" value={owner.role} onChange={(e) => setOwner({ ...owner, role: e.target.value })} />
        <Button disabled={busy || !owner.name.trim()} onClick={() => run(async () => { await addOwner({ data: { onboardingId, fullName: owner.name, ownershipPercent: owner.pct ? Number(owner.pct) : null, role: owner.role || null } }); setOwner({ name: "", pct: "", role: "" }); }, "Owner added")}>Add</Button>
      </div>
    </CardContent></Card>

    <Card><CardHeader><CardTitle className="text-base">Business documents</CardTitle></CardHeader><CardContent className="space-y-3">
      {data.documents.length ? <ul className="divide-y text-sm">{data.documents.map((d: any) => <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
        <span><span className="font-medium">{d.title}</span><span className="text-muted-foreground"> · {BSA_DOC_KINDS[d.kind as BsaDocKind] ?? d.kind} · {new Date(d.created_at).toLocaleDateString()}</span></span>
        <span className="flex gap-1">
          <Button size="sm" variant="outline" onClick={async () => { try { const r = await openDoc({ data: { onboardingId, documentId: d.id } }); window.open(r.url, "_blank", "noopener"); } catch (e) { toast.error((e as Error).message); } }}>Open</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => archive({ data: { onboardingId, documentId: d.id } }), "Archived")}>Archive</Button>
        </span>
      </li>)}</ul> : <p className="text-sm text-muted-foreground">No documents yet.</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        <select aria-label="Document type" className="h-10 rounded-md border bg-background px-3 text-sm" value={docKind} onChange={(e) => setDocKind(e.target.value as BsaDocKind)}>
          {Object.entries(BSA_DOC_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <Input aria-label="Document title" placeholder="Title (optional)" value={docTitle} onChange={(e) => setDocTitle(e.target.value)} />
        <Input aria-label="Choose file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <Button disabled={busy || !file} onClick={() => run(async () => {
          const t = await startUpload({ data: { onboardingId, fileName: file!.name } });
          const { error: upErr } = await supabase.storage.from("bsa-documents").uploadToSignedUrl(t.path, t.token, file!);
          if (upErr) throw new Error(upErr.message);
          await record({ data: { onboardingId, path: t.path, fileName: file!.name, title: docTitle, kind: docKind } });
          setFile(null); setDocTitle("");
        }, "Document stored")}>Upload</Button>
      </div>
    </CardContent></Card>

    <Card><CardHeader><CardTitle className="text-base">Review history</CardTitle></CardHeader><CardContent>
      {data.events.length ? <ul className="divide-y text-sm">{data.events.map((e: any) => <li key={e.id} className="py-2">
        <p>{EVENT_LABEL[e.event] ?? e.event}{e.detail?.title ? `: ${e.detail.title}` : e.detail?.name ? `: ${e.detail.name}` : e.detail?.risk ? ` · ${e.detail.risk} risk` : ""}</p>
        <p className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</p>
      </li>)}</ul> : <p className="text-sm text-muted-foreground">No history yet.</p>}
    </CardContent></Card>
  </div>;
}
