import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MoreHorizontal, Search } from "lucide-react";
import { toast } from "sonner";
import { opsFundsDashboardFn } from "@/lib/ops-funds.functions";
import { getFundLinkFn } from "@/lib/fund-onboarding-link.functions";
import { attentionLines, matchesFilter, type FundFilter } from "@/lib/ops-funds-model";
import { copyText } from "@/components/fund-onboarding-link";
import { ViewAsPicker } from "@/components/view-as";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const FILTERS: [FundFilter, string][] = [["all", "All"], ["active", "Active"], ["onboarding", "Onboarding"], ["needs_harmonious", "Needs Harmonious"], ["blocked", "Blocked"], ["ready", "Ready to Close"], ["closing_soon", "Closing in 30 days"], ["agreement_follow_up", "Agreement Follow-Up"]];
const fmt = (d: string | null) => (d ? new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "-");

function RowActions({ f }: { f: any }) {
  const load = useServerFn(getFundLinkFn);
  const copy = async () => {
    try { const d = await load({ data: { offeringId: f.id } }); if (d.url) await copyText(d.url, "Onboarding link copied"); else toast.message("No active onboarding link. Open the fund's Onboarding Link tab to set one up."); }
    catch (e) { toast.error((e as Error).message); }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label={`Actions for ${f.name}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild><Link to="/ops/fund/$fundId" params={{ fundId: f.id }} search={{ tab: undefined }}>Open Fund</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link to="/manager/fund/$fundId/investors" params={{ fundId: f.id }}>View Investors</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link to="/manager/fund/$fundId/readiness" params={{ fundId: f.id }}>View Readiness</Link></DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link to="/manager/fund/$fundId/investors" params={{ fundId: f.id }} search={{ add: "existing" } as never}>Add Existing Investor</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link to="/manager/fund/$fundId/investors" params={{ fundId: f.id }} search={{ add: "invite" } as never}>Invite Investor</Link></DropdownMenuItem>
        <DropdownMenuItem onClick={copy}>Copy Investor Onboarding Link</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Operations → Funds: which funds need attention, and what's next. */
export function OpsFundsDashboard({ initialFilter }: { initialFilter?: FundFilter | undefined } = {}) {
  const load = useServerFn(opsFundsDashboardFn);
  const q = useQuery({ queryKey: ["ops-funds-dashboard"], queryFn: () => load(), retry: false });
  const [filter, setFilter] = useState<FundFilter>(initialFilter ?? "all");
  const [term, setTerm] = useState("");
  const [client, setClient] = useState("any");
  const [owner, setOwner] = useState("any");
  const [manager, setManager] = useState("any");
  const rows = ((q.data as any)?.rows ?? []) as any[];
  const opts = useMemo(() => {
    const c = new Map<string, string>(), o = new Map<string, string>(), m = new Map<string, string>();
    for (const r of rows) { if (r.clientId) c.set(r.clientId, r.clientName ?? "Client"); if (r.owner) o.set(r.owner.id, r.owner.name); for (const x of r.managers) m.set(x.id, x.name); }
    const sort = (x: Map<string, string>) => [...x.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    return { clients: sort(c), owners: sort(o), managers: sort(m) };
  }, [rows]);
  if (q.isPending) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (q.isError) return <p className="text-sm text-muted-foreground">Harmonious operations access is required.</p>;
  const t = (q.data as any).totals;
  const shown = rows
    .filter((r) => matchesFilter(r, filter))
    .filter((r) => !term || r.name.toLowerCase().includes(term.toLowerCase()))
    .filter((r) => client === "any" || r.clientId === client)
    .filter((r) => owner === "any" || r.owner?.id === owner)
    .filter((r) => manager === "any" || r.managers.some((m: any) => m.id === manager))
    .sort((a, b) => (b.metrics.blocked + b.metrics.needsHarmonious) - (a.metrics.blocked + a.metrics.needsHarmonious));
  const metric: [string, number, boolean?][] = [["Active Funds", t.activeFunds], ["Investors Onboarding", t.onboarding], ["Ready to Close", t.ready], ["Needs Harmonious", t.needsHarmonious], ["Blocked", t.blocked, true]];
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Funds &amp; SPVs</h1>
        <p className="text-sm text-muted-foreground">Which funds need attention, who is onboarding, and what's next.</p>
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-5">
        {metric.map(([l, v, warn]) => (
          <div key={l} className="bg-card p-4 last:col-span-2 sm:last:col-span-1"><p className="text-xs uppercase tracking-wide text-muted-foreground">{l}</p><p className={cn("font-heading text-2xl font-semibold", warn && v ? "text-destructive" : "")}>{v}</p></div>
        ))}
      </div>
      <div className="space-y-3">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {FILTERS.map(([k, l]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} className={cn("whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium", filter === k ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>{l}</button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-4">
          <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search fund" className="h-9 pl-8" /></div>
          {([["Client", client, setClient, opts.clients], ["Harmonious owner", owner, setOwner, opts.owners], ["Fund manager", manager, setManager, opts.managers]] as const).map(([label, v, set, list]) => (
            <Select key={label} value={v} onValueChange={set as (x: string) => void}>
              <SelectTrigger className="h-9"><SelectValue placeholder={label} /></SelectTrigger>
              <SelectContent><SelectItem value="any">Any {label.toLowerCase()}</SelectItem>{list.map(([id, n]) => <SelectItem key={id} value={id}>{n}</SelectItem>)}</SelectContent>
            </Select>
          ))}
        </div>
      </div>
      {!rows.length ? (
        <div className="rounded-xl border border-dashed px-6 py-12 text-center"><p className="font-heading font-semibold">No funds yet</p><p className="text-sm text-muted-foreground">Funds appear here once they are set up.</p></div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="hidden grid-cols-[2fr_1.2fr_1fr_0.9fr_1.6fr_1fr_6rem] gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground lg:grid">
            <span>Fund</span><span>Client</span><span>Setup</span><span>Investors</span><span>Next step</span><span>Owner</span><span />
          </div>
          {!shown.length ? <p className="px-4 py-6 text-sm text-muted-foreground">No funds match these filters.</p> : shown.map((f) => {
            const lines = attentionLines(f.metrics).filter((l) => !l.includes("ready"));
            const pct = f.setupCompletion;
            const stage = !f.isOpen ? "Closed" : pct != null && pct < 100 ? "In setup" : "Live";
            const next = lines[0] ?? (pct != null && pct < 100 ? "Finish fund setup" : "—");
            return (
              <div key={f.id} className="grid grid-cols-2 gap-x-3 gap-y-1 border-b px-4 py-3 text-sm last:border-b-0 hover:bg-muted/30 lg:grid-cols-[2fr_1.2fr_1fr_0.9fr_1.6fr_1fr_6rem] lg:items-center">
                <div className="col-span-2 min-w-0 lg:col-span-1">
                  <Link to="/ops/fund/$fundId" params={{ fundId: f.id }} search={{ tab: undefined }} className="font-medium hover:underline">{f.name}</Link>
                  <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{stage}</span>
                </div>
                <span className="text-muted-foreground">{f.clientName ?? "-"}</span>
                <span className="flex items-center gap-2 text-right lg:text-left">
                  <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted lg:inline-block"><span className="block h-full bg-primary" style={{ width: `${pct ?? 0}%` }} /></span>
                  {pct == null ? "-" : `${pct}%`}
                </span>
                <span><span className="lg:hidden text-muted-foreground">Investors </span>{f.metrics.ready}/{f.metrics.investors} ready</span>
                <span className={cn("text-right text-xs lg:text-left", f.metrics.blocked ? "text-destructive" : f.metrics.needsAttention ? "font-medium" : "text-muted-foreground")}>{next}</span>
                <span className="text-xs text-muted-foreground lg:text-sm lg:text-foreground">{f.owner?.name ?? "Unassigned"}</span>
                <span className="flex items-center justify-end gap-1">
                  <ViewAsPicker offeringId={f.id} label="Preview" />
                  <RowActions f={f} />
                </span>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-xs text-muted-foreground">Counts come from each investment's readiness checklist and open work items. Close Requests will appear here once that feature exists.</p>
    </div>
  );
}
