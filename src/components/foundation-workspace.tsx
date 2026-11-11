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
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  addFoundationAuthority, endFoundationAuthority, getFoundationWorkspace, openFoundationDocument, saveFoundationProfile,
  startFoundationHandoff, storeFoundationTaxId, uploadFoundationDocument,
} from "@/lib/foundation-admin.functions";
import {
  AUTHORITY_ROLES, AUTHORITY_SCOPES, CLASSIFICATIONS, EXEMPTION_STATUSES, FOUNDATION_COMPONENTS, FOUNDATION_ROLE_DISCLAIMER,
  LEGAL_STRUCTURES, RETAINED_RESPONSIBILITIES, authorityProblem, type AuthorityScope, type ComponentKey,
} from "@/lib/foundation-admin-model";
import { money } from "@/components/sales/sales-ui";
import { FoundationReleaseControls, FoundationReviewPanel, FoundationSwitches, FoundationVerificationPanel } from "@/components/foundation-review-panels";
import { FundPersonPicker, type PickPerson } from "@/components/fund-person-picker";
import { ReviewStateBadge } from "@/components/admin-review";
import { foundationDocumentState, personPickState, taskStatusLabel } from "@/lib/admin-review-framework";

/** Client people in the shared person picker, with the canonical person-record ID check (never the sign-in check). */
const pickPeople = (people: any[]): PickPerson[] => people.map((p) => { const v = personPickState(p.kyc_status, p.aml_status); return { key: p.personId, name: p.name, email: p.email ?? null, detail: [p.title, p.email, v.detail].filter(Boolean).join(" · "), source: "Client person", kyc: v.kyc, hasAccount: !!p.hasAccount }; });

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOC_KINDS = { governing_document: "Governing document", determination_letter: "Determination letter", authority_evidence: "Authority evidence", supporting_evidence: "Supporting evidence" } as const;
const CAPABILITY = { partial: "Partly built", not_built: "Not built yet", blocked_by_existing_gate: "Blocked until foundation accounting is validated" } as const;
const label = <T extends Record<string, string>>(o: T, k: string | null | undefined) => (k && k in o ? o[k as keyof T] : "Not recorded");
const errMsg = (e: unknown) => toast.error((e as Error).message);

/** Operations client record: Foundation Administration workspace. Every action is re-checked by the server. */
export function FoundationWorkspace({ clientId }: { clientId: string }) {
  const loadFn = useServerFn(getFoundationWorkspace);
  const q = useQuery({ queryKey: ["foundation-workspace", clientId], queryFn: () => loadFn({ data: { clientId } }) });
  if (q.isPending) return <Skeleton className="h-40 w-full" />;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const d = q.data as any;
  return (
    <div className="space-y-6">
      <FoundationSwitches flags={d.flags} canToggle={d.canToggle} />
      {d.enabled && <>
        <FoundationReleaseControls />
        {d.canEdit && <ProfileForm clientId={clientId} entities={d.entities.filter((e: any) => e.eligible && !e.hasProfile)} people={d.people} />}
        {!d.foundations.length && <p className="text-base text-muted-foreground">No foundation is set up for this client yet.</p>}
        {d.foundations.map((f: any) => <FoundationCard key={f.profile.id} clientId={clientId} f={f} people={d.people} canEdit={d.canEdit} />)}
      </>}
    </div>
  );
}

type ProfileDraft = { legalStructure: string; legalStructureOther: string; classification: string; exemptionStatus: string; exemptionEffectiveOn: string; determinationLetterOn: string; fiscalYearEndMonth: string; mission: string; primaryContactPersonId: string };
const blankDraft: ProfileDraft = { legalStructure: "nonprofit_corporation", legalStructureOther: "", classification: "unknown", exemptionStatus: "unknown", exemptionEffectiveOn: "", determinationLetterOn: "", fiscalYearEndMonth: "12", mission: "", primaryContactPersonId: "" };

function ProfileFields({ v, set, people }: { v: ProfileDraft; set: (v: ProfileDraft) => void; people: any[] }) {
  const pick = (k: keyof ProfileDraft, opts: Record<string, string>, aria: string) => (
    <Select value={v[k]} onValueChange={(x) => set({ ...v, [k]: x })}><SelectTrigger aria-label={aria}><SelectValue /></SelectTrigger>
      <SelectContent>{Object.entries(opts).map(([key, l]) => <SelectItem key={key} value={key}>{l}</SelectItem>)}</SelectContent></Select>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="space-y-1"><Label>Legal structure</Label>{pick("legalStructure", LEGAL_STRUCTURES, "Legal structure")}</div>
      {v.legalStructure === "other" && <div className="space-y-1"><Label htmlFor="fa-lso">Describe the structure</Label><Input id="fa-lso" value={v.legalStructureOther} onChange={(e) => set({ ...v, legalStructureOther: e.target.value })} /></div>}
      <div className="space-y-1"><Label>Charitable classification</Label>{pick("classification", CLASSIFICATIONS, "Charitable classification")}</div>
      <div className="space-y-1"><Label>Tax exemption</Label>{pick("exemptionStatus", EXEMPTION_STATUSES, "Tax exemption status")}</div>
      <div className="space-y-1"><Label htmlFor="fa-dl">Determination letter date</Label><Input id="fa-dl" type="date" value={v.determinationLetterOn} onChange={(e) => set({ ...v, determinationLetterOn: e.target.value })} /></div>
      <div className="space-y-1"><Label htmlFor="fa-ee">Exemption effective date</Label><Input id="fa-ee" type="date" value={v.exemptionEffectiveOn} onChange={(e) => set({ ...v, exemptionEffectiveOn: e.target.value })} /></div>
      <div className="space-y-1"><Label>Fiscal year ends</Label>
        <Select value={v.fiscalYearEndMonth} onValueChange={(x) => set({ ...v, fiscalYearEndMonth: x })}><SelectTrigger aria-label="Fiscal year end month"><SelectValue /></SelectTrigger>
          <SelectContent>{MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1"><Label>Primary contact</Label>
        <FundPersonPicker people={pickPeople(people)} value={v.primaryContactPersonId} onChange={(x) => set({ ...v, primaryContactPersonId: x })} empty="This client has no people linked to a person record yet." /></div>
      <div className="space-y-1 sm:col-span-3"><Label htmlFor="fa-mission">Mission</Label><Textarea id="fa-mission" rows={3} value={v.mission} onChange={(e) => set({ ...v, mission: e.target.value })} /></div>
    </div>
  );
}

const toInput = (clientId: string, entityId: string, v: ProfileDraft, id?: string) => ({
  id: id ?? null, clientId, clientEntityId: entityId, legalStructure: v.legalStructure as any, legalStructureOther: v.legalStructureOther || null,
  classification: v.classification as any, exemptionStatus: v.exemptionStatus as any, exemptionEffectiveOn: v.exemptionEffectiveOn || null,
  determinationLetterOn: v.determinationLetterOn || null, fiscalYearEndMonth: v.fiscalYearEndMonth ? Number(v.fiscalYearEndMonth) : null,
  mission: v.mission || null, primaryContactPersonId: v.primaryContactPersonId || null,
});

function ProfileForm({ clientId, entities, people }: { clientId: string; entities: any[]; people: any[] }) {
  const qc = useQueryClient();
  const fn = useServerFn(saveFoundationProfile);
  const [open, setOpen] = useState(false);
  const [entityId, setEntityId] = useState("");
  const [v, setV] = useState<ProfileDraft>(blankDraft);
  const m = useMutation({ mutationFn: () => fn({ data: toInput(clientId, entityId, v) }), onSuccess: () => { toast.success("Foundation set up"); setOpen(false); setV(blankDraft); setEntityId(""); qc.invalidateQueries({ queryKey: ["foundation-workspace", clientId] }); }, onError: errMsg });
  if (!open) return <Button size="lg" onClick={() => setOpen(true)}>Set up a foundation</Button>;
  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">Set up a foundation</CardTitle>
        <CardDescription className="text-base">Choose the client entity that is the foundation. Its legal name, jurisdiction and formation date come from that entity. A foundation that invests in a fund keeps its own investment profile; this does not create a fund.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        {entities.length ? (
          <div className="max-w-md space-y-1"><Label>Entity</Label>
            <Select value={entityId} onValueChange={setEntityId}><SelectTrigger aria-label="Entity"><SelectValue placeholder="Choose the entity" /></SelectTrigger>
              <SelectContent>{entities.map((e) => <SelectItem key={e.id} value={e.id}>{e.legal_name}{e.jurisdiction ? ` · ${e.jurisdiction}` : ""}</SelectItem>)}</SelectContent></Select></div>
        ) : <p className="text-base text-muted-foreground">No eligible entity yet. <Link to="/admin/clients/$clientId/entities" params={{ clientId }} className="underline">Add the foundation as a client entity</Link> first.</p>}
        <ProfileFields v={v} set={setV} people={people} />
        <div className="flex gap-2"><Button disabled={!entityId || m.isPending} onClick={() => m.mutate()}>Save foundation</Button><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></div>
      </CardContent>
    </Card>
  );
}

function FoundationCard({ clientId, f, people, canEdit }: { clientId: string; f: any; people: any[]; canEdit: boolean }) {
  const p = f.profile;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-xl">{f.entity?.legal_name ?? "Foundation"}</CardTitle>
          <div className="flex flex-wrap gap-1"><Badge variant="outline">{label(CLASSIFICATIONS, p.classification)}</Badge><Badge variant="outline">{label(EXEMPTION_STATUSES, p.exemption_status)}</Badge></div>
        </div>
        <CardDescription className="text-base">{label(LEGAL_STRUCTURES, p.legal_structure)}{p.legal_structure_other ? ` (${p.legal_structure_other})` : ""}{f.entity?.jurisdiction ? ` · ${f.entity.jurisdiction}` : ""}{f.entity?.formation_date ? ` · formed ${f.entity.formation_date}` : ""}</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="overview">
          <TabsList className="flex h-auto flex-wrap">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="people">People and authority</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="services">Services, quotes and agreements</TabsTrigger>
            <TabsTrigger value="tasks">Tasks and deadlines</TabsTrigger>
            <TabsTrigger value="review">Client submissions</TabsTrigger>
            <TabsTrigger value="verification">Verification</TabsTrigger>
          </TabsList>
          <TabsContent value="overview"><Overview clientId={clientId} f={f} people={people} canEdit={canEdit} /></TabsContent>
          <TabsContent value="people"><People clientId={clientId} f={f} people={people} canEdit={canEdit} /></TabsContent>
          <TabsContent value="documents"><Documents clientId={clientId} f={f} canEdit={canEdit} /></TabsContent>
          <TabsContent value="services"><Services f={f} /></TabsContent>
          <TabsContent value="tasks"><Tasks clientId={clientId} f={f} canEdit={canEdit} /></TabsContent>
          <TabsContent value="review"><FoundationReviewPanel profileId={f.profile.id} clientId={clientId} /></TabsContent>
          <TabsContent value="verification"><FoundationVerificationPanel profileId={f.profile.id} /></TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function Overview({ clientId, f, people, canEdit }: { clientId: string; f: any; people: any[]; canEdit: boolean }) {
  const p = f.profile;
  const qc = useQueryClient();
  const saveFn = useServerFn(saveFoundationProfile);
  const einFn = useServerFn(storeFoundationTaxId);
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState<ProfileDraft>({ legalStructure: p.legal_structure, legalStructureOther: p.legal_structure_other ?? "", classification: p.classification, exemptionStatus: p.exemption_status, exemptionEffectiveOn: p.exemption_effective_on ?? "", determinationLetterOn: p.determination_letter_on ?? "", fiscalYearEndMonth: p.fiscal_year_end_month ? String(p.fiscal_year_end_month) : "", mission: p.mission ?? "", primaryContactPersonId: p.primary_contact_person_id ?? "" });
  const [ein, setEin] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["foundation-workspace", clientId] });
  const save = useMutation({ mutationFn: () => saveFn({ data: toInput(clientId, p.client_entity_id, v, p.id) }), onSuccess: () => { toast.success("Saved"); setEditing(false); refresh(); }, onError: errMsg });
  const storeEin = useMutation({ mutationFn: () => einFn({ data: { profileId: p.id, ein } }), onSuccess: () => { toast.success("EIN stored securely"); setEin(""); refresh(); }, onError: errMsg });
  return (
    <div className="space-y-5 pt-3 text-base">
      {editing ? (
        <div className="space-y-3"><ProfileFields v={v} set={setV} people={people} />
          <div className="flex gap-2"><Button disabled={save.isPending} onClick={() => save.mutate()}>Save changes</Button><Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button></div></div>
      ) : (
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <div><dt className="text-sm text-muted-foreground">Fiscal year ends</dt><dd>{p.fiscal_year_end_month ? MONTHS[p.fiscal_year_end_month - 1] : "Not recorded"}</dd></div>
          <div><dt className="text-sm text-muted-foreground">Primary contact</dt><dd>{f.primaryContactName ?? "Not chosen"}</dd></div>
          <div><dt className="text-sm text-muted-foreground">Determination letter</dt><dd>{p.determination_letter_on ?? "Not recorded"}</dd></div>
          <div><dt className="text-sm text-muted-foreground">EIN</dt><dd>{f.entity?.tax_id_masked ?? "Not on file"}</dd></div>
          <div className="sm:col-span-2"><dt className="text-sm text-muted-foreground">Mission</dt><dd className="whitespace-pre-wrap">{p.mission ?? "Not recorded"}</dd></div>
        </dl>
      )}
      {canEdit && !editing && <Button variant="outline" onClick={() => setEditing(true)}>Edit details</Button>}
      {canEdit && <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1"><Label htmlFor={`ein-${p.id}`}>{f.entity?.tax_id_masked ? "Replace EIN" : "Add EIN"}</Label><Input id={`ein-${p.id}`} data-private autoComplete="off" inputMode="numeric" placeholder="12-3456789" value={ein} onChange={(e) => setEin(e.target.value)} /></div>
        <Button variant="outline" disabled={storeEin.isPending || ein.replace(/\D/g, "").length !== 9} onClick={() => storeEin.mutate()}>Store securely</Button>
        <p className="w-full text-sm text-muted-foreground">Stored encrypted. Only the last four digits are shown.</p>
      </div>}
      <div><h4 className="font-semibold">History</h4>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">{f.events.map((e: any) => <li key={e.id}>{new Date(e.created_at).toLocaleString()} · {String(e.event).replace(/_/g, " ")}</li>)}</ul></div>
    </div>
  );
}

function People({ clientId, f, people, canEdit }: { clientId: string; f: any; people: any[]; canEdit: boolean }) {
  const qc = useQueryClient();
  const addFn = useServerFn(addFoundationAuthority);
  const endFn = useServerFn(endFoundationAuthority);
  // Evidence must be current and, for client uploads, reviewed and accepted (the database re-checks).
  const docs = (f.documents as any[]).filter((d) => !d.superseded_by && d.usable !== false);
  const [personId, setPersonId] = useState("");
  const [role, setRole] = useState("director");
  const [title, setTitle] = useState("");
  const [scopes, setScopes] = useState<AuthorityScope[]>([]);
  const [evidence, setEvidence] = useState("");
  const [note, setNote] = useState("");
  const problem = authorityProblem({ role, scopes, evidenceDocumentId: evidence || null });
  const refresh = () => qc.invalidateQueries({ queryKey: ["foundation-workspace", clientId] });
  const add = useMutation({ mutationFn: () => addFn({ data: { profileId: f.profile.id, personId, role: role as any, title: title || null, scopes, evidenceDocumentId: evidence || null, evidenceNote: note || null } }), onSuccess: () => { toast.success("Recorded"); setPersonId(""); setScopes([]); setTitle(""); setEvidence(""); setNote(""); refresh(); }, onError: errMsg });
  const end = useMutation({ mutationFn: (v: { roleId: string; reason: string }) => endFn({ data: v }), onSuccess: () => { toast.success("Role ended"); refresh(); }, onError: errMsg });
  const preparer = role === "paperwork_preparer";
  return (
    <div className="space-y-5 pt-3">
      <p className="text-base text-muted-foreground">Recording a role here never grants platform access or approves any verification. Account checks, investing-party checks, entity verification and AML screening stay separate.</p>
      {f.authority.length ? (
        <ul className="space-y-2">{f.authority.map((r: any) => (
          <li key={r.id} className={`rounded-md border p-3 ${r.status === "ended" ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-base font-medium">{r.personName} · {label(AUTHORITY_ROLES, r.role)}{r.title ? ` (${r.title})` : ""}</span>
              {r.status === "active" && canEdit ? <Button size="sm" variant="ghost" onClick={() => { const reason = window.prompt("Why did this role end?"); if (reason && reason.trim().length >= 3) end.mutate({ roleId: r.id, reason: reason.trim() }); }}>End role</Button> : <Badge variant="outline">{r.status === "ended" ? `Ended ${r.ended_on}` : "Active"}</Badge>}
            </div>
            <div className="mt-1 flex flex-wrap gap-1">{(r.authority_scopes as string[]).length ? (r.authority_scopes as string[]).map((s) => <Badge key={s} variant="secondary">{label(AUTHORITY_SCOPES, s)}</Badge>) : <span className="text-sm text-muted-foreground">Listed, no authority recorded</span>}</div>
            <p className="mt-1 text-sm text-muted-foreground">Effective {r.effective_on}{r.evidenceTitle ? ` · Evidence: ${r.evidenceTitle}` : ""}{r.evidence_note ? ` · ${r.evidence_note}` : ""}</p>
          </li>))}</ul>
      ) : <p className="text-base text-muted-foreground">No people recorded yet.</p>}
      {canEdit && (
        <div className="space-y-3 rounded-md border p-4">
          <h4 className="font-semibold">Add a person</h4>
          {!people.length && <p className="text-sm text-muted-foreground">This client has no people linked to a person record yet. Add them on the People tab first.</p>}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1"><Label>Person</Label>
              <FundPersonPicker people={pickPeople(people)} value={personId} onChange={setPersonId} empty="No people yet." /></div>
            <div className="space-y-1"><Label>Role</Label>
              <Select value={role} onValueChange={(x) => { setRole(x); if (x === "paperwork_preparer") setScopes((s) => s.filter((k) => k === "prepare_paperwork")); }}><SelectTrigger aria-label="Role"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(AUTHORITY_ROLES).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label htmlFor={`fa-title-${f.profile.id}`}>Title (optional)</Label><Input id={`fa-title-${f.profile.id}`} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          </div>
          <fieldset className="space-y-2"><legend className="text-sm font-medium">Authority</legend>
            <div className="grid gap-2 sm:grid-cols-2">{Object.entries(AUTHORITY_SCOPES).map(([k, l]) => {
              const disabled = preparer && k !== "prepare_paperwork";
              return <label key={k} className={`flex items-center gap-2 text-base ${disabled ? "opacity-50" : ""}`}><Checkbox disabled={disabled} checked={scopes.includes(k as AuthorityScope)} onCheckedChange={(c) => setScopes(c ? [...scopes, k as AuthorityScope] : scopes.filter((s) => s !== k))} />{l}</label>;
            })}</div>
            {preparer && <p className="text-sm text-muted-foreground">A paperwork preparer can only prepare paperwork. Signing, verification, grant approval, banking and payment authority need a separate role backed by evidence.</p>}
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>Evidence</Label>
              <Select value={evidence || "none"} onValueChange={(x) => setEvidence(x === "none" ? "" : x)}><SelectTrigger aria-label="Evidence document"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">No document</SelectItem>{docs.map((d) => <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label htmlFor={`fa-note-${f.profile.id}`}>Evidence note (optional)</Label><Input id={`fa-note-${f.profile.id}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example, Bylaws article 4" /></div>
          </div>
          {problem && scopes.length > 0 && <p className="text-sm text-destructive">{problem}</p>}
          <Button disabled={!personId || !!problem || add.isPending} onClick={() => add.mutate()}>Record</Button>
        </div>
      )}
    </div>
  );
}

function Documents({ clientId, f, canEdit }: { clientId: string; f: any; canEdit: boolean }) {
  const qc = useQueryClient();
  const upFn = useServerFn(uploadFoundationDocument);
  const openFn = useServerFn(openFoundationDocument);
  const [kind, setKind] = useState<keyof typeof DOC_KINDS>("governing_document");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [replaces, setReplaces] = useState("");
  const current = (f.documents as any[]).filter((d) => !d.superseded_by);
  const replaced = (f.documents as any[]).filter((d) => d.superseded_by);
  const up = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a file.");
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return upFn({ data: { profileId: f.profile.id, kind, title: title || file.name, fileName: file.name, mimeType: file.type || "application/pdf", base64: btoa(bin), replacesId: replaces || null } });
    },
    onSuccess: () => { toast.success("Uploaded"); setFile(null); setTitle(""); setReplaces(""); qc.invalidateQueries({ queryKey: ["foundation-workspace", clientId] }); },
    onError: errMsg,
  });
  const open = async (id: string) => { try { const r = await openFn({ data: { documentId: id } }); window.open(r.url, "_blank", "noopener"); } catch (e) { errMsg(e); } };
  const reviewBadge = (d: any) => d.source !== "client" ? null : <ReviewStateBadge state={foundationDocumentState(d)} prefix="Client upload" />;
  const row = (d: any) => <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"><span className="text-base">{d.title} <span className="text-sm text-muted-foreground">· {label(DOC_KINDS, d.kind)} · {new Date(d.uploaded_at).toLocaleDateString()}</span> {reviewBadge(d)}</span><Button size="sm" variant="outline" onClick={() => open(d.id)}>Open</Button></li>;
  return (
    <div className="space-y-5 pt-3">
      <p className="text-base text-muted-foreground">Private to Harmonious and this client. Replacing a document keeps the earlier version.</p>
      {current.length ? <ul className="space-y-2">{current.map(row)}</ul> : <p className="text-base text-muted-foreground">No documents yet. Add the governing documents and the determination letter.</p>}
      {replaced.length > 0 && <details><summary className="cursor-pointer text-sm">Earlier versions ({replaced.length})</summary><ul className="mt-2 space-y-2">{replaced.map(row)}</ul></details>}
      {canEdit && (
        <div className="space-y-3 rounded-md border p-4">
          <h4 className="font-semibold">Upload</h4>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1"><Label>Type</Label>
              <Select value={kind} onValueChange={(x) => setKind(x as keyof typeof DOC_KINDS)}><SelectTrigger aria-label="Document type"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(DOC_KINDS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label htmlFor={`fa-doc-title-${f.profile.id}`}>Title</Label><Input id={`fa-doc-title-${f.profile.id}`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="For example, Bylaws" /></div>
            <div className="space-y-1"><Label>Replaces (optional)</Label>
              <Select value={replaces || "none"} onValueChange={(x) => setReplaces(x === "none" ? "" : x)}><SelectTrigger aria-label="Replaces"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">Nothing, this is new</SelectItem>{current.map((d) => <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <Input type="file" aria-label="File" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <Button disabled={!file || up.isPending} onClick={() => up.mutate()}>Upload</Button>
        </div>
      )}
    </div>
  );
}

function Services({ f }: { f: any }) {
  return (
    <div className="space-y-5 pt-3">
      <p className="text-base text-muted-foreground">Quotes are drafted in Sales with "Configure Foundation Administration". No component is released yet, so quotes can be saved and approved internally but not sent, contracted or billed.</p>
      <div className="space-y-2">{FOUNDATION_COMPONENTS.map((c) => (
        <div key={c.key} className="rounded-md border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-base font-medium">{c.name}</span><Badge variant="outline">Not released · {CAPABILITY[c.readiness.capability]}</Badge></div>
          <p className="mt-1 text-sm text-muted-foreground">{c.cadence === "one_time" ? "One-time" : "Recurring"} · {c.summary}</p>
          {c.readiness.missing.length > 0 && <p className="mt-1 text-sm text-muted-foreground">Missing: {c.readiness.missing.join("; ")}.</p>}
        </div>))}</div>
      <div><h4 className="font-semibold">Quotes</h4>
        {f.quotes.length ? <ul className="mt-2 space-y-2">{f.quotes.map((q: any) => (
          <li key={q.id} className="rounded-md border p-3"><Link to="/sales/quotes/$id" params={{ id: q.id }} className="text-base font-medium underline">Q-{q.quote_number} v{q.version} · {q.title}</Link> <Badge variant="outline">{String(q.status).replace(/_/g, " ")}</Badge>
            <ul className="mt-1 text-sm text-muted-foreground">{q.lines.map((l: any, i: number) => <li key={i}>{l.label} · {money(l.unitCents)} {l.billing === "one_time" ? "once" : `per ${l.billing === "annual" ? "year" : l.billing === "quarterly" ? "quarter" : "month"}`} · {l.priceSource === "rate_card" ? "approved rate" : "negotiated"}</li>)}</ul></li>))}</ul>
          : <p className="mt-1 text-base text-muted-foreground">No quotes yet.</p>}</div>
      <div><h4 className="font-semibold">Agreements</h4><p className="mt-1 text-base text-muted-foreground">None. SOWs for Foundation Administration can't be drafted until the service is released.</p></div>
      <div className="rounded-md bg-muted/40 p-3 text-sm">
        <p className="font-medium">Responsibilities that stay with the foundation</p>
        <ul className="mt-1 space-y-1">{RETAINED_RESPONSIBILITIES.map((r) => <li key={r.party}>{r.party}: {r.items.join("; ")}</li>)}</ul>
        <p className="mt-2 text-muted-foreground">{FOUNDATION_ROLE_DISCLAIMER}</p>
      </div>
    </div>
  );
}

function Tasks({ clientId, f, canEdit }: { clientId: string; f: any; canEdit: boolean }) {
  const qc = useQueryClient();
  const fn = useServerFn(startFoundationHandoff);
  const [components, setComponents] = useState<ComponentKey[]>(["onboarding_setup"]);
  const m = useMutation({ mutationFn: () => fn({ data: { profileId: f.profile.id, components } }), onSuccess: (r) => { toast.success(r.created ? `${r.created} Operations task${r.created === 1 ? "" : "s"} created` : "Those tasks already exist"); qc.invalidateQueries({ queryKey: ["foundation-workspace", clientId] }); }, onError: errMsg });
  return (
    <div className="space-y-5 pt-3">
      {f.referenceDeadline && <p className="rounded-md bg-muted/40 p-3 text-base">Annual return reference date: <span className="font-semibold">{f.referenceDeadline}</span>. Filed by the foundation's tax preparer, never by Harmonious.</p>}
      {f.tasks.length ? <ul className="space-y-2">{f.tasks.map((t: any) => <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"><span className="text-base">{t.title}</span><span className="text-sm text-muted-foreground">{taskStatusLabel(t.status)}{t.due_date ? ` · due ${t.due_date}` : ""}</span></li>)}</ul>
        : <p className="text-base text-muted-foreground">No Operations tasks yet.</p>}
      {canEdit && (
        <div className="space-y-3 rounded-md border p-4">
          <h4 className="font-semibold">Hand off to Operations</h4>
          <p className="text-sm text-muted-foreground">Creates tasks linked to this foundation in the Operations queue. It does not create a fund, invite anyone, send email or start billing.</p>
          <div className="grid gap-2 sm:grid-cols-2">{FOUNDATION_COMPONENTS.map((c) => <label key={c.key} className="flex items-center gap-2 text-base"><Checkbox checked={components.includes(c.key)} onCheckedChange={(v) => setComponents(v ? [...components, c.key] : components.filter((k) => k !== c.key))} />{c.name}</label>)}</div>
          <Button disabled={m.isPending} onClick={() => m.mutate()}>Create Operations tasks</Button>
        </div>
      )}
    </div>
  );
}
