import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fileToBase64, fmtDate } from "@/components/fund-tabs/shared";
import { uploadFundFileFn } from "@/lib/fund-tabs.functions";
import {
  acceptFeesFn, deleteOnboardingDocFn, feeStatusFn, fundUpdatesFn, listOnboardingUploadsFn, myInvestorUpdatesFn,
  postFundUpdateFn, removeFundUpdateFn, uploadOnboardingDocFn, updateAttachmentOptionsFn, profileUploadStateFn,
} from "@/lib/investor-extras.functions";

const KINDS = [
  { value: "identification", label: "Government ID" },
  { value: "proof_of_address", label: "Proof of address" },
  { value: "accreditation_proof", label: "Accreditation proof (CPA/lawyer letter or statements)" },
  { value: "entity_formation", label: "Entity formation documents" },
  { value: "operating_agreement", label: "Operating or trust agreement" },
  { value: "ownership_list", label: "Owner list (beneficial owners)" },
  { value: "tax_form", label: "Signed W-9 or W-8" },
] as const;
type Kind = (typeof KINDS)[number]["value"];
const kindLabel = (k: string) => KINDS.find((x) => x.value === k)?.label ?? k;
const STATUS: Record<string, string> = { new: "Waiting for review", accepted: "Accepted", needs_followup: "Needs follow-up" };

export function OnboardingUploadsCard({ onboardingId }: { onboardingId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(profileUploadStateFn);
  const upload = useServerFn(uploadOnboardingDocFn);
  const key = ["onboarding-profile-documents", onboardingId];
  const q = useQuery({ queryKey: key, queryFn: () => list({ data: { onboardingId } }) });
  const [updating, setUpdating] = useState<Kind | null>(null);
  const [files, setFiles] = useState<Partial<Record<Kind, File>>>({});
  const up = useMutation({
    mutationFn: async (kind: Kind) => {
      const file = files[kind];
      if (!file) throw new Error("Choose a file first.");
      return upload({ data: { onboardingId, kind, fileName: file.name, contentType: file.type, base64: await fileToBase64(file) } });
    },
    onSuccess: () => {
      toast.success("Document saved for this profile."); setFiles({}); setUpdating(null);
      void qc.invalidateQueries({ predicate: (query) => ["onboarding-profile-documents", "onboarding", "onboard-portal", "profile-detail", "investment-readiness"].includes(String(query.queryKey[0])) });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (q.isPending) return <p className="text-sm text-muted-foreground">Loading profile documents…</p>;
  if (q.isError) return <p className="text-sm text-destructive">Your documents could not be loaded.</p>;
  if (!q.data?.profileId || !q.data.requirements.length) return null;
  const d = q.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Documents for {d.profileName}</CardTitle>
        <CardDescription>Saved with this investing profile. Previous versions remain on file.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {d.requirements.map((r) => {
          const kind = r.kind as Kind;
          const latest = d.rows.find((row) => row.kind === kind);
          const open = !r.received || updating === kind;
          return <section key={kind} className="space-y-3 border-b pb-4 last:border-0 last:pb-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium">{r.label}</h3>
              <div className="flex items-center gap-2">
                <Badge variant={r.received ? "default" : "outline"}>{r.status === "on_file" ? "On file" : r.received ? "Saved for this profile" : "Required"}</Badge>
                {r.received ? <Button variant="outline" size="sm" disabled={up.isPending} onClick={() => setUpdating(updating === kind ? null : kind)}>{updating === kind ? "Cancel" : "Update"}</Button> : null}
              </div>
            </div>
            {latest ? <p className="break-words text-xs text-muted-foreground">{latest.fileName} · {fmtDate(latest.uploadedAt)} · {STATUS[latest.status] ?? latest.status}{latest.note ? ` · ${latest.note}` : ""}</p> : null}
            {open ? <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1 space-y-1"><Label htmlFor={`profile-file-${kind}`}>File (up to 15 MB)</Label><Input key={`${kind}-${latest?.id ?? "none"}`} id={`profile-file-${kind}`} type="file" disabled={up.isPending} onChange={(e) => setFiles((prev) => ({ ...prev, [kind]: e.target.files?.[0] }))} /></div>
              <Button disabled={!files[kind] || up.isPending} onClick={() => up.mutate(kind)}>{up.isPending && up.variables === kind ? "Uploading…" : r.received ? "Save update" : "Upload"}</Button>
            </div> : null}
          </section>;
        })}
      </CardContent>
    </Card>
  );
}

/** Returns true once fees are accepted or the fund has no fees set. */
export function useFeesAccepted(onboardingId: string) {
  const status = useServerFn(feeStatusFn);
  const q = useQuery({ queryKey: ["fee-status", onboardingId], queryFn: () => status({ data: { onboardingId } }) });
  return { q, ok: !!q.data && (!q.data.terms || !!q.data.accepted) };
}

export function FeeAcceptanceCard({ onboardingId }: { onboardingId: string }) {
  const qc = useQueryClient();
  const { q } = useFeesAccepted(onboardingId);
  const accept = useServerFn(acceptFeesFn);
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const m = useMutation({
    mutationFn: () => accept({ data: { onboardingId, termsId: q.data!.terms!.id, name: name.trim() } }),
    onSuccess: () => { toast.success("Fees accepted."); qc.invalidateQueries({ queryKey: ["fee-status", onboardingId] }); },
    onError: (e: Error) => { toast.error(e.message); qc.invalidateQueries({ queryKey: ["fee-status", onboardingId] }); },
  });
  const t = q.data?.terms;
  if (!q.data || !t) return null;
  const pct = (n: number | null) => (n == null ? "None" : `${n}%`);

  return (
    <div className="space-y-3 rounded-md border p-4">
      <p className="text-sm font-medium">Fund fees</p>
      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div><dt className="text-xs text-muted-foreground">Management fee</dt><dd>{pct(t.managementFeePct)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Charged on</dt><dd>{t.basis ?? "Not stated"}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Carried interest</dt><dd>{pct(t.carryPct)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Hurdle</dt><dd>{pct(t.hurdlePct)}</dd></div>
      </dl>
      {t.notes && <p className="text-sm text-muted-foreground">{t.notes}</p>}
      {q.data.sideLetters.length > 0 && <p className="text-sm">Your side letter terms also apply: {q.data.sideLetters.join("; ")}.</p>}
      {q.data.accepted ? (
        <p className="text-sm text-muted-foreground">Accepted by {q.data.accepted.name} on {fmtDate(q.data.accepted.at)}.</p>
      ) : (
        <div className="space-y-2">
          <label className="flex items-start gap-2 text-sm"><Checkbox checked={agree} onCheckedChange={(v) => setAgree(v === true)} />I've reviewed these fees and accept them. The fund documents I sign are the final terms.</label>
          <div className="max-w-sm"><Label htmlFor="fee-name">Your full name</Label><Input id="fee-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <Button disabled={!agree || name.trim().length < 2 || m.isPending} onClick={() => m.mutate()}>Accept fees</Button>
        </div>
      )}
    </div>
  );
}

export function InvestorUpdatesCard() {
  const load = useServerFn(myInvestorUpdatesFn);
  const q = useQuery({ queryKey: ["investor-updates"], queryFn: () => load() });
  if (!q.data || q.data.funds.length === 0) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Updates on your investments</CardTitle></CardHeader>
        <CardContent>
          {q.data.updates.length === 0 ? <p className="text-sm text-muted-foreground">No updates yet. Your fund managers' updates will appear here.</p> : (
            <ul className="space-y-4">
              {q.data.updates.map((u) => (
                <li key={u.id} className="border-b pb-3 last:border-0">
                  <p className="text-xs text-muted-foreground">{u.fundName} · {fmtDate(u.postedAt)}</p>
                  <p className="font-medium">{u.title}</p>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{u.body}</p>
                  {u.file || u.asset ? (
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {u.file ? (u.file.url ? <a className="rounded-md border px-2 py-1 underline-offset-2 hover:underline" href={u.file.url} target="_blank" rel="noreferrer">Document: {u.file.name}</a> : <span className="rounded-md border px-2 py-1">Document: {u.file.name}</span>) : null}
                  {u.asset ? <span className="rounded-md border px-2 py-1">Asset: {u.asset.name}</span> : null}
                </div>
              ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Deal rooms</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {q.data.funds.map((f) => (
            <div key={f.fundId} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{f.fundName}</span>
              {f.hasDealRoom
                ? <Button size="sm" variant="outline" asChild><Link to="/my-portfolio/$offeringId" params={{ offeringId: f.fundId }} search={{ tab: "deal-room" }}>Open</Link></Button>
                : <span className="text-xs text-muted-foreground">Not opened yet</span>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export function FundUpdatesPanel({ fundId }: { fundId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(fundUpdatesFn);
  const post = useServerFn(postFundUpdateFn);
  const remove = useServerFn(removeFundUpdateFn);
  const key = ["fund-investor-updates", fundId];
  const q = useQuery({ queryKey: key, queryFn: () => list({ data: { fundId } }) });
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const opts = useServerFn(updateAttachmentOptionsFn);
  const upload = useServerFn(uploadFundFileFn);
  const optKey = ["fund-update-attach", fundId];
  const oq = useQuery({ queryKey: optKey, queryFn: () => opts({ data: { fundId } }) });
  const [fileId, setFileId] = useState("none");
  const [assetId, setAssetId] = useState("none");
  const [uploading, setUploading] = useState(false);
  const onUpload = async (f: File | undefined) => {
    if (!f) return;
    setUploading(true);
    try {
      const r = await upload({ data: { fundId, title: f.name, category: "investor_update", fileName: f.name, contentType: f.type, base64: await fileToBase64(f) } });
      await qc.invalidateQueries({ queryKey: optKey });
      setFileId(r.id);
      toast.success("Document attached.");
    } catch (e) { toast.error((e as Error).message); } finally { setUploading(false); }
  };
  const send = useMutation({
    mutationFn: () => post({ data: { fundId, title: title.trim(), body: body.trim(), fileId: fileId === "none" ? null : fileId, assetId: assetId === "none" ? null : assetId } }),
    onSuccess: () => { toast.success("Update posted to investors."); setTitle(""); setBody(""); setFileId("none"); setAssetId("none"); qc.invalidateQueries({ queryKey: key }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const rm = useMutation({ mutationFn: (id: string) => remove({ data: { fundId, id } }), onSuccess: () => qc.invalidateQueries({ queryKey: key }) });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Investor updates</CardTitle>
        <CardDescription>Posts show on every investor's dashboard for this fund. No email is sent.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Textarea placeholder="What's new with the investment?" value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Attach a document (optional)</Label>
            <Select value={fileId} onValueChange={setFileId}>
              <SelectTrigger><SelectValue placeholder="No document" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No document</SelectItem>
                {(oq.data?.files ?? []).map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="file" disabled={uploading} onChange={(e) => { void onUpload(e.target.files?.[0]); e.target.value = ""; }} />
            <p className="text-xs text-muted-foreground">{uploading ? "Uploading…" : "Pick a fund document or upload a new one (20 MB max)."}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Reference an asset (optional)</Label>
            <Select value={assetId} onValueChange={setAssetId}>
              <SelectTrigger><SelectValue placeholder="No asset" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No asset</SelectItem>
                {(oq.data?.assets ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Investors see the asset's name only — no cost or value.</p>
          </div>
        </div>
        <Button disabled={title.trim().length < 2 || body.trim().length < 2 || send.isPending} onClick={() => send.mutate()}>Post update</Button>
        <ul className="space-y-3">
          {(q.data ?? []).map((u) => (
            <li key={u.id} className="rounded-md border p-3 text-sm">
              <div className="flex items-start justify-between gap-2"><div><p className="font-medium">{u.title}</p><p className="text-xs text-muted-foreground">{fmtDate(u.postedAt)}</p></div>
                <Button size="sm" variant="ghost" onClick={() => rm.mutate(u.id)}>Remove</Button></div>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{u.body}</p>
              {u.file || u.asset ? (
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {u.file ? (u.file.url ? <a className="rounded-md border px-2 py-1 underline-offset-2 hover:underline" href={u.file.url} target="_blank" rel="noreferrer">Document: {u.file.name}</a> : <span className="rounded-md border px-2 py-1">Document: {u.file.name}</span>) : null}
                  {u.asset ? <span className="rounded-md border px-2 py-1">Asset: {u.asset.name}</span> : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
