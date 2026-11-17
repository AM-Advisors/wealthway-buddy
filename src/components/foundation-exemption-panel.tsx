import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadError } from "@/components/load-error";
import {
  addIrsLetter, advanceExemption, advanceIrsLetter, getExemptionWorkspace, saveExemptionDetails, startExemptionApplication,
} from "@/lib/foundation-exemption.functions";
import {
  EXEMPTION_FORMS, EXEMPTION_OUTCOMES, EXEMPTION_STAGES, EZ_KEYS, EZ_SCREEN, IRS_LETTER_KINDS, LETTER_STATUSES, STAGE_ORDER, nextStage,
  type ExemptionStage, type EzScreen, type LetterStatus,
} from "@/lib/foundation-exemption-model";

const errMsg = (e: unknown) => toast.error((e as Error).message);
const NONE = "__none";
type Opt = { id: string; name?: string | null; title?: string; kind?: string };

function Pick({ label, value, onChange, options, empty, aria }: { label: string; value: string; onChange: (v: string) => void; options: Opt[]; empty: string; aria?: string }) {
  return (
    <div className="space-y-1"><Label>{label}</Label>
      {options.length ? (
        <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
          <SelectTrigger aria-label={aria ?? label}><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value={NONE}>Not chosen</SelectItem>{options.map((o) => <SelectItem key={o.id} value={o.id}>{o.title ?? o.name ?? "Person on file"}</SelectItem>)}</SelectContent>
        </Select>
      ) : <p className="text-sm text-muted-foreground">{empty}</p>}
    </div>
  );
}

/** Operations: Form 1023 / 1023-EZ preparation for one foundation. Every action is re-checked by the server. */
export function FoundationExemptionPanel({ clientId, profileId, canEdit }: { clientId: string; profileId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const loadFn = useServerFn(getExemptionWorkspace);
  const startFn = useServerFn(startExemptionApplication);
  const key = ["foundation-exemption", profileId];
  const q = useQuery({ queryKey: key, queryFn: () => loadFn({ data: { profileId } }) });
  const refresh = () => { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ["foundation-workspace", clientId] }); };
  const start = useMutation({ mutationFn: () => startFn({ data: { profileId } }), onSuccess: () => { toast.success("Application started"); refresh(); }, onError: errMsg });
  if (q.isPending) return <Skeleton className="h-40 w-full" />;
  if (q.error) return <LoadError error={q.error} what="the Form 1023 application" onRetry={() => q.refetch()} />;
  const d = q.data as any;
  const app = d.application;
  const edit = canEdit && d.canEdit;
  const open = app && app.stage !== "closed";

  return (
    <div className="space-y-5 pt-3 text-base">
      <div className="rounded-md bg-muted/40 p-3 text-sm">
        <p>Harmonious prepares the application and drafts answers to IRS questions. The board approves, and an authorized officer signs, submits and pays the IRS user fee. Nothing on this tab files or pays anything.</p>
        {d.filingWindow && <p className={`mt-1 ${d.filingWindow.passed ? "text-destructive" : ""}`}>27-month filing window from formation: {d.filingWindow.deadline}{d.filingWindow.passed ? ". This has passed, so exemption may not reach back to the formation date." : ` (${d.filingWindow.daysLeft} days left). Filing by then generally makes exemption retroactive to formation.`}</p>}
      </div>

      {!open && edit && d.profile.exemption_status !== "determined" && (
        <Button size="lg" disabled={start.isPending} onClick={() => start.mutate()}>{app ? "Start a new application" : "Start the Form 1023 application"}</Button>
      )}
      {!app && !edit && <p className="text-muted-foreground">No exemption application yet.</p>}
      {app && <Stepper stage={app.stage} outcome={app.outcome} />}
      {app && <CurrentStage key={`${app.id}:${app.updated_at}`} d={d} app={app} edit={edit} refresh={refresh} />}
      {app && (app.stage === "submitted" || app.stage === "closed" || d.letters.length > 0) && <Letters key={`letters:${app.id}`} d={d} app={app} edit={edit && app.stage === "submitted"} refresh={refresh} />}
      {app && d.events.length > 0 && (
        <details><summary className="cursor-pointer text-sm">History ({d.events.length})</summary>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">{(d.events as any[]).map((e) => <li key={e.id}>{new Date(e.created_at).toLocaleString()} · {String(e.event).replace(/_/g, " ")}{e.detail?.note ? ` · ${e.detail.note}` : ""}</li>)}</ul>
        </details>
      )}
      {d.earlierApplications.length > 0 && <p className="text-sm text-muted-foreground">Earlier applications: {(d.earlierApplications as any[]).map((x) => `${x.form ? EXEMPTION_FORMS[x.form as keyof typeof EXEMPTION_FORMS] : "Form not chosen"} · ${x.outcome ? EXEMPTION_OUTCOMES[x.outcome as keyof typeof EXEMPTION_OUTCOMES] : ""} ${x.closed_on ?? ""}`).join("; ")}</p>}
    </div>
  );
}

function Stepper({ stage, outcome }: { stage: ExemptionStage; outcome: string | null }) {
  const at = STAGE_ORDER.indexOf(stage);
  return (
    <ol className="flex flex-wrap gap-2">{STAGE_ORDER.map((s, i) => (
      <li key={s}><Badge variant={i === at ? "default" : i < at ? "secondary" : "outline"}>{i + 1}. {s === "closed" && outcome ? EXEMPTION_OUTCOMES[outcome as keyof typeof EXEMPTION_OUTCOMES] : EXEMPTION_STAGES[s]}</Badge></li>
    ))}</ol>
  );
}

function CurrentStage({ d, app, edit, refresh }: { d: any; app: any; edit: boolean; refresh: () => void }) {
  const saveFn = useServerFn(saveExemptionDetails);
  const moveFn = useServerFn(advanceExemption);
  const stage = app.stage as ExemptionStage;
  const [form, setForm] = useState<string>(app.form ?? "");
  const [ez, setEz] = useState<EzScreen>(app.ez_screen ?? {});
  const [projections, setProjections] = useState<string>(app.projections_document_id ?? "");
  const [draft, setDraft] = useState<string>(app.draft_document_id ?? "");
  const [boardOn, setBoardOn] = useState<string>(app.board_approved_on ?? "");
  const [approver, setApprover] = useState<string>(app.board_approver_person_id ?? "");
  const [boardDoc, setBoardDoc] = useState<string>(app.board_evidence_document_id ?? "");
  const [boardNote, setBoardNote] = useState<string>(app.board_note ?? "");
  const [subOn, setSubOn] = useState(""); const [subBy, setSubBy] = useState(""); const [ref, setRef] = useState("");
  const [outcome, setOutcome] = useState<string>(""); const [letterDoc, setLetterDoc] = useState(""); const [letterOn, setLetterOn] = useState(""); const [effOn, setEffOn] = useState(""); const [note, setNote] = useState("");
  const docs = d.documents as Opt[];

  const details = (): Record<string, unknown> => {
    if (stage === "eligibility") return { form: form || null, ezScreen: ez, projectionsDocumentId: projections || null };
    if (stage === "gathering") return { projectionsDocumentId: projections || null, draftDocumentId: draft || null };
    if (stage === "drafting") return { projectionsDocumentId: projections || null, draftDocumentId: draft || null };
    if (stage === "board_review") return { boardApprovedOn: boardOn || null, boardApproverPersonId: approver || null, boardEvidenceDocumentId: boardDoc || null, boardNote: boardNote || null };
    return {};
  };
  const hasDetails = ["eligibility", "gathering", "drafting", "board_review"].includes(stage);
  const save = useMutation({ mutationFn: () => saveFn({ data: { applicationId: app.id, expectedStage: stage, ...details() } as any }), onSuccess: () => { toast.success("Saved"); refresh(); }, onError: errMsg });
  const move = useMutation({
    mutationFn: async (v: { to: ExemptionStage; input?: Record<string, unknown> }) => {
      if (hasDetails && v.to !== "closed") await saveFn({ data: { applicationId: app.id, expectedStage: stage, ...details() } as any });
      return moveFn({ data: { applicationId: app.id, expectedStage: stage, to: v.to, input: v.input as any } });
    },
    onSuccess: (r) => { toast.success(`Now: ${EXEMPTION_STAGES[r.stage as ExemptionStage]}`); refresh(); }, onError: (e) => { errMsg(e); refresh(); },
  });
  const ask = (m: string) => { const r = window.prompt(m); if (!r) return null; if (r.trim().length < 10) { toast.error("Give at least 10 characters."); return null; } return r.trim(); };
  const next = nextStage(stage);
  const busy = save.isPending || move.isPending;
  const nextLabel: Partial<Record<ExemptionStage, string>> = { eligibility: "Continue: gather information", gathering: "Continue: prepare the application", drafting: "Send to the board for review", board_review: "Board approved: ready for the officer" };

  if (stage === "closed") return (
    <div className="rounded-md border p-4">
      <p className="font-semibold">{EXEMPTION_OUTCOMES[app.outcome as keyof typeof EXEMPTION_OUTCOMES]} · closed {app.closed_on}</p>
      {app.outcome === "approved" && <p className="text-sm text-muted-foreground">Determination letter dated {app.determination_letter_on}, effective {app.exemption_effective_on}. The foundation's exemption status was updated.</p>}
      {app.closed_note && <p className="mt-1 text-sm">{app.closed_note}</p>}
      {app.submitted_on && <p className="mt-1 text-sm text-muted-foreground">Submitted {app.submitted_on} by {app.submittedByName} · confirmation {app.confirmation_ref}</p>}
    </div>
  );

  return (
    <div className="space-y-4 rounded-md border p-4">
      <h4 className="text-lg font-semibold">{EXEMPTION_STAGES[stage]}</h4>

      {stage === "eligibility" && <>
        <div className="max-w-sm space-y-1"><Label>Form</Label>
          <Select value={form || NONE} disabled={!edit} onValueChange={(v) => setForm(v === NONE ? "" : v)}><SelectTrigger aria-label="Form"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={NONE}>Not chosen</SelectItem>{Object.entries(EXEMPTION_FORMS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select></div>
        <fieldset className="space-y-2"><legend className="text-sm font-medium">1023-EZ screen. Any "Yes" means the full Form 1023.</legend>
          {EZ_KEYS.map((k) => (
            <div key={k} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/30 p-2">
              <span className="text-sm">{EZ_SCREEN[k]}</span>
              <Select value={ez[k] === undefined ? NONE : ez[k] ? "yes" : "no"} disabled={!edit} onValueChange={(v) => setEz({ ...ez, [k]: v === NONE ? undefined : v === "yes" })}>
                <SelectTrigger className="w-32" aria-label={EZ_SCREEN[k]}><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value={NONE}>Not answered</SelectItem><SelectItem value="no">No</SelectItem><SelectItem value="yes">Yes</SelectItem></SelectContent></Select>
            </div>))}
        </fieldset>
        {app.ez.reasons.length > 0 && <p className="text-sm text-muted-foreground">Full Form 1023 needed: {app.ez.reasons.join(" ")}</p>}
      </>}

      {(stage === "gathering" || stage === "drafting") && (
        <ul className="space-y-1">{(app.prerequisites as any[]).map((p) => <li key={p.key} className="flex items-start gap-2 text-sm"><Badge variant={p.done ? "default" : "outline"}>{p.done ? "Done" : "Needed"}</Badge><span>{p.label}</span></li>)}</ul>
      )}
      {(stage === "eligibility" || stage === "gathering" || stage === "drafting") && app.form !== "1023_ez" && (
        <Pick label="Financial projections" value={projections} onChange={setProjections} options={docs} empty="Upload the projections on the Documents tab first." />
      )}
      {(stage === "gathering" || stage === "drafting") && (
        <Pick label="Prepared application (draft for the board)" value={draft} onChange={setDraft} options={docs} empty="Upload the prepared application on the Documents tab first." />
      )}

      {stage === "board_review" && <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor={`bo-${app.id}`}>Date the board approved</Label><Input id={`bo-${app.id}`} type="date" disabled={!edit} value={boardOn} onChange={(e) => setBoardOn(e.target.value)} /></div>
        <Pick label="Confirmed by (director, trustee or officer)" value={approver} onChange={setApprover} options={d.board} empty="Add the foundation's directors and officers under People and authority first." />
        <Pick label="Board consent or minutes" value={boardDoc} onChange={setBoardDoc} options={docs} empty="Upload the consent or minutes on the Documents tab, or describe the approval below." />
        <div className="space-y-1"><Label htmlFor={`bn-${app.id}`}>How the board approved it (if no document)</Label><Textarea id={`bn-${app.id}`} rows={2} disabled={!edit} value={boardNote} onChange={(e) => setBoardNote(e.target.value)} /></div>
      </div>}

      {stage === "ready_to_submit" && <>
        <p className="text-sm text-muted-foreground">The officer signs and submits the application and pays the IRS user fee. Record it here once they confirm. Board approval: {app.board_approved_on} by {app.boardApproverName}.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1"><Label htmlFor={`so-${app.id}`}>Date submitted</Label><Input id={`so-${app.id}`} type="date" value={subOn} onChange={(e) => setSubOn(e.target.value)} /></div>
          <Pick label="Submitted by" value={subBy} onChange={setSubBy} options={d.signers} empty="No officer or director with signing authority is recorded under People and authority." />
          <div className="space-y-1"><Label htmlFor={`cr-${app.id}`}>IRS confirmation number</Label><Input id={`cr-${app.id}`} value={ref} onChange={(e) => setRef(e.target.value)} /></div>
        </div>
        {edit && <Button size="lg" disabled={busy} onClick={() => { if (window.confirm("Record that the officer submitted the application? The submission record can't be changed afterwards.")) move.mutate({ to: "submitted", input: { submittedOn: subOn || null, submittedByPersonId: subBy || null, confirmationRef: ref || null } }); }}>Record the officer's submission</Button>}
      </>}

      {stage === "submitted" && <>
        <p className="text-sm text-muted-foreground">Submitted {app.submitted_on} by {app.submittedByName} · confirmation {app.confirmation_ref}. Log every IRS letter below. When the IRS decides, record it here.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label>IRS outcome</Label>
            <Select value={outcome || NONE} onValueChange={(v) => setOutcome(v === NONE ? "" : v)}><SelectTrigger aria-label="IRS outcome"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={NONE}>Not decided yet</SelectItem><SelectItem value="approved">{EXEMPTION_OUTCOMES.approved}</SelectItem><SelectItem value="denied">{EXEMPTION_OUTCOMES.denied}</SelectItem></SelectContent></Select></div>
          {outcome === "approved" && <>
            <Pick label="Determination letter" value={letterDoc} onChange={setLetterDoc} options={docs.filter((x) => x.kind === "determination_letter")} empty="Upload it on the Documents tab as a determination letter first." />
            <div className="space-y-1"><Label htmlFor={`dl-${app.id}`}>Date on the letter</Label><Input id={`dl-${app.id}`} type="date" value={letterOn} onChange={(e) => setLetterOn(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor={`ef-${app.id}`}>Exemption effective date</Label><Input id={`ef-${app.id}`} type="date" value={effOn} onChange={(e) => setEffOn(e.target.value)} /></div>
          </>}
          {outcome === "denied" && <div className="space-y-1 sm:col-span-2"><Label htmlFor={`dn-${app.id}`}>Summary of the IRS decision</Label><Textarea id={`dn-${app.id}`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>}
        </div>
        {edit && outcome && <Button size="lg" disabled={busy} onClick={() => { if (window.confirm("Record the IRS decision and close this application?")) move.mutate({ to: "closed", input: { outcome, determinationDocumentId: letterDoc || null, determinationLetterOn: letterOn || null, exemptionEffectiveOn: effOn || null, note: note || null } }); }}>Record the IRS decision</Button>}
      </>}

      {edit && <div className="flex flex-wrap gap-2">
        {hasDetails && next && <Button size="lg" disabled={busy} onClick={() => move.mutate({ to: next })}>{nextLabel[stage]}</Button>}
        {hasDetails && <Button variant="outline" disabled={busy} onClick={() => save.mutate()}>Save</Button>}
        {stage === "board_review" && <Button variant="outline" disabled={busy} onClick={() => { const r = ask("What did the board ask to change?"); if (r) move.mutate({ to: "drafting", input: { note: r } }); }}>Board asked for changes</Button>}
        <Button variant="ghost" disabled={busy} onClick={() => { const r = ask("Why is the application withdrawn?"); if (r && window.confirm("Withdraw and close this application? It stays in the history.")) move.mutate({ to: "closed", input: { outcome: "withdrawn", note: r } }); }}>Withdraw</Button>
      </div>}
    </div>
  );
}

function Letters({ d, app, edit, refresh }: { d: any; app: any; edit: boolean; refresh: () => void }) {
  const addFn = useServerFn(addIrsLetter);
  const [kind, setKind] = useState<string>("information_request");
  const [receivedOn, setReceivedOn] = useState(""); const [due, setDue] = useState(""); const [summary, setSummary] = useState(""); const [doc, setDoc] = useState("");
  const add = useMutation({
    mutationFn: () => addFn({ data: { applicationId: app.id, kind: kind as any, receivedOn, summary, letterDocumentId: doc || null, responseDueOn: due || null } }),
    onSuccess: () => { toast.success("Letter logged"); setReceivedOn(""); setDue(""); setSummary(""); setDoc(""); refresh(); }, onError: errMsg,
  });
  return (
    <div className="space-y-3">
      <h4 className="text-lg font-semibold">IRS letters</h4>
      {d.letters.length ? <ul className="space-y-3">{(d.letters as any[]).map((l) => <Letter key={`${l.id}:${l.updated_at}`} l={l} d={d} edit={edit} refresh={refresh} />)}</ul>
        : <p className="text-muted-foreground">No IRS letters logged yet.</p>}
      {edit && (
        <div className="space-y-3 rounded-md border p-4">
          <h5 className="font-semibold">Log a letter from the IRS</h5>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>Kind</Label>
              <Select value={kind} onValueChange={setKind}><SelectTrigger aria-label="Kind of letter"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(IRS_LETTER_KINDS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select></div>
            <Pick label="The letter" value={doc} onChange={setDoc} options={d.documents} empty="Upload the letter on the Documents tab to attach it." />
            <div className="space-y-1"><Label htmlFor={`lr-${app.id}`}>Date received</Label><Input id={`lr-${app.id}`} type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor={`ld-${app.id}`}>Response due{kind === "information_request" ? "" : " (if any)"}</Label><Input id={`ld-${app.id}`} type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
            <div className="space-y-1 sm:col-span-2"><Label htmlFor={`ls-${app.id}`}>What the IRS asked</Label><Textarea id={`ls-${app.id}`} rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} /></div>
          </div>
          <p className="text-sm text-muted-foreground">A letter with a due date creates an Operations task five days before the deadline.</p>
          <Button disabled={add.isPending || !receivedOn || summary.trim().length < 3} onClick={() => add.mutate()}>Log letter</Button>
        </div>
      )}
    </div>
  );
}

function Letter({ l, d, edit, refresh }: { l: any; d: any; edit: boolean; refresh: () => void }) {
  const moveFn = useServerFn(advanceIrsLetter);
  const [respDoc, setRespDoc] = useState(l.response_document_id ?? "");
  const [approver, setApprover] = useState(""); const [approvedOn, setApprovedOn] = useState("");
  const [sentOn, setSentOn] = useState(""); const [sentBy, setSentBy] = useState("");
  const move = useMutation({
    mutationFn: (v: { to: LetterStatus; input?: Record<string, unknown> }) => moveFn({ data: { letterId: l.id, expectedStatus: l.status, to: v.to, input: v.input as any } }),
    onSuccess: () => { toast.success("Updated"); refresh(); }, onError: errMsg,
  });
  const ask = (m: string) => { const r = window.prompt(m); if (!r) return null; if (r.trim().length < 10) { toast.error("Give at least 10 characters."); return null; } return r.trim(); };
  const status = l.status as LetterStatus;
  return (
    <li className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{IRS_LETTER_KINDS[l.kind as keyof typeof IRS_LETTER_KINDS]} · received {l.received_on}</span>
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline">{LETTER_STATUSES[status]}</Badge>
          {l.due && <Badge variant={l.due.overdue ? "destructive" : "secondary"}>{l.due.overdue ? `Overdue by ${-l.due.daysLeft} days` : `Due ${l.response_due_on} · ${l.due.daysLeft} days`}</Badge>}
        </div>
      </div>
      <p className="text-sm">{l.summary}</p>
      {l.approverName && <p className="text-sm text-muted-foreground">Board approval {l.approved_on} by {l.approverName}{l.sentByName ? ` · sent ${l.responded_on} by ${l.sentByName}` : ""}</p>}
      {l.closed_reason && status === "closed" && <p className="text-sm text-muted-foreground">{l.closed_reason}</p>}
      {edit && status === "open" && <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-64"><Pick label="Drafted response" value={respDoc} onChange={setRespDoc} options={d.documents} empty="Upload the draft response on the Documents tab first." /></div>
        <Button disabled={move.isPending} onClick={() => move.mutate({ to: "response_drafted", input: { responseDocumentId: respDoc || null } })}>Response drafted</Button>
      </div>}
      {edit && status === "response_drafted" && <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-64"><Pick label="Approved by" value={approver} onChange={setApprover} options={d.board} empty="No directors or officers recorded." /></div>
        <div className="space-y-1"><Label htmlFor={`la-${l.id}`}>Approval date</Label><Input id={`la-${l.id}`} type="date" value={approvedOn} onChange={(e) => setApprovedOn(e.target.value)} /></div>
        <Button disabled={move.isPending} onClick={() => move.mutate({ to: "board_approved", input: { approverPersonId: approver || null, approvedOn: approvedOn || null } })}>Board approved the response</Button>
        <Button variant="outline" disabled={move.isPending} onClick={() => { const r = ask("What needs to change in the draft?"); if (r) move.mutate({ to: "open", input: { reason: r } }); }}>Needs changes</Button>
      </div>}
      {edit && status === "board_approved" && <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1"><Label htmlFor={`lsn-${l.id}`}>Date sent</Label><Input id={`lsn-${l.id}`} type="date" value={sentOn} onChange={(e) => setSentOn(e.target.value)} /></div>
        <div className="min-w-64"><Pick label="Sent by" value={sentBy} onChange={setSentBy} options={d.signers} empty="No officer or director with signing authority recorded." /></div>
        <Button disabled={move.isPending} onClick={() => { if (window.confirm("Record that the officer sent this response? It can't be changed afterwards.")) move.mutate({ to: "responded", input: { respondedOn: sentOn || null, sentByPersonId: sentBy || null } }); }}>Record the officer's reply</Button>
      </div>}
      {edit && !["responded", "closed"].includes(status) && <Button size="sm" variant="ghost" disabled={move.isPending} onClick={() => { const r = ask("Why is no response needed?"); if (r) move.mutate({ to: "closed", input: { reason: r } }); }}>No response needed</Button>}
    </li>
  );
}
