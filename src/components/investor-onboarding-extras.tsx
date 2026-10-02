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
import {
  acceptFeesFn, deleteOnboardingDocFn, feeStatusFn, fundUpdatesFn, listOnboardingUploadsFn, myInvestorUpdatesFn,
  postFundUpdateFn, removeFundUpdateFn, uploadOnboardingDocFn,
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
  const list = useServerFn(listOnboardingUploadsFn);
  const upload = useServerFn(uploadOnboardingDocFn);
  const del = useServerFn(deleteOnboardingDocFn);
  const key = ["onboarding-uploads", onboardingId];
  const q = useQuery({ queryKey: key, queryFn: () => list({ data: { onboardingId } }) });
  const [kind, setKind] = useState<Kind>("identification");
  const [file, setFile] = useState<File | null>(null);
  const up = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a file first.");
      return upload({ data: { onboardingId, kind, fileName: file.name, contentType: file.type, base64: await fileToBase64(file) } });
    },
    onSuccess: () => { toast.success("File uploaded."); setFile(null); qc.invalidateQueries({ queryKey: key }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const rm = useMutation({
    mutationFn: (id: string) => del({ data: { onboardingId, id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e: Error) => toast.error(e.message),
  });
  const rows = q.data ?? [];
  const have = new Set(rows.map((r) => r.kind));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Your documents</CardTitle>
        <CardDescription>Upload what applies to you. Companies and trusts also add formation documents, the operating or trust agreement and an owner list. Files stay private to you and Harmonious.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => <Badge key={k.value} variant={have.has(k.value) ? "default" : "outline"}>{have.has(k.value) ? "✓ " : ""}{k.label}</Badge>)}
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div><Label>Document type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label htmlFor="ob-file">File (up to 15 MB)</Label><Input id="ob-file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
          <Button disabled={!file || up.isPending} onClick={() => up.mutate()}>{up.isPending ? "Uploading..." : "Upload"}</Button>
        </div>
        {rows.length > 0 && (
          <ul className="divide-y rounded-md border text-sm">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="min-w-0"><p className="truncate font-medium">{r.fileName}</p><p className="text-xs text-muted-foreground">{kindLabel(r.kind)} · {fmtDate(r.uploadedAt)}{r.note ? ` · ${r.note}` : ""}</p></div>
                <div className="flex items-center gap-2">
                  <Badge variant={r.status === "accepted" ? "default" : "outline"}>{STATUS[r.status] ?? r.status}</Badge>
                  {r.canDelete && <Button size="sm" variant="ghost" disabled={rm.isPending} onClick={() => rm.mutate(r.id)}>Remove</Button>}
                </div>
              </li>
            ))}
          </ul>
        )}
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
                ? <Button size="sm" variant="outline" asChild><Link to="/diligence/$offeringId" params={{ offeringId: f.fundId }}>Open</Link></Button>
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
  const send = useMutation({
    mutationFn: () => post({ data: { fundId, title: title.trim(), body: body.trim() } }),
    onSuccess: () => { toast.success("Update posted to investors."); setTitle(""); setBody(""); qc.invalidateQueries({ queryKey: key }); },
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
        <Button disabled={title.trim().length < 2 || body.trim().length < 2 || send.isPending} onClick={() => send.mutate()}>Post update</Button>
        <ul className="space-y-3">
          {(q.data ?? []).map((u) => (
            <li key={u.id} className="rounded-md border p-3 text-sm">
              <div className="flex items-start justify-between gap-2"><div><p className="font-medium">{u.title}</p><p className="text-xs text-muted-foreground">{fmtDate(u.postedAt)}</p></div>
                <Button size="sm" variant="ghost" onClick={() => rm.mutate(u.id)}>Remove</Button></div>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{u.body}</p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
