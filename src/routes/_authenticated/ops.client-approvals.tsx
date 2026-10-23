import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAllApprovals } from "@/lib/approvals.functions";
import { listAllFundRequests } from "@/lib/fund-requests.functions";
import { APPROVAL_TYPES, APPROVAL_TYPE_KEYS, APPROVAL_STATUS_LABEL, approvalType } from "@/lib/approval-types";
import { REQUEST_STATUS_LABEL, requestType } from "@/lib/service-request-types";
import { ResponsibilityBadge } from "@/components/responsibility-badge";
import { AmPage } from "@/components/account-management-ui";
import { fmtDate, titleCase } from "@/lib/service-engagement-labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/ops/client-approvals")({
  head: () => ({ meta: [
    { title: "Client approvals & requests - Harmonious" },
    { name: "description", content: "Every fund's client approvals and service requests, with SLA, team and entitlement status." },
    { property: "og:title", content: "Client approvals & requests - Harmonious" },
    { property: "og:description", content: "Approvals and service requests across funds." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" },
  ] }),
  component: Page,
});

const sel = "h-8 rounded-md border bg-background px-2 text-sm";
const ANY = "";

function Page() {
  const [tab, setTab] = useState<"approvals" | "requests">("approvals");
  return (
    <AmPage title="Client approvals & requests" intro="Approvals waiting on fund managers and the operational requests they've sent. Open a fund to act on an item.">
      <div className="flex gap-2"><Button size="sm" variant={tab === "approvals" ? "default" : "outline"} onClick={() => setTab("approvals")}>Approvals</Button><Button size="sm" variant={tab === "requests" ? "default" : "outline"} onClick={() => setTab("requests")}>Service requests</Button></div>
      {tab === "approvals" ? <Approvals /> : <Requests />}
    </AmPage>
  );
}

const FundLink = ({ id, name, tab }: { id: string; name: string; tab: string }) => <Link to="/ops/fund/$fundId" params={{ fundId: id }} search={{ tab } as any} className="underline">{name}</Link>;

function Approvals() {
  const load = useServerFn(listAllApprovals);
  const q = useQuery({ queryKey: ["ops-approvals"], queryFn: () => load() });
  const [f, setF] = useState({ fund: ANY, level: ANY, type: ANY, status: ANY, admin: ANY, lead: ANY, due: ANY, min: "", max: "" });
  const rows = q.data ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const uniq = (k: string) => [...new Set(rows.map((r: any) => r[k]).filter(Boolean))] as string[];
  const list = useMemo(() => rows.filter((r: any) => (!f.fund || r.fund_id === f.fund) && (!f.level || r.serviceLevel === f.level) && (!f.type || r.approval_type === f.type) && (!f.status || r.status === f.status)
    && (!f.admin || r.primaryAdministrator === f.admin) && (!f.lead || r.relationshipLead === f.lead)
    && (!f.due || (f.due === "overdue" ? r.due_date && r.due_date < today && r.status === "AWAITING_APPROVAL" : r.due_date && r.due_date <= new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)))
    && (!f.min || Number(r.approval_amount ?? 0) >= Number(f.min)) && (!f.max || Number(r.approval_amount ?? 0) <= Number(f.max))), [rows, f, today]);
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  return (<>
    <div className="flex flex-wrap gap-2">
      <select aria-label="Fund" className={sel} value={f.fund} onChange={(e) => setF({ ...f, fund: e.target.value })}><option value="">Any fund</option>{uniq("fund_id").map((id) => <option key={id} value={id}>{rows.find((r: any) => r.fund_id === id)?.fundName}</option>)}</select>
      <select aria-label="Service level" className={sel} value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })}><option value="">Any level</option>{uniq("serviceLevel").map((l) => <option key={l} value={l}>{titleCase(l)}</option>)}</select>
      <select aria-label="Type" className={sel} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="">Any type</option>{APPROVAL_TYPE_KEYS.map((k) => <option key={k} value={k}>{APPROVAL_TYPES[k].label}</option>)}</select>
      <select aria-label="Status" className={sel} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">Any status</option>{Object.entries(APPROVAL_STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <select aria-label="Primary administrator" className={sel} value={f.admin} onChange={(e) => setF({ ...f, admin: e.target.value })}><option value="">Any administrator</option>{uniq("primaryAdministrator").map((n) => <option key={n}>{n}</option>)}</select>
      <select aria-label="Relationship lead" className={sel} value={f.lead} onChange={(e) => setF({ ...f, lead: e.target.value })}><option value="">Any lead</option>{uniq("relationshipLead").map((n) => <option key={n}>{n}</option>)}</select>
      <select aria-label="Due" className={sel} value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })}><option value="">Any due date</option><option value="overdue">Overdue</option><option value="week">Due within 7 days</option></select>
      <Input aria-label="Minimum amount" placeholder="Min $" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} className="h-8 w-24" />
      <Input aria-label="Maximum amount" placeholder="Max $" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} className="h-8 w-24" />
    </div>
    <ul className="divide-y rounded-lg border bg-card">{list.map((r: any) => (
      <li key={r.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
        <div className="min-w-0 flex-1"><p className="font-medium">{r.title} <span className="text-xs text-muted-foreground">· {approvalType(r.approval_type).label} v{r.version}</span></p>
          <p className="text-xs text-muted-foreground"><FundLink id={r.fund_id} name={r.fundName} tab="approvals" /> · {r.approval_amount != null ? `$${Number(r.approval_amount).toLocaleString("en-US")} · ` : ""}{r.due_date ? `Due ${fmtDate(r.due_date)} · ` : ""}Prepared by {r.preparedByName ?? "—"}</p></div>
        <span className="text-xs">{APPROVAL_STATUS_LABEL[r.status]}</span>
      </li>
    ))}{!list.length && <li className="p-3 text-sm text-muted-foreground">No approvals match.</li>}</ul>
  </>);
}

function Requests() {
  const load = useServerFn(listAllFundRequests);
  const q = useQuery({ queryKey: ["ops-fund-requests"], queryFn: () => load() });
  const [open, setOpen] = useState(true);
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const rows = (q.data ?? []).filter((r: any) => !open || !["COMPLETED", "CANCELLED"].includes(r.status));
  return (<>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} /> Open only</label>
    <ul className="divide-y rounded-lg border bg-card">{rows.map((r: any) => (
      <li key={r.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
        <div className="min-w-0 flex-1"><p className="font-medium">{r.title}</p>
          <p className="text-xs text-muted-foreground">{r.clientName ? `${r.clientName} · ` : ""}<FundLink id={r.fund_id} name={r.fundName} tab="requests" /> · {r.serviceLevel ? titleCase(r.serviceLevel) : "No service level"} · {requestType(r.request_type).label} · {r.entitlement_status === "INCLUDED" ? "Included" : "Service review required"} · {r.assignedName ?? "Unassigned"} · {r.priority}
            {r.sla ? ` · SLA ${r.sla.paused ? "paused" : r.sla.breached ? "breached" : `${r.sla.hoursLeft}h`}` : ""}</p></div>
        <span className="text-xs">{REQUEST_STATUS_LABEL[r.status as keyof typeof REQUEST_STATUS_LABEL]}</span>
        <ResponsibilityBadge status={r.responsibility_status} />
      </li>
    ))}{!rows.length && <li className="p-3 text-sm text-muted-foreground">No requests.</li>}</ul>
  </>);
}
