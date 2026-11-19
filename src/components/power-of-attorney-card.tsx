import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileSignature, Plus, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  investorProfilesForPoaFn, linkPowerOfAttorneyAgentFn, listPowersOfAttorneyFn, powerOfAttorneyFileFn, reviewPowerOfAttorneyFn, revokePowerOfAttorneyFn, startPoaUploadFn, submitPowerOfAttorneyFn,
} from "@/lib/power-of-attorney.functions";
import { POA_KIND_LABELS, POA_POWER_LABELS, POA_POWERS, POA_STATUS_LABELS, poaInputBlocker, type PoaDisplayStatus, type PoaKind, type PoaPower } from "@/lib/power-of-attorney-model";
import { POA_KEEPS_WITH_OWNER } from "@/lib/poa-authority";
import { SIGNABLE_DOCUMENT_LABELS, SIGNABLE_DOCUMENT_TYPES, type SignableDocumentType } from "@/lib/signatory-model";

type Subject = { kind: "investment_profile" | "client"; id: string };
const fmt = (d: string | null | undefined) => (d ? new Date(`${d.length === 10 ? `${d}T12:00:00` : d}`).toLocaleDateString("en-US") : null);
const statusVariant = (s: PoaDisplayStatus) => (s === "accepted" ? "default" : s === "pending_review" || s === "not_yet_effective" ? "secondary" : "outline");
const authorityVariant = (state: string) => (state === "active" ? "default" : state === "ended" || state === "no_record" ? "outline" : "secondary");

/** Power of attorney on file for an investing profile or a client. The named person may do exactly what the accepted document lists. */
export function PowerOfAttorneyCard({ subject, title = "Power of attorney" }: { subject: Subject; title?: string }) {
  const list = useServerFn(listPowersOfAttorneyFn);
  const qc = useQueryClient();
  const key = ["power-of-attorney", subject.kind, subject.id];
  const q = useQuery({ queryKey: key, queryFn: () => list({ data: { subject } }), retry: false });
  const [adding, setAdding] = useState<{ replacesId: string | null } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  if (q.error) return null; // Not someone who may see this account's powers of attorney.
  const data = q.data;
  return (
    <Card className="md:col-span-2">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base"><FileSignature className="h-4 w-4" />{title}</CardTitle>
          <CardDescription className="text-sm">Keep a signed power of attorney on file, with the person it names. Harmonious reviews each one. Once accepted, that person can do what the document lists, and nothing else.</CardDescription>
        </div>
        {data?.can.add ? <Button size="sm" onClick={() => setAdding({ replacesId: null })}><Plus className="mr-1 h-4 w-4" />Add power of attorney</Button> : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {data && data.records.length === 0 ? <p className="text-sm text-muted-foreground">No power of attorney on file.</p> : null}
        {data?.records.map((r) => <PoaRow key={r.id} r={r} can={data.can} me={data.me} onChanged={refresh} onReplace={() => setAdding({ replacesId: r.id })} />)}
        {data && data.records.length ? (
          <p className="text-xs text-muted-foreground">Always stays with the account holder and Harmonious: {POA_KEEPS_WITH_OWNER.join("; ")}.</p>
        ) : null}
      </CardContent>
      {adding ? <AddPoaDialog subject={subject} replacesId={adding.replacesId} onClose={() => setAdding(null)} onSaved={() => { setAdding(null); refresh(); }} /> : null}
    </Card>
  );
}

type Row = Awaited<ReturnType<typeof listPowersOfAttorneyFn>>["records"][number];

function PoaRow({ r, can, me, onChanged, onReplace }: { r: Row; can: { add: boolean; revoke: boolean; review: boolean; link: boolean }; me: string; onChanged: () => void; onReplace: () => void }) {
  const review = useServerFn(reviewPowerOfAttorneyFn);
  const revoke = useServerFn(revokePowerOfAttorneyFn);
  const file = useServerFn(powerOfAttorneyFileFn);
  const link = useServerFn(linkPowerOfAttorneyAgentFn);
  const [mode, setMode] = useState<"reject" | "revoke" | null>(null);
  const [note, setNote] = useState("");
  const [linking, setLinking] = useState(false);
  const [linkEmail, setLinkEmail] = useState(r.agentEmail ?? "");
  const act = useMutation({
    mutationFn: async (kind: "accept" | "reject" | "revoke") => {
      if (kind === "revoke") { await revoke({ data: { id: r.id, reason: note } }); return null; }
      const out = await review({ data: { id: r.id, decision: kind, note: note || null } });
      return out.why ?? null;
    },
    onSuccess: (why, kind) => {
      toast.success(kind === "accept" ? "Accepted" : kind === "reject" ? "Marked not accepted" : "Revoked");
      if (why) toast.info(why);
      setMode(null); setNote(""); onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const doLink = useMutation({
    mutationFn: () => link({ data: { id: r.id, agentEmail: linkEmail.trim() } }),
    onSuccess: () => { toast.success("Linked to their account"); setLinking(false); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const open = async () => {
    try { const { url } = await file({ data: { id: r.id } }); window.open(url, "_blank", "noopener"); } catch (e) { toast.error((e as Error).message); }
  };
  const active = r.status === "accepted" || r.status === "pending_review";
  const ownUpload = r.submittedBy === me;
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{r.agentName}{r.agentRelationship ? <span className="font-normal text-muted-foreground"> · {r.agentRelationship}</span> : null}</p>
          <p className="text-sm text-muted-foreground">{POA_KIND_LABELS[r.poaKind as PoaKind]}{r.durable ? ", durable" : ""} · from {fmt(r.effectiveOn)}{r.expiresOn ? ` to ${fmt(r.expiresOn)}` : ", no end date"}{r.agentEmail ? ` · ${r.agentEmail}` : ""}</p>
          <p className="text-sm">Covers: {(r.coveredPowers as string[]).map((p: string) => POA_POWER_LABELS[p as PoaPower] ?? p).join(", ")}</p>
          {r.coveredDocumentTypes.length ? <p className="text-sm text-muted-foreground">May sign: {r.coveredDocumentTypes.map((t) => SIGNABLE_DOCUMENT_LABELS[t as SignableDocumentType] ?? t).join(", ")}</p> : null}
          {r.limitsNote ? <p className="text-sm text-muted-foreground">Limits: {r.limitsNote}</p> : null}
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant={statusVariant(r.displayStatus)}>{POA_STATUS_LABELS[r.displayStatus]}</Badge>
          <Badge variant={authorityVariant(r.authority.state)}><ShieldCheck className="mr-1 h-3 w-3" />{r.authority.label}</Badge>
        </div>
      </div>
      {r.mayDo.length ? (
        <div className="rounded-md bg-muted/50 p-2">
          <p className="text-sm font-medium">What this person may do</p>
          <ul className="mt-1 space-y-0.5 text-sm">{r.mayDo.map((line, i) => <li key={i}>· {line}</li>)}</ul>
          <p className="mt-1 text-xs text-muted-foreground">{r.authority.detail}</p>
        </div>
      ) : null}
      {r.agentUserId ? (
        <p className="flex items-center gap-1 text-xs text-muted-foreground"><UserRound className="h-3 w-3" />Linked to {r.agentName2 ?? "their account"}</p>
      ) : r.status === "accepted" ? (
        <div className="rounded-md border border-dashed p-2">
          <p className="text-sm">We haven't matched {r.agentName} to a sign-in account yet, so nothing is open for them.</p>
          {can.link ? (
            linking ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <Input value={linkEmail} onChange={(e) => setLinkEmail(e.target.value.trim())} placeholder="Their account email" className="max-w-xs" autoComplete="off" />
                <Button size="sm" disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(linkEmail) || doLink.isPending} onClick={() => doLink.mutate()}>{doLink.isPending ? "Linking…" : "Link account"}</Button>
                <Button size="sm" variant="ghost" onClick={() => setLinking(false)}>Cancel</Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" className="mt-2" onClick={() => setLinking(true)}>Link their account</Button>
            )
          ) : null}
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Added by {r.submittedByName ?? "a team member"} on {fmt(r.createdAt)}
        {r.reviewedAt ? ` · ${r.status === "rejected" ? "not accepted" : "reviewed"} by ${r.reviewedByName} on ${fmt(r.reviewedAt)}` : ""}
        {r.revokedAt ? ` · revoked ${fmt(r.revokedAt)}: ${r.revokeReason}` : ""}
      </p>
      {r.status === "rejected" && r.reviewNote ? <p className="text-sm text-destructive">Reason: {r.reviewNote}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => void open()}><Download className="mr-1 h-4 w-4" />Open {r.fileName}</Button>
        {can.review && r.status === "pending_review" && !ownUpload ? <>
          <Button size="sm" disabled={act.isPending} onClick={() => act.mutate("accept")}>Accept</Button>
          <Button size="sm" variant="outline" onClick={() => setMode("reject")}>Not accepted</Button>
        </> : null}
        {can.review && r.status === "pending_review" && ownUpload ? <span className="self-center text-xs text-muted-foreground">Another Harmonious reviewer needs to accept this, since you added it.</span> : null}
        {can.add && active ? <Button size="sm" variant="outline" onClick={onReplace}>Upload a replacement</Button> : null}
        {can.revoke && active ? <Button size="sm" variant="ghost" onClick={() => setMode("revoke")}>Revoke</Button> : null}
      </div>
      {mode ? (
        <div className="space-y-2 rounded-md bg-muted/50 p-2">
          <Label htmlFor={`poa-note-${r.id}`}>{mode === "reject" ? "Why can't it be accepted?" : "Why is it being revoked?"}</Label>
          <Textarea id={`poa-note-${r.id}`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
          <div className="flex gap-2">
            <Button size="sm" variant={mode === "revoke" ? "destructive" : "default"} disabled={!note.trim() || act.isPending} onClick={() => act.mutate(mode)}>{mode === "reject" ? "Save as not accepted" : "Revoke now"}</Button>
            <Button size="sm" variant="ghost" onClick={() => { setMode(null); setNote(""); }}>Cancel</Button>
          </div>
        </div>
      ) : null}
      {r.history.length ? (
        <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">History</summary>
          <ul className="mt-1 space-y-0.5">{r.history.map((h, i) => <li key={i}>{new Date(h.at).toLocaleString()} · {h.event} by {h.by ?? "someone"}{h.note ? `: ${h.note}` : ""}</li>)}</ul>
        </details>
      ) : null}
    </div>
  );
}

function AddPoaDialog({ subject, replacesId, onClose, onSaved }: { subject: Subject; replacesId: string | null; onClose: () => void; onSaved: () => void }) {
  const start = useServerFn(startPoaUploadFn);
  const submit = useServerFn(submitPowerOfAttorneyFn);
  const [agentName, setAgentName] = useState("");
  const [agentEmail, setAgentEmail] = useState("");
  const [agentRelationship, setAgentRelationship] = useState("");
  const [poaKind, setPoaKind] = useState<PoaKind>("general");
  const [durable, setDurable] = useState(false);
  const [powers, setPowers] = useState<PoaPower[]>([]);
  const [docTypes, setDocTypes] = useState<SignableDocumentType[]>([]);
  const [limitsNote, setLimitsNote] = useState("");
  const [effectiveOn, setEffectiveOn] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const input = { agentName, agentEmail: agentEmail || null, poaKind, coveredPowers: powers, limitsNote: limitsNote || null, effectiveOn, expiresOn: expiresOn || null };
  const blocker = poaInputBlocker(input)
    ?? (powers.includes("sign_documents") && docTypes.length === 0 ? "Say which document types the power of attorney lets them sign." : null)
    ?? (file ? null : "Choose the signed power of attorney file.");
  const save = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose the signed power of attorney file.");
      const t = await start({ data: { subject, fileName: file.name } });
      const up = await supabase.storage.from("power-of-attorney").uploadToSignedUrl(t.path, t.token, file, { contentType: file.type || "application/octet-stream" });
      if (up.error) throw new Error("The file couldn't be uploaded. Please try again.");
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const documentHash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
      return submit({ data: { subject, ...input, agentRelationship: agentRelationship || null, durable, coveredDocumentTypes: docTypes, fileName: file.name, storagePath: t.path, documentHash, replacesId } });
    },
    onSuccess: () => { toast.success("Saved. Harmonious will review it."); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{replacesId ? "Upload a replacement power of attorney" : "Add a power of attorney"}</DialogTitle>
          <DialogDescription>Upload the signed document and tell us who it names. Harmonious reviews it before it shows as accepted. Once accepted, the person named can do what the document lists.{replacesId ? " It then replaces the earlier one." : ""}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label htmlFor="poa-file">Signed document</Label><Input id="poa-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /><p className="text-xs text-muted-foreground">Kept private. Opening it is logged.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2"><Label htmlFor="poa-agent">Person it names (full legal name)</Label><Input id="poa-agent" value={agentName} onChange={(e) => setAgentName(e.target.value)} maxLength={200} autoComplete="off" /></div>
            <div className="space-y-1"><Label htmlFor="poa-email">Their email (optional)</Label><Input id="poa-email" type="email" value={agentEmail} onChange={(e) => setAgentEmail(e.target.value.trim())} maxLength={320} autoComplete="off" /></div>
            <div className="space-y-1"><Label htmlFor="poa-rel">Relationship (optional)</Label><Input id="poa-rel" value={agentRelationship} onChange={(e) => setAgentRelationship(e.target.value)} placeholder="For example spouse or attorney" maxLength={80} autoComplete="off" /></div>
            <div className="space-y-1"><Label>Type</Label>
              <Select value={poaKind} onValueChange={(v) => setPoaKind(v as PoaKind)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(Object.keys(POA_KIND_LABELS) as PoaKind[]).map((k) => <SelectItem key={k} value={k}>{POA_KIND_LABELS[k]}</SelectItem>)}</SelectContent></Select></div>
            <Label className="flex items-center gap-2 self-end pb-2 font-normal"><Switch checked={durable} onCheckedChange={setDurable} />Durable (stays in effect if they become incapacitated)</Label>
            <div className="space-y-1"><Label htmlFor="poa-from">Takes effect</Label><Input id="poa-from" type="date" value={effectiveOn} onChange={(e) => setEffectiveOn(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="poa-to">Ends (leave blank if no end date)</Label><Input id="poa-to" type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} /></div>
          </div>
          <div><p className="text-sm font-medium">What the document says it covers</p>
            <p className="text-xs text-muted-foreground">Only these open for that person, and only after Harmonious accepts the document.</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">{POA_POWERS.map((p) => (
              <label key={p} className="flex items-center gap-2 text-sm"><Checkbox checked={powers.includes(p)} onCheckedChange={(c) => setPowers((prev) => (c ? [...prev, p] : prev.filter((x) => x !== p)))} />{POA_POWER_LABELS[p]}</label>
            ))}</div>
          </div>
          {powers.includes("sign_documents") ? (
            <div><p className="text-sm font-medium">Which documents may they sign?</p>
              <p className="text-xs text-muted-foreground">Choose only what the power of attorney names. Each signature still needs a fresh identity check.</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">{SIGNABLE_DOCUMENT_TYPES.map((t) => (
                <label key={t} className="flex items-center gap-2 text-sm"><Checkbox checked={docTypes.includes(t)} onCheckedChange={(c) => setDocTypes((prev) => (c ? [...prev, t] : prev.filter((x) => x !== t)))} />{SIGNABLE_DOCUMENT_LABELS[t]}</label>
              ))}</div>
            </div>
          ) : null}
          <div className="space-y-1"><Label htmlFor="poa-limits">Limits or other powers {poaKind === "limited" || powers.includes("other") ? "" : "(optional)"}</Label><Textarea id="poa-limits" value={limitsNote} onChange={(e) => setLimitsNote(e.target.value)} maxLength={1000} placeholder="For example: only for the Erebor subscription" /></div>
        </div>
        <DialogFooter className="gap-2">
          {blocker ? <p className="mr-auto self-center text-xs text-muted-foreground">{blocker}</p> : null}
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!!blocker || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save for review"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Investor 360: one card per investing profile the account owns (staff only). */
export function InvestorPowersOfAttorney({ investorUserId }: { investorUserId: string }) {
  const load = useServerFn(investorProfilesForPoaFn);
  const q = useQuery({ queryKey: ["poa-profiles", investorUserId], queryFn: () => load({ data: { investorUserId } }), retry: false });
  if (q.error || !q.data?.length) return null;
  return <div className="space-y-3">{q.data.map((p) => <PowerOfAttorneyCard key={p.id} subject={{ kind: "investment_profile", id: p.id }} title={q.data.length > 1 ? `Power of attorney · ${p.label}` : "Power of attorney"} />)}</div>;
}
