import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { AlertCircle, Check, ChevronDown, Circle, Inbox, Search } from "lucide-react";
import { fundReadinessFn, investmentReadinessFn, readinessQueueFn } from "@/lib/investor-onboarding.functions";
import { viewAsFundFn, viewAsInvestmentFn } from "@/lib/view-as.functions";
import { getFundWireInstructions } from "@/lib/wire-instructions.functions";
import { getStaffFundSetup } from "@/lib/staff-funds.functions";
import { fundSetupSummary } from "@/lib/fund-launch-summary";
import { ViewAsPicker } from "@/components/view-as";
import { OWNER_LABELS, type ReadinessStatus } from "@/lib/investment-readiness";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ACTIVE, blockersOf, bucketOf, closeHeadline, isAging, plainStatus, toggleStage, waitingLabel, type Bucket, type Viewer } from "@/lib/readiness-presentation";

const money = (c: number | null | undefined) => (c ? `$${(c / 100).toLocaleString("en-US")}` : "-");
const ownerText = (o: string | null | undefined) => (o ? OWNER_LABELS[o as keyof typeof OWNER_LABELS] : "-");

function tone(s: ReadinessStatus) {
  if (s === "complete") return "text-muted-foreground";
  if (s === "blocked") return "text-destructive";
  if (ACTIVE.has(s)) return "text-primary";
  return "text-muted-foreground";
}

function ago(iso: string | null | undefined) {
  if (!iso) return "-";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "Not scheduled";
  const dt = new Date(d.length === 10 ? `${d}T12:00:00` : d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function Kv({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("truncate", strong ? "font-heading text-base font-semibold" : "text-sm")}>{value}</p>
    </div>
  );
}

/** Header: close readiness first, then Next Action, Owner, Progress and Target Close. */
function ReadinessHeader({ r, title, subtitle, action }: { r: any; title: string; subtitle: string; action?: React.ReactNode }) {
  const n = blockersOf(r).length;
  const ready = r.closeReady || r.terminal === "closed";
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-heading text-xl font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {action}
      </div>
      <div>
        <p className={cn("font-heading text-2xl font-semibold sm:text-3xl", ready ? "text-accent-foreground" : "text-foreground")}>
          <span className={cn("mr-2 inline-block h-3 w-3 rounded-full align-middle", ready ? "bg-accent" : n ? "bg-destructive/80" : "bg-muted-foreground/40")} />
          {closeHeadline(r)}
        </p>
        {!r.terminal ? <p className="text-sm text-muted-foreground">{n ? `${n} item${n === 1 ? "" : "s"} still need${n === 1 ? "s" : ""} attention` : ready ? "All required items are complete" : "No action needed right now"}</p> : null}
      </div>
      <div className="grid grid-cols-2 gap-4 border-t pt-4 sm:grid-cols-4">
        <Kv label="Next Action" value={r.nextAction?.label ?? (ready ? "Ready to close" : "Nothing outstanding")} strong />
        <Kv label="Owner" value={ownerText(r.nextAction?.owner)} strong />
        <Kv label="Progress" value={`${r.percentComplete}% · ${r.completeCount} of ${r.requiredCount}`} />
        <Kv label="Target Close" value={fmtDate(r.requestedCloseDate)} />
      </div>
    </div>
  );
}

export function AttentionNeeded({ r, viewer }: { r: any; viewer: Viewer }) {
  const list = blockersOf(r);
  if (!list.length || r.terminal) return null;
  return (
    <section className="space-y-2" data-testid="attention-needed">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><AlertCircle className="h-4 w-4 text-destructive" />Attention Needed</h3>
      <ul className="divide-y rounded-lg border-l-4 border-l-destructive/70 bg-muted/40">
        {list.map((i: any) => (
          <li key={i.key} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{i.owner ? `${ownerText(i.owner)} action` : "Action"}</p>
              <p className="text-sm font-medium">{i.action ?? i.label}</p>
            </div>
            <span className={cn("text-xs font-medium", tone(i.status))}>{plainStatus(i.status, viewer)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StageIcon({ s, current }: { s: ReadinessStatus; current: boolean }) {
  if (s === "complete") return <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/30"><Check className="h-3.5 w-3.5" /></span>;
  if (s === "blocked") return <span className="flex h-6 w-6 items-center justify-center rounded-full bg-destructive/15"><AlertCircle className="h-3.5 w-3.5 text-destructive" /></span>;
  if (ACTIVE.has(s) || current) return <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground"><Circle className="h-2.5 w-2.5 fill-current" /></span>;
  return <span className="flex h-6 w-6 items-center justify-center rounded-full border"><Circle className="h-2 w-2 text-muted-foreground" /></span>;
}

/** Eight stages as a compact vertical journey; detail on demand. */
export function StageJourney({ r, viewer, defaultOpen = null }: { r: any; viewer: Viewer; defaultOpen?: string | null }) {
  const [open, setOpen] = useState<string | null>(defaultOpen);
  return (
    <section className="space-y-1">
      <h3 className="text-sm font-semibold">Journey</h3>
      <ol className="relative">
        {r.stages.map((s: any, idx: number) => {
          const items = r.items.filter((i: any) => i.stage === s.stage && i.status !== "not_applicable");
          const pending = items.filter((i: any) => ACTIVE.has(i.status)).length;
          const current = r.currentStage === s.stage;
          const isOpen = open === s.stage;
          const label = s.safeLabel ?? plainStatus(s.status, viewer);
          return (
            <li key={s.stage} data-stage={s.stage} data-status={s.status} data-open={isOpen ? "true" : "false"} className="relative pl-9">
              {idx < r.stages.length - 1 ? <span className="absolute left-3 top-8 h-[calc(100%-1.5rem)] w-px bg-border" /> : null}
              <span className="absolute left-0 top-2.5"><StageIcon s={s.status} current={current} /></span>
              <button type="button" onClick={() => setOpen(toggleStage(open, s.stage))} aria-expanded={isOpen} className="flex w-full items-center justify-between gap-2 rounded-md py-2.5 text-left hover:bg-muted/40">
                <span className={cn("text-sm", s.status === "complete" ? "text-muted-foreground" : "font-medium", current && "font-semibold")}>
                  {s.title}{current ? <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">Current</span> : null}
                </span>
                <span className="flex items-center gap-2">
                  <span className={cn("text-xs", tone(s.status))}>{label}{pending ? ` · ${pending} item${pending === 1 ? "" : "s"}` : ""}</span>
                  <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                </span>
              </button>
              {isOpen ? (
                <ul className="mb-2 space-y-1.5 border-l-2 border-muted pl-3">
                  {items.length ? items.map((i: any) => (
                    <li key={i.key} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="min-w-0">{i.label}{viewer !== "manager" && i.reason ? <span className="block text-xs text-muted-foreground">{i.reason}</span> : null}</span>
                      <span className="flex items-center gap-2 text-xs">
                        {i.owner && i.status !== "complete" ? <span className="text-muted-foreground">{ownerText(i.owner)}</span> : null}
                        <span className={tone(i.status)}>{plainStatus(i.status, viewer)}</span>
                      </span>
                    </li>
                  )) : <li className="text-xs text-muted-foreground">Nothing required at this stage.</li>}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Staff-only operational detail. Never rendered for investor or fund manager viewers. */
function AuditDetails({ r }: { r: any }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="border-t pt-3">
      <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />Audit & Details
      </button>
      {open ? (
        <div className="mt-2 space-y-2 text-xs text-muted-foreground">
          <p>Rule version {r.ruleVersion}. Not-applicable items are excluded from progress. A nearly complete investment stays Not Ready to Close while any blocking item remains.</p>
          {r.closeBlockers?.length ? <p>Close blockers: {r.closeBlockers.join(", ")}</p> : null}
          <table className="w-full">
            <thead><tr className="text-left"><th className="py-1 font-medium">Item</th><th className="font-medium">Source</th><th className="font-medium">Status</th></tr></thead>
            <tbody>
              {r.items.map((i: any) => (
                <tr key={i.key} className="border-t align-top"><td className="py-1 pr-2">{i.label}{i.reason ? ` - ${i.reason}` : ""}</td><td className="pr-2">{i.source ?? "-"}</td><td>{i.status}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

export function ReadinessSurface({ r, viewer, title, subtitle, action }: { r: any; viewer: Viewer; title: string; subtitle: string; action?: React.ReactNode }) {
  return (
    <div className="space-y-6 rounded-xl border bg-card p-5 sm:p-6">
      <ReadinessHeader r={r} title={title} subtitle={subtitle} action={action} />
      <AttentionNeeded r={r} viewer={viewer} />
      <StageJourney r={r} viewer={viewer} />
      {viewer === "staff" ? <AuditDetails r={r} /> : null}
    </div>
  );
}

function Empty({ title, body, icon }: { title: string; body: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
      {icon ?? <Inbox className="h-6 w-6 text-muted-foreground" />}
      <p className="font-heading font-semibold">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

/** Investor / manager / staff view of one Investment's canonical checklist. */
export function InvestmentChecklist({ onboardingId, viewAs = false }: { onboardingId: string; viewAs?: boolean }) {
  const load = useServerFn(investmentReadinessFn);
  const loadAs = useServerFn(viewAsInvestmentFn);
  // In View As the server resolves the investment from the live perspective; no ID is sent.
  const q = useQuery({ queryKey: viewAs ? ["view-as", "investment"] : ["investment-readiness", onboardingId], queryFn: () => (viewAs ? loadAs() : load({ data: { onboardingId } })), retry: false });
  if (q.isPending) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (q.isError || !q.data) return null;
  const d = q.data as any;
  const r = d.readiness;
  const subtitle = [d.fundName, d.amountCents ? `${money(d.amountCents)} investment` : null].filter(Boolean).join(" · ");
  return (
    <ReadinessSurface
      r={r}
      viewer={d.viewer}
      title={d.profileLabel ?? "Investment Readiness"}
      subtitle={subtitle}
      action={!viewAs && d.viewer === "staff" ? <ViewAsPicker onboardingId={onboardingId} label="View client perspective" /> : undefined}
    />
  );
}

const BUCKET_LABEL: Record<Bucket, string> = { all: "All", ready: "Ready", needs_investor: "Needs Investor", needs_fund_manager: "Needs Fund Manager", needs_harmonious: "Needs Harmonious", blocked: "Blocked" };

function FilterChips<T extends string>({ value, options, labels, counts, onChange }: { value: T; options: T[]; labels: Record<T, string>; counts?: Partial<Record<T, number>>; onChange: (v: T) => void }) {
  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {options.map((o) => (
        <button key={o} type="button" onClick={() => onChange(o)} className={cn("whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors", value === o ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
          {labels[o]}{counts?.[o] != null ? <span className="ml-1 opacity-70">{counts[o]}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** Fund → Readiness: operations dashboard over the same engine. */
const WIRE_LABELS: [string, string][] = [
  ["bank_name", "Receiving bank"],
  ["account_name", "Account name"],
  ["routing_number", "Routing number"],
  ["account_number", "Account number"],
  ["swift", "SWIFT"],
  ["bank_address", "Bank address"],
  ["memo", "Memo / reference"],
];

/** Fund launch status + setup %, from the same Fund Setup data (query key shared, so it refreshes together). */
function FundLaunchCard({ fundId, readyCount, total }: { fundId: string; readyCount: number; total: number }) {
  const get = useServerFn(getStaffFundSetup);
  const q = useQuery({ queryKey: ["staff-fund-setup", fundId], queryFn: () => get({ data: { offeringId: fundId } }), retry: false });
  const d = q.data as any;
  if (!d || !d.hasSetup || !d.canSeeOperations) return null;
  const s = fundSetupSummary(d);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Fund launch</p>
        <p className="font-heading text-lg font-semibold capitalize">{s.launchLabel}</p>
        <p className="text-sm text-muted-foreground">Setup {s.percent}% complete · {s.openTasks} setup tasks and {s.openConditions} launch conditions open · {readyCount} of {total} investors ready</p>
      </div>
      <Link className="text-sm underline" to="/ops/fund-setup/$fundId" params={{ fundId }} search={{ tab: "setup" }}>Open Fund Setup</Link>
    </div>
  );
}

function WireInstructionsCard({ fundId }: { fundId: string }) {
  const load = useServerFn(getFundWireInstructions);
  const q = useQuery({ queryKey: ["fund-wire-instructions", fundId], queryFn: () => load({ data: { offering_id: fundId } }), retry: false });
  if (q.isPending) return <Skeleton className="h-24 w-full rounded-xl" />;
  if (q.isError) return null;
  const d = q.data as any;
  const rows = WIRE_LABELS.filter(([k]) => String(d.details?.[k] ?? "").trim() !== "");
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-heading text-sm font-semibold">Bank &amp; wire instructions</h3>
          <p className="text-xs text-muted-foreground">
            {d.hasAny ? `Where investors send funds. Updated ${ago(d.updated_at)}.` : "No wire instructions saved yet."}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/manager/fund-banking/$fundId" params={{ fundId }}>{d.hasAny ? "View in Banking" : "Add in Banking"}</Link>
        </Button>
      </div>
      {d.hasAny ? (
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(([k, label]) => (
            <div key={k}>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
              <dd className="text-sm font-medium">{String(d.details[k])}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

export function FundReadiness({ fundId, viewAs = false }: { fundId: string; viewAs?: boolean }) {
  const load = useServerFn(fundReadinessFn);
  const loadAs = useServerFn(viewAsFundFn);
  const q = useQuery({ queryKey: viewAs ? ["view-as", "fund"] : ["fund-readiness", fundId], queryFn: () => (viewAs ? loadAs() : load({ data: { offeringId: fundId } })), retry: false });
  const [open, setOpen] = useState<string | null>(null);
  const [bucket, setBucket] = useState<Bucket>("all");
  const [term, setTerm] = useState("");
  const rows = ((q.data as any)?.rows ?? []) as any[];
  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { all: rows.length, ready: 0, needs_investor: 0, needs_fund_manager: 0, needs_harmonious: 0, blocked: 0 };
    for (const r of rows) { const b = bucketOf(r); if (b !== "all") c[b]++; }
    return c;
  }, [rows]);
  if (q.isPending) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (q.isError) return <p className="text-sm text-muted-foreground">Investor readiness is available to Harmonious staff and managers of this fund.</p>;
  const d = q.data as any;
  const shown = rows.filter((r) => (bucket === "all" || bucketOf(r) === bucket) && (!term || String(r.investorName).toLowerCase().includes(term.toLowerCase())));
  const sel = rows.find((r) => r.onboardingId === open);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-semibold">Investor Readiness</h2>
          <p className="text-sm text-muted-foreground">Who is ready, who is not, and why.</p>
        </div>
        {!viewAs && d.viewer === "staff" ? <ViewAsPicker offeringId={fundId} label="View client perspective" /> : null}
      </div>
      <WireInstructionsCard fundId={fundId} />
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-5">
        {(["all", "ready", "needs_investor", "needs_harmonious", "blocked"] as Bucket[]).map((b) => (
          <div key={b} className="bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{b === "all" ? "Total Investors" : b === "ready" ? "Ready to Close" : BUCKET_LABEL[b]}</p>
            <p className={cn("font-heading text-2xl font-semibold", b === "blocked" && counts.blocked ? "text-destructive" : "")}>{counts[b]}</p>
          </div>
        ))}
      </div>
      {!rows.length ? (
        <Empty title="No investments to review yet" body="Investments will appear here as investors begin onboarding for this fund." />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <FilterChips value={bucket} options={Object.keys(BUCKET_LABEL) as Bucket[]} labels={BUCKET_LABEL} counts={counts} onChange={setBucket} />
            <div className="relative sm:w-56"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search investor" className="h-9 pl-8" /></div>
          </div>
          <div className="overflow-hidden rounded-xl border">
            <div className="hidden grid-cols-[1.4fr_0.8fr_0.9fr_1.6fr_0.8fr_0.6fr] gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground md:grid">
              <span>Investor</span><span>Investment</span><span>Readiness</span><span>Next Action</span><span>Owner</span><span>Updated</span>
            </div>
            {!shown.length ? <p className="px-4 py-6 text-sm text-muted-foreground">No investors match this filter.</p> : shown.map((r) => (
              <button key={r.onboardingId} type="button" onClick={() => setOpen(r.onboardingId === open ? null : r.onboardingId)}
                className={cn("grid w-full grid-cols-2 gap-x-3 gap-y-1 border-b px-4 py-3 text-left text-sm last:border-b-0 hover:bg-muted/40 md:grid-cols-[1.4fr_0.8fr_0.9fr_1.6fr_0.8fr_0.6fr] md:items-center", open === r.onboardingId && "bg-muted/60")}>
                <span className="font-medium">{r.investorName}<span className="block text-xs font-normal text-muted-foreground">{r.profileLabel ?? r.profileType ?? ""}</span></span>
                <span className="text-right md:text-left">{money(r.amountCents)}</span>
                <span className={cn("text-xs font-semibold", r.closeReady ? "text-accent-foreground" : bucketOf(r) === "blocked" ? "text-destructive" : "")}>{r.closeReady ? "Ready" : bucketOf(r) === "blocked" ? "Blocked" : "Not Ready"}<span className="ml-1 font-normal text-muted-foreground">{r.percentComplete}%</span></span>
                <span className="col-span-2 md:col-span-1">{r.nextAction?.label ?? "Nothing outstanding"}</span>
                <span className="text-xs text-muted-foreground md:text-sm md:text-foreground">{ownerText(r.nextAction?.owner)}</span>
                <span className="text-right text-xs text-muted-foreground md:text-left">{ago(r.updatedAt)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {sel ? (
        <ReadinessSurface r={sel.readiness} viewer={d.viewer} title={sel.investorName} subtitle={[money(sel.amountCents), sel.profileLabel].filter(Boolean).join(" · ")}
          action={!viewAs && d.viewer === "staff" ? <ViewAsPicker onboardingId={sel.onboardingId} label="View client perspective" /> : undefined} />
      ) : null}
    </div>
  );
}

type QTab = "harmonious" | "investor" | "fund_manager" | "all";
const QTAB_LABEL: Record<QTab, string> = { harmonious: "Needs Harmonious", investor: "Waiting on Investor", fund_manager: "Waiting on Fund Manager", all: "All" };

function TriageDrawer({ item, onClose }: { item: any | null; onClose: () => void }) {
  return (
    <Sheet open={!!item} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        {item ? (
          <>
            <SheetHeader className="mb-4">
              <SheetTitle className="font-heading">{item.investorName}</SheetTitle>
              <SheetDescription>{item.fundName} · {waitingLabel(item.ageDays)}</SheetDescription>
            </SheetHeader>
            <div className="space-y-4">
              {item.onboardingId ? <InvestmentChecklist onboardingId={item.onboardingId} /> : null}
              <div className="flex flex-wrap gap-3">
                {item.offeringId ? <Button asChild size="sm"><Link to="/manager/fund/$fundId/readiness" params={{ fundId: item.offeringId }}>Open Investment</Link></Button> : null}
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

/** Waiting time only; emphasis at 3+ days is not an SLA and never says "overdue". */
export function QueueAge({ days }: { days: number }) {
  return (
    <span data-aging={isAging(days) ? "true" : "false"} className={cn("text-xs sm:text-sm", isAging(days) ? "font-semibold text-destructive" : "text-muted-foreground")}>
      {waitingLabel(days)}{isAging(days) ? <span className="ml-1 rounded bg-destructive/10 px-1 text-[10px] uppercase">Aging</span> : null}
    </span>
  );
}

/** Operations → readiness queue: an inbox of open work items, oldest first. */
export function ReadinessQueue({ initialTab }: { initialTab?: QTab | undefined } = {}) {
  const load = useServerFn(readinessQueueFn);
  const q = useQuery({ queryKey: ["readiness-queue"], queryFn: () => load(), retry: false });
  const [tab, setTab] = useState<QTab>(initialTab ?? "harmonious");
  const [sel, setSel] = useState<any | null>(null);
  if (q.isPending) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (q.isError) return <p className="text-sm text-muted-foreground">Harmonious operations access is required.</p>;
  const all = (q.data ?? []) as any[];
  const counts = { harmonious: 0, investor: 0, fund_manager: 0, all: all.length } as Record<QTab, number>;
  for (const r of all) if (r.owner in counts) counts[r.owner as QTab]++;
  const rows = all.filter((r) => tab === "all" || r.owner === tab);
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-xl font-semibold">Investment readiness</h2>
        <p className="text-sm text-muted-foreground">What needs Harmonious attention now.</p>
      </div>
      <FilterChips value={tab} options={Object.keys(QTAB_LABEL) as QTab[]} labels={QTAB_LABEL} counts={counts} onChange={setTab} />
      {!rows.length ? (
        <Empty title="You're caught up" body="There are no investment readiness items requiring attention." icon={<Check className="h-6 w-6 text-accent-foreground" />} />
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
              <button type="button" onClick={() => setSel(r)} className="grid min-w-0 flex-1 grid-cols-2 gap-x-4 gap-y-0.5 text-left sm:grid-cols-[1.2fr_1fr_1.6fr_0.5fr]">
                <span className="font-medium">{r.investorName}</span>
                <span className="text-right text-sm text-muted-foreground sm:text-left">{r.fundName}</span>
                <span className="col-span-2 text-sm sm:col-span-1">{r.title}<span className="ml-2 text-xs text-muted-foreground">{ownerText(r.owner)}</span></span>
                <QueueAge days={r.ageDays} />
              </button>
              <div className="flex items-center gap-3">
                <Button size="sm" variant="outline" onClick={() => setSel(r)}>Open</Button>
                {r.onboardingId ? <ViewAsPicker onboardingId={r.onboardingId} label="View as…" /> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <TriageDrawer item={sel} onClose={() => setSel(null)} />
    </div>
  );
}
