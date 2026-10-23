import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listFundRequests, getFundRequest, createFundRequest, postFundRequestMessage, updateFundRequest, cancelFundRequest, getFundRequestFileUrl } from "@/lib/fund-requests.functions";
import { REQUEST_TYPES, REQUEST_TYPE_KEYS, REQUEST_STATUSES, REQUEST_STATUS_LABEL, TEAM_ROUTING, requestType, isOpenRequest } from "@/lib/service-request-types";
import { ResponsibilityBadge } from "@/components/responsibility-badge";
import { invalidateFundWork } from "@/components/fund-approvals";
import { fmtDate } from "@/lib/service-engagement-labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const sel = "h-9 rounded-md border bg-background px-2 text-sm";
const toB64 = (f: File) => new Promise<{ name: string; base64: string }>((res, rej) => { const r = new FileReader(); r.onload = () => res({ name: f.name, base64: String(r.result).split(",")[1] ?? "" }); r.onerror = rej; r.readAsDataURL(f); });
const ENT = { INCLUDED: "Included in your service", ADDITIONAL: "Additional service", REVIEW_REQUIRED: "Pricing review required" } as Record<string, string>;
const ATTN = new Set(["WAITING_ON_CLIENT", "READY_FOR_APPROVAL"]);
const WAIT = new Set(["WAITING_ON_INVESTOR", "WAITING_ON_THIRD_PARTY"]);

export function FundRequests({ fundId, preselect }: { fundId: string; preselect?: string | null }) {
  const load = useServerFn(listFundRequests);
  const q = useQuery({ queryKey: ["fund-requests", fundId], queryFn: () => load({ data: { fundId } }) });
  const [filter, setFilter] = useState<"open" | "attention" | "handling" | "waiting" | "completed" | "all">("open");
  const [openId, setOpenId] = useState<string | null>(null);
  const [newType, setNewType] = useState<string | null>(preselect ?? null);
  const rows = useMemo(() => (q.data?.rows ?? []).filter((r: any) => {
    if (filter === "open") return isOpenRequest(r.status);
    if (filter === "attention") return ATTN.has(r.status);
    if (filter === "handling") return isOpenRequest(r.status) && r.responsibility_status === "HARMONIOUS_HANDLING";
    if (filter === "waiting") return WAIT.has(r.status);
    if (filter === "completed") return !isOpenRequest(r.status);
    return true;
  }), [q.data, filter]);
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading requests…</p>;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  if (openId) return <RequestDetail id={openId} fundId={fundId} onBack={() => setOpenId(null)} />;
  if (newType !== null) return <NewRequest fundId={fundId} initial={newType} onDone={(id) => { setNewType(null); if (id) setOpenId(id); }} />;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter requests">
        {([["open", "Open"], ["attention", "Needs My Attention"], ["handling", "Harmonious Handling"], ["waiting", "Waiting"], ["completed", "Completed"], ["all", "All"]] as const).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={cn("rounded-full border px-2.5 py-1 text-xs", filter === k ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>{l}</button>
        ))}
        <Button size="sm" className="ml-auto" onClick={() => setNewType("")}>Request Service</Button>
      </div>
      {rows.length ? <ul className="divide-y rounded-xl border bg-card">{rows.map((r: any) => (
        <li key={r.id}><button type="button" onClick={() => setOpenId(r.id)} className="flex w-full flex-wrap items-center gap-2 p-3 text-left hover:bg-muted/50">
          <div className="min-w-0 flex-1">
            <p className="font-medium">{r.title}</p>
            <p className="text-xs text-muted-foreground">{requestType(r.request_type).label} · Submitted {fmtDate(r.submitted_at)}{r.due_date ? ` · Due ${fmtDate(r.due_date)}` : ""} · Updated {fmtDate(r.updated_at)}</p>
          </div>
          <span className="text-xs text-muted-foreground">{REQUEST_STATUS_LABEL[r.status as keyof typeof REQUEST_STATUS_LABEL]}</span>
          <ResponsibilityBadge status={r.responsibility_status} />
        </button></li>
      ))}</ul> : <div className="rounded-xl border bg-card p-4 text-sm"><p className="font-medium">No requests here</p><p className="text-muted-foreground">Use Request Service to ask Harmonious for anything — capital calls, distributions, reports, filings and more.</p></div>}
    </div>
  );
}

function NewRequest({ fundId, initial, onDone }: { fundId: string; initial: string; onDone: (id?: string) => void }) {
  const create = useServerFn(createFundRequest);
  const qc = useQueryClient();
  const [type, setType] = useState(initial);
  const [details, setDetails] = useState<Record<string, string>>({});
  const [priority, setPriority] = useState<"normal" | "high" | "urgent">("normal");
  const [urgentReason, setUrgentReason] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [dup, setDup] = useState<{ title: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const def = type ? REQUEST_TYPES[type] : null;
  const submit = async (confirmDuplicate = false) => {
    setBusy(true);
    try {
      const payload = { fundId, type, details, priority, urgentReason: urgentReason || null, confirmDuplicate, files: await Promise.all(files.slice(0, 5).map(toB64)) };
      const r: any = await create({ data: payload });
      if (r.duplicate) { setDup(r.duplicate); return; }
      toast.success("Request submitted. Your Harmonious team has it."); invalidateFundWork(qc, fundId); onDone(r.id);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <Button size="sm" variant="ghost" onClick={() => onDone()}>← Requests</Button>
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="text-lg">What do you need?</h2>
        {!def ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{REQUEST_TYPE_KEYS.map((k) => <button key={k} type="button" onClick={() => setType(k)} className="rounded-lg border p-3 text-left text-sm hover:bg-muted">{REQUEST_TYPES[k]!.label}</button>)}</div>
        ) : (<>
          <div className="flex items-center gap-2"><span className="font-medium">{def.label}</span><Button size="sm" variant="ghost" onClick={() => { setType(""); setDetails({}); }}>Change</Button></div>
          <div className="grid gap-3 sm:grid-cols-2">
            {def.fields.map((f) => (
              <label key={f.key} className={cn("space-y-1 text-sm", f.kind === "textarea" && "sm:col-span-2")}>
                <span>{f.label}{f.required ? " *" : ""}</span>
                {f.kind === "textarea" ? <Textarea value={details[f.key] ?? ""} onChange={(e) => setDetails({ ...details, [f.key]: e.target.value })} rows={3} />
                  : f.kind === "select" ? <select value={details[f.key] ?? ""} onChange={(e) => setDetails({ ...details, [f.key]: e.target.value })} className={cn(sel, "w-full")}><option value="">Select…</option>{f.options!.map((o) => <option key={o}>{o}</option>)}</select>
                  : <Input type={f.kind === "date" ? "date" : f.kind === "money" ? "number" : f.kind === "email" ? "email" : "text"} min={f.kind === "money" ? 0 : undefined} value={details[f.key] ?? ""} onChange={(e) => setDetails({ ...details, [f.key]: e.target.value })} />}
              </label>
            ))}
          </div>
          {type === "CAPITAL_CALL" && <p className="text-xs text-muted-foreground">You don't need to calculate each investor's share — Harmonious prepares the allocation and sends it to you for approval.</p>}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Priority</span>
            <select aria-label="Priority" value={priority} onChange={(e) => setPriority(e.target.value as any)} className={sel}><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent (time-sensitive)</option></select>
            {priority === "urgent" && <Input value={urgentReason} onChange={(e) => setUrgentReason(e.target.value)} placeholder="Why is this urgent?" aria-label="Urgent reason" className="h-9 min-w-64 flex-1" />}
          </div>
          <label className="block text-sm">Supporting documents (up to 5)<input type="file" multiple className="mt-1 block text-xs" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} /></label>
          {dup ? (
            <div className="space-y-2 rounded-md border border-accent bg-accent/10 p-3 text-sm">
              <p>There is already an active {def.label.replace(/^Request an? /, "").toLowerCase()} request for this fund ("{dup.title}"). Continue anyway?</p>
              <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => submit(true)}>Continue anyway</Button><Button size="sm" variant="outline" onClick={() => setDup(null)}>Go back</Button></div>
            </div>
          ) : <Button disabled={busy} onClick={() => submit(false)}>Submit request</Button>}
        </>)}
      </section>
    </div>
  );
}

function RequestDetail({ id, fundId, onBack }: { id: string; fundId: string; onBack: () => void }) {
  const load = useServerFn(getFundRequest);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["fund-request", id], queryFn: () => load({ data: { id } }) });
  const post = useServerFn(postFundRequestMessage); const cancel = useServerFn(cancelFundRequest); const fileUrl = useServerFn(getFundRequestFileUrl);
  const [body, setBody] = useState(""); const [internal, setInternal] = useState(false); const [file, setFile] = useState<File | null>(null);
  const refresh = () => { q.refetch(); invalidateFundWork(qc, fundId); };
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error) return <div><Button size="sm" variant="ghost" onClick={onBack}>← Requests</Button><p className="text-sm text-destructive">{(q.error as Error).message}</p></div>;
  const { request: r, staff, stages, messages, files, events, approvals, irreversible } = q.data! as any;
  const send = async () => {
    try { await post({ data: { id, body, internal, file: file ? await toB64(file) : null } }); setBody(""); setFile(null); refresh(); } catch (e) { toast.error((e as Error).message); }
  };
  const doCancel = async () => {
    const reason = window.prompt(irreversible ? "Some steps may not be reversible once started. Why do you want to cancel? Harmonious will review." : "Why do you want to cancel this request?");
    if (!reason) return;
    try { const res = await cancel({ data: { id, reason } }); toast.success(res.status === "CANCELLED" ? "Request cancelled." : "Cancellation sent to Harmonious for review."); refresh(); } catch (e) { toast.error((e as Error).message); }
  };
  const current = r.status === "COMPLETED" ? stages.length : r.stage;
  return (
    <div className="space-y-4">
      <Button size="sm" variant="ghost" onClick={onBack}>← Requests</Button>
      <section className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{requestType(r.request_type).label}</p><h2 className="text-xl">{r.title}</h2></div>
          <ResponsibilityBadge status={r.responsibility_status} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{REQUEST_STATUS_LABEL[r.status as keyof typeof REQUEST_STATUS_LABEL]} · {ENT[r.entitlement_status]}{r.entitlement_status !== "INCLUDED" ? " — this request may be outside your current service scope. Harmonious will review it before work begins." : ""}</p>
        {r.client_notes && <p className="mt-2 rounded-md bg-muted p-2 text-sm">{r.client_notes}</p>}
        <ol className="mt-4 grid gap-2 sm:grid-cols-4">
          {stages.map((s: string, i: number) => (
            <li key={s} className={cn("rounded-md border p-2 text-xs", i < current ? "border-primary/30 bg-primary/5" : i === current ? "border-accent bg-accent/15 font-semibold" : "text-muted-foreground")}>
              {s}<br /><span className="font-normal">{i < current ? "Complete" : i === current ? "In progress" : i === current + 1 ? "Upcoming" : "Not started"}</span>
            </li>
          ))}
        </ol>
        {Object.keys(r.details ?? {}).length > 0 && <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">{requestType(r.request_type).fields.filter((f) => r.details[f.key]).map((f) => <div key={f.key}><dt className="text-xs text-muted-foreground">{f.label}</dt><dd className="whitespace-pre-wrap">{f.kind === "money" ? `$${Number(r.details[f.key]).toLocaleString("en-US")}` : r.details[f.key]}</dd></div>)}</dl>}
        {approvals.length > 0 && <p className="mt-3 text-sm">Linked approvals: {approvals.map((a: any) => `${a.title} (v${a.version})`).join(", ")} — open them in Approvals.</p>}
        {!staff && isOpenRequest(r.status) && r.status !== "CANCELLATION_REVIEW" && <Button size="sm" variant="ghost" className="mt-3" onClick={doCancel}>{irreversible && r.stage > 1 ? "Ask to cancel" : "Cancel request"}</Button>}
      </section>

      {staff && <StaffControls r={r} stages={stages} onSaved={refresh} />}

      <section className="rounded-xl border bg-card p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Messages</h3>
        <ul className="space-y-2 text-sm">{messages.map((m: any) => (
          <li key={m.id} className={cn("rounded-md p-2", m.visibility === "INTERNAL" ? "border border-dashed bg-muted" : m.author_side === "CLIENT" ? "bg-secondary" : "bg-primary/5")}>
            <p className="text-xs text-muted-foreground">{m.who} · {new Date(m.created_at).toLocaleString()}{m.visibility === "INTERNAL" ? " · Internal only" : ""}</p><p className="whitespace-pre-wrap">{m.body}</p>
          </li>
        ))}{!messages.length && <li className="text-muted-foreground">No messages yet.</li>}</ul>
        {isOpenRequest(r.status) && <div className="mt-3 space-y-2">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder={staff ? "Reply to the client, or add an internal note" : "Message your Harmonious team"} aria-label="Message" />
          <div className="flex flex-wrap items-center gap-2">
            <input type="file" className="text-xs" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="Attach file" />
            {staff && <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Internal note (client can't see)</label>}
            <Button size="sm" disabled={!body.trim() && !file} onClick={send}>Send</Button>
          </div>
        </div>}
      </section>

      <section className="rounded-xl border bg-card p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Files</h3>
        {files.length ? <ul className="text-sm">{files.map((f: any) => <li key={f.id}><button className="underline" onClick={async () => { const u = await fileUrl({ data: { id: f.id } }); if (u.url) window.open(u.url, "_blank", "noopener"); }}>{f.file_name}</button> <span className="text-xs text-muted-foreground">· {f.category}{f.visibility === "INTERNAL" ? " · internal" : ""}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">No files.</p>}
      </section>

      <section className="rounded-xl border bg-card p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Activity</h3>
        <ul className="space-y-1 text-xs">{events.map((e: any) => <li key={e.id}><span className="text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span> · {e.kind.replace(/_/g, " ")}{e.detail?.label ? `: ${e.detail.label}` : e.detail?.stage ? `: ${e.detail.stage}` : ""}{staff && !e.client_visible ? " (internal)" : ""}</li>)}</ul>
      </section>
    </div>
  );
}

function StaffControls({ r, stages, onSaved }: { r: any; stages: string[]; onSaved: () => void }) {
  const update = useServerFn(updateFundRequest);
  const [v, setV] = useState({ status: r.status, stage: r.stage, team: r.assigned_team ?? "operations", due: r.due_date ?? "", client: r.client_notes ?? "", internal: r.internal_notes ?? "" });
  const save = async () => {
    try { await update({ data: { id: r.id, status: v.status, stage: Number(v.stage), assignedTeam: v.team, dueDate: v.due || null, clientNotes: v.client || null, internalNotes: v.internal || null } }); toast.success("Request updated."); onSaved(); }
    catch (e) { toast.error((e as Error).message); }
  };
  return (
    <section className="space-y-2 rounded-xl border bg-card p-4 text-sm">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Harmonious</h3>
      <p className="text-xs text-muted-foreground">{TEAM_ROUTING[r.assigned_team]?.label ?? r.assigned_team} · {r.assignedName ?? "Unassigned"} · Priority {r.priority}{r.urgent_reason ? ` (${r.urgent_reason})` : ""} · {ENT[r.entitlement_status]}
        {` · Response SLA ${r.sla_hours != null ? `${r.sla_hours} hours` : "Not configured"} (Source: ${r.sla_source ?? "—"})`}{r.sla ? ` · ${r.sla.paused ? "paused" : r.sla.breached ? "breached" : `${r.sla.hoursLeft}h left`}` : ""}</p>
      <div className="flex flex-wrap gap-2">
        <select aria-label="Status" value={v.status} onChange={(e) => setV({ ...v, status: e.target.value })} className={sel}>{REQUEST_STATUSES.map((s) => <option key={s} value={s}>{REQUEST_STATUS_LABEL[s]}</option>)}</select>
        <select aria-label="Stage" value={v.stage} onChange={(e) => setV({ ...v, stage: Number(e.target.value) })} className={sel}>{stages.map((s, i) => <option key={s} value={i}>{s}</option>)}</select>
        <select aria-label="Team" value={v.team} onChange={(e) => setV({ ...v, team: e.target.value })} className={sel}>{Object.entries(TEAM_ROUTING).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}</select>
        <Input type="date" value={v.due} onChange={(e) => setV({ ...v, due: e.target.value })} aria-label="Due date" className="h-9 w-40" />
      </div>
      <Input value={v.client} onChange={(e) => setV({ ...v, client: e.target.value })} placeholder="Client-visible note (e.g. what information you need)" aria-label="Client note" />
      <Input value={v.internal} onChange={(e) => setV({ ...v, internal: e.target.value })} placeholder="Internal notes (never shown to the client)" aria-label="Internal notes" />
      <Button size="sm" onClick={save}>Save</Button>
    </section>
  );
}
