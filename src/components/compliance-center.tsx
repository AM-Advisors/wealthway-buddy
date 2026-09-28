import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  addControlMapping, addManualEvidence, collectRbacEvidence, createAccessReview, decideAccessReview, getCompliance,
  recordControlStatus, reviewEvidence, saveControlVersion, saveRecord,
} from "@/lib/compliance-controls.functions";
import { CONTROL_STATUSES, CONTROL_TYPES, EVIDENCE_QUERIES, FREQUENCIES, PRIVACY_KINDS, REGISTERS, registerPermissions, STATUS_LABEL } from "@/lib/compliance-model";

type Data = { perms: string[]; me: string; staff: { id: string; label: string }[]; dashboard: any; controls: any[]; evidence: any[]; requirements: any[]; reviews: any[]; records: any[]; recordHistory: any[]; providers: any[]; report: any[] };
const sel = "h-9 rounded-md border bg-background px-2 text-sm";
const today = () => new Date().toISOString().slice(0, 10);
const quarterStart = () => { const d = new Date(); return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1).toISOString().slice(0, 10); };

function useAct() {
  const qc = useQueryClient();
  return async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.success(ok); await qc.invalidateQueries({ queryKey: ["compliance"] }); return true; }
    catch (e) { toast.error(e instanceof Error ? e.message : "Something went wrong."); return false; }
  };
}

export function ComplianceCenter() {
  const load = useServerFn(getCompliance);
  const q = useQuery({ queryKey: ["compliance"], queryFn: () => load() });
  if (q.isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (q.error || !q.data) return <div className="p-6"><Card><CardContent className="p-6 text-sm">Compliance & Controls is limited to authorized Harmonious administrators.</CardContent></Card></div>;
  const d = q.data as unknown as Data;
  const can = (p: string) => d.perms.includes(p);
  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Compliance & Controls</h1>
        <p className="text-sm text-muted-foreground">How Harmonious controls are designed, operated and evidenced. This supports SOC 2 readiness and privacy governance — it does not certify compliance.</p>
      </div>
      <Tabs defaultValue="home">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="home">Home</TabsTrigger>
          <TabsTrigger value="controls">Control Library</TabsTrigger>
          {can("administration.evidence.view") && <TabsTrigger value="evidence">Evidence</TabsTrigger>}
          <TabsTrigger value="reviews">Access Reviews</TabsTrigger>
          {can("administration.privacy.view") && <TabsTrigger value="privacy">Privacy</TabsTrigger>}
          {can("administration.vendors.view") && <TabsTrigger value="vendors">Vendors</TabsTrigger>}
          {can("administration.risks.view") && <TabsTrigger value="risks">Risks</TabsTrigger>}
          {can("administration.incidents.view") && <TabsTrigger value="incidents">Incidents</TabsTrigger>}
          <TabsTrigger value="report">Mapping report</TabsTrigger>
        </TabsList>
        <TabsContent value="home"><Home d={d} /></TabsContent>
        <TabsContent value="controls"><Controls d={d} /></TabsContent>
        <TabsContent value="evidence"><Evidence d={d} /></TabsContent>
        <TabsContent value="reviews"><Reviews d={d} /></TabsContent>
        <TabsContent value="privacy">
          <Tabs defaultValue="data_map">
            <TabsList className="flex-wrap h-auto">{[...PRIVACY_KINDS, "privacy_review"].map((k) => <TabsTrigger key={k} value={k}>{REGISTERS[k]!.label}</TabsTrigger>)}</TabsList>
            {[...PRIVACY_KINDS, "privacy_review"].map((k) => <TabsContent key={k} value={k}><Register d={d} kind={k} /></TabsContent>)}
          </Tabs>
        </TabsContent>
        <TabsContent value="vendors"><Register d={d} kind="vendor" /></TabsContent>
        <TabsContent value="risks"><Register d={d} kind="risk" /></TabsContent>
        <TabsContent value="incidents"><Register d={d} kind="incident" /></TabsContent>
        <TabsContent value="report"><Report d={d} /></TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-md border p-3"><div className="text-2xl font-semibold">{value}</div><div className="text-xs text-muted-foreground">{label}</div></div>;
}
function Home({ d }: { d: Data }) {
  const x = d.dashboard;
  const groups: [string, [string, number][]][] = [
    ["Controls", [["Operating or tested", x.controls.operating], ["Overdue", x.controls.overdue], ["Exceptions", x.controls.exceptions]]],
    ["Evidence", [["Due this month", x.evidence.dueThisMonth], ["Awaiting review", x.evidence.awaitingReview]]],
    ["Access Reviews", [["Open campaigns", x.accessReviews.open], ["Overdue", x.accessReviews.overdue]]],
    ["Privacy", [["Open rights requests", x.privacy.openRights], ["DPIAs awaiting review", x.privacy.dpiasAwaiting], ["Retention reviews due", x.privacy.retentionDue]]],
    ["Vendors", [["Security reviews due", x.vendors.reviewsDue], ["DPAs missing or pending", x.vendors.dpaMissing]]],
    ["Risks", [["High residual risks", x.risks.highResidual], ["Overdue remediation", x.risks.overdue]]],
    ["Incidents", [["Open", x.incidents.open], ["Corrective actions outstanding", x.incidents.correctiveOutstanding]]],
  ];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {groups.map(([t, s]) => <Card key={t}><CardHeader className="pb-2"><CardTitle className="text-base">{t}</CardTitle></CardHeader><CardContent className="grid grid-cols-3 gap-2">{s.map(([l, v]) => <Stat key={l} label={l} value={v} />)}</CardContent></Card>)}
      <p className="text-xs text-muted-foreground md:col-span-2">Factual counts only. There is no compliance score.</p>
    </div>
  );
}

function StatusBadge({ s }: { s: string | null }) {
  if (!s) return <Badge variant="outline">No status recorded</Badge>;
  return <Badge variant={s === "exception" || s === "remediation" ? "destructive" : s === "operating" || s === "tested" ? "default" : "secondary"}>{STATUS_LABEL[s as keyof typeof STATUS_LABEL] ?? s}</Badge>;
}

function Controls({ d }: { d: Data }) {
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const can = (p: string) => d.perms.includes(p);
  return (
    <div className="space-y-3">
      {can("administration.controls.edit") && <Button size="sm" onClick={() => setEditing({})}>New control</Button>}
      {editing && <ControlForm d={d} initial={editing} onDone={() => setEditing(null)} />}
      {d.controls.map((c: any) => (
        <Card key={c.control_key}>
          <CardContent className="space-y-2 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <button className="font-medium" onClick={() => setOpen(open === c.control_key ? null : c.control_key)}>{c.control_key} — {c.name}</button>
              <StatusBadge s={c.status} /><Badge variant="outline">v{c.version}</Badge><Badge variant="outline">{c.control_type}</Badge><Badge variant="outline">{c.frequency.replace("_", " ")}</Badge>
              {c.mappings.map((m: string) => <Badge key={m} variant="secondary">{m}</Badge>)}
            </div>
            <p className="text-sm text-muted-foreground">{c.description}</p>
            {open === c.control_key && <ControlDetail d={d} c={c} onEdit={() => setEditing(c)} />}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ControlDetail({ d, c, onEdit }: { d: Data; c: any; onEdit: () => void }) {
  const act = useAct();
  const setStatus = useServerFn(recordControlStatus);
  const map = useServerFn(addControlMapping);
  const [st, setSt] = useState<string>("designed");
  const [ev, setEv] = useState<string>("");
  const [note, setNote] = useState("");
  const [req, setReq] = useState("");
  const name = (id: string | null) => d.staff.find((s) => s.id === id)?.label ?? "—";
  const can = (p: string) => d.perms.includes(p);
  const evs = d.evidence.filter((e: any) => e.control_key === c.control_key);
  return (
    <div className="space-y-3 border-t pt-3 text-sm">
      <div className="grid gap-1 md:grid-cols-2">
        <div><b>Objective:</b> {c.objective}</div><div><b>System / process:</b> {c.system_process}</div>
        <div><b>Owner:</b> {c.owner_label || "—"}</div><div><b>Operator:</b> {name(c.operator_user_id)} · <b>Reviewer:</b> {name(c.reviewer_user_id)} {c.sod_required ? "(must differ)" : ""}</div>
        <div><b>Evidence requirements:</b> {c.evidence_requirements}</div><div><b>Implementation:</b> {c.implementation}</div>
        <div><b>Last performed:</b> {c.last_performed?.slice(0, 10) ?? "—"} · <b>Last tested:</b> {c.last_tested?.slice(0, 10) ?? "—"}</div><div><b>Next due:</b> {c.next_due ?? "Per event / on change"} · <b>Exceptions:</b> {c.exceptions}</div>
        <div><b>Effective:</b> {c.effective_at.slice(0, 10)}</div>
      </div>
      <div><b>Version history</b> (versions are never rewritten)
        <ul className="list-disc pl-5">{c.versions.map((v: any) => <li key={v.version}>v{v.version} · {v.created_at.slice(0, 10)} · {v.change_reason}</li>)}</ul>
      </div>
      {can("administration.controls.edit") && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={onEdit}>New version</Button>
          <select className={sel} value={req} onChange={(e) => setReq(e.target.value)}><option value="">Map to requirement…</option>{d.requirements.map((r: any) => <option key={r.id} value={r.id}>{r.framework}: {r.code}</option>)}</select>
          <Button size="sm" variant="outline" disabled={!req} onClick={() => act(() => map({ data: { control_key: c.control_key, requirement_id: req } }), "Mapping added")}>Add mapping</Button>
        </div>
      )}
      {can("administration.controls.review") && (
        <div className="flex flex-wrap items-center gap-2">
          <select className={sel} value={st} onChange={(e) => setSt(e.target.value)}>{CONTROL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>
          <select className={sel} value={ev} onChange={(e) => setEv(e.target.value)}><option value="">No evidence linked</option>{evs.map((e: any) => <option key={e.id} value={e.id}>{e.evidence_type} · {e.collected_at.slice(0, 10)}</option>)}</select>
          <Input className="w-64" placeholder="Note (required)" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button size="sm" onClick={() => act(() => setStatus({ data: { control_key: c.control_key, status: st as any, evidence_id: ev || null, note } }), "Status recorded")}>Record status</Button>
        </div>
      )}
    </div>
  );
}

function ControlForm({ d, initial, onDone }: { d: Data; initial: any; onDone: () => void }) {
  const act = useAct();
  const save = useServerFn(saveControlVersion);
  const [f, setF] = useState<any>({ control_key: "", name: "", objective: "", description: "", control_type: "preventive", system_process: "", owner_label: "", operator_user_id: null, reviewer_user_id: null, frequency: "quarterly", evidence_requirements: "", implementation: "", sod_required: true, ...initial, change_reason: initial.control_key ? "" : "Initial version" });
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value || (k.endsWith("user_id") ? null : "") });
  return (
    <Card><CardContent className="grid gap-2 p-4 md:grid-cols-2">
      <Input placeholder="Control ID (e.g. AC-07)" value={f.control_key} disabled={!!initial.control_key} onChange={set("control_key")} />
      <Input placeholder="Control name" value={f.name} onChange={set("name")} />
      <Textarea placeholder="Objective" value={f.objective} onChange={set("objective")} />
      <Textarea placeholder="Description" value={f.description} onChange={set("description")} />
      <select className={sel} value={f.control_type} onChange={set("control_type")}>{CONTROL_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
      <select className={sel} value={f.frequency} onChange={set("frequency")}>{FREQUENCIES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}</select>
      <Input placeholder="System / process" value={f.system_process} onChange={set("system_process")} />
      <Input placeholder="Owner" value={f.owner_label} onChange={set("owner_label")} />
      <select className={sel} value={f.operator_user_id ?? ""} onChange={set("operator_user_id")}><option value="">Operator…</option>{d.staff.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
      <select className={sel} value={f.reviewer_user_id ?? ""} onChange={set("reviewer_user_id")}><option value="">Reviewer…</option>{d.staff.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
      <Textarea placeholder="Evidence requirements" value={f.evidence_requirements} onChange={set("evidence_requirements")} />
      <Textarea placeholder="Existing implementation" value={f.implementation} onChange={set("implementation")} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.sod_required} onChange={(e) => setF({ ...f, sod_required: e.target.checked })} /> Operator and reviewer must differ</label>
      <Input placeholder="Reason for this version" value={f.change_reason} onChange={set("change_reason")} />
      <div className="flex gap-2 md:col-span-2">
        <Button size="sm" onClick={async () => { if (await act(() => save({ data: f }), "Control version saved")) onDone(); }}>Save as new version</Button>
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </CardContent></Card>
  );
}

function Evidence({ d }: { d: Data }) {
  const act = useAct();
  const collect = useServerFn(collectRbacEvidence);
  const manual = useServerFn(addManualEvidence);
  const review = useServerFn(reviewEvidence);
  const [qk, setQk] = useState<string>("super_admins");
  const [ps, setPs] = useState(quarterStart()); const [pe, setPe] = useState(today());
  const [m, setM] = useState({ control_key: d.controls[0]?.control_key ?? "", evidence_type: "", source: "", artifact_reference: "", note: "" });
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const can = (p: string) => d.perms.includes(p);
  const name = (id: string | null) => d.staff.find((s) => s.id === id)?.label ?? (id ? "Unknown" : "—");
  return (
    <div className="space-y-4">
      {can("administration.evidence.collect") && (
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Generate evidence from Access Control (read-only)</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <select className={sel} value={qk} onChange={(e) => setQk(e.target.value)}>{Object.entries(EVIDENCE_QUERIES).map(([k, v]) => <option key={k} value={k}>{v.label} ({v.control})</option>)}</select>
            <Input type="date" className="w-40" value={ps} onChange={(e) => setPs(e.target.value)} /><Input type="date" className="w-40" value={pe} onChange={(e) => setPe(e.target.value)} />
            <Button size="sm" onClick={() => act(() => collect({ data: { query: qk as any, period_start: ps, period_end: pe } }), "Evidence collected")}>Collect</Button>
          </CardContent>
          <CardContent className="grid gap-2 border-t pt-3 md:grid-cols-3">
            <select className={sel} value={m.control_key} onChange={(e) => setM({ ...m, control_key: e.target.value })}>{d.controls.map((c: any) => <option key={c.control_key}>{c.control_key}</option>)}</select>
            <Input placeholder="Evidence type" value={m.evidence_type} onChange={(e) => setM({ ...m, evidence_type: e.target.value })} />
            <Input placeholder="Source" value={m.source} onChange={(e) => setM({ ...m, source: e.target.value })} />
            <Input placeholder="Artifact reference (no sensitive values)" value={m.artifact_reference} onChange={(e) => setM({ ...m, artifact_reference: e.target.value })} />
            <Input placeholder="Note" value={m.note} onChange={(e) => setM({ ...m, note: e.target.value })} />
            <Button size="sm" variant="outline" onClick={() => act(() => manual({ data: { ...m, period_start: ps, period_end: pe, supersedes_id: null } }), "Manual evidence added")}>Add manual evidence</Button>
          </CardContent>
        </Card>
      )}
      <div className="space-y-2">
        {[...d.evidence].reverse().map((e: any) => (
          <Card key={e.id}><CardContent className="space-y-1 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <button className="font-medium" onClick={() => setOpen(open === e.id ? null : e.id)}>{e.control_key} · {e.evidence_type}</button>
              <Badge variant="outline">{e.system_generated ? "System generated" : "Manual"}</Badge>
              {e.record_count != null && <Badge variant="outline">{e.record_count} records</Badge>}
              {e.superseded && <Badge variant="secondary">Superseded (retained)</Badge>}
              {e.reviews.map((r: any) => <Badge key={r.id} variant={r.decision === "accepted" ? "default" : "destructive"}>{r.decision} by {name(r.reviewer_user_id)}</Badge>)}
              {!e.reviews.length && <Badge variant="outline">Awaiting review</Badge>}
            </div>
            <div className="text-xs text-muted-foreground">ID {e.id.slice(0, 8)} · {e.source} · period {e.period_start ?? "—"} → {e.period_end ?? "—"} · collected {e.collected_at.slice(0, 16).replace("T", " ")} by {name(e.collected_by)} · {e.query_version ?? "manual"} · fingerprint {e.fingerprint?.slice(0, 16) ?? "—"}</div>
            {open === e.id && (
              <div className="space-y-2">
                <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(e.summary?.items ?? e.summary, null, 2)}</pre>
                {can("administration.evidence.review") && (
                  <div className="flex flex-wrap gap-2">
                    <Input className="w-72" placeholder="Review note" value={note} onChange={(x) => setNote(x.target.value)} />
                    <Button size="sm" onClick={() => act(() => review({ data: { evidence_id: e.id, decision: "accepted", note } }), "Evidence accepted")}>Accept</Button>
                    <Button size="sm" variant="destructive" onClick={() => act(() => review({ data: { evidence_id: e.id, decision: "exception", note } }), "Exception recorded")}>Record exception</Button>
                    {e.system_generated && can("administration.evidence.collect") && <Button size="sm" variant="outline" onClick={() => act(() => collect({ data: { query: e.artifact_reference.replace("rbac:", ""), period_start: e.period_start, period_end: e.period_end, supersedes_id: e.id } }), "Regenerated — original retained")}>Regenerate (keeps original)</Button>}
                  </div>
                )}
              </div>
            )}
          </CardContent></Card>
        ))}
        {!d.evidence.length && <p className="text-sm text-muted-foreground">No evidence collected yet.</p>}
      </div>
    </div>
  );
}

function Reviews({ d }: { d: Data }) {
  const act = useAct();
  const create = useServerFn(createAccessReview);
  const decide = useServerFn(decideAccessReview);
  const [f, setF] = useState({ title: "Quarterly Harmonious Privileged Access Review", population: "privileged", period_start: quarterStart(), period_end: today(), reviewer_user_id: "" });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const name = (id: string | null) => d.staff.find((s) => s.id === id)?.label ?? "—";
  return (
    <div className="space-y-4">
      {d.perms.includes("administration.access_reviews.manage") && (
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">New access-review campaign</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Input className="w-80" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            <select className={sel} value={f.population} onChange={(e) => setF({ ...f, population: e.target.value })}><option value="privileged">Privileged access</option><option value="staff">Harmonious staff</option><option value="scoped">Scoped client/fund access</option></select>
            <Input type="date" className="w-40" value={f.period_start} onChange={(e) => setF({ ...f, period_start: e.target.value })} /><Input type="date" className="w-40" value={f.period_end} onChange={(e) => setF({ ...f, period_end: e.target.value })} />
            <select className={sel} value={f.reviewer_user_id} onChange={(e) => setF({ ...f, reviewer_user_id: e.target.value })}><option value="">Reviewer…</option>{d.staff.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
            <Button size="sm" onClick={() => act(() => create({ data: f as any }), "Campaign created with snapshot")}>Create</Button>
          </CardContent>
        </Card>
      )}
      <p className="text-xs text-muted-foreground">Decisions are recorded here; revoking or reducing access is done separately in Access Control. Snapshots never change after creation.</p>
      {d.reviews.map((r: any) => {
        const decided = (k: string) => r.decisions.filter((x: any) => x.item_key === k).at(-1);
        const mine = r.reviewer_user_id === d.me && !r.completed;
        return (
          <Card key={r.id}><CardHeader className="pb-2"><CardTitle className="text-base">{r.title} <Badge variant={r.completed ? "default" : "outline"}>{r.completed ? "Completed" : "Open"}</Badge></CardTitle>
            <p className="text-xs text-muted-foreground">Period {r.period_start} → {r.period_end} · population {r.population} ({r.snapshot.items.length}) · reviewer {name(r.reviewer_user_id)} · snapshot {r.snapshot.taken_at.slice(0, 16).replace("T", " ")} · fingerprint {r.fingerprint.slice(0, 16)}</p></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-xs"><thead><tr className="text-left text-muted-foreground">{["Person", "Role", "Scope", "Sensitive Access", "Grant Source", "Granted By", "Last Used", "Expiry", "Review Decision"].map((h) => <th key={h} className="p-1">{h}</th>)}</tr></thead>
                <tbody>{r.snapshot.items.map((i: any) => { const dd = decided(i.key); return (
                  <tr key={i.key} className="border-t align-top"><td className="p-1">{i.person}</td><td className="p-1">{i.role}</td><td className="p-1">{i.scope}</td><td className="p-1">{i.sensitive || "—"}</td><td className="p-1">{i.source}</td><td className="p-1">{i.granted_by}</td><td className="p-1">{i.last_used}</td><td className="p-1">{i.expiry}</td>
                    <td className="p-1">{dd ? <span>{dd.decision}{dd.note ? ` — ${dd.note}` : ""}</span> : mine ? (
                      <div className="flex flex-wrap gap-1"><Input className="h-7 w-40" placeholder="Note" value={notes[i.key] ?? ""} onChange={(e) => setNotes({ ...notes, [i.key]: e.target.value })} />
                        {(["approve", "revoke", "reduce", "investigate"] as const).map((x) => <Button key={x} size="sm" variant="outline" className="h-7 px-2" onClick={() => act(() => decide({ data: { review_id: r.id, item_key: i.key, decision: x, note: notes[i.key] ?? "" } }), "Decision recorded")}>{x === "reduce" ? "Reduce" : x === "investigate" ? "Investigate" : x[0]!.toUpperCase() + x.slice(1)}</Button>)}</div>
                    ) : "Pending"}</td></tr>); })}</tbody></table>
              {mine && <Button size="sm" className="mt-2" onClick={() => act(() => decide({ data: { review_id: r.id, item_key: "__complete__", decision: "complete", note: "Review completed" } }), "Review completed")}>Complete review</Button>}
            </CardContent></Card>
        );
      })}
      {!d.reviews.length && <p className="text-sm text-muted-foreground">No campaigns yet.</p>}
    </div>
  );
}

function Register({ d, kind }: { d: Data; kind: string }) {
  const spec = REGISTERS[kind]!;
  const act = useAct();
  const save = useServerFn(saveRecord);
  const rows = useMemo(() => d.records.filter((r: any) => r.kind === kind).sort((a: any, b: any) => a.record_ref.localeCompare(b.record_ref)), [d.records, kind]);
  const [edit, setEdit] = useState<any | null>(null);
  const canManage = d.perms.includes(registerPermissions(kind).manage);
  const history = (ref: string) => d.recordHistory.filter((h: any) => h.kind === kind && h.record_ref === ref).sort((a: any, b: any) => b.version - a.version);
  return (
    <div className="space-y-3 pt-2">
      {spec.note && <p className="text-sm text-muted-foreground">{spec.note}</p>}
      {canManage && <Button size="sm" onClick={() => setEdit({ record_ref: null, title: "", status: spec.statuses[0], data: {}, change_reason: "" })}>Add {spec.label.replace(/s$/, "").toLowerCase()}</Button>}
      {edit && (
        <Card><CardContent className="grid gap-2 p-4 md:grid-cols-2">
          <Input placeholder="Title" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
          <select className={sel} value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>{spec.statuses.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}</select>
          {spec.fields.map((f) => {
            const v = edit.data[f.key];
            const set = (val: any) => setEdit({ ...edit, data: { ...edit.data, [f.key]: val } });
            const label = `${f.label}${f.required ? " *" : ""}${f.humanOnly ? " (human decision)" : ""}`;
            if (f.type === "bool") return <label key={f.key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!v} onChange={(e) => set(e.target.checked)} /> {label}</label>;
            if (f.type === "select") return <select key={f.key} className={sel} value={v ?? ""} onChange={(e) => set(e.target.value || null)}><option value="">{label}…</option>{f.options!.map((o) => <option key={o} value={o}>{o}</option>)}</select>;
            if (f.type === "person") return <select key={f.key} className={sel} value={v ?? ""} onChange={(e) => set(e.target.value || null)}><option value="">{label}…</option>{d.staff.map((s) => <option key={s.id} value={s.label}>{s.label}</option>)}</select>;
            if (f.key === "provider_id") return <select key={f.key} className={sel} value={v ?? ""} onChange={(e) => set(e.target.value || null)}><option value="">Existing provider record…</option>{d.providers.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>;
            if (f.key === "control_key") return <select key={f.key} className={sel} value={v ?? ""} onChange={(e) => set(e.target.value || null)}><option value="">{label}…</option>{d.controls.map((c: any) => <option key={c.control_key} value={c.control_key}>{c.control_key} — {c.name}</option>)}</select>;
            if (f.type === "long") return <Textarea key={f.key} placeholder={label} value={v ?? ""} onChange={(e) => set(e.target.value)} />;
            return <div key={f.key}><Input type={f.type === "date" ? "date" : "text"} placeholder={label} title={label} value={v ?? ""} onChange={(e) => set(e.target.value)} />{f.type === "date" && <span className="text-xs text-muted-foreground">{label}</span>}</div>;
          })}
          {edit.record_ref && <Input placeholder="Reason for change (required)" value={edit.change_reason} onChange={(e) => setEdit({ ...edit, change_reason: e.target.value })} />}
          <div className="flex gap-2 md:col-span-2">
            <Button size="sm" onClick={async () => { if (await act(() => save({ data: { kind, ...edit } }), edit.record_ref ? "New version saved" : "Saved")) setEdit(null); }}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
          </div>
        </CardContent></Card>
      )}
      {rows.map((r: any) => (
        <Card key={r.id}><CardContent className="space-y-1 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2"><b>{r.record_ref}</b> {r.title}<Badge variant="outline">{r.status.replace(/_/g, " ")}</Badge><Badge variant="outline">v{r.version}</Badge>
            {canManage && <Button size="sm" variant="ghost" className="h-7" onClick={() => setEdit({ record_ref: r.record_ref, title: r.title, status: r.status, data: { ...r.data }, change_reason: "" })}>Update</Button>}</div>
          <div className="grid gap-x-4 text-xs text-muted-foreground md:grid-cols-2">{spec.fields.filter((f) => r.data[f.key] !== undefined && r.data[f.key] !== null && r.data[f.key] !== "").map((f) => <div key={f.key}><b>{f.label}:</b> {f.key === "provider_id" ? d.providers.find((p: any) => p.id === r.data[f.key])?.name ?? r.data[f.key] : String(r.data[f.key] === true ? "Yes" : r.data[f.key] === false ? "No" : r.data[f.key])}</div>)}</div>
          {history(r.record_ref).length > 1 && <div className="text-xs text-muted-foreground">History: {history(r.record_ref).map((h: any) => `v${h.version} ${h.status} (${h.created_at.slice(0, 10)}: ${h.change_reason})`).join(" · ")}</div>}
        </CardContent></Card>
      ))}
      {!rows.length && <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>}
    </div>
  );
}

function Report({ d }: { d: Data }) {
  return (
    <div className="overflow-x-auto">
      <p className="mb-2 text-sm text-muted-foreground">Initial control mapping based on what exists in the application. Nothing is marked Operating or Tested without collected, reviewed evidence.</p>
      <table className="w-full text-xs"><thead><tr className="text-left text-muted-foreground">{["Control", "Existing Implementation", "Evidence Available", "Evidence Missing", "SOC 2", "GDPR", "Status"].map((h) => <th key={h} className="p-1">{h}</th>)}</tr></thead>
        <tbody>{d.report.map((r: any) => <tr key={r.control} className="border-t align-top"><td className="p-1 font-medium">{r.control}</td><td className="p-1">{r.implementation}</td><td className="p-1">{r.available}</td><td className="p-1">{r.missing}</td><td className="p-1">{r.soc2}</td><td className="p-1">{r.gdpr || "—"}</td><td className="p-1"><StatusBadge s={r.status} /></td></tr>)}</tbody></table>
    </div>
  );
}
