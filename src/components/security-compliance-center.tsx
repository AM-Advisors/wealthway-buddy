import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { ComplianceCenter } from "@/components/compliance-center";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  decideDocumentRequest, decideRiskAcceptance, getSecurityCompliance, saveAudit, saveControlDetails, saveEvidenceDetails,
  saveFramework, savePolicy, savePublication, saveRisk, saveScopeItem, transitionPolicy, transitionPublication,
} from "@/lib/security-compliance.functions";
import {
  ACCESS_LEVEL_LABEL, ASSURANCE_LABEL, ASSURANCE_STATUSES, CONTROL_DOMAINS, IMPACT, LIFECYCLE, LIFECYCLE_LABEL, LIKELIHOOD,
  POLICY_CATEGORIES, riskBand, riskScore, SCOPE_ITEM_TYPES, TREATMENTS, type Lifecycle,
} from "@/lib/security-compliance-model";

export const SC_SECTIONS = [
  ["overview", "Overview"], ["frameworks", "Frameworks"], ["controls", "Controls"], ["evidence", "Evidence"], ["risks", "Risks"],
  ["policies", "Policies"], ["vendors", "Vendors"], ["assets", "Assets & Systems"], ["access", "Access Reviews"],
  ["vulnerabilities", "Vulnerabilities"], ["incidents", "Incidents"], ["bcdr", "Business Continuity"], ["privacy", "Privacy"],
  ["employees", "Employees"], ["audits", "Audits"], ["exceptions", "Exceptions"], ["trust", "Trust Center"],
] as const;
export type ScSection = (typeof SC_SECTIONS)[number][0];

/** Sections served by the existing Compliance & Controls registers for now. */
const LEGACY: Partial<Record<ScSection, string>> = { vendors: "vendors", access: "reviews", incidents: "incidents", privacy: "privacy", exceptions: "home", employees: "home" };
const PLANNED: ScSection[] = ["assets", "vulnerabilities", "bcdr"];

type Data = Awaited<ReturnType<typeof getSecurityCompliance>>;
const label = (s: string | null | undefined) => (s ?? "").replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
const csv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const toastErr = (e: any) => toast.error(e?.message?.replace(/\[self-approval:[^\]]*\]/, "") ?? "Could not save.");

function useRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["security-compliance"] });
}

export function SecurityComplianceCenter({ section, onSection }: { section: ScSection; onSection: (s: ScSection) => void }) {
  const get = useServerFn(getSecurityCompliance);
  const q = useQuery({ queryKey: ["security-compliance"], queryFn: () => get(), retry: false });
  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row">
      <nav aria-label="Security & Compliance sections" className="lg:w-52 lg:shrink-0">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Security & Compliance</p>
        <ul className="flex flex-wrap gap-1 lg:flex-col">
          {SC_SECTIONS.map(([k, v]) => (
            <li key={k}>
              <button type="button" onClick={() => onSection(k)} aria-current={section === k ? "page" : undefined}
                className={`w-full rounded-md px-3 py-1.5 text-left text-sm ${section === k ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"}`}>{v}</button>
            </li>
          ))}
        </ul>
      </nav>
      <main className="min-w-0 flex-1 space-y-4">
        {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : q.error ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> : q.data ? <Section s={section} d={q.data} /> : null}
      </main>
    </div>
  );
}

function Section({ s, d }: { s: ScSection; d: Data }) {
  if (PLANNED.includes(s)) return <Planned title={SC_SECTIONS.find((x) => x[0] === s)![1]} />;
  if (LEGACY[s]) return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Shown from the existing Compliance & Controls registers. These records carry over unchanged; the dedicated module follows in the next phase.</p>
      <ComplianceCenter initialTab={LEGACY[s]} />
    </div>
  );
  switch (s) {
    case "overview": return <Overview d={d} />;
    case "frameworks": return <Frameworks d={d} />;
    case "controls": return <Controls d={d} />;
    case "evidence": return <Evidence d={d} />;
    case "risks": return <Risks d={d} />;
    case "policies": return <Policies d={d} />;
    case "audits": return <Audits d={d} />;
    case "trust": return <Trust d={d} />;
    default: return null;
  }
}

function Planned({ title }: { title: string }) {
  return <Card><CardHeader><CardTitle className="text-base">{title}</CardTitle><CardDescription>Planned — next phase. No records are kept here yet, and nothing is shown as complete.</CardDescription></CardHeader></Card>;
}

function Stat({ k, v, sub }: { k: string; v: string | number; sub?: string }) {
  return <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">{k}</p><p className="mt-1 text-2xl font-medium">{v}</p>{sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}</div>;
}
function Bar({ pct }: { pct: number }) {
  return <div className="h-2 w-full rounded bg-muted"><div className="h-2 rounded bg-primary" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} /></div>;
}

// ------------------------------------------------------------------ overview

function Overview({ d }: { d: Data }) {
  const o = d.overview;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl">Security & Compliance Overview</h1>
        <p className="text-sm text-muted-foreground">Calculated from recorded controls, evidence and risks. This workspace does not certify Harmonious; external status follows only recorded external results.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat k="Controls operating effectively" v={`${o.controlsEffective} / ${o.controlsTotal}`} />
        <Stat k="Evidence current" v={`${o.evidenceCurrent} / ${o.evidenceTotal}`} />
        <Stat k="Open high/critical risks" v={o.openHighRisks} />
        <Stat k="Open findings" v={o.openFindings} />
        <Stat k="Policies due for review" v={o.policiesDue} />
        <Stat k="Vendor reviews due" v={o.vendorReviewsDue} />
        <Stat k="Access reviews due" v={o.accessReviewsDue} />
        <Stat k="Vulnerabilities past SLA" v="—" sub="Module planned" />
        <Stat k="Open incidents" v={o.openIncidents} />
        <Stat k="Audit readiness" v={`${o.auditReadiness}%`} sub="Requirements with an effective control" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle className="text-base">Control effectiveness by domain</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">{o.domains.map((x) => (
            <div key={x.domain}><div className="flex justify-between"><span>{CONTROL_DOMAINS[x.domain] ?? x.domain}</span><span className="text-muted-foreground">{x.effective}/{x.total}</span></div><Bar pct={x.total ? (x.effective / x.total) * 100 : 0} /></div>
          ))}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Framework readiness</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">{o.frameworks.map((f) => (
            <div key={f.name}><div className="flex justify-between"><span>{f.name}</span><span className="text-muted-foreground">{f.readiness}% · {f.gaps} unmapped</span></div><Bar pct={f.readiness} /></div>
          ))}</CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle className="text-base">Risk distribution</CardTitle><CardDescription>Open risks by inherent and residual position.</CardDescription></CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2"><Matrix title="Inherent" points={o.matrix.map((m) => ({ l: m.il, i: m.ii, ref: m.ref }))} /><Matrix title="Residual" points={o.matrix.filter((m) => m.rl && m.ri).map((m) => ({ l: m.rl!, i: m.ri!, ref: m.ref }))} /></CardContent></Card>
    </div>
  );
}

function Matrix({ title, points }: { title: string; points: { l: number; i: number; ref: string }[] }) {
  const tone = (s: number) => ({ low: "bg-muted", medium: "bg-accent/40", high: "bg-accent", critical: "bg-destructive/70", unassessed: "bg-muted" })[riskBand(s)];
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{title} risk</p>
      <div className="grid grid-cols-[auto_repeat(5,minmax(0,1fr))] gap-1 text-[11px]">
        {[5, 4, 3, 2, 1].map((l) => (
          <div key={l} className="contents">
            <span className="pr-1 text-right text-muted-foreground">{LIKELIHOOD[l - 1]}</span>
            {[1, 2, 3, 4, 5].map((i) => {
              const here = points.filter((p) => p.l === l && p.i === i);
              return <div key={i} className={`flex h-10 items-center justify-center rounded ${tone(l * i)}`} title={here.map((h) => h.ref).join(", ")}>{here.length || ""}</div>;
            })}
          </div>
        ))}
        <span />{IMPACT.map((x) => <span key={x} className="text-center text-muted-foreground">{x}</span>)}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ frameworks & scope

function Frameworks({ d }: { d: Data }) {
  const save = useServerFn(saveFramework);
  const addItem = useServerFn(saveScopeItem);
  const refresh = useRefresh();
  const canEdit = d.caps.includes("security_compliance_manage");
  const [edit, setEdit] = useState<any>(null);
  const [item, setItem] = useState({ item_type: "application", name: "", notes: "" });
  const scope = d.scopes[0];
  return (
    <div className="space-y-4">
      <h1 className="text-2xl">Frameworks</h1>
      <p className="text-sm text-muted-foreground">One Harmonious control maps to many frameworks. Only identifiers and short titles are stored, never licensed standard text. Readiness counts requirements covered by an Operating Effectively or Auditor Verified control.</p>
      <div className="grid gap-3 md:grid-cols-2">
        {d.frameworks.map((f) => (
          <Card key={f.key}>
            <CardHeader className="pb-2"><CardTitle className="text-base">{f.name} <span className="text-sm font-normal text-muted-foreground">{f.version}</span></CardTitle>
              <CardDescription>{f.applicability}</CardDescription></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex flex-wrap gap-2"><Badge variant="outline">{label(f.program_status)}</Badge><Badge variant="secondary">Scope: {f.scope_name ?? "Not set"}</Badge>{f.assessor ? <Badge variant="outline">{f.assessor}</Badge> : null}</div>
              <Bar pct={f.readiness} />
              <p className="text-xs text-muted-foreground">{f.total} requirements · {f.mapped} mapped · {f.gaps} gaps · {f.operating} effective · {f.audits} assessment(s){f.assessment_start ? ` · period ${f.assessment_start} to ${f.assessment_end ?? "?"}` : ""}</p>
              {f.total === 0 ? <p className="text-xs text-muted-foreground">No requirement identifiers loaded yet{f.key === "csa_ccm" ? " — load the CAIQ in Privacy → CSA STAR." : "."}</p> : null}
              <details><summary className="cursor-pointer text-xs">Requirements and mapped controls</summary>
                <ul className="mt-1 space-y-1 text-xs">{f.requirements.map((r) => <li key={r.id}><span className="font-medium">{r.code}</span> {r.title} — {r.controls.length ? r.controls.join(", ") : <span className="text-destructive">gap</span>}</li>)}</ul></details>
              {canEdit ? <Button size="sm" variant="outline" onClick={() => setEdit({ ...f })}>Edit</Button> : null}
            </CardContent>
          </Card>
        ))}
      </div>
      {scope ? (
        <Card><CardHeader><CardTitle className="text-base">Compliance scope: {scope.name}</CardTitle><CardDescription>{scope.description}</CardDescription></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {!scope.items.length ? <p className="text-muted-foreground">Nothing defined yet. An empty scope means nothing is in scope.</p> : null}
            <ul className="space-y-1">{scope.items.map((i: any) => (
              <li key={i.id} className="flex flex-wrap items-center gap-2"><Badge variant="outline">{label(i.item_type)}</Badge><span className={i.in_scope ? "" : "line-through text-muted-foreground"}>{i.name}</span>{i.notes ? <span className="text-xs text-muted-foreground">{i.notes}</span> : null}
                {canEdit ? <Button size="sm" variant="ghost" onClick={() => addItem({ data: { id: i.id, scope_id: scope.id, item_type: i.item_type, name: i.name, notes: i.notes, in_scope: !i.in_scope } }).then(refresh).catch(toastErr)}>{i.in_scope ? "Mark out of scope" : "Mark in scope"}</Button> : null}</li>
            ))}</ul>
            {canEdit ? (
              <div className="flex flex-wrap gap-2">
                <Select value={item.item_type} onValueChange={(v) => setItem({ ...item, item_type: v })}><SelectTrigger className="w-44" aria-label="Item type"><SelectValue /></SelectTrigger><SelectContent>{SCOPE_ITEM_TYPES.map((t) => <SelectItem key={t} value={t}>{label(t)}</SelectItem>)}</SelectContent></Select>
                <Input className="w-56" placeholder="Name" value={item.name} onChange={(e) => setItem({ ...item, name: e.target.value })} />
                <Input className="w-56" placeholder="Notes" value={item.notes} onChange={(e) => setItem({ ...item, notes: e.target.value })} />
                <Button size="sm" disabled={!item.name.trim()} onClick={() => addItem({ data: { scope_id: scope.id, item_type: item.item_type as any, name: item.name, notes: item.notes, in_scope: true } }).then(() => { setItem({ ...item, name: "", notes: "" }); refresh(); }).catch(toastErr)}>Add to scope</Button>
              </div>
            ) : null}
          </CardContent></Card>
      ) : null}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent><DialogHeader><DialogTitle>{edit?.name}</DialogTitle></DialogHeader>
          {edit ? (
            <div className="space-y-2 text-sm">
              <Select value={edit.program_status} onValueChange={(v) => setEdit({ ...edit, program_status: v })}><SelectTrigger aria-label="Program status"><SelectValue /></SelectTrigger><SelectContent>{["not_started", "planned", "in_progress", "active", "paused"].map((x) => <SelectItem key={x} value={x}>{label(x)}</SelectItem>)}</SelectContent></Select>
              <Textarea placeholder="Applicability" value={edit.applicability} onChange={(e) => setEdit({ ...edit, applicability: e.target.value })} />
              <Input placeholder="Auditor / certification body" value={edit.assessor} onChange={(e) => setEdit({ ...edit, assessor: e.target.value })} />
              <div className="flex gap-2"><Input type="date" aria-label="Assessment start" value={edit.assessment_start ?? ""} onChange={(e) => setEdit({ ...edit, assessment_start: e.target.value || null })} /><Input type="date" aria-label="Assessment end" value={edit.assessment_end ?? ""} onChange={(e) => setEdit({ ...edit, assessment_end: e.target.value || null })} /></div>
              <Textarea placeholder="Internal notes" value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
              <Button onClick={() => save({ data: { key: edit.key, applicability: edit.applicability, scope_id: edit.scope_id, program_status: edit.program_status, assessment_start: edit.assessment_start, assessment_end: edit.assessment_end, assessor: edit.assessor, notes: edit.notes } }).then(() => { setEdit(null); refresh(); toast.success("Saved."); }).catch(toastErr)}>Save</Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ------------------------------------------------------------------ controls

function Controls({ d }: { d: Data }) {
  const [open, setOpen] = useState<any>(null);
  const [filter, setFilter] = useState("");
  const rows = d.controls.filter((c) => !filter || `${c.canonical_id} ${c.name} ${c.domain}`.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl">Harmonious Control Library</h1>
      <p className="text-sm text-muted-foreground">One canonical control, mapped to every framework it supports. Marking a control Implemented never changes external assurance.</p>
      <Input className="max-w-sm" placeholder="Search controls" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="p-2">Control</th><th className="p-2">Domain</th><th className="p-2">Status</th><th className="p-2">Evidence</th><th className="p-2">Frameworks</th><th className="p-2" /></tr></thead>
          <tbody>{rows.map((c) => (
            <tr key={c.control_key} className="border-t align-top">
              <td className="p-2"><span className="font-medium">{c.canonical_id}</span> <span className="text-xs text-muted-foreground">({c.control_key})</span><br />{c.name}</td>
              <td className="p-2 text-xs">{CONTROL_DOMAINS[c.domain] ?? c.domain}</td>
              <td className="p-2"><Badge variant={c.lifecycle === "operating_effectively" || c.lifecycle === "auditor_verified" ? "default" : c.lifecycle === "failed" ? "destructive" : "outline"}>{LIFECYCLE_LABEL[c.lifecycle]}</Badge></td>
              <td className="p-2 text-xs">{c.evidence.filter((e) => e.current).length} current / {c.evidence.length}</td>
              <td className="p-2 text-xs">{[...new Set(c.mappings.map((m) => m.split(":")[0]))].join(", ") || "—"}</td>
              <td className="p-2"><Button size="sm" variant="outline" onClick={() => setOpen(c)}>Open</Button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {open ? <ControlDialog c={open} d={d} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function ControlDialog({ c, d, onClose }: { c: Data["controls"][number]; d: Data; onClose: () => void }) {
  const save = useServerFn(saveControlDetails);
  const refresh = useRefresh();
  const det: any = c.details ?? {};
  const [f, setF] = useState({
    domain: c.domain, executive_owner: det.executive_owner ?? "", nature: det.nature ?? null, automation: det.automation ?? null,
    systems: (det.systems_in_scope ?? []).join(", "), classes: (det.data_classifications ?? []).join(", "), lifecycle_status: c.lifecycle as Lifecycle,
    audit_id: det.audit_id ?? null, last_tested: det.last_tested ?? null, next_test: det.next_test ?? null, auditor_notes: det.auditor_notes ?? "", internal_notes: det.internal_notes ?? "", change_reason: "",
  });
  const canEdit = d.caps.includes("security_compliance_manage");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>{c.canonical_id} · {c.name}</DialogTitle></DialogHeader>
        <div className="grid gap-3 text-sm md:grid-cols-2">
          <div className="space-y-1 md:col-span-2"><p><span className="font-medium">Objective:</span> {c.objective}</p><p className="text-muted-foreground">{c.description}</p>
            <p className="text-xs">Owner: {c.owner || "—"} · Type: {label(c.control_type)} · Frequency: {label(c.frequency)} · Evidence required: {c.evidence_requirements || "—"}</p>
            <p className="text-xs">Mappings: {c.mappings.join("; ") || "—"}</p>
            <p className="text-xs">Evidence: {c.evidence.map((e) => `${e.title}${e.current ? "" : " (not current)"}`).join("; ") || "none"} · Risks: {c.risks.join(", ") || "—"} · Policies: {c.policies.join(", ") || "—"}</p></div>
          <label className="space-y-1"><span className="text-xs">Status</span>
            <Select value={f.lifecycle_status} onValueChange={(v) => setF({ ...f, lifecycle_status: v as Lifecycle })} disabled={!canEdit}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{LIFECYCLE.map((s) => <SelectItem key={s} value={s}>{LIFECYCLE_LABEL[s]}</SelectItem>)}</SelectContent></Select></label>
          <label className="space-y-1"><span className="text-xs">Domain</span>
            <Select value={f.domain} onValueChange={(v) => setF({ ...f, domain: v })} disabled={!canEdit}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(CONTROL_DOMAINS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></label>
          <label className="space-y-1"><span className="text-xs">Preventive / Detective / Corrective</span>
            <Select value={f.nature ?? ""} onValueChange={(v) => setF({ ...f, nature: v })} disabled={!canEdit}><SelectTrigger><SelectValue placeholder="Not set" /></SelectTrigger><SelectContent>{["preventive", "detective", "corrective"].map((x) => <SelectItem key={x} value={x}>{label(x)}</SelectItem>)}</SelectContent></Select></label>
          <label className="space-y-1"><span className="text-xs">Manual / Automated / Hybrid</span>
            <Select value={f.automation ?? ""} onValueChange={(v) => setF({ ...f, automation: v })} disabled={!canEdit}><SelectTrigger><SelectValue placeholder="Not set" /></SelectTrigger><SelectContent>{["manual", "automated", "hybrid"].map((x) => <SelectItem key={x} value={x}>{label(x)}</SelectItem>)}</SelectContent></Select></label>
          <Input placeholder="Executive owner" value={f.executive_owner} onChange={(e) => setF({ ...f, executive_owner: e.target.value })} disabled={!canEdit} />
          <Input placeholder="Systems in scope (comma separated)" value={f.systems} onChange={(e) => setF({ ...f, systems: e.target.value })} disabled={!canEdit} />
          <Input placeholder="Data classifications (comma separated)" value={f.classes} onChange={(e) => setF({ ...f, classes: e.target.value })} disabled={!canEdit} />
          {f.lifecycle_status === "auditor_verified" ? (
            <Select value={f.audit_id ?? ""} onValueChange={(v) => setF({ ...f, audit_id: v })}><SelectTrigger aria-label="Audit"><SelectValue placeholder="Audit that verified this control" /></SelectTrigger><SelectContent>{d.audits.map((a: any) => <SelectItem key={a.id} value={a.id}>{label(a.audit_type)} · {a.assessor || "assessor"} · {label(a.result)}</SelectItem>)}</SelectContent></Select>
          ) : <span />}
          <label className="space-y-1"><span className="text-xs">Last tested</span><Input type="date" value={f.last_tested ?? ""} onChange={(e) => setF({ ...f, last_tested: e.target.value || null })} disabled={!canEdit} /></label>
          <label className="space-y-1"><span className="text-xs">Next test</span><Input type="date" value={f.next_test ?? ""} onChange={(e) => setF({ ...f, next_test: e.target.value || null })} disabled={!canEdit} /></label>
          <Textarea placeholder="Auditor notes" value={f.auditor_notes} onChange={(e) => setF({ ...f, auditor_notes: e.target.value })} disabled={!canEdit} />
          <Textarea placeholder="Internal notes" value={f.internal_notes} onChange={(e) => setF({ ...f, internal_notes: e.target.value })} disabled={!canEdit} />
          {canEdit ? <>
            <Input className="md:col-span-2" placeholder="Reason for this change (required)" value={f.change_reason} onChange={(e) => setF({ ...f, change_reason: e.target.value })} />
            <Button className="md:col-span-2" disabled={f.change_reason.trim().length < 5} onClick={() => save({ data: {
              control_key: c.control_key, domain: f.domain, executive_owner: f.executive_owner, nature: f.nature, automation: f.automation,
              systems_in_scope: csv(f.systems), data_classifications: csv(f.classes), lifecycle_status: f.lifecycle_status, audit_id: f.audit_id,
              last_tested: f.last_tested, next_test: f.next_test, auditor_notes: f.auditor_notes, internal_notes: f.internal_notes, change_reason: f.change_reason,
            } }).then(() => { toast.success("Control saved as a new version."); refresh(); onClose(); }).catch(toastErr)}>Save new version</Button>
          </> : null}
          <div className="md:col-span-2"><p className="text-xs font-medium">Change history</p>
            <ul className="text-xs text-muted-foreground">{c.history.map((h) => <li key={h.version}>v{h.version} · {LIFECYCLE_LABEL[h.status as Lifecycle] ?? h.status} · {h.reason} · {h.by ?? "system"} · {new Date(h.at).toLocaleString()}</li>)}</ul></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ evidence

function Evidence({ d }: { d: Data }) {
  const save = useServerFn(saveEvidenceDetails);
  const refresh = useRefresh();
  const [edit, setEdit] = useState<any>(null);
  if (!d.caps.includes("evidence_view")) return <Card><CardHeader><CardTitle className="text-base">Evidence</CardTitle><CardDescription>You don't have permission to view security evidence.</CardDescription></CardHeader></Card>;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl">Evidence Repository</h1>
      <p className="text-sm text-muted-foreground">Restricted internal storage. Evidence is never shown in the Trust Center, and every view and download is logged. Upload new files from the Controls register (Compliance & Controls → Evidence).</p>
      {!d.evidence.length ? <p className="text-sm text-muted-foreground">No evidence recorded yet.</p> : null}
      <div className="space-y-2">{d.evidence.map((e) => (
        <div key={e.id} className="rounded-md border p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{e.title}</span><Badge variant={e.current ? "default" : "outline"}>{e.current ? "Current" : e.superseded ? "Superseded" : e.accepted ? "Expired" : "Awaiting review"}</Badge><Badge variant="secondary">{label(e.details?.sensitivity ?? "restricted")}</Badge></div>
          <p className="text-xs text-muted-foreground">{label(e.type)} · {e.source} · collected {new Date(e.collected_at).toLocaleDateString()} by {e.collected_by ?? "—"}{e.period_start ? ` · covers ${e.period_start} to ${e.period_end ?? "?"}` : ""}{e.details?.expires_on ? ` · review by ${e.details.expires_on}` : ""}</p>
          <p className="text-xs">Controls: {e.controlKeys.map((k) => d.controls.find((c) => c.control_key === k)?.canonical_id ?? k).join(", ")}{e.details?.systems?.length ? ` · Systems: ${e.details.systems.join(", ")}` : ""}</p>
          {d.caps.includes("evidence_manage") ? <Button className="mt-1" size="sm" variant="outline" onClick={() => setEdit({ id: e.id, expires_on: e.details?.expires_on ?? null, sensitivity: e.details?.sensitivity ?? "restricted", systems: (e.details?.systems ?? []).join(", "), collection_method: e.details?.collection_method ?? "manual", controls: e.controlKeys.join(", "), requirement_ids: e.details?.requirement_ids ?? [], sha: e.details?.file_sha256 ?? "" })}>Edit details</Button> : null}
        </div>
      ))}</div>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent><DialogHeader><DialogTitle>Evidence details</DialogTitle></DialogHeader>
          {edit ? <div className="space-y-2 text-sm">
            <label className="block space-y-1"><span className="text-xs">Review / expiry date</span><Input type="date" value={edit.expires_on ?? ""} onChange={(e) => setEdit({ ...edit, expires_on: e.target.value || null })} /></label>
            <Select value={edit.sensitivity} onValueChange={(v) => setEdit({ ...edit, sensitivity: v })}><SelectTrigger aria-label="Sensitivity"><SelectValue /></SelectTrigger><SelectContent>{["internal", "restricted", "highly_restricted"].map((x) => <SelectItem key={x} value={x}>{label(x)}</SelectItem>)}</SelectContent></Select>
            <Select value={edit.collection_method} onValueChange={(v) => setEdit({ ...edit, collection_method: v })}><SelectTrigger aria-label="Collection method"><SelectValue /></SelectTrigger><SelectContent>{["manual", "automated", "system_generated"].map((x) => <SelectItem key={x} value={x}>{label(x)}</SelectItem>)}</SelectContent></Select>
            <Input placeholder="Linked systems (comma separated)" value={edit.systems} onChange={(e) => setEdit({ ...edit, systems: e.target.value })} />
            <Input placeholder="Linked control keys, e.g. AC-01, LG-01" value={edit.controls} onChange={(e) => setEdit({ ...edit, controls: e.target.value })} />
            <Input placeholder="File SHA-256 (optional)" value={edit.sha} onChange={(e) => setEdit({ ...edit, sha: e.target.value.trim().toLowerCase() })} />
            <Button onClick={() => save({ data: { evidence_id: edit.id, expires_on: edit.expires_on, sensitivity: edit.sensitivity, systems: csv(edit.systems), collection_method: edit.collection_method, control_keys: csv(edit.controls), requirement_ids: edit.requirement_ids, file_sha256: edit.sha || null } }).then(() => { setEdit(null); refresh(); toast.success("Saved."); }).catch(toastErr)}>Save</Button>
          </div> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ------------------------------------------------------------------ risks

const EMPTY_RISK = { title: "", description: "", category: "", affected_systems: "", affected_data: "", threat: "", vulnerability: "", inherent_likelihood: 3, inherent_impact: 3, residual_likelihood: null as number | null, residual_impact: null as number | null, treatment: null as string | null, owner: "", target_date: null as string | null, review_date: null as string | null, status: "open", controls: "", change_reason: "" };

function Risks({ d }: { d: Data }) {
  const save = useServerFn(saveRisk);
  const decide = useServerFn(decideRiskAcceptance);
  const refresh = useRefresh();
  const [edit, setEdit] = useState<any>(null);
  const [acc, setAcc] = useState<{ ref: string; action: "request" | "approve" | "reject"; reason: string; expires: string } | null>(null);
  const can = d.caps.includes("risk_manage");
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl">Enterprise Security Risk Register</h1>{can ? <Button size="sm" onClick={() => setEdit({ ...EMPTY_RISK })}>Add risk</Button> : null}</div>
      <p className="text-sm text-muted-foreground">Residual risk is assessed explicitly — linking or implementing a control never lowers it. Accepting a risk needs a second approver and an expiry.</p>
      {!d.risks.length ? <p className="text-sm text-muted-foreground">No risks recorded yet.</p> : null}
      <div className="overflow-x-auto rounded-md border"><table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="p-2">Risk</th><th className="p-2">Inherent</th><th className="p-2">Residual</th><th className="p-2">Treatment</th><th className="p-2">Status</th><th className="p-2" /></tr></thead>
        <tbody>{d.risks.map((r: any) => (
          <tr key={r.risk_ref} className="border-t align-top">
            <td className="p-2"><span className="font-medium">{r.risk_ref}</span> {r.title}<br /><span className="text-xs text-muted-foreground">{r.owner || "No owner"} · review {r.review_date ?? "—"}</span></td>
            <td className="p-2">{r.inherent} <span className="text-xs text-muted-foreground">({riskBand(r.inherent)})</span></td>
            <td className="p-2">{r.residual ?? <span className="text-xs text-muted-foreground">Not assessed</span>}</td>
            <td className="p-2">{label(r.treatment) || "—"}</td>
            <td className="p-2"><Badge variant="outline">{label(r.status)}</Badge>{r.status === "accepted" ? <p className="text-xs text-muted-foreground">by {r.accepted_by_label} until {r.acceptance_expires}</p> : null}</td>
            <td className="space-y-1 p-2">{can ? <>
              <Button size="sm" variant="outline" onClick={() => setEdit({ ...r, controls: (r.control_keys ?? []).join(", "), change_reason: "" })}>Edit</Button>
              {r.treatment === "accept" && ["open", "treating"].includes(r.status) ? <Button size="sm" variant="ghost" onClick={() => setAcc({ ref: r.risk_ref, action: "request", reason: "", expires: "" })}>Request acceptance</Button> : null}
              {r.status === "acceptance_requested" ? <><Button size="sm" onClick={() => setAcc({ ref: r.risk_ref, action: "approve", reason: r.acceptance_reason ?? "", expires: r.acceptance_expires ?? "" })}>Approve</Button><Button size="sm" variant="ghost" onClick={() => setAcc({ ref: r.risk_ref, action: "reject", reason: "", expires: "" })}>Reject</Button></> : null}
            </> : null}</td>
          </tr>
        ))}</tbody>
      </table></div>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{edit?.risk_ref ?? "New risk"}</DialogTitle></DialogHeader>
          {edit ? <div className="grid gap-2 text-sm md:grid-cols-2">
            <Input className="md:col-span-2" placeholder="Title" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
            <Textarea className="md:col-span-2" placeholder="Description" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
            {(["category", "owner", "affected_systems", "affected_data", "threat", "vulnerability"] as const).map((k) => <Input key={k} placeholder={label(k)} value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />)}
            <ScoreSelect lbl="Inherent likelihood" opts={LIKELIHOOD} v={edit.inherent_likelihood} on={(v) => setEdit({ ...edit, inherent_likelihood: v })} />
            <ScoreSelect lbl="Inherent impact" opts={IMPACT} v={edit.inherent_impact} on={(v) => setEdit({ ...edit, inherent_impact: v })} />
            <ScoreSelect lbl="Residual likelihood" opts={LIKELIHOOD} v={edit.residual_likelihood} on={(v) => setEdit({ ...edit, residual_likelihood: v })} allowNone />
            <ScoreSelect lbl="Residual impact" opts={IMPACT} v={edit.residual_impact} on={(v) => setEdit({ ...edit, residual_impact: v })} allowNone />
            <Select value={edit.treatment ?? ""} onValueChange={(v) => setEdit({ ...edit, treatment: v })}><SelectTrigger aria-label="Treatment"><SelectValue placeholder="Treatment" /></SelectTrigger><SelectContent>{TREATMENTS.map((t) => <SelectItem key={t} value={t}>{label(t)}</SelectItem>)}</SelectContent></Select>
            <Select value={["open", "treating", "closed"].includes(edit.status) ? edit.status : "open"} onValueChange={(v) => setEdit({ ...edit, status: v })}><SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger><SelectContent>{["open", "treating", "closed"].map((t) => <SelectItem key={t} value={t}>{label(t)}</SelectItem>)}</SelectContent></Select>
            <label className="space-y-1"><span className="text-xs">Target date</span><Input type="date" value={edit.target_date ?? ""} onChange={(e) => setEdit({ ...edit, target_date: e.target.value || null })} /></label>
            <label className="space-y-1"><span className="text-xs">Review date</span><Input type="date" value={edit.review_date ?? ""} onChange={(e) => setEdit({ ...edit, review_date: e.target.value || null })} /></label>
            <Input className="md:col-span-2" placeholder="Existing control keys (comma separated, e.g. AC-01)" value={edit.controls} onChange={(e) => setEdit({ ...edit, controls: e.target.value })} />
            <p className="text-xs text-muted-foreground md:col-span-2">Inherent {riskScore(edit.inherent_likelihood, edit.inherent_impact)} · Residual {riskScore(edit.residual_likelihood, edit.residual_impact) ?? "not assessed"}</p>
            <Input className="md:col-span-2" placeholder="Reason for this change (required)" value={edit.change_reason} onChange={(e) => setEdit({ ...edit, change_reason: e.target.value })} />
            <Button className="md:col-span-2" disabled={edit.title.trim().length < 3 || edit.change_reason.trim().length < 5} onClick={() => save({ data: {
              risk_ref: edit.risk_ref, title: edit.title, description: edit.description, category: edit.category, affected_systems: edit.affected_systems, affected_data: edit.affected_data,
              threat: edit.threat, vulnerability: edit.vulnerability, inherent_likelihood: edit.inherent_likelihood, inherent_impact: edit.inherent_impact,
              residual_likelihood: edit.residual_likelihood, residual_impact: edit.residual_impact, treatment: edit.treatment, owner: edit.owner, target_date: edit.target_date,
              review_date: edit.review_date, status: ["open", "treating", "closed"].includes(edit.status) ? edit.status : "open", control_keys: csv(edit.controls), change_reason: edit.change_reason,
            } }).then(() => { setEdit(null); refresh(); toast.success("Risk saved."); }).catch(toastErr)}>Save</Button>
          </div> : null}
        </DialogContent>
      </Dialog>
      <Dialog open={!!acc} onOpenChange={(o) => !o && setAcc(null)}>
        <DialogContent><DialogHeader><DialogTitle>{acc ? `${label(acc.action)} acceptance · ${acc.ref}` : ""}</DialogTitle></DialogHeader>
          {acc ? <div className="space-y-2 text-sm">
            <Textarea placeholder="Reason (required)" value={acc.reason} onChange={(e) => setAcc({ ...acc, reason: e.target.value })} />
            {acc.action !== "reject" ? <label className="block space-y-1"><span className="text-xs">Acceptance expires / must be reviewed by</span><Input type="date" value={acc.expires} onChange={(e) => setAcc({ ...acc, expires: e.target.value })} /></label> : null}
            <Button onClick={() => decide({ data: { risk_ref: acc.ref, action: acc.action, reason: acc.reason, expires: acc.expires || null } }).then(() => { setAcc(null); refresh(); toast.success("Recorded."); }).catch(toastErr)}>Confirm</Button>
          </div> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ScoreSelect({ lbl, opts, v, on, allowNone }: { lbl: string; opts: readonly string[]; v: number | null; on: (v: number | null) => void; allowNone?: boolean }) {
  return (
    <label className="space-y-1"><span className="text-xs">{lbl}</span>
      <Select value={v ? String(v) : "none"} onValueChange={(x) => on(x === "none" ? null : Number(x))}><SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{allowNone ? <SelectItem value="none">Not assessed</SelectItem> : null}{opts.map((o, i) => <SelectItem key={o} value={String(i + 1)}>{i + 1} {o}</SelectItem>)}</SelectContent></Select></label>
  );
}

// ------------------------------------------------------------------ policies

function Policies({ d }: { d: Data }) {
  const save = useServerFn(savePolicy);
  const move = useServerFn(transitionPolicy);
  const refresh = useRefresh();
  const [edit, setEdit] = useState<any>(null);
  const [tr, setTr] = useState<{ ref: string; to: string; reason: string; date: string } | null>(null);
  const can = d.caps.includes("security_compliance_manage");
  const next: Record<string, string[]> = { draft: ["review", "retired"], review: ["draft", "approved"], approved: ["effective", "retired"], effective: ["superseded", "retired"], superseded: [], retired: [] };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl">Policy Library</h1>{can ? <Button size="sm" onClick={() => setEdit({ title: "", category: POLICY_CATEGORIES[0], owner: "", body: "", next_review: null, controls: "", requires_acknowledgment: false, change_reason: "" })}>New policy</Button> : null}</div>
      <p className="text-sm text-muted-foreground">Draft → Review → Approved → Effective → Superseded → Retired. Approved versions are locked; edits start a new version. Approval needs someone other than the author.</p>
      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Required policy coverage</CardTitle><CardDescription>A category is covered only by an Approved or Effective policy. Drafts and missing policies remain gaps.</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap gap-1">{d.coverage.map((c) => <Badge key={c.category} variant={c.state === "effective" ? "default" : c.state === "approved" ? "secondary" : "outline"} className={c.state === "missing" ? "border-destructive text-destructive" : ""}>{c.category}: {label(c.state)}</Badge>)}</CardContent></Card>
      <div className="space-y-2">{d.policies.map((p: any) => (
        <div key={p.policy_ref} className="rounded-md border p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{p.policy_ref}</span>{p.title}<Badge variant="outline">v{p.version} · {label(p.status)}</Badge><Badge variant="secondary">{p.category}</Badge>{p.requires_acknowledgment ? <Badge variant="outline">Acknowledgment required · {p.acks}</Badge> : null}</div>
          <p className="text-xs text-muted-foreground">Owner {p.owner || "—"} · Approved by {p.approved_by_label ?? "—"} · Effective {p.effective_date ?? "—"} · Next review {p.next_review ?? "—"}</p>
          {can ? <div className="mt-1 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setEdit({ ...p, controls: (p.control_keys ?? []).join(", "), change_reason: "" })}>{["approved", "effective"].includes(p.status) ? "Start new version" : "Edit"}</Button>
            {next[p.status]!.filter((x) => x !== "superseded").map((to) => <Button key={to} size="sm" variant="ghost" onClick={() => setTr({ ref: p.policy_ref, to, reason: "", date: "" })}>Move to {label(to)}</Button>)}
          </div> : null}
          <details><summary className="cursor-pointer text-xs">History</summary><ul className="text-xs text-muted-foreground">{p.history.map((h: any, i: number) => <li key={i}>v{h.version} · {label(h.status)} · {h.reason} · {h.by ?? "system"} · {new Date(h.at).toLocaleString()}</li>)}</ul></details>
        </div>
      ))}</div>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{edit?.policy_ref ?? "New policy"}</DialogTitle></DialogHeader>
          {edit ? <div className="space-y-2 text-sm">
            <Input placeholder="Title" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
            <Select value={edit.category} onValueChange={(v) => setEdit({ ...edit, category: v })}><SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger><SelectContent>{[...new Set([...POLICY_CATEGORIES, edit.category])].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
            <Input placeholder="Owner" value={edit.owner} onChange={(e) => setEdit({ ...edit, owner: e.target.value })} />
            <Textarea rows={10} placeholder="Policy text written by Harmonious" value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} />
            <label className="block space-y-1"><span className="text-xs">Next review</span><Input type="date" value={edit.next_review ?? ""} onChange={(e) => setEdit({ ...edit, next_review: e.target.value || null })} /></label>
            <Input placeholder="Related control keys (comma separated)" value={edit.controls} onChange={(e) => setEdit({ ...edit, controls: e.target.value })} />
            <label className="flex items-center gap-2"><Checkbox checked={edit.requires_acknowledgment} onCheckedChange={(c) => setEdit({ ...edit, requires_acknowledgment: Boolean(c) })} />Employees must acknowledge this policy</label>
            <Input placeholder="Reason for this change (required)" value={edit.change_reason} onChange={(e) => setEdit({ ...edit, change_reason: e.target.value })} />
            <Button disabled={edit.change_reason.trim().length < 5 || edit.title.trim().length < 3} onClick={() => save({ data: { policy_ref: edit.policy_ref, title: edit.title, category: edit.category, owner: edit.owner, body: edit.body, next_review: edit.next_review, control_keys: csv(edit.controls), requires_acknowledgment: edit.requires_acknowledgment, change_reason: edit.change_reason } }).then(() => { setEdit(null); refresh(); toast.success("Saved as Draft."); }).catch(toastErr)}>Save as Draft</Button>
          </div> : null}
        </DialogContent>
      </Dialog>
      <Dialog open={!!tr} onOpenChange={(o) => !o && setTr(null)}>
        <DialogContent><DialogHeader><DialogTitle>{tr ? `Move ${tr.ref} to ${label(tr.to)}` : ""}</DialogTitle></DialogHeader>
          {tr ? <div className="space-y-2 text-sm">
            <Textarea placeholder="Reason (required)" value={tr.reason} onChange={(e) => setTr({ ...tr, reason: e.target.value })} />
            {tr.to === "effective" ? <Input type="date" aria-label="Effective date" value={tr.date} onChange={(e) => setTr({ ...tr, date: e.target.value })} /> : null}
            <Button onClick={() => move({ data: { policy_ref: tr.ref, to: tr.to as any, reason: tr.reason, effective_date: tr.date || null } }).then(() => { setTr(null); refresh(); toast.success("Recorded."); }).catch(toastErr)}>Confirm</Button>
          </div> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ------------------------------------------------------------------ audits

function Audits({ d }: { d: Data }) {
  const save = useServerFn(saveAudit);
  const refresh = useRefresh();
  const [edit, setEdit] = useState<any>(null);
  const can = d.caps.includes("audit_manage");
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl">Audits & Assessments</h1>{can ? <Button size="sm" onClick={() => setEdit({ framework_key: d.frameworks[0]?.key, audit_type: "readiness", scope_id: d.scopes[0]?.id ?? null, period_start: null, period_end: null, assessor: "", status: "planned", result: "none", report_evidence_id: null, notes: "" })}>Add assessment</Button> : null}</div>
      <p className="text-sm text-muted-foreground">Harmonious is never labelled certified here. A Report Issued or Certified result can only be recorded by an authorized administrator with the external report attached as evidence.</p>
      {!d.audits.length ? <p className="text-sm text-muted-foreground">No assessments recorded.</p> : null}
      {d.audits.map((a: any) => (
        <div key={a.id} className="rounded-md border p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{d.frameworks.find((f) => f.key === a.framework_key)?.name} · {label(a.audit_type)}</span><Badge variant="outline">{label(a.status)}</Badge><Badge variant={a.result === "none" ? "outline" : "default"}>Result: {label(a.result)}</Badge></div>
          <p className="text-xs text-muted-foreground">{a.assessor || "Assessor not set"} · {a.period_start ?? "?"} to {a.period_end ?? "?"}{a.result_recorded_by_label ? ` · result recorded by ${a.result_recorded_by_label}` : ""}</p>
          {can ? <Button className="mt-1" size="sm" variant="outline" onClick={() => setEdit({ ...a })}>Edit</Button> : null}
        </div>
      ))}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Assessment</DialogTitle></DialogHeader>
          {edit ? <div className="space-y-2 text-sm">
            <Select value={edit.framework_key} onValueChange={(v) => setEdit({ ...edit, framework_key: v })}><SelectTrigger aria-label="Framework"><SelectValue /></SelectTrigger><SelectContent>{d.frameworks.map((f) => <SelectItem key={f.key} value={f.key}>{f.name}</SelectItem>)}</SelectContent></Select>
            <Select value={edit.audit_type} onValueChange={(v) => setEdit({ ...edit, audit_type: v })}><SelectTrigger aria-label="Type"><SelectValue /></SelectTrigger><SelectContent>{["readiness", "soc2_type1", "soc2_type2", "iso_certification", "csa_assessment", "internal", "penetration_test", "other"].map((t) => <SelectItem key={t} value={t}>{label(t)}</SelectItem>)}</SelectContent></Select>
            <Select value={edit.scope_id ?? ""} onValueChange={(v) => setEdit({ ...edit, scope_id: v })}><SelectTrigger aria-label="Scope"><SelectValue placeholder="Scope" /></SelectTrigger><SelectContent>{d.scopes.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>
            <Input placeholder="Auditor / assessor" value={edit.assessor} onChange={(e) => setEdit({ ...edit, assessor: e.target.value })} />
            <div className="flex gap-2"><Input type="date" aria-label="Period start" value={edit.period_start ?? ""} onChange={(e) => setEdit({ ...edit, period_start: e.target.value || null })} /><Input type="date" aria-label="Period end" value={edit.period_end ?? ""} onChange={(e) => setEdit({ ...edit, period_end: e.target.value || null })} /></div>
            <Select value={edit.status} onValueChange={(v) => setEdit({ ...edit, status: v })}><SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger><SelectContent>{["planned", "in_progress", "fieldwork", "completed", "closed"].map((t) => <SelectItem key={t} value={t}>{label(t)}</SelectItem>)}</SelectContent></Select>
            <Select value={edit.result} onValueChange={(v) => setEdit({ ...edit, result: v })}><SelectTrigger aria-label="Result"><SelectValue /></SelectTrigger><SelectContent>{["none", "report_issued", "certified", "qualified", "failed"].map((t) => <SelectItem key={t} value={t}>{label(t)}</SelectItem>)}</SelectContent></Select>
            {edit.result !== "none" && edit.result !== "failed" ? (
              <Select value={edit.report_evidence_id ?? ""} onValueChange={(v) => setEdit({ ...edit, report_evidence_id: v })}><SelectTrigger aria-label="Report evidence"><SelectValue placeholder="External report / certificate (evidence)" /></SelectTrigger><SelectContent>{d.evidence.filter((e) => e.has_file).map((e) => <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>)}</SelectContent></Select>
            ) : null}
            <Textarea placeholder="Findings, management responses, remediation" value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
            <Button onClick={() => save({ data: { id: edit.id, framework_key: edit.framework_key, audit_type: edit.audit_type, scope_id: edit.scope_id, period_start: edit.period_start, period_end: edit.period_end, assessor: edit.assessor, status: edit.status, result: edit.result, report_evidence_id: edit.report_evidence_id, notes: edit.notes } }).then(() => { setEdit(null); refresh(); toast.success("Saved."); }).catch(toastErr)}>Save</Button>
          </div> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ------------------------------------------------------------------ trust center

function Trust({ d }: { d: Data }) {
  const save = useServerFn(savePublication);
  const move = useServerFn(transitionPublication);
  const decide = useServerFn(decideDocumentRequest);
  const refresh = useRefresh();
  const [edit, setEdit] = useState<any>(null);
  const [tr, setTr] = useState<{ id: string; to: string; reason: string } | null>(null);
  const can = d.caps.includes("security_compliance_manage");
  const pub = d.caps.includes("trust_center_publish");
  const next: Record<string, string[]> = { internal_only: ["approved"], approved: ["published", "internal_only"], published: ["withdrawn"], withdrawn: ["internal_only"] };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl">Trust Center publishing</h1>{can ? <Button size="sm" onClick={() => setEdit({ item_type: "section", item_key: "", title: "", body: "", framework_key: null, assurance_status: null, audit_id: null, access_level: "public", sort: 100 })}>New item</Button> : null}</div>
      <p className="text-sm text-muted-foreground">Nothing internal publishes automatically. Each item moves Internal Only → Approved for Trust Center → Published → Withdrawn, with a second approver. Any edit returns it to Internal Only. Only Published items appear on /data-security.</p>
      {d.publications.map((p: any) => (
        <div key={p.id} className="rounded-md border p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{p.title}</span><Badge variant="outline">{label(p.item_type)}</Badge>{p.assurance_status ? <Badge variant="secondary">{ASSURANCE_LABEL[p.assurance_status as keyof typeof ASSURANCE_LABEL]}</Badge> : null}<Badge variant={p.state === "published" ? "default" : "outline"}>{label(p.state)}</Badge><Badge variant="outline">{ACCESS_LEVEL_LABEL[p.access_level as keyof typeof ACCESS_LEVEL_LABEL]}</Badge></div>
          {p.body ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.body}</p> : null}
          <div className="mt-1 flex flex-wrap gap-2">
            {can ? <Button size="sm" variant="outline" onClick={() => setEdit({ ...p })}>Edit</Button> : null}
            {next[p.state]!.filter((to) => (to === "approved" || to === "published" ? pub : can)).map((to) => <Button key={to} size="sm" variant="ghost" onClick={() => setTr({ id: p.id, to, reason: "" })}>{to === "approved" ? "Approve for Trust Center" : label(to === "internal_only" ? "return to internal" : to)}</Button>)}
          </div>
          <details><summary className="cursor-pointer text-xs">Publication history</summary><ul className="text-xs text-muted-foreground">{p.events.map((e: any) => <li key={e.id}>{label(e.from_state) || "—"} → {label(e.to_state)} · {e.reason} · {e.actor_label} · {new Date(e.created_at).toLocaleString()}</li>)}</ul></details>
        </div>
      ))}
      {can ? <Card><CardHeader><CardTitle className="text-base">Document requests</CardTitle><CardDescription>A request never grants access by itself.</CardDescription></CardHeader>
        <CardContent className="space-y-2 text-sm">{!d.documentRequests.length ? <p className="text-muted-foreground">No requests.</p> : d.documentRequests.map((r: any) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2 border-b pb-2"><span className="font-medium">{r.requester_name}</span><span className="text-xs text-muted-foreground">{r.requester_email} · {r.company} · {d.publications.find((p: any) => p.id === r.publication_id)?.title}</span><Badge variant="outline">{label(r.status)}</Badge>
            {r.status === "received" ? <><Button size="sm" variant="outline" onClick={() => decide({ data: { id: r.id, status: "approved" } }).then(refresh).catch(toastErr)}>Approve</Button><Button size="sm" variant="ghost" onClick={() => decide({ data: { id: r.id, status: "declined" } }).then(refresh).catch(toastErr)}>Decline</Button></> : r.status === "approved" ? <Button size="sm" variant="ghost" onClick={() => decide({ data: { id: r.id, status: "fulfilled" } }).then(refresh).catch(toastErr)}>Mark sent</Button> : null}</div>
        ))}</CardContent></Card> : null}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>Trust Center item</DialogTitle></DialogHeader>
          {edit ? <div className="space-y-2 text-sm">
            <Select value={edit.item_type} onValueChange={(v) => setEdit({ ...edit, item_type: v })} disabled={!!edit.id}><SelectTrigger aria-label="Type"><SelectValue /></SelectTrigger><SelectContent>{["assurance", "section", "document"].map((t) => <SelectItem key={t} value={t}>{label(t)}</SelectItem>)}</SelectContent></Select>
            <Input placeholder="Key (e.g. encryption)" value={edit.item_key} disabled={!!edit.id} onChange={(e) => setEdit({ ...edit, item_key: e.target.value })} />
            <Input placeholder="Title" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
            <Textarea rows={6} placeholder="Public text" value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} />
            {edit.item_type === "assurance" ? <>
              <Select value={edit.framework_key ?? ""} onValueChange={(v) => setEdit({ ...edit, framework_key: v })}><SelectTrigger aria-label="Framework"><SelectValue placeholder="Framework" /></SelectTrigger><SelectContent>{d.frameworks.map((f) => <SelectItem key={f.key} value={f.key}>{f.name}</SelectItem>)}</SelectContent></Select>
              <Select value={edit.assurance_status ?? ""} onValueChange={(v) => setEdit({ ...edit, assurance_status: v })}><SelectTrigger aria-label="Assurance status"><SelectValue placeholder="Assurance status" /></SelectTrigger><SelectContent>{ASSURANCE_STATUSES.map((s) => <SelectItem key={s} value={s}>{ASSURANCE_LABEL[s]}</SelectItem>)}</SelectContent></Select>
              {["report_issued", "certified"].includes(edit.assurance_status) ? <Select value={edit.audit_id ?? ""} onValueChange={(v) => setEdit({ ...edit, audit_id: v })}><SelectTrigger aria-label="Audit"><SelectValue placeholder="Recorded external audit" /></SelectTrigger><SelectContent>{d.audits.filter((a: any) => a.framework_key === edit.framework_key).map((a: any) => <SelectItem key={a.id} value={a.id}>{label(a.audit_type)} · {label(a.result)}</SelectItem>)}</SelectContent></Select> : null}
            </> : null}
            <Select value={edit.access_level} onValueChange={(v) => setEdit({ ...edit, access_level: v })}><SelectTrigger aria-label="Access"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(ACCESS_LEVEL_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
            <Button onClick={() => save({ data: { id: edit.id, item_type: edit.item_type, item_key: edit.item_key, title: edit.title, body: edit.body, framework_key: edit.framework_key, assurance_status: edit.assurance_status, audit_id: edit.audit_id, access_level: edit.access_level, sort: edit.sort ?? 100 } }).then(() => { setEdit(null); refresh(); toast.success("Saved as Internal Only."); }).catch(toastErr)}>Save (Internal Only)</Button>
          </div> : null}
        </DialogContent>
      </Dialog>
      <Dialog open={!!tr} onOpenChange={(o) => !o && setTr(null)}>
        <DialogContent><DialogHeader><DialogTitle>{tr ? label(tr.to) : ""}</DialogTitle></DialogHeader>
          {tr ? <div className="space-y-2 text-sm"><Textarea placeholder="Reason (required)" value={tr.reason} onChange={(e) => setTr({ ...tr, reason: e.target.value })} />
            <Button onClick={() => move({ data: { id: tr.id, to: tr.to as any, reason: tr.reason } }).then(() => { setTr(null); refresh(); toast.success("Recorded."); }).catch(toastErr)}>Confirm</Button></div> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
