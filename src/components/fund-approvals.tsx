import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listFundApprovals, getApproval, createApproval, submitApprovalForReview, completeApprovalReview, decideApproval, reviseApproval, withdrawApproval, completeApproval } from "@/lib/approvals.functions";
import { APPROVAL_TYPES, APPROVAL_TYPE_KEYS, APPROVAL_STATUS_LABEL, CLIENT_APPROVAL_FILTERS, approvalType } from "@/lib/approval-types";
import { fmtDate } from "@/lib/service-engagement-labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const money = (n: number | string | null | undefined, cur = "USD") => (n == null ? null : Number(n).toLocaleString("en-US", { style: "currency", currency: cur, maximumFractionDigits: 0 }));
const sel = "h-8 rounded-md border bg-background px-2 text-sm";
const STATUS_TONE: Record<string, string> = { AWAITING_APPROVAL: "border-accent bg-accent/20 font-semibold", CHANGES_REQUESTED: "border-border bg-muted", APPROVED: "border-primary/30 bg-primary/5 text-primary", COMPLETED: "border-border bg-secondary" };
const StatusPill = ({ s }: { s: string }) => <span className={cn("rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wide", STATUS_TONE[s] ?? "border-border bg-muted text-muted-foreground")}>{APPROVAL_STATUS_LABEL[s] ?? s}</span>;

export function invalidateFundWork(qc: ReturnType<typeof useQueryClient>, fundId: string) {
  for (const k of [["fund-approvals", fundId], ["fund-command-center", fundId], ["fund-requests", fundId], ["staff-tasks"], ["client-fund-tasks", fundId], ["ops-approvals"], ["ops-fund-requests"]]) qc.invalidateQueries({ queryKey: k });
}

export function FundApprovals({ fundId, initialId }: { fundId: string; initialId?: string | null }) {
  const load = useServerFn(listFundApprovals);
  const q = useQuery({ queryKey: ["fund-approvals", fundId], queryFn: () => load({ data: { fundId } }) });
  const [filter, setFilter] = useState<keyof typeof CLIENT_APPROVAL_FILTERS | "all">("needs");
  const [openId, setOpenId] = useState<string | null>(initialId ?? null);
  const [creating, setCreating] = useState(false);
  const rows = useMemo(() => (q.data?.rows ?? []).filter((r: any) => r.status !== "SUPERSEDED" && (filter === "all" || (CLIENT_APPROVAL_FILTERS[filter] as readonly string[]).includes(r.status))), [q.data, filter]);
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading approvals…</p>;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const d = q.data!;
  const count = (k: keyof typeof CLIENT_APPROVAL_FILTERS) => d.rows.filter((r: any) => (CLIENT_APPROVAL_FILTERS[k] as readonly string[]).includes(r.status)).length;
  if (openId) return <ApprovalDetail id={openId} fundId={fundId} onBack={() => setOpenId(null)} onOpen={setOpenId} />;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter approvals">
        {([["needs", "Needs My Approval"], ["review", "In Review"], ["approved", "Approved"], ["changes", "Changes Requested"], ["completed", "Completed"], ["all", "All"]] as const).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={cn("rounded-full border px-2.5 py-1 text-xs", filter === k ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>{l}{k !== "all" ? ` (${count(k)})` : ""}</button>
        ))}
        {d.staff && <Button size="sm" className="ml-auto" onClick={() => setCreating(!creating)}>{creating ? "Close" : "Prepare approval"}</Button>}
      </div>
      {creating && <ApprovalForm fundId={fundId} onDone={(id) => { setCreating(false); setOpenId(id); }} />}
      {rows.length ? <ul className="divide-y rounded-xl border bg-card">{rows.map((r: any) => (
        <li key={r.id} className="flex flex-wrap items-center gap-3 p-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{approvalType(r.approval_type).label}{r.version > 1 ? ` · v${r.version}` : ""}</p>
            <p className="font-medium">{r.title}</p>
            <p className="text-xs text-muted-foreground">{[money(r.approval_amount, r.currency), r.due_date ? `Due ${fmtDate(r.due_date)}` : null, `Prepared by ${r.preparedByName ?? "Harmonious"}`, r.requested_at ? `Requested ${fmtDate(r.requested_at)}` : null].filter(Boolean).join(" · ")}</p>
          </div>
          <StatusPill s={r.status} />
          <Button size="sm" variant={r.status === "AWAITING_APPROVAL" ? "default" : "outline"} onClick={() => setOpenId(r.id)}>Review</Button>
        </li>
      ))}</ul> : <div className="rounded-xl border bg-card p-4 text-sm"><p className="font-medium">{filter === "needs" ? "No action required" : "Nothing here"}</p><p className="text-muted-foreground">{filter === "needs" ? "Nothing is waiting for your approval right now." : "No approvals match this filter."}</p></div>}
    </div>
  );
}

function ApprovalForm({ fundId, onDone, base }: { fundId: string; onDone: (id: string) => void; base?: any }) {
  const create = useServerFn(createApproval); const revise = useServerFn(reviseApproval);
  const qc = useQueryClient();
  const [v, setV] = useState({ type: base?.approval_type ?? "DISTRIBUTION", title: base?.title ?? "", amount: base?.approval_amount != null ? String(base.approval_amount) : "", due: base?.due_date ?? "", effective: base?.effective_date ?? "", summary: base?.client_visible_summary ?? "", description: base?.description ?? "", internal: base?.internal_notes ?? "", calc: ((base?.calculation_summary ?? []) as any[]).map((c) => `${c.label}: ${c.value}`).join("\n"), docs: ((base?.supporting_documents ?? []) as any[]).map((x) => x.name).join("\n"), reason: "" });
  const submit = async () => {
    const calculation = v.calc.split("\n").map((l: string) => l.trim()).filter(Boolean).map((l: string) => { const [a, ...b] = l.split(":"); return { label: a!.trim().slice(0, 120), value: b.join(":").trim().slice(0, 200) || "—" }; });
    const documents = v.docs.split("\n").map((l: string) => l.trim()).filter(Boolean).map((name: string) => ({ name: name.slice(0, 200) }));
    const payload = { fundId, type: v.type, title: v.title, amount: v.amount ? Number(v.amount) : null, dueDate: v.due || null, effectiveDate: v.effective || null, summary: v.summary || null, description: v.description || null, internalNotes: v.internal || null, calculation, documents };
    try {
      const r = base ? await revise({ data: { ...payload, id: base.id, reason: v.reason } }) : await create({ data: payload });
      toast.success(base ? "New version created as a draft." : "Approval drafted."); invalidateFundWork(qc, fundId); onDone(r.id);
    } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <div className="space-y-2 rounded-xl border bg-card p-3 text-sm">
      <div className="flex flex-wrap gap-2">
        <select aria-label="Approval type" value={v.type} disabled={!!base} onChange={(e) => setV({ ...v, type: e.target.value })} className={sel}>{APPROVAL_TYPE_KEYS.map((k) => <option key={k} value={k}>{APPROVAL_TYPES[k].label}</option>)}</select>
        <Input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="Title, e.g. Q3 Distribution" aria-label="Title" className="h-8 w-64" />
        <Input type="number" min={0} value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} placeholder="Amount (USD)" aria-label="Amount" className="h-8 w-36" />
        <label className="flex items-center gap-1 text-xs">Due<Input type="date" value={v.due} onChange={(e) => setV({ ...v, due: e.target.value })} aria-label="Due date" className="h-8 w-40" /></label>
        <label className="flex items-center gap-1 text-xs">Effective<Input type="date" value={v.effective} onChange={(e) => setV({ ...v, effective: e.target.value })} aria-label="Effective date" className="h-8 w-40" /></label>
      </div>
      <Textarea value={v.summary} onChange={(e) => setV({ ...v, summary: e.target.value })} placeholder="Client-visible summary: why approval is needed and what happens after" aria-label="Client summary" rows={2} />
      <Textarea value={v.calc} onChange={(e) => setV({ ...v, calc: e.target.value })} placeholder={"Calculation summary, one per line — Label: value\nGross distribution: $450,000"} aria-label="Calculation" rows={3} />
      <Textarea value={v.docs} onChange={(e) => setV({ ...v, docs: e.target.value })} placeholder="Supporting documents (one name per line; files live in the fund's Documents)" aria-label="Documents" rows={2} />
      <Textarea value={v.internal} onChange={(e) => setV({ ...v, internal: e.target.value })} placeholder="Internal notes (never shown to the client)" aria-label="Internal notes" rows={2} />
      {base && <Input value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} placeholder="Reason for the new version (shown in history)" aria-label="Reason" className="h-8" />}
      <Button size="sm" onClick={submit}>{base ? "Create new version" : "Save draft"}</Button>
    </div>
  );
}

function ApprovalDetail({ id, fundId, onBack, onOpen }: { id: string; fundId: string; onBack: () => void; onOpen: (id: string) => void }) {
  const load = useServerFn(getApproval);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["approval", id], queryFn: () => load({ data: { id } }) });
  const fns = { review: useServerFn(submitApprovalForReview), complete: useServerFn(completeApprovalReview), decide: useServerFn(decideApproval), withdraw: useServerFn(withdrawApproval), done: useServerFn(completeApproval) };
  const [certified, setCertified] = useState(false); const [confirm, setConfirm] = useState(""); const [comment, setComment] = useState(""); const [reason, setReason] = useState("");
  const [revising, setRevising] = useState(false); const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<any>, ok: string) => { setBusy(true); try { const r = await fn(); toast.success(r?.remaining ? `Recorded. ${r.remaining} more approval needed from another fund manager.` : ok); invalidateFundWork(qc, fundId); q.refetch(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } };
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error) return <div><Button size="sm" variant="ghost" onClick={onBack}>← Approvals</Button><p className="text-sm text-destructive">{(q.error as Error).message}</p></div>;
  const { approval: a, staff, canDecide, certification, highRisk, events, decisions, versions } = q.data!;
  const newer = versions.find((x: any) => x.version > a.version);
  return (
    <div className="space-y-4">
      <Button size="sm" variant="ghost" onClick={onBack}>← Approvals</Button>
      {newer && <p className="rounded-md border border-accent bg-accent/10 p-2 text-sm">This version was replaced. <button className="underline" onClick={() => onOpen(newer.id)}>Open version {newer.version}</button></p>}
      <section className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{approvalType(a.approval_type).label} · Version {a.version}</p><h2 className="text-xl">{a.title}</h2></div>
          <StatusPill s={a.status} />
        </div>
        {a.client_visible_summary && <p className="mt-2 text-sm">{a.client_visible_summary}</p>}
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><dt className="text-xs text-muted-foreground">Financial impact</dt><dd className="font-semibold">{money(a.approval_amount, a.currency) ?? "—"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Effective date</dt><dd>{fmtDate(a.effective_date)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Due date</dt><dd>{fmtDate(a.due_date)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Approvals needed</dt><dd>{decisions.filter((x: any) => x.decision === "APPROVE").length} of {a.required_approver_count}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Prepared by</dt><dd>{a.preparedByName ?? "Harmonious"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Reviewed by</dt><dd>{a.reviewedByName ?? "Not yet reviewed"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Related workflow</dt><dd>{a.related_workflow_type ?? (a.service_request_id ? "Service request" : "—")}</dd></div>
        </dl>
        {a.description && <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{a.description}</p>}
      </section>
      {(a.calculation_summary ?? []).length > 0 && <section className="rounded-xl border bg-card p-4"><h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Calculation / summary</h3><dl className="grid gap-1 text-sm sm:grid-cols-2">{(a.calculation_summary as any[]).map((c, i) => <div key={i} className="flex justify-between gap-2 border-b py-1"><dt>{c.label}</dt><dd className="font-medium">{c.value}</dd></div>)}</dl></section>}
      <section className="rounded-xl border bg-card p-4"><h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Supporting documents</h3>{(a.supporting_documents ?? []).length ? <ul className="text-sm">{(a.supporting_documents as any[]).map((x, i) => <li key={i}>• {x.name}</li>)}</ul> : <p className="text-sm text-muted-foreground">None attached. Fund documents are in the Documents tab.</p>}</section>
      {staff && a.internal_notes && <p className="rounded-md bg-muted p-3 text-sm"><span className="font-medium">Internal notes:</span> {a.internal_notes}</p>}

      {canDecide && (
        <section className="space-y-3 rounded-xl border-2 border-accent bg-card p-4">
          <h3 className="font-semibold">Your decision</h3>
          {certification && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={certified} onChange={(e) => setCertified(e.target.checked)} /> {certification}</label>}
          {highRisk && <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Type the fund name to confirm" aria-label="Type the fund name to confirm" />}
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comments (required if requesting changes)" aria-label="Comments" rows={2} />
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => act(() => fns.decide({ data: { id: a.id, decision: "APPROVE", certified, confirmText: confirm, comment, version: a.version } }), "Approved. Harmonious will proceed.")}>Approve</Button>
            <Button disabled={busy} variant="outline" onClick={() => act(() => fns.decide({ data: { id: a.id, decision: "REQUEST_CHANGES", certified: false, comment, version: a.version } }), "Changes requested. Harmonious will revise it.")}>Request changes</Button>
          </div>
          <p className="text-xs text-muted-foreground">Approving never moves money by itself. Payments are released only through Harmonious's separate controlled payment process.</p>
        </section>
      )}

      {staff && (
        <section className="space-y-2 rounded-xl border bg-card p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Harmonious actions</h3>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (withdraw, or Super Admin self-review)" aria-label="Reason" className="h-8" />
          <div className="flex flex-wrap gap-2">
            {a.status === "DRAFT" && <Button size="sm" disabled={busy} onClick={() => act(() => fns.review({ data: { id: a.id } }), "Sent for internal review.")}>Send for internal review</Button>}
            {a.status === "INTERNAL_REVIEW" && <Button size="sm" disabled={busy} onClick={() => act(() => fns.complete({ data: { id: a.id, reason: reason || null } }), "Reviewed and sent to the fund manager.")}>Complete review & request client approval</Button>}
            {a.status === "APPROVED" && <Button size="sm" disabled={busy} onClick={() => act(() => fns.done({ data: { id: a.id } }), "Marked complete.")}>Mark workflow complete</Button>}
            {["DRAFT", "INTERNAL_REVIEW", "AWAITING_APPROVAL", "CHANGES_REQUESTED", "APPROVED"].includes(a.status) && !newer && <Button size="sm" variant="outline" onClick={() => setRevising(!revising)}>Create new version</Button>}
            {["DRAFT", "INTERNAL_REVIEW", "AWAITING_APPROVAL", "CHANGES_REQUESTED"].includes(a.status) && <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => fns.withdraw({ data: { id: a.id, reason } }), "Withdrawn.")}>Withdraw</Button>}
          </div>
          {revising && <ApprovalForm fundId={fundId} base={a} onDone={(nid) => { setRevising(false); onOpen(nid); }} />}
        </section>
      )}

      <section className="rounded-xl border bg-card p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Change history</h3>
        <ul className="space-y-1 text-xs">{events.map((e: any) => <li key={e.id}><span className="text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span> · v{e.version} · {e.action.replace(/_/g, " ")} · {e.who}{e.comment ? ` — ${e.comment}` : ""}</li>)}</ul>
      </section>
    </div>
  );
}
