import { fundOriginLabel, migrationApplies } from "@/lib/fund-origin";
import { useEffect } from "react";
import { ReadinessQueue } from "@/components/investment-readiness";
import { FundMigrationStatus } from "@/components/fund-migration-status";
import { MigrationPaymentsCard } from "@/components/migration-payments-card";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { FundServicesTab } from "@/components/fund-services-tab";
import { FundCommandCenter } from "@/components/fund-command-center";
import { FundCalendar } from "@/components/fund-calendar";
import { FundApprovals } from "@/components/fund-approvals";
import { ManagerFundReviews } from "@/components/manager-fund-reviews";
import { FundRequests } from "@/components/fund-requests";
import { updateSetupTaskFn } from "@/lib/fund-setup.functions";
import { Link } from "@tanstack/react-router";
import { CloseRequestReview } from "@/components/close-request-review";
import { FundPayments } from "@/components/fund-payments";
import { FundDistributions } from "@/components/fund-distributions";
import { listAllCloseRequests } from "@/lib/fund-close-requests.functions";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, ChevronDown, ChevronRight, Clock } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getClientFund, getFundCapTable } from "@/lib/fund-cap-table.functions";
import { getFundTabsData, listFundCloseRequests } from "@/lib/fund-close-requests.functions";
import { TodosTab } from "@/components/fund-tabs/todos-tab";
import { TeamTab } from "@/components/fund-tabs/team-tab";
import { InvestorsTab } from "@/components/fund-tabs/investors-tab";
import { CapitalTieReport } from "@/components/investor-share-panel";
import { FundUpdatesPanel } from "@/components/investor-onboarding-extras";
import { DocumentsTab } from "@/components/fund-tabs/documents-tab";
import { AuditHistoryTab } from "@/components/fund-tabs/audit-history-tab";
import { BankingTab, FundBooks } from "@/components/fund-tabs/banking-tab";
import { RequestCloseDialog } from "@/components/fund-tabs/request-close-dialog";
import { fundRegulatoryFn } from "@/lib/fund-regulatory.functions";
import { nextDeadline } from "@/lib/fund-health";
import { RegulatoryTab } from "@/components/fund-tabs/regulatory-tab";
import { FeesSection } from "@/components/fund-tabs/team-tab";
import { AccountTab } from "@/components/fund-tabs/account-tab";
import { AssetManager } from "@/components/fund-tabs/asset-manager";
import { CentsBarChart, CentsDonut } from "@/components/fund-tabs/charts";
import { RequestHarmoniousButton } from "@/components/fund-tabs/request-harmonious";
import { fundEinFn } from "@/lib/fund-tabs.functions";

const nice = (v: string | null | undefined) => (v ? v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "");

export function EinField({ fundId }: { fundId: string }) {
  const load = useServerFn(fundEinFn);
  const [reveal, setReveal] = useState(false);
  const q = useQuery({ queryKey: ["fund-ein", fundId, reveal], queryFn: () => load({ data: { fundId, reveal } }) });
  const r = q.data;
  let body: React.ReactNode = "Loading…";
  if (r && !r.allowed) body = <span className="text-muted-foreground">Restricted to fund managers</span>;
  else if (r && r.status === "not_recorded") body = "Not recorded";
  else if (r && r.status === "in_review") body = "Harmonious reviewing";
  else if (r && r.status === "recorded") body = <span className="inline-flex items-center gap-2 font-mono">{r.ein}<button type="button" className="font-sans text-xs text-primary underline" onClick={() => setReveal((x) => !x)}>{reveal ? "Hide" : "Show"}</button></span>;
  return <div><dt className="text-xs text-muted-foreground">EIN</dt><dd>{body}</dd></div>;
}

export const FUND_TABS = ["overview", "approvals", "requests", "calendar", "distributions", "services", "todos", "details", "team", "investors", "documents", "banking", "accounting", "assets", "closes", "regulatory", "audit"] as const;
export type FundTab = (typeof FUND_TABS)[number];
type Tab = FundTab;
export type FundWorkspaceMode = "client" | "harmonious";
export type ExtraTab = { value: string; label: string; content: React.ReactNode };

const usd = (c: number | null | undefined) =>
  typeof c === "number" ? (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }) : "-";
const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Not recorded";

const CLOSE_STATUS: Record<string, string> = {
  submitted: "Submitted - Harmonious reviewing",
  in_review: "In review",
  completed: "Completed",
  returned: "Returned",
  approved: "Approved - filings in progress",
};

/** Primary tabs, each owning a group of the original tab values (old addresses keep working). */
const PRIMARY: { value: string; label: string; group: string[] }[] = [
  { value: "overview", label: "Overview", group: ["overview"] },
  { value: "setup", label: "Fund Details", group: ["setup", "details", "team"] },
  { value: "investors", label: "Investors", group: ["investors"] },
  { value: "assets", label: "Asset Details", group: ["assets"] },
  { value: "banking", label: "Banking", group: ["banking"] },
  { value: "accounting", label: "Accounting", group: ["accounting", "closes", "distributions"] },
  { value: "documents", label: "Documents", group: ["documents"] },
  { value: "audit", label: "Audit History", group: ["audit"] },
];
const SUB_LABEL: Record<string, string> = { setup: "Checklist", details: "Fund details", team: "Team", banking: "Banking", accounting: "Accounting", assets: "Assets", closes: "Closes", distributions: "Distributions" };
const SETUP_GROUP = ["setup", "details", "team", "banking"];
const MERGED_SECTIONS = [{ id: "fs-setup", label: "Progress" }, { id: "fs-launch", label: "Launch status" }, { id: "setup-details", label: "Fund details" }, { id: "setup-economics", label: "Fees & terms" }, { id: "setup-documents", label: "Documents" }, { id: "fund-operations", label: "EIN, tax & sign-off" }, { id: "fs-team", label: "Team" }, { id: "fs-banking", label: "Banking" }];
const MORE: { value: string; label: string }[] = [
  { value: "todos", label: "To dos" }, { value: "approvals", label: "Approvals" }, { value: "requests", label: "Requests" },
  { value: "calendar", label: "Calendar" }, { value: "regulatory", label: "Regulatory" }, { value: "services", label: "Services" },
];

function FundTabBar({ fundId, mode, tab, onTab, extraTabs, todoCount }: { fundId: string; mode: FundWorkspaceMode; tab: string; onTab: (t: string) => void; extraTabs: ExtraTab[]; todoCount: number }) {
  const hasSetup = extraTabs.some((x) => x.value === "setup");
  const primary = PRIMARY
    .map((p) => (p.value === "setup" && !hasSetup ? { ...p, value: "details", group: p.group.filter((g) => g !== "setup") } : p))
    .map((p) => (p.value === "setup" && hasSetup ? { ...p, label: "Fund Setup" } : p));
  const active = primary.find((p) => p.group.includes(tab));
  const more = [...MORE, ...extraTabs.filter((x) => x.value !== "setup").map((x) => ({ value: x.value, label: x.label }))];
  const moreActive = !active ? more.find((m) => m.value === tab) : undefined;
  const label = (m: { value: string; label: string }) => (m.value === "todos" && todoCount ? `${m.label} (${todoCount})` : m.label);
  const pill = (on: boolean) => cn("shrink-0 rounded-md border px-3.5 py-1.5 text-sm font-medium transition-colors", on ? "border-border bg-muted text-foreground" : "border-transparent text-muted-foreground hover:text-foreground");
  const tabLink = (value: string, text: string, className: string, selected?: boolean) => mode === "harmonious"
    ? <Link to="/ops/fund/$fundId" params={{ fundId }} search={(prev) => ({ ...prev, tab: value })} resetScroll={false} role="tab" aria-selected={selected} className={className}>{text}</Link>
    : <Link to="/client/funds/$fundId" params={{ fundId }} search={(prev) => ({ ...prev, tab: value as FundTab })} resetScroll={false} role="tab" aria-selected={selected} className={className}>{text}</Link>;
  return (
    <div id="fund-workspace-tabs" className="sticky top-0 z-20 space-y-2 bg-background pt-2">
      <div role="tablist" aria-label="Fund tabs" className="flex items-center gap-1 overflow-x-auto border-b pb-2">
        {primary.map((p) => (
          <span key={p.value} className="shrink-0">{tabLink(p.value, p.label, pill(active?.value === p.value), active?.value === p.value)}</span>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className={cn(pill(!!moreActive), "inline-flex h-auto items-center gap-1")}>{moreActive ? `More: ${label(moreActive)}` : todoCount ? `More (${todoCount})` : "More"}<ChevronDown className="h-3.5 w-3.5" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {more.map((m) => <DropdownMenuItem key={m.value} asChild>{tabLink(m.value, label(m), "cursor-pointer")}</DropdownMenuItem>)}
            <DropdownMenuSeparator />
            {!hasSetup && ["details", "team", "banking"].map((v) => <DropdownMenuItem key={v} onSelect={() => onTab(v)}>{SUB_LABEL[v]}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {active && active.group.length > 1 && !(hasSetup && active.value === "setup") && (
        <div className="flex gap-1 overflow-x-auto">
          {active.group.map((g) => (
            <span key={g} className="shrink-0">{tabLink(g, SUB_LABEL[g] ?? g, cn("inline-flex rounded-md border px-3 py-1 text-xs transition-colors", tab === g ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:border-primary hover:text-foreground"), tab === g)}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{text}</p>;
}

export function FundWorkspace({ fundId, tab, onTab, mode = "client", extraTabs = [], headerExtra }: { fundId: string; tab: string; onTab: (t: string) => void; mode?: FundWorkspaceMode; extraTabs?: ExtraTab[]; headerExtra?: React.ReactNode }) {
  const staff = mode === "harmonious";
  const [closeOpen, setCloseOpen] = useState(false);
  const loadFund = useServerFn(getClientFund);
  const loadCap = useServerFn(getFundCapTable);
  const loadTabs = useServerFn(getFundTabsData);
  const loadCloses = useServerFn(listFundCloseRequests);
  const fq = useQuery({ queryKey: ["client-fund", fundId], queryFn: () => loadFund({ data: { fundId } }) });
  const cq = useQuery({ queryKey: ["client-fund-cap", fundId], queryFn: () => loadCap({ data: { fundId } }) });
  const tq = useQuery({ queryKey: ["client-fund-tabs", fundId], queryFn: () => loadTabs({ data: { fundId } }) });
  const crq = useQuery({ queryKey: ["client-fund-closes", fundId], queryFn: () => loadCloses({ data: { fundId } }) });
  const loadReg = useServerFn(fundRegulatoryFn);
  const rq = useQuery({ queryKey: ["fund-regulatory", fundId], queryFn: () => loadReg({ data: { fundId } }) });

  const isMerged = extraTabs.some((x) => x.value === "setup");
  const ready = !!fq.data;
  useEffect(() => {
    if (!isMerged || !ready || !["details", "team", "banking"].includes(tab)) return;
    const t = setTimeout(() => document.getElementById(tab === "details" ? "setup-details" : `fs-${tab}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    return () => clearTimeout(t);
  }, [isMerged, ready, tab]);
  if (fq.isLoading) return <p className="text-sm text-muted-foreground">Loading fund…</p>;
  if (fq.error || !fq.data) return <p className="text-sm text-destructive">{(fq.error as any)?.message ?? "Couldn't load this fund."}</p>;
  const { setup, steps, sideLetters } = fq.data;
  const f = fq.data.fund as any;
  const pending = steps.filter((s) => !s.done);
  const cap = cq.data;
  const td = tq.data;
  // Operations: Setup, Fund details, Team and Banking live on one page so the fund can be managed without jumping between tabs.
  const merged = extraTabs.some((x) => x.value === "setup");
  const detailsBody = <>
          <Card>
            <CardHeader><CardTitle className="text-base">Fund details</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid gap-3 text-sm sm:grid-cols-3">
                <div><dt className="text-xs text-muted-foreground">Type</dt><dd>{nice(f.fund_type === "other" ? f.fund_type_other : f.fund_type) || "Not recorded"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Entity type</dt><dd>{f.entity_type ? (/^(llc|lp|gp)$/i.test(f.entity_type) ? f.entity_type.toUpperCase() : nice(f.entity_type)) : "Not recorded"}</dd></div>
                <EinField fundId={fundId} />
                <div><dt className="text-xs text-muted-foreground">Exemption</dt><dd>{f.reg_type ? `Reg D ${f.reg_type}` : "Not recorded"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Target raise</dt><dd>{usd(f.target_raise_cents == null ? null : Number(f.target_raise_cents))}</dd></div>
                <div><dt className="text-xs text-muted-foreground">State formed</dt><dd>{f.state_formed || "Not recorded"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Date formed</dt><dd>{fmtDate(f.date_formed)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Side letters</dt><dd>{sideLetters.active} active{sideLetters.proposed ? ` · ${sideLetters.proposed} proposed` : ""}</dd></div>
              </dl>
            </CardContent>
          </Card>

          <FeesSection fundId={fundId} />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Setup progress</CardTitle>
              <CardDescription>{pending.length ? `${pending.length} step${pending.length === 1 ? "" : "s"} still open.` : steps.length ? "All setup steps are complete." : "Harmonious hasn't started setup for this fund yet."}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {setup.percent != null && <Progress value={setup.percent} />}
              {mode === "harmonious" ? <p className="text-sm text-muted-foreground">Each step is listed and completed in its section on the <button type="button" className="underline" onClick={() => onTab?.("setup")}>Setup tab</button>.</p> : <div className="space-y-1.5">
                {steps.map((s, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    {s.done ? <CheckCircle2 className="size-4 text-primary" /> : <Clock className="size-4 text-muted-foreground" />}
                    <span className={s.done ? "" : "text-muted-foreground"}>{s.label}</span>
                    {!s.done && <Badge variant="outline" className="ml-auto">{s.status === "review" ? "Sent - Harmonious reviewing" : s.owner === "Harmonious" ? "Harmonious - pending" : "Waiting on you"}</Badge>}
                  </div>
                ))}
              </div>}
            </CardContent>
          </Card>
  </>;
  const bankingBody = <>
          {!!td?.banks.length && (
            <Card>
              <CardHeader><CardTitle className="text-base">Connected accounts</CardTitle></CardHeader>
              <CardContent className="divide-y">
                {td.banks.map((b) => (
                  <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <div><p className="font-medium">{b.institution || "Bank"}{b.mask ? ` ${b.mask}` : ""}</p><p className="text-xs text-muted-foreground">{b.name || "Operating account"}</p></div>
                    <Badge variant="outline" className="capitalize">{b.status}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          <BankingTab fundId={fundId} />
  </>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {!staff && <Link to="/client/funds" className="text-xs text-muted-foreground hover:underline">← All funds</Link>}
          <h2 className="text-xl font-semibold tracking-tight">{f.name}</h2>
          <p className="text-sm text-muted-foreground">{f.legal_entity_name || "Legal name not recorded"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{fundOriginLabel(f.fund_origin)}</Badge>
          <Badge variant={f.is_open ? "default" : "secondary"}>{f.is_open ? "Open to investors" : "In setup"}</Badge>
          {headerExtra}
          {!staff && <Button onClick={() => setCloseOpen(true)}>Request Fund Close</Button>}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { l: "Setup complete", t: extraTabs.some((x) => x.value === "setup") ? "setup" : "details", v: setup.percent == null ? "-" : `${setup.percent}%` },
          { l: "Investors", t: "investors", v: cap ? String(cap.totals.investors) : "-" },
          { l: "Committed", t: "investors", v: cap ? usd(cap.totals.commitCents) : "-" },
          { l: "Funded (reconciled)", t: "investors", v: cap ? usd(cap.totals.fundedCents) : "-" },
          { l: "Open to dos", t: "todos", v: String(steps.filter((s) => s.owner === "You" && !s.done && s.status !== "review").length) },
          { l: "Next deadline", t: "calendar", v: (() => { const n = nextDeadline((rq.data?.calendar ?? []) as any); return n ? `${n.date}` : "-"; })() },
        ].map((k) => (
          <button key={k.l} type="button" onClick={() => onTab(k.t)} className="group rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <p className="flex items-center justify-between text-xs text-muted-foreground">{k.l}<ChevronRight className="h-3.5 w-3.5 opacity-50 transition-transform group-hover:translate-x-0.5 group-hover:opacity-100" /></p>
            <p className="text-xl font-semibold">{k.v}</p>
          </button>
        ))}
      </div>

      <Tabs value={tab} onValueChange={onTab}>
        <FundTabBar fundId={fundId} mode={mode} tab={tab} onTab={onTab} extraTabs={extraTabs} todoCount={steps.filter((s) => s.owner === "You" && !s.done && s.status !== "review" && !s.answer?.trim()).length} />

        {extraTabs.map((x) => x.value === "setup" && merged ? (!SETUP_GROUP.includes(tab) ? null :
          <TabsContent key="setup" value={tab}>
            <div className="grid gap-6 lg:grid-cols-[11rem_minmax(0,1fr)]">
              <nav aria-label="Setup sections" className="flex gap-1 overflow-x-auto lg:sticky lg:top-4 lg:h-fit lg:flex-col">
                {MERGED_SECTIONS.map((m) => <button key={m.id} type="button" onClick={() => document.getElementById(m.id)?.scrollIntoView({ behavior: "smooth", block: "start" })} className="shrink-0 rounded-md px-3 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground">{m.label}</button>)}
              </nav>
              <div className="min-w-0 space-y-10">
                <section id="fs-setup" className="scroll-mt-4 space-y-4">{x.content}</section>
                <section id="fs-team" className="scroll-mt-4 space-y-4 border-t pt-6"><h2 className="font-heading text-xl font-semibold">Team</h2><TeamTab fundId={fundId} /></section>
                <section id="fs-banking" className="scroll-mt-4 space-y-5 border-t pt-6"><h2 className="font-heading text-xl font-semibold">Banking</h2>{bankingBody}</section>
              </div>
            </div>
          </TabsContent>
        ) : <TabsContent key={x.value} value={x.value}>{x.content}</TabsContent>)}
        <TabsContent value="distributions"><FundDistributions fundId={fundId} mode={mode} /></TabsContent>
        <TabsContent value="todos" className="space-y-4">
          {staff && <HarmoniousTodos steps={steps as any} onSetup={() => onTab("setup")} />}
          <TodosTab fundId={fundId} steps={steps.filter((s) => s.owner === "You" && !s.done) as any} />
        </TabsContent>
        {!merged && <TabsContent value="team"><TeamTab fundId={fundId} /></TabsContent>}
        <TabsContent value="overview"><FundCommandCenter fundId={fundId} onNavigate={(t) => onTab(t === "capital" ? "distributions" : t)} /></TabsContent>
        <TabsContent value="calendar"><FundCalendar fundId={fundId} /></TabsContent>
        <TabsContent value="approvals">{tab === "approvals" && <div className="space-y-6">{!staff && <ManagerFundReviews fundId={fundId} />}<FundApprovals fundId={fundId} /></div>}</TabsContent>
        <TabsContent value="requests"><FundRequests fundId={fundId} /></TabsContent>
        <TabsContent value="services"><FundServicesTab fundId={fundId} /></TabsContent>
        <TabsContent value="documents"><DocumentsTab fundId={fundId} /></TabsContent>
        <TabsContent value="audit"><AuditHistoryTab fundId={fundId} /></TabsContent>
        <TabsContent value="regulatory"><RegulatoryTab fundId={fundId} /></TabsContent>

        {!merged && <TabsContent value="details" className="space-y-5">{detailsBody}</TabsContent>}
        {!merged && <TabsContent value="banking" className="space-y-5">{bankingBody}</TabsContent>}

        <TabsContent value="investors" className="space-y-4">{staff && migrationApplies(f.fund_origin) && <FundMigrationStatus fundId={fundId} />}{staff && migrationApplies(f.fund_origin) && <MigrationPaymentsCard fundId={fundId} />}<InvestorsTab fundId={fundId} workQueue={staff ? <ReadinessQueue offeringId={fundId} initialTab="all" /> : undefined} /><CapitalTieReport offeringId={fundId} /><FundUpdatesPanel fundId={fundId} /></TabsContent>


        <TabsContent value="accounting" className="space-y-5"><FundBooks fundId={fundId} />
{staff && <Card><CardHeader><CardTitle className="text-base">Harmonious: fees, invoices and payments received</CardTitle><CardDescription>Bill fees, issue invoices and record wire/ACH receipts for this fund. Nothing is charged or moved automatically.</CardDescription></CardHeader><CardContent><FundPayments fundId={fundId} backTo="admin" /></CardContent></Card>}
<AccountTab fundId={fundId} fundName={String(f.name ?? "Fund")} taxDocs={td?.taxDocs ?? []} /></TabsContent>

        <TabsContent value="assets" className="space-y-5">
          {!!td?.assets.length && (
            <div className="grid gap-5 lg:grid-cols-2">
              <Card><CardHeader><CardTitle className="text-base">Cost vs latest value</CardTitle></CardHeader><CardContent>
                <CentsBarChart xKey="name" series={[{ key: "cost", label: "Cost" }, { key: "value", label: "Latest value" }]}
                  data={td.assets.map((a: any) => ({ name: String(a.asset_name).slice(0, 18), cost: Number(a.cost_basis_cents ?? 0), value: Number(a.latestValueCents ?? a.cost_basis_cents ?? 0) }))} />
              </CardContent></Card>
              <Card><CardHeader><CardTitle className="text-base">Allocation by asset type</CardTitle></CardHeader><CardContent>
                <CentsDonut data={Object.entries(td.assets.reduce((m: Record<string, number>, a: any) => { const k = nice(a.asset_class) || "Other"; m[k] = (m[k] ?? 0) + Number(a.latestValueCents ?? a.cost_basis_cents ?? 0); return m; }, {})).map(([name, value]) => ({ name, value: value as number }))} />
              </CardContent></Card>
            </div>
          )}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><CardTitle className="text-base">Assets</CardTitle>
                <CardDescription>For your information. Values show the latest approved valuation.</CardDescription></div>
                {!staff && <RequestHarmoniousButton fundId={fundId} fundName={String(f.name ?? "Fund")} item="an additional asset" serviceKeys={["additional_asset"]} />}
              </div>
            </CardHeader>
            <CardContent>
              {tq.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> :
               !td?.assets.length ? <Empty text="No portfolio assets recorded yet." /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-2">Asset</th><th>Type</th><th>Acquired</th><th className="text-right">Cost</th><th className="text-right">Latest value</th><th>Status</th></tr></thead>
                    <tbody>
                      {td.assets.map((a: any) => (
                        <tr key={a.id} className="border-t">
                          <td className="py-2"><p className="font-medium">{a.asset_name}</p>{a.issuer_name && <p className="text-xs text-muted-foreground">{a.issuer_name}</p>}</td>
                          <td className="capitalize">{[a.asset_class, a.instrument].filter(Boolean).join(" · ").replace(/_/g, " ") || "-"}</td>
                          <td>{fmtDate(a.acquisition_date)}</td>
                          <td className="text-right">{usd(a.cost_basis_cents == null ? null : Number(a.cost_basis_cents))}</td>
                          <td className="text-right">{a.latestValueCents == null ? "-" : usd(Number(a.latestValueCents))}</td>
                          <td className="capitalize">{a.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
          <AssetManager fundId={fundId} assets={td?.assets ?? []} />
        </TabsContent>

        <TabsContent value="closes" className="space-y-4">
          {staff && <StaffCloses fundId={fundId} />}
          {!staff && <Card>
            <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
              <div>
                <CardTitle className="text-base">Closes</CardTitle>
                <CardDescription>Close requests are reviewed by Harmonious before anything happens.</CardDescription>
              </div>
              <Button size="sm" onClick={() => setCloseOpen(true)}>Request Fund Close</Button>
            </CardHeader>
            <CardContent>
              {crq.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> :
               !crq.data?.length ? <Empty text="No close requests yet." /> : (
                <div className="divide-y rounded-md border">
                  {crq.data.map((c: any) => (
                    <div key={c.id} className="space-y-1 p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">Requested {fmtDate(c.created_at)} · {c.onboarding_ids.length} investor{c.onboarding_ids.length === 1 ? "" : "s"}</p>
                        <Badge variant={c.status === "completed" ? "default" : c.status === "returned" ? "destructive" : "secondary"}>{CLOSE_STATUS[c.status] ?? c.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">Target close date: {c.target_date ? fmtDate(c.target_date) : "Not set"}</p>
                      {c.notes && <p className="text-xs">{c.notes}</p>}
                      {c.staff_note && <p className="text-xs text-muted-foreground">Harmonious: {c.staff_note}</p>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>}
        </TabsContent>
      </Tabs>

      <RequestCloseDialog fundId={fundId} open={closeOpen} onOpenChange={setCloseOpen} onDone={() => onTab("closes")} />
    </div>
  );
}

function HarmoniousTodos({ steps, onSetup }: { steps: { label: string; owner: string; done: boolean; status: string; answer?: string }[]; onSetup: () => void }) {
  const mine = steps.filter((s) => s.owner === "Harmonious" && !s.done);
  const toReview = steps.filter((s) => !s.done && (s.status === "review" || s.answer?.trim()));
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div><CardTitle className="text-base">Harmonious to dos</CardTitle>
        <CardDescription>{mine.length} waiting on Harmonious · {toReview.length} answered by the manager and waiting for review.</CardDescription></div>
        <Button size="sm" onClick={onSetup}>Process in Setup</Button>
      </CardHeader>
      <CardContent className="space-y-1.5 text-sm">
        {!mine.length && !toReview.length ? <Empty text="Nothing is waiting on Harmonious." /> : [...toReview, ...mine.filter((m) => !toReview.includes(m))].map((s, i) => (
          <div key={i} className="flex items-center gap-3"><Clock className="size-4 text-muted-foreground" /><span>{s.label}</span>
            <Badge variant="outline" className="ml-auto">{toReview.includes(s) ? "Review answer" : "Harmonious to complete"}</Badge></div>
        ))}
      </CardContent>
    </Card>
  );
}

function StaffCloses({ fundId }: { fundId: string }) {
  const load = useServerFn(listAllCloseRequests);
  const q = useQuery({ queryKey: ["ops-close-requests"], queryFn: () => load() });
  const rows = ((q.data ?? []) as any[]).filter((r) => r.offering_id === fundId);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Approve a close, generate its Form D and state filing packets, then file them yourself and record the confirmation. Nothing is submitted automatically.</p>
      {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : q.error ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> :
       !rows.length ? <Empty text="No close requests for this fund yet." /> : rows.map((r) => <CloseRequestReview key={r.id} r={r} />)}
    </div>
  );
}
