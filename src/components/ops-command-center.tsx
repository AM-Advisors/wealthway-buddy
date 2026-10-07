import { Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ResponsibilityBadge } from "@/components/responsibility-badge";
import {
  getOperations, opsBulkAction, opsClientActionStep, opsDeleteView, opsSaveView, opsSavedViews, opsSetException, opsSetServiceReview, opsSyncServiceReviews, opsUpdateSetting,
} from "@/lib/ops-command.functions";
import { CAPACITY_LABEL, PACKAGE_KEYS, SLA_STATUS_LABEL, packageLabel, type CapacityStatus, type SlaStatus } from "@/lib/ops-command";
import { fmtDate, titleCase } from "@/lib/service-engagement-labels";

export const OPS_VIEWS = [
  ["command", "Command Center"], ["my-work", "My Work"], ["portfolio", "Funds & SPVs"], ["sla", "SLA"], ["client-actions", "Client Actions"],
  ["investors", "Investor Exceptions"], ["third-party", "Third-Party Blockers"], ["approvals", "Approvals"], ["requests", "Requests"],
  ["calendar", "Calendar"], ["reporting", "Reporting"], ["capital", "Capital Activity"], ["exceptions", "Exceptions"], ["limits", "Service Limits"],
  ["reviews", "Service Reviews"], ["capacity", "Team Capacity"], ["relationship", "Relationship View"], ["administrator", "Administrator View"],
  ["accounting", "Accounting View"], ["economics", "Service Economics"], ["leadership", "Leadership"], ["settings", "Settings"],
] as const;
export type OpsView = (typeof OPS_VIEWS)[number][0];

const sel = "h-8 rounded-md border bg-background px-2 text-sm";
const usd = (n?: number | null) => (n == null ? "—" : `$${Math.round(n).toLocaleString("en-US")}`);
const hrs = (m?: number | null) => (m == null ? "—" : `${Math.floor(Math.abs(m) / 60)}h ${Math.abs(m) % 60}m${m < 0 ? " over" : ""}`);
const PACKAGES = PACKAGE_KEYS.map((k) => { const [p, l] = k.split("/"); return packageLabel(p, l); });

function slaTone(s: SlaStatus | null | undefined) {
  return s === "BREACHED" ? "destructive" : s === "AT_RISK" ? "destructive" : s === "APPROACHING" ? "secondary" : "outline";
}

export function OpsCommandCenter({ view, filter }: { view: OpsView; filter?: string | undefined }) {
  const [includeTest, setIncludeTest] = useState(false);
  const load = useServerFn(getOperations);
  const q = useQuery({ queryKey: ["ops-command", includeTest], queryFn: () => load({ data: { includeTest } }), staleTime: 60_000 });
  const [pkg, setPkg] = useState("");
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const d = q.data;

  return (
    <main className="mx-auto max-w-7xl space-y-4 px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl">Operations · {OPS_VIEWS.find((v) => v[0] === view)?.[1]}</h1>
          <p className="text-sm text-muted-foreground">Run administration from here — every count opens its queue.</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Package" value={pkg} onChange={(e) => setPkg(e.target.value)} className={sel}><option value="">All packages</option>{PACKAGES.map((p) => <option key={p}>{p}</option>)}</select>
          <Input aria-label="Search" placeholder="Search fund, client, title" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 w-56" />
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={includeTest} onChange={(e) => setIncludeTest(e.target.checked)} /> Show test/demo</label>
          <SavedViews view={view} filters={{ pkg, search, filter: filter ?? "" }} onApply={(f) => { setPkg(f["pkg"] ?? ""); setSearch(f["search"] ?? ""); navigate({ to: "/ops/command-center", search: { view, filter: f["filter"] || undefined } as any }); }} />
        </div>
      </header>
      <nav className="flex flex-wrap gap-1 border-b pb-2 text-sm">
        {OPS_VIEWS.filter(([k]) => k !== "economics" || d?.viewer.canEconomics).map(([k, label]) => (
          <Link key={k} to="/ops/command-center" search={{ view: k } as any} className={`rounded-md px-2 py-1 ${k === view ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{label}</Link>
        ))}
      </nav>
      {q.isLoading ? <p className="text-sm text-muted-foreground">Loading operations…</p>
        : q.error ? <p className="text-sm text-destructive">{(q.error as Error).message}</p>
        : d ? <ViewBody view={view} d={d} filter={filter} pkg={pkg} search={search.toLowerCase()} /> : null}
    </main>
  );
}

type D = Awaited<ReturnType<typeof getOperations>>;
const match = (r: any, pkg: string, s: string) => (!pkg || r.packageLabel === pkg) && (!s || [r.title, r.fundName, r.clientName, r.investor].some((x) => String(x ?? "").toLowerCase().includes(s)));

function ViewBody({ view, d, filter, pkg, search }: { view: OpsView; d: D; filter?: string | undefined; pkg: string; search: string }) {
  const f = <T,>(rows: T[]) => rows.filter((r) => match(r, pkg, search));
  switch (view) {
    case "command": return <><Scoreboard d={d} /><Queue rows={f(applyFilter(d.queue, filter, d.today))} title={filter ? `Filtered: ${titleCase(filter)}` : "Needs attention"} /></>;
    case "my-work": return <MyWork d={d} rows={f(d.queue)} />;
    case "portfolio": return <Portfolio rows={f(d.portfolio)} economics={d.viewer.canEconomics} />;
    case "sla": return <SlaView rows={f(d.requests.filter((r: any) => r.open))} />;
    case "client-actions": return <ClientActions rows={f(d.clientActions)} />;
    case "investors": return <InvestorEx rows={f(d.investorExceptions)} />;
    case "third-party": return <ThirdParty rows={f(d.thirdParty)} />;
    case "approvals": return <ApprovalsOps rows={f(d.approvals)} />;
    case "requests": return <RequestsOps rows={f(d.requests)} />;
    case "calendar": return <CalendarOps rows={f(d.calendar)} today={d.today} />;
    case "reporting": return <ReportingOps rows={f(d.reporting)} today={d.today} />;
    case "capital": return <CapitalOps calls={f(d.capitalCalls)} dists={f(d.distributions)} />;
    case "exceptions": return <Exceptions rows={f(d.exceptions)} />;
    case "limits": return <Limits rows={f(d.serviceLimits)} />;
    case "reviews": return <Reviews rows={f(d.serviceReviews)} economics={d.viewer.canEconomics} />;
    case "capacity": return <Capacity rows={d.capacity} />;
    case "relationship": return <RoleView d={d} field="relationshipLeadId" title="Clients you lead" />;
    case "administrator": return <RoleView d={d} field="primaryAdministratorId" title="Vehicles you administer" />;
    case "accounting": return <Queue rows={f(d.queue.filter((x) => ["ACCOUNTING", "NAV", "accounting", "REPORTING"].includes(String(x.category)) || x.team === "accounting"))} title="Accounting work (tasks, NAV and reporting deadlines in the app today)" />;
    case "economics": return d.economics ? <Economics rows={f(d.economics)} acv={d.acv} /> : <p className="text-sm text-muted-foreground">Service economics is limited to Leadership and Finance.</p>;
    case "leadership": return <Leadership d={d} />;
    case "settings": return <Settings d={d} />;
  }
}

function applyFilter(rows: D["queue"], filter: string | undefined, today: string) {
  if (!filter) return rows.filter((r) => r.rank <= 12);
  const by: Record<string, (r: D["queue"][number]) => boolean> = {
    overdue: (r) => !!r.due && r.due < today, "sla-at-risk": (r) => r.sla === "AT_RISK", "sla-breached": (r) => r.sla === "BREACHED",
    "client-action": (r) => r.responsibility === "CLIENT_APPROVAL_REQUIRED" || r.responsibility === "CLIENT_INFORMATION_REQUIRED",
    investor: (r) => r.responsibility === "WAITING_ON_INVESTOR", "third-party": (r) => r.responsibility === "WAITING_ON_THIRD_PARTY",
    approvals: (r) => r.kind === "approval", capital: (r) => r.kind === "capital", reviews: (r) => r.kind === "review", unassigned: (r) => !r.assignedUserId,
    reporting: (r) => ["REPORTING", "NAV"].includes(String(r.category)),
  };
  return rows.filter(by[filter] ?? (() => true));
}

function Scoreboard({ d }: { d: D }) {
  const s = d.scoreboard;
  const tiles: [string, number, string, string | undefined][] = [
    ["Needs attention", s.needsAttention, "command", undefined], ["Overdue", s.overdue, "command", "overdue"], ["SLA at risk", s.slaAtRisk, "sla", undefined],
    ["SLA breached", s.slaBreached, "command", "sla-breached"], ["Client action required", s.clientAction, "client-actions", undefined], ["Investor blockers", s.investorBlockers, "investors", undefined],
    ["Third-party blockers", s.thirdPartyBlockers, "third-party", undefined], ["Approvals pending", s.approvalsPending, "approvals", undefined], ["Reporting due", s.reportingDue, "reporting", undefined],
    ["Capital events", s.capitalEvents, "capital", undefined], ["Service reviews", s.serviceReviews, "reviews", undefined], ["Unassigned work", s.unassigned, "command", "unassigned"],
  ];
  return (
    <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {tiles.map(([label, n, v, fl]) => (
        <Link key={label} to="/ops/command-center" search={{ view: v, filter: fl } as any} className="rounded-lg border bg-card p-3 hover:border-primary">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p><p className={`text-2xl font-semibold ${n && (label.includes("breach") || label === "Overdue") ? "text-destructive" : ""}`}>{n}</p>
        </Link>
      ))}
    </section>
  );
}

function Table({ head, children, empty }: { head: string[]; children: React.ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm"><thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr>{head.map((h) => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>{empty ? <tr><td colSpan={head.length} className="p-4 text-center text-muted-foreground">Nothing here.</td></tr> : children}</tbody></table>
    </div>
  );
}
const Veh = ({ r }: { r: any }) => (<td className="p-2">{r.fundId ? <Link to="/ops/fund/$fundId" params={{ fundId: r.fundId }} className="underline">{r.fundName ?? "Fund"}</Link> : "—"}<div className="text-xs text-muted-foreground">{r.clientName ?? ""}</div></td>);
const Pkg = ({ r }: { r: any }) => <td className="p-2 whitespace-nowrap">{r.packageLabel}</td>;

function Queue({ rows, title }: { rows: D["queue"]; title: string }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const qc = useQueryClient();
  const bulk = useServerFn(opsBulkAction);
  const [action, setAction] = useState("priority");
  const [value, setValue] = useState("high");
  const page = rows.slice(0, 200);
  const run = async () => {
    const items = page.filter((r) => picked.has(r.id)).map((r) => ({ kind: r.kind, id: r.id, title: r.title }));
    try { const res = await bulk({ data: { action: action as any, value, items } }); toast.success(`Updated ${res.done}${res.skipped.length ? `; skipped ${res.skipped.length} (not a task — bulk changes never touch approvals, payments, NAV, pricing or banking)` : ""}.`); setPicked(new Set()); qc.invalidateQueries({ queryKey: ["ops-command"] }); }
    catch (e) { toast.error((e as Error).message); }
  };
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg">{title} <span className="text-sm text-muted-foreground">({rows.length})</span></h2>
        {picked.size ? <div className="flex items-center gap-2 text-sm">{picked.size} selected
          <select value={action} onChange={(e) => { setAction(e.target.value); setValue(""); }} className={sel}><option value="priority">Change priority</option><option value="team">Reassign team</option><option value="follow_up">Set follow-up</option></select>
          {action === "priority" ? <select value={value} onChange={(e) => setValue(e.target.value)} className={sel}><option value="">Pick…</option>{["low", "normal", "high", "urgent"].map((p) => <option key={p}>{p}</option>)}</select>
            : <Input className="h-8 w-40" type={action === "follow_up" ? "date" : "text"} value={value} onChange={(e) => setValue(e.target.value)} placeholder="team key" />}
          <Button size="sm" onClick={run}>Apply</Button></div> : null}</div>
      <Table head={["", "Why", "Item", "Vehicle", "Package", "Waiting on", "Owner", "Due", "SLA"]} empty={!page.length}>
        {page.map((r) => (
          <tr key={`${r.kind}-${r.id}`} className="border-t">
            <td className="p-2"><input type="checkbox" aria-label="Select" checked={picked.has(r.id)} onChange={(e) => { const n = new Set(picked); e.target.checked ? n.add(r.id) : n.delete(r.id); setPicked(n); }} /></td>
            <td className="p-2 text-xs"><Badge variant={r.rank <= 4 ? "destructive" : "outline"}>{r.rank}</Badge> {r.reason}</td>
            <td className="p-2"><a href={r.href} className="underline">{r.title}</a><div className="text-xs text-muted-foreground">{titleCase(r.kind)}{r.highRisk ? " · high risk" : ""}</div></td>
            <Veh r={r} /><Pkg r={r} />
            <td className="p-2"><ResponsibilityBadge value={r.responsibility as any} /></td>
            <td className="p-2">{r.assignedName ?? (r.team ? titleCase(r.team) : <span className="text-destructive">Unassigned</span>)}</td>
            <td className="p-2 whitespace-nowrap">{r.due ? fmtDate(r.due) : "—"}</td>
            <td className="p-2">{r.sla ? <Badge variant={slaTone(r.sla)}>{SLA_STATUS_LABEL[r.sla]}</Badge> : "—"}</td>
          </tr>
        ))}
      </Table>
      {rows.length > 200 ? <p className="text-xs text-muted-foreground">Showing the 200 highest-priority items; narrow with filters.</p> : null}
    </section>
  );
}

function MyWork({ d, rows }: { d: D; rows: D["queue"] }) {
  const me = d.viewer.userId; const t = d.today;
  const mine = rows.filter((r) => r.assignedUserId === me);
  const week = new Date(Date.parse(t) + 7 * 86400000).toISOString().slice(0, 10);
  const groups: [string, D["queue"]][] = [
    ["Overdue", mine.filter((r) => r.due && r.due < t)], ["Due today", mine.filter((r) => r.due === t)], ["Due this week", mine.filter((r) => r.due && r.due > t && r.due <= week)],
    ["Awaiting my review", mine.filter((r) => r.kind === "approval" && r.status === "INTERNAL_REVIEW")], ["SLA at risk", mine.filter((r) => r.sla === "AT_RISK" || r.sla === "BREACHED")],
    ["Client action required", mine.filter((r) => r.responsibility.startsWith("CLIENT_"))], ["Waiting on investor", mine.filter((r) => r.responsibility === "WAITING_ON_INVESTOR")],
    ["Waiting on third party", mine.filter((r) => r.responsibility === "WAITING_ON_THIRD_PARTY")],
  ];
  const funds = d.portfolio.filter((p) => p.primaryAdministratorId === me || p.relationshipLeadId === me);
  return (
    <div className="space-y-4">
      {groups.map(([g, list]) => <Queue key={g} rows={list} title={g} />)}
      <section><h2 className="text-lg">Assigned funds & SPVs</h2><Portfolio rows={funds} economics={false} /></section>
    </div>
  );
}

function Portfolio({ rows, economics }: { rows: D["portfolio"]; economics: boolean }) {
  return (
    <Table head={["Vehicle", "Package", "Administrator", "Relationship lead", "Health", "Open", "Overdue", "SLA risk", "Breach", "Approvals", "Requests", "Inv. exceptions", "Next report", "Next capital", "Next deadline", ...(economics ? ["Active ACV"] : []), "Limits", "Review"]} empty={!rows.length}>
      {rows.map((r) => (
        <tr key={r.fundId} className="border-t">
          <Veh r={r} /><Pkg r={r} /><td className="p-2">{r.primaryAdministrator ?? "—"}</td><td className="p-2">{r.relationshipLead ?? "—"}</td>
          <td className="p-2"><Badge variant={r.health === "At Risk" ? "destructive" : r.health === "Needs Attention" ? "secondary" : "outline"}>{r.health}</Badge></td>
          <td className="p-2">{r.openTasks}</td><td className="p-2">{r.overdueTasks}</td><td className="p-2">{r.slaRisks}</td><td className="p-2">{r.slaBreaches}</td><td className="p-2">{r.approvals}</td><td className="p-2">{r.requests}</td><td className="p-2">{r.investorExceptions}</td>
          <td className="p-2 whitespace-nowrap">{r.nextReport ? fmtDate(r.nextReport) : "—"}</td><td className="p-2 whitespace-nowrap">{r.nextCapitalEvent ? fmtDate(r.nextCapitalEvent) : "—"}</td><td className="p-2 whitespace-nowrap">{r.nextDeadline ? fmtDate(r.nextDeadline) : "—"}</td>
          {economics ? <td className="p-2">{usd(r.acv)}</td> : null}<td className="p-2">{r.serviceLimitStatus}</td><td className="p-2">{r.serviceReviewStatus ? titleCase(r.serviceReviewStatus) : "—"}</td>
        </tr>
      ))}
    </Table>
  );
}

function SlaView({ rows }: { rows: any[] }) {
  const [st, setSt] = useState("");
  const list = rows.filter((r) => !st || r.slaStatus === st).sort((a, b) => (a.slaRemainingMin ?? 1e9) - (b.slaRemainingMin ?? 1e9));
  return (
    <section className="space-y-2">
      <select aria-label="SLA status" value={st} onChange={(e) => setSt(e.target.value)} className={sel}><option value="">All SLA statuses</option>{Object.entries(SLA_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <Table head={["Vehicle", "Package", "Request", "Assigned", "Team", "Response SLA", "SLA source", "Started", "Elapsed", "Paused", "Pause reason", "Remaining", "Due", "Status"]} empty={!list.length}>
        {list.map((r) => (
          <tr key={r.id} className="border-t"><Veh r={r} /><Pkg r={r} /><td className="p-2">{r.title}</td><td className="p-2">{r.assignedName ?? "—"}</td><td className="p-2">{titleCase(r.assigned_team)}</td>
            <td className="p-2">{r.sla_hours != null ? `${r.sla_hours} hours` : "—"}</td><td className="p-2 text-xs">{r.sla_source ?? "—"}</td><td className="p-2 whitespace-nowrap">{r.submitted_at ? fmtDate(r.submitted_at) : "—"}</td>
            <td className="p-2">{hrs(r.slaElapsedMin)}</td><td className="p-2">{hrs(r.slaPausedMin)}</td><td className="p-2 text-xs">{r.sla_paused_at ? titleCase(r.status) : "—"}</td>
            <td className="p-2">{r.slaRemainingMin == null ? "—" : hrs(r.slaRemainingMin)}</td><td className="p-2 whitespace-nowrap">{r.slaDueAt ? fmtDate(r.slaDueAt) : "—"}</td>
            <td className="p-2"><Badge variant={slaTone(r.slaStatus)}>{SLA_STATUS_LABEL[r.slaStatus as SlaStatus] ?? "—"}</Badge></td></tr>
        ))}
      </Table>
      <p className="text-xs text-muted-foreground">Warning point comes from each SLA policy (default 75% elapsed). The clock pauses while waiting on the client, an investor or a third party.</p>
    </section>
  );
}

function ClientActions({ rows }: { rows: any[] }) {
  const step = useServerFn(opsClientActionStep); const qc = useQueryClient();
  const go = async (r: any, s: "reminder" | "follow_up" | "escalate") => {
    if (r.kind !== "task") { toast.message("Open the item to follow up — only tasks track reminders here."); return; }
    const date = s === "follow_up" ? window.prompt("Follow-up date (YYYY-MM-DD)") : null;
    if (s === "follow_up" && !date) return;
    try { const res = await step({ data: { taskId: r.id, step: s, date } }); toast.success(res.note ?? "Saved."); qc.invalidateQueries({ queryKey: ["ops-command"] }); } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <Table head={["Client / Vehicle", "Item", "Waiting on", "Requested", "Due", "Days waiting", "Last reminder", "Priority", "Harmonious owner", "Actions"]} empty={!rows.length}>
      {rows.map((r) => (
        <tr key={r.id} className="border-t"><Veh r={r} /><td className="p-2"><a href={r.href} className="underline">{r.title}</a></td><td className="p-2"><ResponsibilityBadge value={r.responsibility} /></td>
          <td className="p-2">{r.requestedDate ? fmtDate(r.requestedDate) : "—"}</td><td className="p-2">{r.due ? fmtDate(r.due) : "—"}</td><td className="p-2">{r.daysWaiting ?? "—"}</td>
          <td className="p-2">{r.lastReminder ? fmtDate(r.lastReminder) : "—"}</td><td className="p-2">{r.priority}</td><td className="p-2">{r.assignedName ?? "—"}</td>
          <td className="p-2 whitespace-nowrap"><a href={r.href} className="mr-2 underline">Open</a><button className="mr-2 underline" onClick={() => go(r, "reminder")}>Log reminder</button><button className="mr-2 underline" onClick={() => go(r, "follow_up")}>Follow-up</button><button className="underline" onClick={() => go(r, "escalate")}>Escalate</button></td></tr>
      ))}
    </Table>
  );
}

function InvestorEx({ rows }: { rows: any[] }) {
  const [t, setT] = useState("");
  const types = [...new Set(rows.map((r) => r.type))];
  const list = rows.filter((r) => !t || r.type === t);
  return (
    <section className="space-y-2">
      <select aria-label="Type" value={t} onChange={(e) => setT(e.target.value)} className={sel}><option value="">All exception types</option>{types.map((x) => <option key={x}>{x}</option>)}</select>
      <Table head={["Investor", "Vehicle", "Type", "Created", "Age (days)", "Severity", "Team", "Next action", "Client visible"]} empty={!list.length}>
        {list.slice(0, 300).map((r) => (
          <tr key={r.id} className="border-t"><td className="p-2">{r.investor}</td><Veh r={r} /><td className="p-2">{r.type}</td><td className="p-2">{r.created ? fmtDate(r.created) : "—"}</td><td className="p-2">{r.age}</td>
            <td className="p-2"><Badge variant={r.severity === "high" ? "destructive" : "outline"}>{r.severity}</Badge></td><td className="p-2">{titleCase(r.team)}</td><td className="p-2">{r.nextAction}</td><td className="p-2">{r.clientVisible ? "Yes" : "No"}</td></tr>
        ))}
      </Table>
      <p className="text-xs text-muted-foreground">No identity numbers, documents or bank details are shown here — open the investor record for authorized detail.</p>
    </section>
  );
}

function ThirdParty({ rows }: { rows: any[] }) {
  return (
    <Table head={["Vehicle", "Item", "Third-party type", "Third-party name", "Waiting since", "Days waiting", "Due", "Assigned", "Next follow-up"]} empty={!rows.length}>
      {rows.map((r) => (
        <tr key={r.id} className="border-t"><Veh r={r} /><td className="p-2"><a href={r.href} className="underline">{r.title}</a></td><td className="p-2">{r.thirdPartyType}</td><td className="p-2">{r.thirdPartyName ?? "—"}</td>
          <td className="p-2">{r.waitingSince ? fmtDate(r.waitingSince) : "—"}</td><td className="p-2">{r.daysWaiting ?? "—"}</td><td className="p-2">{r.due ? fmtDate(r.due) : "—"}</td><td className="p-2">{r.assignedName ?? "—"}</td><td className="p-2">{r.followUp ? fmtDate(r.followUp) : "—"}</td></tr>
      ))}
    </Table>
  );
}

function ApprovalsOps({ rows }: { rows: any[] }) {
  const [st, setSt] = useState("open");
  const list = rows.filter((r) => st === "all" || (st === "open" ? !["COMPLETED", "WITHDRAWN", "EXPIRED"].includes(r.status) : st === "overdue" ? r.overdue : r.status === st));
  return (
    <section className="space-y-2">
      <select aria-label="Status" value={st} onChange={(e) => setSt(e.target.value)} className={sel}>
        <option value="open">Open</option><option value="INTERNAL_REVIEW">Awaiting internal review</option><option value="AWAITING_APPROVAL">Awaiting client</option><option value="CHANGES_REQUESTED">Changes requested</option><option value="overdue">Overdue</option><option value="COMPLETED">Completed</option><option value="all">All</option></select>
      <Table head={["Approval", "Vehicle", "Package", "Type", "Amount", "Prepared by", "Reviewer", "2nd approver", "Step-up", "Version", "Requested", "Due", "Status", "Age"]} empty={!list.length}>
        {list.map((r) => (
          <tr key={r.id} className={`border-t ${r.overdue ? "bg-destructive/5" : ""}`}><td className="p-2"><a href={`/manager/fund/${r.fund_id}/approvals?approval=${r.id}`} className="underline">{r.title}</a></td><Veh r={r} /><Pkg r={r} />
            <td className="p-2">{titleCase(r.approval_type)}{r.highRisk ? <Badge variant="secondary" className="ml-1">High risk</Badge> : null}</td><td className="p-2">{usd(r.approval_amount)}</td><td className="p-2">{r.preparedByName ?? "—"}</td><td className="p-2">{r.reviewerName ?? "—"}</td>
            <td className="p-2">{r.secondApproverRequired ? "Required" : "No"}</td><td className="p-2 text-xs">Typed confirmation (re-sign-in not built)</td><td className="p-2">v{r.version}</td>
            <td className="p-2">{r.requested_at ? fmtDate(r.requested_at) : "—"}</td><td className="p-2">{r.due_date ? fmtDate(r.due_date) : "—"}</td><td className="p-2">{titleCase(r.status)}</td><td className="p-2">{r.age ?? "—"}d</td></tr>
        ))}
      </Table>
    </section>
  );
}

function RequestsOps({ rows }: { rows: any[] }) {
  const [fl, setFl] = useState<Record<string, string>>({ open: "open" });
  const set = (k: string, v: string) => setFl({ ...fl, [k]: v });
  const opts = (k: string) => [...new Set(rows.map((r) => r[k]).filter(Boolean))] as string[];
  const list = rows.filter((r) => (fl["open"] !== "open" || r.open) && (!fl["type"] || r.request_type === fl["type"]) && (!fl["status"] || r.status === fl["status"]) && (!fl["team"] || r.assigned_team === fl["team"])
    && (!fl["priority"] || r.priority === fl["priority"]) && (!fl["sla"] || r.slaStatus === fl["sla"]) && (!fl["ent"] || r.entitlement_status === fl["ent"]) && (!fl["resp"] || r.responsibility === fl["resp"]));
  const S = ({ k, label, values, labels }: { k: string; label: string; values: string[]; labels?: Record<string, string> }) => (
    <select aria-label={label} value={fl[k] ?? ""} onChange={(e) => set(k, e.target.value)} className={sel}><option value="">{label}: all</option>{values.map((v) => <option key={v} value={v}>{labels?.[v] ?? titleCase(v)}</option>)}</select>);
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <select aria-label="Open" value={fl["open"]} onChange={(e) => set("open", e.target.value)} className={sel}><option value="open">Open</option><option value="all">All</option></select>
        <S k="type" label="Type" values={opts("request_type")} /><S k="status" label="Status" values={opts("status")} /><S k="resp" label="Responsibility" values={opts("responsibility")} />
        <S k="team" label="Team" values={opts("assigned_team")} /><S k="priority" label="Priority" values={opts("priority")} /><S k="sla" label="SLA" values={Object.keys(SLA_STATUS_LABEL)} labels={SLA_STATUS_LABEL} />
        <S k="ent" label="Entitlement" values={["INCLUDED", "REVIEW_REQUIRED"]} labels={{ INCLUDED: "Included", REVIEW_REQUIRED: "Service/pricing review required" }} />
      </div>
      <Table head={["Request", "Vehicle", "Package", "Type", "Responsibility", "Status", "Team", "Assigned", "Priority", "SLA", "Due", "Submitted", "Entitlement"]} empty={!list.length}>
        {list.map((r) => (
          <tr key={r.id} className="border-t"><td className="p-2"><a href={`/manager/fund/${r.fund_id}/requests?request=${r.id}`} className="underline">{r.title}</a></td><Veh r={r} /><Pkg r={r} /><td className="p-2">{titleCase(r.request_type)}</td>
            <td className="p-2"><ResponsibilityBadge value={r.responsibility} /></td><td className="p-2">{titleCase(r.status)}</td><td className="p-2">{titleCase(r.assigned_team)}</td><td className="p-2">{r.assignedName ?? "—"}</td><td className="p-2">{r.priority}</td>
            <td className="p-2">{r.slaStatus ? <Badge variant={slaTone(r.slaStatus)}>{SLA_STATUS_LABEL[r.slaStatus as SlaStatus]}</Badge> : "—"}</td><td className="p-2">{r.due_date ? fmtDate(r.due_date) : "—"}</td><td className="p-2">{r.submitted_at ? fmtDate(r.submitted_at) : "—"}</td>
            <td className="p-2">{r.entitlement_status === "REVIEW_REQUIRED" ? <Badge variant="secondary">Review required</Badge> : "Included"}</td></tr>
        ))}
      </Table>
    </section>
  );
}

function CalendarOps({ rows, today }: { rows: any[]; today: string }) {
  const [range, setRange] = useState("week"); const [cat, setCat] = useState(""); const [vis, setVis] = useState("");
  const end = { today: 0, week: 7, month: 31, quarter: 92, list: 120 }[range] ?? 7;
  const until = new Date(Date.parse(today) + end * 86400000).toISOString().slice(0, 10);
  const list = rows.filter((r) => r.due_date <= until && (range === "list" || r.due_date >= today || r.status !== "COMPLETED") && (!cat || r.category === cat) && (!vis || String(r.client_visibility) === vis));
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <select aria-label="Range" value={range} onChange={(e) => setRange(e.target.value)} className={sel}>{["today", "week", "month", "quarter", "list"].map((x) => <option key={x} value={x}>{titleCase(x)}</option>)}</select>
        <select aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)} className={sel}><option value="">All categories</option>{["ACCOUNTING", "NAV", "INVESTOR", "CAPITAL", "REPORTING", "TAX", "REGULATORY", "AUDIT", "ENTITY", "BANKING", "OTHER"].map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}</select>
        <select aria-label="Visibility" value={vis} onChange={(e) => setVis(e.target.value)} className={sel}><option value="">Client-visible & internal</option><option value="true">Client-visible</option><option value="false">Internal</option></select>
      </div>
      <Table head={["Date", "Item", "Vehicle", "Package", "Category", "Responsible", "Administrator", "Status"]} empty={!list.length}>
        {list.map((r) => (
          <tr key={r.id} className={`border-t ${r.due_date < today && r.status !== "COMPLETED" ? "bg-destructive/5" : ""}`}><td className="p-2 whitespace-nowrap">{fmtDate(r.due_date)}</td><td className="p-2">{r.title}</td><Veh r={r} /><Pkg r={r} />
            <td className="p-2">{titleCase(r.category)}</td><td className="p-2">{titleCase(r.responsible_party)}{r.responsible_team ? ` · ${titleCase(r.responsible_team)}` : ""}</td><td className="p-2">{r.administrator ?? "—"}</td><td className="p-2">{titleCase(r.status)}</td></tr>
        ))}
      </Table>
      <p className="text-xs text-muted-foreground">Reads every fund's existing Operating Calendar — edit items on the fund's Calendar tab.</p>
    </section>
  );
}

function ReportingOps({ rows, today }: { rows: any[]; today: string }) {
  const [w, setW] = useState("month");
  const lim = { week: 7, month: 31, quarter: 92 }[w];
  const list = rows.filter((r) => (w === "overdue" ? r.reportState === "OVERDUE" : lim ? r.due_date <= new Date(Date.parse(today) + lim * 86400000).toISOString().slice(0, 10) && (r.due_date >= today || r.reportState === "OVERDUE") : true));
  return (
    <section className="space-y-2">
      <select aria-label="Window" value={w} onChange={(e) => setW(e.target.value)} className={sel}><option value="week">This week</option><option value="month">This month</option><option value="quarter">This quarter</option><option value="overdue">Overdue</option><option value="all">All</option></select>
      <Table head={["Vehicle", "Package", "Report", "Period", "Expected", "Status", "Administrator", "Prepared by / Reviewer / Client review / Release"]} empty={!list.length}>
        {list.map((r) => (
          <tr key={r.id} className="border-t"><Veh r={r} /><Pkg r={r} /><td className="p-2">{r.title}</td><td className="p-2">{r.period_label ?? "—"}</td><td className="p-2">{fmtDate(r.due_date)}</td>
            <td className="p-2"><Badge variant={r.reportState === "OVERDUE" ? "destructive" : "outline"}>{titleCase(r.reportState)}</Badge></td><td className="p-2">{r.administrator ?? "—"}</td><td className="p-2 text-xs text-muted-foreground">No Data (not yet tracked per report)</td></tr>
        ))}
      </Table>
    </section>
  );
}

function CapitalOps({ calls, dists }: { calls: any[]; dists: any[] }) {
  return (
    <div className="space-y-4">
      <section><h2 className="text-lg">Capital calls</h2>
        <Table head={["Vehicle", "Package", "Call", "Requested", "Funded", "Outstanding", "Due", "Status"]} empty={!calls.length}>
          {calls.map((r) => <tr key={r.id} className="border-t"><Veh r={r} /><Pkg r={r} /><td className="p-2">{r.title}</td><td className="p-2">{usd(r.requested)}</td><td className="p-2">{usd(r.funded)}</td><td className="p-2">{usd(r.outstanding)}</td><td className="p-2">{r.due_date ? fmtDate(r.due_date) : "—"}</td><td className="p-2">{titleCase(r.status)}</td></tr>)}
        </Table></section>
      <section><h2 className="text-lg">Distributions</h2>
        <Table head={["Vehicle", "Package", "Distribution", "Gross", "Approval", "Payment", "Reconciliation", "Pay date"]} empty={!dists.length}>
          {dists.map((r) => <tr key={r.id} className="border-t"><Veh r={r} /><Pkg r={r} /><td className="p-2">{r.title}</td><td className="p-2">{usd(r.gross)}</td><td className="p-2">{r.final_approved_at ? "Final approved" : titleCase(r.status)}</td><td className="p-2">{titleCase(r.payment_status)}</td><td className="p-2 text-xs text-muted-foreground">{r.reconciliation}</td><td className="p-2">{r.payment_date ? fmtDate(r.payment_date) : "—"}</td></tr>)}
        </Table></section>
      <p className="text-xs text-muted-foreground">View only. Money still moves only through the separate controlled payment process.</p>
    </div>
  );
}

function Exceptions({ rows }: { rows: any[] }) {
  const set = useServerFn(opsSetException); const bulk = useServerFn(opsBulkAction); const qc = useQueryClient();
  const [t, setT] = useState("");
  const list = rows.filter((r) => !t || r.exception_type === t);
  const act = async (r: any, status: "ACKNOWLEDGED" | "IN_PROGRESS" | "RESOLVED" | "DISMISSED") => {
    const resolution = status === "RESOLVED" || status === "DISMISSED" ? window.prompt("Resolution note") : null;
    if ((status === "RESOLVED" || status === "DISMISSED") && !resolution) return;
    try { await set({ data: { type: r.exception_type, ref: r.source_ref, fundId: r.fundId, title: r.title, status, resolution } }); qc.invalidateQueries({ queryKey: ["ops-command"] }); } catch (e) { toast.error((e as Error).message); }
  };
  const ackAll = async () => {
    try { const res = await bulk({ data: { action: "acknowledge", items: list.filter((r) => r.status === "OPEN").slice(0, 200).map((r) => ({ kind: "exception", id: r.source_ref, ref: r.source_ref, type: r.exception_type, fundId: r.fundId, title: r.title })) } }); toast.success(`Acknowledged ${res.done}.`); qc.invalidateQueries({ queryKey: ["ops-command"] }); } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <section className="space-y-2">
      <div className="flex gap-2"><select aria-label="Type" value={t} onChange={(e) => setT(e.target.value)} className={sel}><option value="">All exception types</option>{[...new Set(rows.map((r) => r.exception_type))].map((x) => <option key={x} value={x}>{titleCase(x)}</option>)}</select>
        <Button size="sm" variant="outline" onClick={ackAll}>Acknowledge open shown</Button></div>
      <Table head={["Type", "Item", "Vehicle", "Severity", "Due", "Status", "Actions"]} empty={!list.length}>
        {list.slice(0, 300).map((r) => (
          <tr key={`${r.exception_type}-${r.source_ref}`} className="border-t"><td className="p-2">{titleCase(r.exception_type)}</td><td className="p-2">{r.title}</td><Veh r={r} />
            <td className="p-2"><Badge variant={r.severity === "high" || r.severity === "critical" ? "destructive" : "outline"}>{r.severity}</Badge></td><td className="p-2">{r.due_date ? fmtDate(r.due_date) : "—"}</td><td className="p-2">{titleCase(r.status)}</td>
            <td className="p-2 whitespace-nowrap">{r.status === "OPEN" ? <button className="mr-2 underline" onClick={() => act(r, "ACKNOWLEDGED")}>Acknowledge</button> : null}<button className="mr-2 underline" onClick={() => act(r, "IN_PROGRESS")}>In progress</button><button className="mr-2 underline" onClick={() => act(r, "RESOLVED")}>Resolve</button><button className="underline" onClick={() => act(r, "DISMISSED")}>Dismiss</button></td></tr>
        ))}
      </Table>
      <p className="text-xs text-muted-foreground">Only deterministic exceptions from real records. NAV variance, accounting discrepancies, tax risk and regulatory deficiencies are not inferred.</p>
    </section>
  );
}

function Limits({ rows }: { rows: any[] }) {
  return (
    <Table head={["Vehicle", "Package", "Metric", "Used", "Included", "Percent", "Status"]} empty={!rows.length}>
      {rows.map((r) => <tr key={`${r.engagementId}-${r.metric}`} className="border-t"><Veh r={r} /><Pkg r={r} /><td className="p-2">{r.metric}</td><td className="p-2">{r.used ?? "No Data"}</td><td className="p-2">{r.included}</td><td className="p-2">{r.pct != null ? `${r.pct}%` : "—"}</td>
        <td className="p-2"><Badge variant={r.status === "REVIEW_REQUIRED" ? "destructive" : r.status === "APPROACHING" ? "secondary" : "outline"}>{titleCase(r.status)}</Badge></td></tr>)}
    </Table>
  );
}

function Reviews({ rows, economics }: { rows: any[]; economics: boolean }) {
  const set = useServerFn(opsSetServiceReview); const sync = useServerFn(opsSyncServiceReviews); const qc = useQueryClient();
  const change = async (id: string, status: string) => { const note = ["RESOLVED", "NO_CHANGE"].includes(status) ? window.prompt("Resolution note") : null; try { await set({ data: { id, status, note } }); qc.invalidateQueries({ queryKey: ["ops-command"] }); } catch (e) { toast.error((e as Error).message); } };
  return (
    <section className="space-y-2">
      <Button size="sm" variant="outline" onClick={async () => { const r = await sync(); toast.success(`Checked ${r.checked} triggers.`); qc.invalidateQueries({ queryKey: ["ops-command"] }); }}>Check for new service reviews</Button>
      <Table head={["Vehicle", "Package", "Reason", "Usage", ...(economics ? ["Active ACV"] : []), "Status"]} empty={!rows.length}>
        {rows.map((r) => <tr key={r.id} className="border-t"><Veh r={r} /><Pkg r={r} /><td className="p-2">{r.reason}</td><td className="p-2 text-xs">{r.usage_detail?.used != null ? `${r.usage_detail.used}/${r.usage_detail.included}` : titleCase(r.usage_detail?.request_type ?? "")}</td>
          {economics ? <td className="p-2">{usd(r.acv)}</td> : null}
          <td className="p-2"><select aria-label="Status" value={r.status} onChange={(e) => change(r.id, e.target.value)} className={sel}>{["REVIEW_REQUIRED", "IN_REVIEW", "CLIENT_DISCUSSION", "QUOTE_PREPARED", "RESOLVED", "NO_CHANGE"].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</select></td></tr>)}
      </Table>
      <p className="text-xs text-muted-foreground">Reviews never change price automatically.</p>
    </section>
  );
}

function Capacity({ rows }: { rows: D["capacity"] }) {
  return (
    <section className="space-y-2">
      <Table head={["Employee", "Role", "SPVs", "Funds", "Weighted load", "Investors", "Open tasks", "Overdue", "SLA risk", "SLA breach", "Approvals", "Requests", "Reports due", "Capital", "Inv. exceptions", "Status"]} empty={!rows.length}>
        {rows.map((r) => <tr key={r.userId} className="border-t"><td className="p-2">{r.name}</td><td className="p-2 text-xs">{r.roles.map(titleCase).join(", ")}</td><td className="p-2">{r.spvs}</td><td className="p-2">{r.funds}</td><td className="p-2">{r.weightedLoad}</td><td className="p-2">{r.investorCount}</td>
          <td className="p-2">{r.openTasks}</td><td className="p-2">{r.overdue}</td><td className="p-2">{r.slaAtRisk}</td><td className="p-2">{r.slaBreached}</td><td className="p-2">{r.approvalsToReview}</td><td className="p-2">{r.requestsAssigned}</td><td className="p-2">{r.reportsDue}</td><td className="p-2">{r.capitalEvents}</td><td className="p-2">{r.investorExceptions}</td>
          <td className="p-2"><Badge variant={r.status === "OVER_CAPACITY" || r.status === "HIGH" ? "destructive" : r.status === "ELEVATED" ? "secondary" : "outline"}>{CAPACITY_LABEL[r.status as CapacityStatus]}</Badge></td></tr>)}
      </Table>
      <p className="text-xs text-muted-foreground">Weights and thresholds are internal planning estimates (Settings), never shown to clients and not for employment decisions.</p>
    </section>
  );
}

function RoleView({ d, field, title }: { d: D; field: "relationshipLeadId" | "primaryAdministratorId"; title: string }) {
  const [who, setWho] = useState(d.viewer.userId);
  const people = useMemo(() => [...new Map(d.portfolio.filter((p) => p[field]).map((p) => [p[field]!, field === "relationshipLeadId" ? p.relationshipLead : p.primaryAdministrator])).entries()], [d, field]);
  const funds = d.portfolio.filter((p) => p[field] === who);
  const ids = new Set(funds.map((f) => f.fundId));
  const work = d.queue.filter((q) => q.fundId && ids.has(q.fundId));
  return (
    <div className="space-y-4">
      <select aria-label="Person" value={who} onChange={(e) => setWho(e.target.value)} className={sel}><option value={d.viewer.userId}>Me</option>{people.map(([id, n]) => <option key={id} value={id}>{n ?? "Staff"}</option>)}</select>
      <section><h2 className="text-lg">{title}</h2><Portfolio rows={funds} economics={false} /></section>
      <Queue rows={work.filter((w) => w.responsibility.startsWith("CLIENT_"))} title="Client actions outstanding" />
      <Queue rows={work.filter((w) => w.kind === "request")} title="Requests" />
      <Queue rows={work.filter((w) => w.kind === "approval")} title="Approvals" />
      <Queue rows={work.filter((w) => w.responsibility === "WAITING_ON_THIRD_PARTY")} title="Third-party blockers" />
      <Queue rows={work.filter((w) => w.kind === "capital" || w.kind === "calendar" || w.kind === "review")} title="Capital, deadlines & service reviews" />
    </div>
  );
}

function Economics({ rows, acv }: { rows: any[]; acv: D["acv"] }) {
  return (
    <div className="space-y-4">
      {acv ? <Acv acv={acv} /> : null}
      <Table head={["Vehicle", "Package", "Active ACV", "SPV transaction fee", "Annual service fee", "Billing", "Investors", "Entities", "Investments", "Requests YTD", "Tasks", "Capital events", "Reports", "Weight", "Review", "Hours YTD", "Labor cost", "Vendor cost", "Gross margin"]} empty={!rows.length}>
        {rows.map((r) => <tr key={r.engagementId} className="border-t"><Veh r={r} /><Pkg r={r} /><td className="p-2">{usd(r.acv)}</td><td className="p-2 text-xs">{r.spvTransactionFee ?? "—"}</td><td className="p-2">{usd(r.annualServiceFee)}</td><td className="p-2">{titleCase(r.billingFrequency)}</td>
          <td className="p-2">{r.investorCount}</td><td className="p-2 text-xs">{r.entityCount}</td><td className="p-2 text-xs">{r.investmentCount}</td><td className="p-2">{r.requestsYtd}</td><td className="p-2">{r.tasksYtd}</td><td className="p-2">{r.capitalEventsYtd}</td><td className="p-2">{r.reportingCycles}</td><td className="p-2">{r.weightedWorkload}</td>
          <td className="p-2">{r.serviceReviewStatus ? titleCase(r.serviceReviewStatus) : "—"}</td><td className="p-2 text-xs">{r.hoursYtd}</td><td className="p-2 text-xs">{r.laborCost}</td><td className="p-2 text-xs">{r.vendorCost}</td><td className="p-2 text-xs">{r.grossMargin}</td></tr>)}
      </Table>
      <p className="text-xs text-muted-foreground">Internal only. Active Administration ACV is contracted value, not recognized revenue. SPV transaction fees are one-time and not linked per SPV yet (No Data); costs show No Data until time and vendor data exist.</p>
    </div>
  );
}

function Acv({ acv }: { acv: NonNullable<D["acv"]> }) {
  const Box = ({ title, m }: { title: string; m: Record<string, number> }) => (
    <div className="rounded-lg border bg-card p-3"><p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="mt-1 space-y-0.5 text-sm">{Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => <li key={k} className="flex justify-between gap-2"><span>{k}</span><span>{usd(v)}</span></li>)}</ul></div>);
  return (
    <section className="space-y-2"><h2 className="text-lg">Active Administration ACV: {usd(acv.total)}</h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"><Box title="SPV vs Fund" m={acv.byProduct} /><Box title="By package" m={acv.byPackage} /><Box title="By client" m={acv.byClient} /><Box title="By administrator" m={acv.byAdministrator} /><Box title="By relationship lead" m={acv.byRelationshipLead} /></div></section>
  );
}

function Leadership({ d }: { d: D }) {
  const l = d.leadership;
  const cards: [string, number | string][] = [["Active funds", l.activeFunds], ["Active SPVs", l.activeSpvs], ["Open work", l.openWork], ["Overdue", l.overdue], ["SLA risks", l.slaAtRisk], ["SLA breaches", l.slaBreached],
    ["Approvals pending", l.approvalsPending], ["Requests open", d.requests.filter((r: any) => r.open).length], ["Reporting due", l.reportingDue], ["Capital activity", l.capitalEvents], ["Investor exceptions", d.investorExceptions.length], ["Capacity risks", l.capacityRisks], ["Service reviews", l.serviceReviews]];
  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">{cards.map(([k, v]) => <div key={k} className="rounded-lg border bg-card p-3"><p className="text-xs uppercase tracking-wide text-muted-foreground">{k}</p><p className="text-xl font-semibold">{v}</p></div>)}</section>
      <section><h2 className="text-lg">Engagements by package</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">{PACKAGES.map((p) => <div key={p} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{p}</p><p className="text-xl font-semibold">{d.packages[p] ?? 0}</p></div>)}</div></section>
      {d.acv ? <Acv acv={d.acv} /> : <p className="text-sm text-muted-foreground">Active Administration ACV is visible to Leadership and Finance.</p>}
    </div>
  );
}

function Settings({ d }: { d: D }) {
  const save = useServerFn(opsUpdateSetting); const qc = useQueryClient();
  const [weights, setWeights] = useState(JSON.stringify(d.settings.weights ?? {}, null, 1));
  const [cap, setCap] = useState(JSON.stringify(d.settings.capacity, null, 1));
  const [lim, setLim] = useState(JSON.stringify(d.settings.limits, null, 1));
  if (!d.viewer.canSettings) return <p className="text-sm text-muted-foreground">Only a Harmonious Admin can change Operations settings. Current capacity thresholds: {JSON.stringify(d.settings.capacity)}.</p>;
  const go = async (key: string, raw: string) => {
    const reason = window.prompt("Reason for this change (10+ characters)"); if (!reason) return;
    try { await save({ data: { key, value: JSON.parse(raw), reason } }); toast.success("Saved and logged."); qc.invalidateQueries({ queryKey: ["ops-command"] }); } catch (e) { toast.error((e as Error).message); }
  };
  const Block = ({ k, label, v, set }: { k: string; label: string; v: string; set: (s: string) => void }) => (
    <div className="space-y-1 rounded-lg border p-3"><p className="text-sm font-medium">{label}</p><textarea aria-label={label} value={v} onChange={(e) => set(e.target.value)} className="h-40 w-full rounded-md border bg-background p-2 font-mono text-xs" /><Button size="sm" onClick={() => go(k, v)}>Save</Button></div>);
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Block k="workload_weights" label="Workload weights (product/level)" v={weights} set={setWeights} />
      <Block k="capacity_thresholds" label="Capacity thresholds" v={cap} set={setCap} />
      <Block k="service_limit_thresholds" label="Service limit thresholds" v={lim} set={setLim} />
      <p className="text-xs text-muted-foreground md:col-span-3">Approval second-approver rules and SLA policies are saved settings too; every change here is logged with your reason.</p>
    </div>
  );
}

function SavedViews({ view, filters, onApply }: { view: string; filters: Record<string, string>; onApply: (f: Record<string, string>) => void }) {
  const list = useServerFn(opsSavedViews); const save = useServerFn(opsSaveView); const del = useServerFn(opsDeleteView);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["ops-saved-views"], queryFn: () => list() });
  const mine = (q.data ?? []).filter((v: any) => v.view === view);
  return (
    <div className="flex items-center gap-1">
      <select aria-label="Saved views" className={sel} value="" onChange={(e) => { const v = mine.find((x: any) => x.id === e.target.value); if (v) onApply(v.filters); }}>
        <option value="">Saved views…</option>{mine.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
      <Button size="sm" variant="ghost" onClick={async () => { const name = window.prompt("Name this view"); if (!name) return; try { await save({ data: { view, name, filters } }); qc.invalidateQueries({ queryKey: ["ops-saved-views"] }); toast.success("View saved."); } catch (e) { toast.error((e as Error).message); } }}>Save view</Button>
      {mine.length ? <Button size="sm" variant="ghost" onClick={async () => { const n = window.prompt(`Delete which view? (${mine.map((m: any) => m.name).join(", ")})`); const v = mine.find((m: any) => m.name === n); if (v) { await del({ data: { id: v.id } }); qc.invalidateQueries({ queryKey: ["ops-saved-views"] }); } }}>Delete</Button> : null}
    </div>
  );
}
