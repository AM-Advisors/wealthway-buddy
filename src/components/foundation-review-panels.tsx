import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  decideFoundationEntityReview, decideFoundationRelease, getFoundationReleaseControls, getFoundationReview, getFoundationVerification,
  requestFoundationRelease, reviewFoundationDocument, reviewFoundationSubmission,
} from "@/lib/foundation-onboarding.functions";
import { setFoundationFlag } from "@/lib/foundation-admin.functions";
import { AUTHORITY_ROLES } from "@/lib/foundation-admin-model";
import { CLIENT_FACT_FIELDS } from "@/lib/foundation-onboarding-model";
import { FOUNDATION_FLAGS, REQUIRED_EVIDENCE, RELEASE_EVIDENCE, type FoundationFlagKey, type ReleaseDimension, type ReleaseEvidenceInput } from "@/lib/foundation-release-model";
import { OWNERSHIP_NOTE } from "@/lib/foundation-verification-model";
import { fromFoundationRequirement, personPickState, REVIEW_ACTIONS, type RequirementRow } from "@/lib/admin-review-framework";
import { RequirementList, ReviewDecisionBar, ReviewStateBadge, reviewBlockedReason } from "@/components/admin-review";
import { ApprovalButton } from "@/components/approval-button";
import { FundPersonPicker, type PickPerson } from "@/components/fund-person-picker";
import { LoadError } from "@/components/load-error";

const errMsg = (e: unknown) => toast.error((e as Error).message);
const roleName = (r: string) => AUTHORITY_ROLES[r as keyof typeof AUTHORITY_ROLES] ?? r;

// ------------------------------------------------------------ Switches (Super Admin)

export function FoundationSwitches({ flags, canToggle }: { flags: Record<FoundationFlagKey, boolean>; canToggle: boolean }) {
  const qc = useQueryClient();
  const fn = useServerFn(setFoundationFlag);
  const [reason, setReason] = useState("");
  const m = useMutation({
    mutationFn: (v: { key: FoundationFlagKey; enabled: boolean }) => fn({ data: { ...v, reason } }),
    onSuccess: (r) => { toast.success(`${FOUNDATION_FLAGS[r.key as FoundationFlagKey].label} turned ${r.enabled ? "on" : "off"}`); setReason(""); qc.invalidateQueries(); },
    onError: errMsg,
  });
  if (!canToggle && flags.foundation_administration) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Foundation Administration switches</CardTitle>
        <CardDescription className="text-base">Each switch is separate. None of them releases a service: sending, contracts, enrollment and billing stay blocked until a component is released below.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-2">{(Object.keys(FOUNDATION_FLAGS) as FoundationFlagKey[]).map((k) => (
          <li key={k} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
            <div><p className="text-base font-medium">{FOUNDATION_FLAGS[k].label} <Badge variant={flags[k] ? "default" : "outline"}>{flags[k] ? "On" : "Off"}</Badge></p><p className="text-sm text-muted-foreground">{FOUNDATION_FLAGS[k].description}</p></div>
            {canToggle && <Button size="sm" variant={flags[k] ? "outline" : "default"} disabled={m.isPending || reason.trim().length < 3 || (!flags[k] && k !== "foundation_administration" && !flags.foundation_administration)}
              onClick={() => { if (window.confirm(`${flags[k] ? "Turn off" : "Turn on"} ${FOUNDATION_FLAGS[k].label.toLowerCase()}?`)) m.mutate({ key: k, enabled: !flags[k] }); }}>{flags[k] ? "Turn off" : "Turn on"}</Button>}
          </li>))}</ul>
        {canToggle && <div className="max-w-md space-y-1"><Label htmlFor="fa-flag-reason">Reason for the change</Label><Input id="fa-flag-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this is changing" /></div>}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------ Client submissions (staff review)

export function FoundationReviewPanel({ profileId, clientId }: { profileId: string; clientId: string }) {
  const qc = useQueryClient();
  const loadFn = useServerFn(getFoundationReview);
  const subFn = useServerFn(reviewFoundationSubmission);
  const docFn = useServerFn(reviewFoundationDocument);
  const q = useQuery({ queryKey: ["foundation-review", profileId], queryFn: () => loadFn({ data: { profileId } }) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["foundation-review", profileId] }); qc.invalidateQueries({ queryKey: ["foundation-workspace", clientId] }); qc.invalidateQueries({ queryKey: ["foundation-verification", profileId] }); };
  const decide = useMutation({ mutationFn: (v: any) => subFn({ data: v }), onSuccess: (_r, v: any) => { toast.success(v.decision === "accepted" ? "Approved and applied to the foundation" : "Sent back to the client"); refresh(); }, onError: errMsg });
  const docDecide = useMutation({ mutationFn: (v: any) => docFn({ data: v }), onSuccess: (_r, v: any) => { toast.success(v.decision === "accepted" ? "Approved as evidence" : "Sent back to the client"); refresh(); }, onError: errMsg });
  if (q.isPending) return <Skeleton className="h-24 w-full" />;
  if (q.error) return <LoadError error={q.error} what="Client submissions" onRetry={() => q.refetch()} />;
  const d = q.data as any;
  const open = d.submissions.filter((s: any) => s.status === "submitted");
  const past = d.submissions.filter((s: any) => s.status !== "submitted");
  return (
    <div className="space-y-5 pt-3">
      <p className="text-base text-muted-foreground">What the client sent. Nothing here changes the foundation's records until someone other than the sender approves it. Approving a person never grants authority or access.</p>
      <section className="space-y-2"><h4 className="font-semibold">Documents waiting for review</h4>
        {d.pendingDocuments.length ? <ul className="space-y-2">{d.pendingDocuments.map((doc: any) => (
          <li key={doc.id} className="space-y-2 rounded-md border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-base">{doc.title} <span className="text-sm text-muted-foreground">· {String(doc.kind).replace(/_/g, " ")} · {new Date(doc.uploaded_at).toLocaleDateString()}</span></span><ReviewStateBadge state="waiting" /></div>
            <ReviewDecisionBar blockedReason={reviewBlockedReason(!!doc.ownUpload, !!d.canReview)} approveLabel={REVIEW_ACTIONS.approve} approveTitle="Approve this document as evidence?" approveDescription="It can then support people's roles and the foundation records decision. Earlier copies stay on file." pending={docDecide.isPending}
              onApprove={() => docDecide.mutate({ documentId: doc.id, decision: "accepted" })} onSendBack={(note) => docDecide.mutate({ documentId: doc.id, decision: "correction_requested", note })} recipient="the client" />
          </li>))}</ul> : <p className="text-base text-muted-foreground">None.</p>}
      </section>
      <section className="space-y-2"><h4 className="font-semibold">Submissions waiting for review</h4>
        {open.length ? <ul className="space-y-3">{open.map((s: any) => <SubmissionCard key={s.id} s={s} canReview={d.canReview} pending={decide.isPending} onDecide={(v) => decide.mutate({ submissionId: s.id, ...v })} />)}</ul>
          : <p className="text-base text-muted-foreground">None.</p>}
      </section>
      {past.length > 0 && <details><summary className="cursor-pointer text-sm">Decided ({past.length})</summary>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">{past.map((s: any) => <li key={s.id} className="flex flex-wrap items-center gap-2">{new Date(s.submitted_at).toLocaleDateString()} · {String(s.kind).replace(/_/g, " ")} <ReviewStateBadge engine="foundation_submission" status={s.status} />{s.review_note ? ` ${s.review_note}` : ""}</li>)}</ul></details>}
    </div>
  );
}

function SubmissionCard({ s, canReview, pending, onDecide }: { s: any; canReview: boolean; pending: boolean; onDecide: (v: any) => void }) {
  const [choice, setChoice] = useState<string>("");
  const can = canReview && !s.ownSubmission;
  const changed = s.kind === "profile_facts" ? (s.changedSince as string[]).map((f) => (CLIENT_FACT_FIELDS as any)[f]).join(", ") : "";
  const needsChoice = s.kind === "person_new" && s.candidates.length > 0 && !choice;
  const approve = () => onDecide({ decision: "accepted", confirmReplace: s.changedSince.length > 0, person: s.kind === "person_new" ? (choice && choice !== "new" ? { action: "use_existing", personId: choice } : { action: "create_new" }) : null });
  const candidates: PickPerson[] = (s.candidates as any[]).map((c) => { const v = personPickState(c.kyc_status, c.aml_status); return { key: c.id, name: c.name, email: c.email, detail: c.email ? `${c.email} · ${v.detail}` : v.detail, source: "Existing person", kyc: v.kyc, hasAccount: !!c.hasLogin }; });
  return (
    <li className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-base font-medium">{s.kind === "profile_facts" ? "Foundation details" : s.kind === "person_existing" ? `Person: ${s.personName}` : s.kind === "person_new" ? `New person: ${s.payload.firstName} ${s.payload.lastName}` : "Ready for review"}</span>
        <span className="flex items-center gap-2 text-sm text-muted-foreground">Sent {new Date(s.submitted_at).toLocaleString()} <ReviewStateBadge engine="foundation_submission" status={s.status} /></span></div>
      {s.kind === "profile_facts" && <table className="w-full text-sm"><thead><tr className="text-left text-muted-foreground"><th>Field</th><th>On record</th><th>Client proposes</th></tr></thead>
        <tbody>{s.changes.map((c: any) => <tr key={c.field} className={s.changedSince.includes(c.field) ? "font-medium" : ""}><td>{(CLIENT_FACT_FIELDS as any)[c.field]}{s.changedSince.includes(c.field) ? " (changed since)" : ""}</td><td>{c.from ?? "Not recorded"}</td><td>{c.to ?? "Cleared"}</td></tr>)}</tbody></table>}
      {(s.kind === "person_existing" || s.kind === "person_new") && <p className="text-sm">Role: {roleName(s.payload.role)}{s.payload.title ? ` · ${s.payload.title}` : ""}{s.payload.email ? ` · ${s.payload.email}` : ""}</p>}
      {s.kind === "person_new" && can && (
        <div className="space-y-2">
          {candidates.length ? <><Label>Possible existing people</Label>
            <FundPersonPicker people={candidates} value={choice === "new" ? "" : choice} onChange={setChoice} empty="" />
            <Button size="sm" variant={choice === "new" ? "default" : "outline"} onClick={() => setChoice(choice === "new" ? "" : "new")}>None of these: add a new person</Button></>
            : <p className="text-sm text-muted-foreground">No possible matches. Approving adds a new person to this client without a login.</p>}
        </div>)}
      <ReviewDecisionBar blockedReason={reviewBlockedReason(!!s.ownSubmission, canReview)} pending={pending} approveDisabled={needsChoice}
        approveTitle="Approve and apply this submission?"
        approveDescription={changed ? `Changed by Harmonious since the client sent this: ${changed}. Approving replaces them with the client's values.` : s.kind === "person_new" ? "The person is linked to this client without a login, and no authority is granted." : "The client's values are applied to the foundation's records."}
        onApprove={approve} onSendBack={(note) => onDecide({ decision: "correction_requested", note })} recipient="the client" />
      {needsChoice && <p className="text-sm text-muted-foreground">Choose a matching person or "None of these" before approving.</p>}
    </li>
  );
}

// ------------------------------------------------------------ Verification

export function FoundationVerificationPanel({ profileId }: { profileId: string }) {
  const qc = useQueryClient();
  const loadFn = useServerFn(getFoundationVerification);
  const fn = useServerFn(decideFoundationEntityReview);
  const q = useQuery({ queryKey: ["foundation-verification", profileId], queryFn: () => loadFn({ data: { profileId } }) });
  const [decision, setDecision] = useState<"approved" | "declined" | "more_information">("more_information");
  const [evidence, setEvidence] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const m = useMutation({ mutationFn: () => fn({ data: { profileId, decision, evidenceDocumentIds: evidence, note } }), onSuccess: () => { toast.success("Decision recorded"); setNote(""); setEvidence([]); qc.invalidateQueries({ queryKey: ["foundation-verification", profileId] }); }, onError: errMsg });
  if (q.isPending) return <Skeleton className="h-24 w-full" />;
  if (q.error) return <LoadError error={q.error} what="Verification" onRetry={() => q.refetch()} />;
  const d = q.data as any;
  const groups: [string, string][] = [["entity", "Foundation"], ["screening", "Screening"], ["person", "People"], ["authority", "Authority to act"]];
  const account = new Map((d.accountChecks as any[]).map((c) => [c.personId, c.status]));
  const byKey = new Map((d.requirements as any[]).map((r) => [r.key, r]));
  return (
    <div className="space-y-5 pt-3">
      <p className="text-base text-muted-foreground">{d.summary.complete ? "Every requirement is met." : `${d.summary.unresolved} requirement${d.summary.unresolved === 1 ? "" : "s"} still open${d.summary.exceptions ? `, ${d.summary.exceptions} with exceptions` : ""}.`} Nothing is approved automatically: exemption status, uploaded documents, recorded roles and sign-in checks never count on their own.</p>
      <p className="text-sm text-muted-foreground">{OWNERSHIP_NOTE}</p>
      {groups.map(([area, title]) => {
        const reqs = (d.requirements as any[]).filter((r) => r.area === area);
        if (!reqs.length) return null;
        const rows: RequirementRow[] = reqs.map((r) => ({ key: r.key, label: r.label, state: fromFoundationRequirement(r.status), note: r.why, source: r.source, items: r.items }));
        return <section key={area} className="space-y-2"><h4 className="font-semibold">{title}</h4>
          <RequirementList audience="staff" rows={rows} renderExtra={(row) => {
            const r = byKey.get(row.key);
            return r?.personId && r.area === "person" ? <p className="mt-1 text-sm text-muted-foreground">Sign-in account check (separate, not counted): {account.get(r.personId) ?? "no login"} · <a className="underline" href={`/ops/verifications?person=${r.personId}`}>Open verification</a></p> : null;
          }} /></section>;
      })}
      {d.canDecide ? (
        <div className="space-y-3 rounded-md border p-4">
          <h4 className="font-semibold">Record the foundation records decision</h4>
          <p className="text-sm text-muted-foreground">Approval needs a current, approved governing document and the EIN on file. You can't decide on documents you uploaded. Screening isn't decided here.</p>
          <div className="max-w-xs space-y-1"><Label>Decision</Label>
            <Select value={decision} onValueChange={(v) => setDecision(v as any)}><SelectTrigger aria-label="Decision"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="approved">Approve</SelectItem><SelectItem value="more_information">Ask for more information</SelectItem><SelectItem value="declined">Decline</SelectItem></SelectContent></Select></div>
          <fieldset className="space-y-1"><legend className="text-sm font-medium">Evidence reviewed</legend>
            {(d.evidenceOptions as any[]).length ? (d.evidenceOptions as any[]).map((o) => <label key={o.id} className={`flex items-center gap-2 text-base ${o.uploadedByMe ? "opacity-50" : ""}`}><Checkbox disabled={o.uploadedByMe} checked={evidence.includes(o.id)} onCheckedChange={(c) => setEvidence(c ? [...evidence, o.id] : evidence.filter((x) => x !== o.id))} />{o.title} <span className="text-sm text-muted-foreground">· {String(o.kind).replace(/_/g, " ")}{o.uploadedByMe ? " · uploaded by you" : ""}</span></label>)
              : <p className="text-sm text-muted-foreground">No approved documents yet.</p>}</fieldset>
          <div className="space-y-1"><Label htmlFor={`fv-note-${profileId}`}>Note</Label><Textarea id={`fv-note-${profileId}`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <ApprovalButton disabled={m.isPending || note.trim().length < 3} title="Record this decision?" description="It can't be edited afterwards. A later change needs a new decision." confirmLabel="Record decision" undoLabel="Undo" waitingTitle="Decision waiting to send" waitingNote="You have 5 seconds to undo. Nothing has been recorded yet." historyNote="Decisions stay in the history." onApprove={() => m.mutate()}>Record decision</ApprovalButton>
        </div>
      ) : <p className="text-sm text-muted-foreground">Foundation records decisions are made by Compliance or an administrator.</p>}
      {(d.reviews as any[]).length > 0 && <details><summary className="cursor-pointer text-sm">Decision history ({d.reviews.length})</summary>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">{[...d.reviews].reverse().map((r: any) => <li key={r.id}>{new Date(r.created_at).toLocaleString()} · {r.decision.replace(/_/g, " ")} · {r.note}</li>)}</ul></details>}
    </div>
  );
}

// ------------------------------------------------------------ Release controls

export function FoundationReleaseControls() {
  const qc = useQueryClient();
  const loadFn = useServerFn(getFoundationReleaseControls);
  const reqFn = useServerFn(requestFoundationRelease);
  const decFn = useServerFn(decideFoundationRelease);
  const q = useQuery({ queryKey: ["foundation-release-controls"], queryFn: () => loadFn() });
  const [form, setForm] = useState<{ component: string; dimension: ReleaseDimension } | null>(null);
  const [ev, setEv] = useState<ReleaseEvidenceInput>({});
  const [reason, setReason] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["foundation-release-controls"] });
  const request = useMutation({ mutationFn: () => reqFn({ data: { component: form!.component as any, dimension: form!.dimension, evidence: ev, reason } }), onSuccess: () => { toast.success("Release requested. A different Super Admin must approve it."); setForm(null); setEv({}); setReason(""); refresh(); }, onError: errMsg });
  const decide = useMutation({ mutationFn: (v: any) => decFn({ data: v }), onSuccess: () => { toast.success("Recorded"); refresh(); }, onError: errMsg });
  if (q.isPending) return <Skeleton className="h-24 w-full" />;
  if (q.error) return null;
  const d = q.data as any;
  const ask = (m: string) => { const r = window.prompt(m); return r && r.trim().length >= 10 ? r.trim() : (r ? (toast.error("Give at least 10 characters."), null) : null); };
  const dimCell = (c: any, dim: ReleaseDimension) => {
    const st = c.state[dim];
    return (
      <div className="space-y-1">
        <Badge variant={st.released ? "default" : "outline"}>{st.released ? "Released" : st.openRequest ? "Requested" : "Not released"}</Badge>
        {st.openRequest && <p className="text-xs text-muted-foreground">Requested {new Date(st.openRequest.created_at).toLocaleDateString()}: {st.openRequest.reason}</p>}
        <div className="flex flex-wrap gap-1">
          {!st.released && !st.openRequest && d.canRequest && <Button size="sm" variant="outline" onClick={() => { setForm({ component: c.key, dimension: dim }); setEv({}); setReason(""); }}>Request</Button>}
          {st.openRequest && d.canApprove && st.openRequest.actor_id !== d.userId && <Button size="sm" disabled={decide.isPending || (dim === "commercial" && !c.state.delivery.released)} onClick={() => { const r = ask("Reason for approving this release (at least 10 characters)"); if (r && window.confirm("Approve this release?")) decide.mutate({ component: c.key, dimension: dim, action: "approved", reason: r }); }}>Approve</Button>}
          {st.openRequest && (st.openRequest.actor_id === d.userId || d.canApprove) && <Button size="sm" variant="ghost" onClick={() => { const r = ask("Why withdraw this request?"); if (r) decide.mutate({ component: c.key, dimension: dim, action: "withdrawn", reason: r }); }}>Withdraw</Button>}
          {st.released && d.canApprove && <Button size="sm" variant="ghost" onClick={() => { const r = ask("Why revoke this release?"); if (r && window.confirm("Revoke? Blocks apply again immediately.")) decide.mutate({ component: c.key, dimension: dim, action: "revoked", reason: r }); }}>Revoke</Button>}
        </div>
      </div>
    );
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Service release controls</CardTitle>
        <CardDescription className="text-base">Each component is released on its own, first for delivery and then commercially, with recorded evidence and a different Super Admin's approval. Turning a switch on never releases anything.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground"><th className="py-2 pr-3">Component</th><th className="py-2 pr-3">What's built</th><th className="py-2 pr-3">Delivery readiness</th><th className="py-2">Commercial release</th></tr></thead>
          <tbody>{(d.components as any[]).map((c) => (
            <tr key={c.key} className="border-t align-top"><td className="py-2 pr-3 text-base font-medium">{c.name}</td>
              <td className="py-2 pr-3"><span>{c.capability === "partial" ? "Partly built" : c.capability === "not_built" ? "Not built yet" : "Blocked until foundation accounting is validated"}</span>{c.missing.length > 0 && <p className="text-xs text-muted-foreground">Missing: {c.missing.join("; ")}</p>}</td>
              <td className="py-2 pr-3">{dimCell(c, "delivery")}</td><td className="py-2">{dimCell(c, "commercial")}</td></tr>))}</tbody>
        </table></div>
        {form && (
          <div className="space-y-3 rounded-md border p-4">
            <h4 className="font-semibold">Request {form.dimension === "commercial" ? "commercial release" : "delivery readiness"}: {(d.components as any[]).find((c) => c.key === form.component)?.name}</h4>
            <p className="text-sm text-muted-foreground">Record where each piece of evidence lives (document, decision or test run) and who approved it. Every item is required.</p>
            {REQUIRED_EVIDENCE[form.dimension].map((k) => <div key={k} className="space-y-1"><Label htmlFor={`rel-${k}`}>{RELEASE_EVIDENCE[k]}</Label><Textarea id={`rel-${k}`} rows={2} value={ev[k] ?? ""} onChange={(e) => setEv({ ...ev, [k]: e.target.value })} /></div>)}
            <div className="space-y-1"><Label htmlFor="rel-reason">Reason</Label><Input id="rel-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
            <div className="flex gap-2"><Button disabled={request.isPending} onClick={() => { if (window.confirm("Send this release request for approval?")) request.mutate(); }}>Request release</Button><Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button></div>
          </div>)}
        <div className="rounded-md bg-muted/40 p-3 text-sm"><p className="font-medium">Never released here</p><ul className="mt-1 list-disc pl-5">{(d.protectedFinancial as string[]).map((x) => <li key={x}>{x}</li>)}</ul></div>
        {(d.events as any[]).length > 0 && <details><summary className="cursor-pointer text-sm">Release history ({d.events.length})</summary>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">{(d.events as any[]).map((e) => <li key={e.id}>{new Date(e.created_at).toLocaleString()} · {e.component.replace(/_/g, " ")} · {e.dimension} · {e.action} · {e.reason}</li>)}</ul></details>}
      </CardContent>
    </Card>
  );
}
