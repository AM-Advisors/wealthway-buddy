import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  getClientFoundations, markClientFoundationReady, openClientFoundationDocument, requestClientFoundationPerson,
  submitClientFoundationFacts, uploadClientFoundationDocument, withdrawClientFoundationSubmission,
} from "@/lib/foundation-onboarding.functions";
import { AUTHORITY_ROLES, CLASSIFICATIONS, EXEMPTION_STATUSES, LEGAL_STRUCTURES } from "@/lib/foundation-admin-model";
import type { ChecklistStatus } from "@/lib/foundation-onboarding-model";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOC_KINDS = { governing_document: "Governing document (articles, bylaws or trust instrument)", determination_letter: "IRS determination letter", authority_evidence: "Board resolution or other proof of authority", supporting_evidence: "Other supporting document, such as the IRS EIN letter" } as const;
const CHECK: Record<ChecklistStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  done: { label: "Done", variant: "default" }, in_review: { label: "With Harmonious", variant: "secondary" }, needed: { label: "Needed", variant: "outline" }, correction: { label: "Needs a fix", variant: "destructive" },
};
const VSTATUS: Record<string, string> = { satisfied: "Done", in_review: "In progress", missing: "Needed", exception: "In progress" };
const SUB: Record<string, string> = { submitted: "With Harmonious", accepted: "Accepted", correction_requested: "Needs a fix", withdrawn: "Withdrawn" };
const errMsg = (e: unknown) => toast.error((e as Error).message);
const label = <T extends Record<string, string>>(o: T, k: string | null | undefined) => (k && k in o ? o[k as keyof T] : "Not recorded");

/** Client members: fill in foundation details, upload documents, name people and send for review. Harmonious reviews everything. */
export function FoundationClientOnboarding() {
  const loadFn = useServerFn(getClientFoundations);
  const q = useQuery({ queryKey: ["client-foundations"], queryFn: () => loadFn() });
  if (q.isPending) return <Skeleton className="h-48 w-full" />;
  if (q.error) return <p className="text-base text-destructive">{(q.error as Error).message}</p>;
  const d = q.data as any;
  if (!d.available) return <p className="text-base text-muted-foreground">Foundation onboarding isn't available yet.</p>;
  if (!d.foundations.length) return <p className="text-base text-muted-foreground">There's no foundation set up for your organization yet. Harmonious sets it up first, then you can add the details here.</p>;
  return <div className="space-y-8">{d.foundations.map((f: any) => <ClientFoundation key={f.profileId} f={f} />)}</div>;
}

function ClientFoundation({ f }: { f: any }) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["client-foundations"] });
  const readyFn = useServerFn(markClientFoundationReady);
  const withdrawFn = useServerFn(withdrawClientFoundationSubmission);
  const ready = useMutation({ mutationFn: () => readyFn({ data: { profileId: f.profileId } }), onSuccess: () => { toast.success("Sent to Harmonious for review"); refresh(); }, onError: errMsg });
  const withdraw = useMutation({ mutationFn: (submissionId: string) => withdrawFn({ data: { submissionId } }), onSuccess: () => { toast.success("Withdrawn"); refresh(); }, onError: errMsg });
  const next = (f.checklist as any[]).find((c) => c.status === "correction") ?? (f.checklist as any[]).find((c) => c.status === "needed");
  const waiting = (f.submissions as any[]).some((s) => s.kind === "ready_for_review" && s.status === "submitted");
  return (
    <section className="space-y-5">
      <header>
        <h2 className="text-2xl font-semibold">{f.name}</h2>
        <p className="text-base text-muted-foreground">{f.jurisdiction ?? "Jurisdiction not recorded"}{f.formationDate ? ` · formed ${f.formationDate}` : ""}{f.einMasked ? ` · EIN ${f.einMasked}` : ""}</p>
      </header>

      <Card>
        <CardHeader><CardTitle className="text-xl">What's left</CardTitle>
          <CardDescription className="text-base">{next ? `Next: ${next.label}.` : waiting ? "Harmonious is reviewing what you sent." : "Everything on your list is in. Send it to Harmonious when you're ready."}</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-2">{(f.checklist as any[]).map((c) => (
            <li key={c.key} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-base">
              <span>{c.label}{c.note ? <span className="block text-sm text-muted-foreground">{c.note}</span> : null}</span>
              <Badge variant={CHECK[c.status as ChecklistStatus].variant}>{CHECK[c.status as ChecklistStatus].label}</Badge>
            </li>))}</ul>
          {f.canEdit && !waiting && <Button size="lg" disabled={ready.isPending} onClick={() => { if (window.confirm("Send everything to Harmonious for review? You can still add documents afterwards.")) ready.mutate(); }}>Send to Harmonious for review</Button>}
          {!f.canEdit && <p className="text-sm text-muted-foreground">Your access is view-only. Ask someone who manages your organization to make changes.</p>}
        </CardContent>
      </Card>

      {f.canEdit && <Details f={f} onDone={refresh} />}
      <Documents f={f} onDone={refresh} />
      <People f={f} onDone={refresh} />

      <Card>
        <CardHeader><CardTitle className="text-xl">Checks Harmonious runs</CardTitle>
          <CardDescription className="text-base">Harmonious checks the foundation and the people who act for it. Nothing is approved automatically.</CardDescription></CardHeader>
        <CardContent><ul className="space-y-2">{(f.verification as any[]).map((v) => (
          <li key={v.key} className="rounded-md border p-3 text-base"><div className="flex flex-wrap items-center justify-between gap-2"><span>{v.label}</span><Badge variant={v.status === "satisfied" ? "default" : "outline"}>{VSTATUS[v.status]}</Badge></div>
            {v.items.length > 0 && <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">{v.items.map((i: string) => <li key={i}>{i}</li>)}</ul>}</li>))}</ul></CardContent>
      </Card>

      {(f.submissions as any[]).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-xl">What you sent</CardTitle></CardHeader>
          <CardContent><ul className="space-y-2">{(f.submissions as any[]).map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-base">
              <span>{s.summary}<span className="block text-sm text-muted-foreground">Sent {new Date(s.submittedAt).toLocaleDateString()}{s.note ? ` · Harmonious: ${s.note}` : ""}</span></span>
              <span className="flex items-center gap-2"><Badge variant={s.status === "correction_requested" ? "destructive" : "outline"}>{SUB[s.status]}</Badge>
                {s.mine && s.status === "submitted" && <Button size="sm" variant="ghost" onClick={() => { if (window.confirm("Withdraw this?")) withdraw.mutate(s.id); }}>Withdraw</Button>}</span>
            </li>))}</ul></CardContent>
        </Card>)}
    </section>
  );
}

function Details({ f, onDone }: { f: any; onDone: () => void }) {
  const fn = useServerFn(submitClientFoundationFacts);
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Record<string, any>>({ ...f.facts });
  const m = useMutation({ mutationFn: () => fn({ data: { profileId: f.profileId, facts: { ...v, fiscal_year_end_month: v["fiscal_year_end_month"] ? Number(v["fiscal_year_end_month"]) : null, legal_structure_other: v["legal_structure_other"] || null, mission: v["mission"] || null, exemption_effective_on: v["exemption_effective_on"] || null, determination_letter_on: v["determination_letter_on"] || null } } }), onSuccess: () => { toast.success("Sent to Harmonious for review"); setOpen(false); onDone(); }, onError: errMsg });
  const pick = (k: string, opts: Record<string, string>, aria: string) => (
    <Select value={v[k] ?? ""} onValueChange={(x) => setV({ ...v, [k]: x })}><SelectTrigger aria-label={aria}><SelectValue /></SelectTrigger>
      <SelectContent>{Object.entries(opts).map(([key, l]) => <SelectItem key={key} value={key}>{l}</SelectItem>)}</SelectContent></Select>
  );
  return (
    <Card>
      <CardHeader><CardTitle className="text-xl">Foundation details</CardTitle>
        <CardDescription className="text-base">Changes go to Harmonious for review. The details on record stay the same until Harmonious accepts them.</CardDescription></CardHeader>
      <CardContent className="space-y-4 text-base">
        {!open ? <>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <div><dt className="text-sm text-muted-foreground">Legal structure</dt><dd>{label(LEGAL_STRUCTURES, f.facts.legal_structure)}{f.facts.legal_structure_other ? ` (${f.facts.legal_structure_other})` : ""}</dd></div>
            <div><dt className="text-sm text-muted-foreground">Charitable classification</dt><dd>{label(CLASSIFICATIONS, f.facts.classification)}</dd></div>
            <div><dt className="text-sm text-muted-foreground">Tax exemption</dt><dd>{label(EXEMPTION_STATUSES, f.facts.exemption_status)}</dd></div>
            <div><dt className="text-sm text-muted-foreground">Fiscal year ends</dt><dd>{f.facts.fiscal_year_end_month ? MONTHS[f.facts.fiscal_year_end_month - 1] : "Not recorded"}</dd></div>
            <div className="sm:col-span-2"><dt className="text-sm text-muted-foreground">Mission</dt><dd className="whitespace-pre-wrap">{f.facts.mission ?? "Not recorded"}</dd></div>
          </dl>
          <Button variant="outline" size="lg" onClick={() => { setV({ ...f.facts }); setOpen(true); }}>Suggest changes</Button>
        </> : <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>Legal structure</Label>{pick("legal_structure", LEGAL_STRUCTURES, "Legal structure")}</div>
            {v["legal_structure"] === "other" && <div className="space-y-1"><Label htmlFor="cf-lso">Describe the structure</Label><Input id="cf-lso" value={v["legal_structure_other"] ?? ""} onChange={(e) => setV({ ...v, legal_structure_other: e.target.value })} /></div>}
            <div className="space-y-1"><Label>Charitable classification</Label>{pick("classification", CLASSIFICATIONS, "Charitable classification")}</div>
            <div className="space-y-1"><Label>Tax exemption</Label>{pick("exemption_status", EXEMPTION_STATUSES, "Tax exemption")}</div>
            <div className="space-y-1"><Label htmlFor="cf-dl">Determination letter date</Label><Input id="cf-dl" type="date" value={v["determination_letter_on"] ?? ""} onChange={(e) => setV({ ...v, determination_letter_on: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="cf-ee">Exemption effective date</Label><Input id="cf-ee" type="date" value={v["exemption_effective_on"] ?? ""} onChange={(e) => setV({ ...v, exemption_effective_on: e.target.value })} /></div>
            <div className="space-y-1"><Label>Fiscal year ends</Label>
              <Select value={v["fiscal_year_end_month"] ? String(v["fiscal_year_end_month"]) : ""} onValueChange={(x) => setV({ ...v, fiscal_year_end_month: x })}><SelectTrigger aria-label="Fiscal year end month"><SelectValue placeholder="Choose a month" /></SelectTrigger>
                <SelectContent>{MONTHS.map((mo, i) => <SelectItem key={mo} value={String(i + 1)}>{mo}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1 sm:col-span-2"><Label htmlFor="cf-mission">Mission</Label><Textarea id="cf-mission" rows={3} value={v["mission"] ?? ""} onChange={(e) => setV({ ...v, mission: e.target.value })} /></div>
          </div>
          <div className="flex gap-2"><Button size="lg" disabled={m.isPending} onClick={() => m.mutate()}>Send changes for review</Button><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></div>
        </>}
      </CardContent>
    </Card>
  );
}

function Documents({ f, onDone }: { f: any; onDone: () => void }) {
  const upFn = useServerFn(uploadClientFoundationDocument);
  const openFn = useServerFn(openClientFoundationDocument);
  const [kind, setKind] = useState<keyof typeof DOC_KINDS>("governing_document");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const current = (f.documents as any[]).filter((d) => !d.superseded);
  const up = useMutation({
    mutationFn: async (replacesId: string | null) => {
      if (!file) throw new Error("Choose a file.");
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return upFn({ data: { profileId: f.profileId, kind, title: title || file.name, fileName: file.name, mimeType: file.type || "application/pdf", base64: btoa(bin), replacesId } });
    },
    onSuccess: () => { toast.success("Uploaded. Harmonious will review it."); setFile(null); setTitle(""); onDone(); },
    onError: errMsg,
  });
  const open = async (id: string) => { try { const r = await openFn({ data: { documentId: id } }); window.open(r.url, "_blank", "noopener"); } catch (e) { errMsg(e); } };
  const fix = current.find((d) => d.mine && d.review === "correction_requested");
  return (
    <Card>
      <CardHeader><CardTitle className="text-xl">Documents</CardTitle>
        <CardDescription className="text-base">Private to your organization and Harmonious. Replacing a document keeps the earlier copy.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        {current.length ? <ul className="space-y-2">{current.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-base">
            <span>{d.title}<span className="block text-sm text-muted-foreground">{label(DOC_KINDS, d.kind)} · {new Date(d.uploadedAt).toLocaleDateString()}{d.reviewNote ? ` · Harmonious: ${d.reviewNote}` : ""}</span></span>
            <span className="flex items-center gap-2"><Badge variant={d.source === "staff" || d.review === "accepted" ? "default" : d.review === "correction_requested" ? "destructive" : "secondary"}>{d.source === "staff" ? "On file" : d.review === "accepted" ? "Accepted" : d.review === "correction_requested" ? "Needs a fix" : "With Harmonious"}</Badge>
              <Button size="sm" variant="outline" onClick={() => open(d.id)}>Open</Button></span>
          </li>))}</ul> : <p className="text-base text-muted-foreground">No documents yet. Start with the governing documents.</p>}
        {f.canEdit && (
          <div className="space-y-3 rounded-md border p-4">
            <h3 className="text-lg font-semibold">{fix ? `Upload a corrected copy of "${fix.title}"` : "Upload a document"}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label>What is it?</Label>
                <Select value={kind} onValueChange={(x) => setKind(x as keyof typeof DOC_KINDS)}><SelectTrigger aria-label="Document type"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(DOC_KINDS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1"><Label htmlFor={`cd-title-${f.profileId}`}>Name (optional)</Label><Input id={`cd-title-${f.profileId}`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="For example, Bylaws" /></div>
            </div>
            <Input type="file" aria-label="File" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <Button size="lg" disabled={!file || up.isPending} onClick={() => up.mutate(fix ? fix.id : null)}>{fix ? "Upload corrected copy" : "Upload"}</Button>
          </div>)}
      </CardContent>
    </Card>
  );
}

function People({ f, onDone }: { f: any; onDone: () => void }) {
  const fn = useServerFn(requestClientFoundationPerson);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [personId, setPersonId] = useState("");
  const [first, setFirst] = useState(""); const [last, setLast] = useState(""); const [email, setEmail] = useState("");
  const [role, setRole] = useState("director");
  const [title, setTitle] = useState("");
  const m = useMutation({
    mutationFn: () => fn({ data: { profileId: f.profileId, request: mode === "existing" ? { mode, personId, role, title: title || null } : { mode, firstName: first, lastName: last, email: email || null, role, title: title || null } } }),
    onSuccess: () => { toast.success("Sent to Harmonious"); setPersonId(""); setFirst(""); setLast(""); setEmail(""); setTitle(""); onDone(); },
    onError: errMsg,
  });
  const ok = mode === "existing" ? !!personId : first.trim() && last.trim();
  return (
    <Card>
      <CardHeader><CardTitle className="text-xl">People and authority</CardTitle>
        <CardDescription className="text-base">The directors, trustees, officers and signers on record. Being listed here doesn't give anyone a login or access, and authority is confirmed from your documents.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        {(f.authority as any[]).length ? <ul className="space-y-2">{(f.authority as any[]).map((r) => <li key={r.id} className="rounded-md border p-3 text-base">{r.name} · {label(AUTHORITY_ROLES, r.role)}{r.title ? ` (${r.title})` : ""}</li>)}</ul>
          : <p className="text-base text-muted-foreground">No one is on record yet.</p>}
        {f.canEdit && (
          <div className="space-y-3 rounded-md border p-4">
            <h3 className="text-lg font-semibold">Tell Harmonious about a person</h3>
            <div className="flex gap-2"><Button size="sm" variant={mode === "existing" ? "default" : "outline"} onClick={() => setMode("existing")}>Someone already listed</Button><Button size="sm" variant={mode === "new" ? "default" : "outline"} onClick={() => setMode("new")}>Someone new</Button></div>
            {mode === "existing" ? (
              <div className="max-w-md space-y-1"><Label>Person</Label>
                <Select value={personId} onValueChange={setPersonId}><SelectTrigger aria-label="Person"><SelectValue placeholder={(f.people as any[]).length ? "Choose a person" : "No one listed yet"} /></SelectTrigger>
                  <SelectContent>{(f.people as any[]).map((p) => <SelectItem key={p.personId} value={p.personId}>{p.name}{p.title ? ` · ${p.title}` : ""}</SelectItem>)}</SelectContent></Select></div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1"><Label htmlFor={`cp-first-${f.profileId}`}>First name</Label><Input id={`cp-first-${f.profileId}`} value={first} onChange={(e) => setFirst(e.target.value)} /></div>
                <div className="space-y-1"><Label htmlFor={`cp-last-${f.profileId}`}>Last name</Label><Input id={`cp-last-${f.profileId}`} value={last} onChange={(e) => setLast(e.target.value)} /></div>
                <div className="space-y-1"><Label htmlFor={`cp-email-${f.profileId}`}>Email (optional)</Label><Input id={`cp-email-${f.profileId}`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              </div>)}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label>Their role</Label>
                <Select value={role} onValueChange={setRole}><SelectTrigger aria-label="Role"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(AUTHORITY_ROLES).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1"><Label htmlFor={`cp-title-${f.profileId}`}>Title (optional)</Label><Input id={`cp-title-${f.profileId}`} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            </div>
            {role === "paperwork_preparer" && <p className="text-sm text-muted-foreground">A paperwork preparer can only prepare paperwork. They can't sign, approve grants or payments, or act on bank accounts.</p>}
            <Button size="lg" disabled={!ok || m.isPending} onClick={() => m.mutate()}>Send to Harmonious</Button>
          </div>)}
      </CardContent>
    </Card>
  );
}
