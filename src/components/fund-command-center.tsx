import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCommandCenter } from "@/lib/fund-command-center.functions";
import { ResponsibilityBadge } from "@/components/responsibility-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RESPONSIBILITY_LABEL, RESPONSIBILITY_CLIENT_EXPLANATION, asResponsibility, type ResponsibilityStatus } from "@/lib/responsibility";
import { HEALTH_LABEL, CATEGORY_HEALTH_LABEL, type Health, type CategoryHealth } from "@/lib/fund-command-health";
import { serviceLevelLabel, fmtDate, titleCase } from "@/lib/service-engagement-labels";
import { CALENDAR_CATEGORIES } from "@/lib/fund-calendar-templates";

export type CommandTarget = "calendar" | "investors" | "capital" | "approvals" | "requests";

const HEALTH_TONE: Record<Health | CategoryHealth, string> = {
  HEALTHY: "border-primary/30 bg-primary/5 text-primary", IN_PROGRESS: "border-primary/30 bg-primary/5 text-primary",
  ATTENTION_NEEDED: "border-accent bg-accent/20 text-foreground", ACTION_REQUIRED: "border-destructive/40 bg-destructive/10 text-destructive",
  WAITING: "border-border bg-muted text-muted-foreground", NO_DATA: "border-border bg-muted text-muted-foreground",
};
const Pill = ({ tone, children }: { tone: string; children: React.ReactNode }) => <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide", tone)}>{children}</span>;
const usd = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;
const dueText = (d: string | null | undefined, today: string) => !d ? "No due date" : d === today ? "Due today" : d < today ? `Overdue since ${fmtDate(d)}` : `Due ${fmtDate(d)}`;

function Card({ title, children, className, action }: { title: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <section className={cn("min-w-0 rounded-xl border bg-card p-4", className)}>
      <div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>{action}</div>
      {children}
    </section>
  );
}
const Empty = ({ title, body }: { title: string; body: string }) => <div className="text-sm"><p className="font-medium text-foreground">{title}</p><p className="text-muted-foreground">{body}</p></div>;

export function FundCommandCenter({ fundId, onNavigate }: { fundId: string; onNavigate?: (t: CommandTarget) => void }) {
  const load = useServerFn(getCommandCenter);
  const q = useQuery({ queryKey: ["fund-command-center", fundId], queryFn: () => load({ data: { fundId } }) });
  const [filter, setFilter] = useState<ResponsibilityStatus | null>(null);
  const [healthOpen, setHealthOpen] = useState(false);
  const [showAllHandling, setShowAllHandling] = useState(false);
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading Command Center…</p>;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const d = q.data!;
  const lvl = d.engagement ? serviceLevelLabel(d.engagement.level, d.engagement.product) : null;
  const admin = d.team.find((t) => t.role === "Primary Administrator")?.name;
  const lead = d.team.find((t) => t.role === "Relationship Lead")?.name;
  const nextDeadline = d.deadlines.find((x) => x.due >= d.today);
  const overdue = d.deadlines.filter((x) => x.due < d.today);
  const soon = (days: number) => new Date(Date.parse(d.today) + days * 864e5).toISOString().slice(0, 10);
  const groups = [
    ["Next 7 days", d.deadlines.filter((x) => x.due >= d.today && x.due <= soon(7))],
    ["Next 30 days", d.deadlines.filter((x) => x.due > soon(7) && x.due <= soon(30))],
    ["Later", d.deadlines.filter((x) => x.due > soon(30)).slice(0, 6)],
  ] as const;
  const filtered = filter ? d.tasks.filter((t) => t.status !== "done" && t.status !== "cancelled" && asResponsibility(t.responsibility_status) === filter) : [];
  const handling = showAllHandling ? d.handling : d.handling.slice(0, 6);
  const isCore = d.engagement?.level === "CORE";

  return (
    <div className="space-y-4">
      {/* Header */}
      <section className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-xl">{d.fund.name}</h2>
            {lvl ? <p className="text-sm"><span className="font-semibold uppercase tracking-wide text-primary">{lvl.name}</span> <span className="text-muted-foreground">· {lvl.positioning}</span></p>
              : <p className="text-sm text-muted-foreground">Administration level not set yet</p>}
          </div>
          <div className="flex items-start gap-3">
          {onNavigate && <Button size="sm" onClick={() => onNavigate("requests")}>Request Service</Button>}
          <button type="button" onClick={() => setHealthOpen(!healthOpen)} aria-expanded={healthOpen} className="text-left">
            <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">Fund health</span>
            <Pill tone={HEALTH_TONE[d.health.overall]}>{HEALTH_LABEL[d.health.overall]}</Pill>
          </button>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-7">
          <div><dt className="text-xs text-muted-foreground">Primary Administrator</dt><dd>{admin ?? (isCore ? "Harmonious Support Team" : "To be assigned")}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Relationship Lead</dt><dd>{lead ?? (isCore ? "Harmonious Support Team" : "To be assigned")}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Next report</dt><dd>{d.nextReport ? `${d.nextReport.title} · ${fmtDate(d.nextReport.due)}` : "None scheduled"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Next major deadline</dt><dd>{nextDeadline ? `${nextDeadline.title} · ${fmtDate(nextDeadline.due)}` : "None scheduled"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Open items</dt><dd>{d.openCount}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Approvals / Information</dt><dd>{Math.max(d.counts.CLIENT_APPROVAL_REQUIRED, d.approvalsAwaiting.length)} / {d.counts.CLIENT_INFORMATION_REQUIRED}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Open requests</dt><dd>{onNavigate ? <button className="underline" onClick={() => onNavigate("requests")}>{d.requests.open}</button> : d.requests.open}</dd></div>
        </dl>
        {d.internal && <p className="mt-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">Staff only: {d.internal.internalOnly} internal-only open tasks · {d.internal.slaRisk} at SLA risk (due within 2 days)</p>}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* 1. Your attention */}
        <Card title="Your attention" className="lg:col-span-2">
          {d.approvalsAwaiting.length || d.attention.length ? (
            <ul className="divide-y">
              {d.approvalsAwaiting.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{a.title}</span><ResponsibilityBadge status="CLIENT_APPROVAL_REQUIRED" /></div>
                    <p className={cn("text-xs", a.due_date && a.due_date < d.today ? "text-destructive" : "text-muted-foreground")}>{a.amount != null ? `${Number(a.amount).toLocaleString("en-US", { style: "currency", currency: a.currency || "USD", maximumFractionDigits: 0 })} · ` : ""}{dueText(a.due_date, d.today)}</p>
                  </div>
                  {onNavigate && <Button size="sm" onClick={() => onNavigate("approvals")}>Review</Button>}
                </li>
              ))}
              {d.attention.filter((t) => !d.approvalsAwaiting.some((a) => a.task_id === t.id)).map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{t.title}</span><ResponsibilityBadge status={t.responsibility_status} /></div>
                    <p className={cn("text-xs", t.overdueDays ? "text-destructive" : "text-muted-foreground")}>
                      {t.approval_amount != null ? `$${Number(t.approval_amount).toLocaleString("en-US")} · ` : ""}{dueText(t.due_date, d.today)}
                    </p>
                    <p className="text-xs text-muted-foreground">{t.note || RESPONSIBILITY_CLIENT_EXPLANATION[asResponsibility(t.responsibility_status)]}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : <Empty title="No action required" body="Your Harmonious team is handling all current administration items." />}
          {d.requests.attention > 0 && onNavigate && <Button size="sm" variant="outline" className="mt-2" onClick={() => onNavigate("requests")}>{d.requests.attention} request(s) need your attention</Button>}
        </Card>

        {/* 2. Fund health */}
        <Card title="Fund health" action={d.health.categories.length ? <Button size="sm" variant="ghost" onClick={() => setHealthOpen(!healthOpen)}>{healthOpen ? "Hide detail" : "Detail"}</Button> : undefined}>
          <Pill tone={HEALTH_TONE[d.health.overall]}>{HEALTH_LABEL[d.health.overall]}</Pill>
          <p className="mt-2 text-xs text-muted-foreground">
            {d.health.overall === "NO_DATA" ? "Nothing is being tracked for this fund yet, so health isn't shown as Healthy."
              : d.health.overall === "HEALTHY" ? "No material overdue items." : d.health.overall === "ATTENTION_NEEDED" ? "At least one item is overdue or unresolved." : "A client action is materially overdue or a high-priority deadline was missed."}
          </p>
          {healthOpen && (
            <ul className="mt-3 space-y-1 text-sm">
              {d.health.categories.map((c) => <li key={c.key} className="flex items-center justify-between gap-2"><span>{(CALENDAR_CATEGORIES as any)[c.key] ?? c.label}</span><Pill tone={HEALTH_TONE[c.health]}>{CATEGORY_HEALTH_LABEL[c.health]}</Pill></li>)}
              <li className="pt-1 text-xs text-muted-foreground">Only areas with tracked data are shown.</li>
            </ul>
          )}
        </Card>
      </div>

      {/* 3. Responsibility counts */}
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" aria-label="Responsibility summary">
        {(["HARMONIOUS_HANDLING", "CLIENT_APPROVAL_REQUIRED", "CLIENT_INFORMATION_REQUIRED", "WAITING_ON_INVESTOR", "WAITING_ON_THIRD_PARTY"] as const).map((s) => (
          <button key={s} type="button" onClick={() => s === "CLIENT_APPROVAL_REQUIRED" && onNavigate ? onNavigate("approvals") : setFilter(filter === s ? null : s)} aria-pressed={filter === s}
            className={cn("rounded-xl border bg-card p-3 text-left hover:bg-muted", filter === s && "border-primary ring-1 ring-primary")}>
            <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">{RESPONSIBILITY_LABEL[s]}</span>
            <span className="text-2xl font-semibold">{s === "CLIENT_APPROVAL_REQUIRED" ? Math.max(d.counts[s], d.approvalsAwaiting.length) : d.counts[s]}</span>
          </button>
        ))}
      </section>
      {filter && (
        <Card title={RESPONSIBILITY_LABEL[filter]} action={<Button size="sm" variant="ghost" onClick={() => setFilter(null)}>Close</Button>}>
          {filtered.length ? <ul className="divide-y text-sm">{filtered.map((t) => (
            <li key={t.id} className="py-2"><span className="font-medium">{t.title}</span>{t.waitingOn ? <span className="text-muted-foreground"> · {t.waitingOn}</span> : null}<p className={cn("text-xs", t.overdueDays ? "text-destructive" : "text-muted-foreground")}>{dueText(t.due_date, d.today)}{t.priority === "high" || t.priority === "urgent" ? ` · ${titleCase(t.priority)} priority` : ""}</p></li>
          ))}</ul> : <p className="text-sm text-muted-foreground">No items in this state.</p>}
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* 4. Deadlines */}
        <Card title="Upcoming deadlines" className="lg:col-span-2" action={onNavigate ? <Button size="sm" variant="ghost" onClick={() => onNavigate("calendar")}>View calendar</Button> : undefined}>
          {overdue.length > 0 && (
            <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 p-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-destructive">Overdue</p>
              <ul className="text-sm">{overdue.map((x) => <li key={x.kind + x.id} className="flex flex-wrap justify-between gap-2 py-0.5"><span>{x.title}</span><span className="text-xs text-destructive">{fmtDate(x.due)}</span></li>)}</ul>
            </div>
          )}
          {groups.some(([, l]) => l.length) ? groups.filter(([, l]) => l.length).map(([label, list]) => (
            <div key={label} className="mb-2">
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              <ul className="text-sm">{list.map((x) => (
                <li key={x.kind + x.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
                  <span className="min-w-0">{x.title}{x.category ? <span className="ml-1 text-xs text-muted-foreground">· {(CALENDAR_CATEGORIES as any)[x.category] ?? x.category}</span> : null}</span>
                  <span className="flex items-center gap-2"><ResponsibilityBadge status={x.responsibility} /><span className="text-xs text-muted-foreground">{fmtDate(x.due)}</span></span>
                </li>
              ))}</ul>
            </div>
          )) : <Empty title="No upcoming deadlines" body="No client-visible deadlines are scheduled in the next 30 days." />}
        </Card>

        {/* 5. Harmonious is handling */}
        <Card title="Harmonious is handling" action={d.handling.length > 6 ? <Button size="sm" variant="ghost" onClick={() => setShowAllHandling(!showAllHandling)}>{showAllHandling ? "Show less" : "View all"}</Button> : undefined}>
          {handling.length ? <ul className="space-y-2 text-sm">{handling.map((t) => (
            <li key={t.id}><span className="font-medium">{t.title}</span><p className="text-xs text-muted-foreground">{t.status === "in_progress" ? "In progress" : "Scheduled"}{t.due_date ? ` · ${dueText(t.due_date, d.today)}` : ""}</p></li>
          ))}</ul> : <Empty title="Nothing in progress" body="No client-visible work is underway right now." />}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Waiting on others">
          {d.waiting.length ? <ul className="space-y-2 text-sm">{d.waiting.map((t) => (
            <li key={t.id}><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{t.title}</span><ResponsibilityBadge status={t.responsibility_status} /></div>{t.waitingOn && <p className="text-xs text-muted-foreground">{t.waitingOn}</p>}</li>
          ))}</ul> : <Empty title="No investor or third-party holds" body="All current investor and outside-party requirements are complete." />}
        </Card>

        {/* 6. Capital activity — only when it exists */}
        {d.capital.length > 0 && (
          <Card title="Capital activity" action={onNavigate ? <Button size="sm" variant="ghost" onClick={() => onNavigate("capital")}>View</Button> : undefined}>
            <ul className="space-y-3 text-sm">{d.capital.map((c) => (
              <li key={c.id}>
                <p className="font-medium">{c.title}</p>
                <p className="text-xs text-muted-foreground">{usd(c.calledCents)} requested · {usd(c.receivedCents)} received{c.investors ? ` · ${c.funded} / ${c.investors} investors funded` : ""}</p>
                {c.due_date && <p className="text-xs text-muted-foreground">{dueText(c.due_date, d.today)}</p>}
              </li>
            ))}</ul>
          </Card>
        )}

        {/* 7. Reporting */}
        <Card title="Reporting status">
          {d.nextReport ? (
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div className="col-span-2"><dt className="text-xs text-muted-foreground">Next report</dt><dd className="font-medium">{d.nextReport.title}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Period</dt><dd>{d.nextReport.period ?? "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Expected</dt><dd>{fmtDate(d.nextReport.due)}</dd></div>
              <div className="col-span-2"><dt className="text-xs text-muted-foreground">Status</dt><dd>{d.nextReport.status === "PREPARING" ? "Harmonious Preparing" : titleCase(d.nextReport.status)}</dd></div>
            </dl>
          ) : <Empty title="No report scheduled" body="Reporting dates appear here once your operating calendar is set." />}
        </Card>

        {/* 8. Team */}
        <Card title="Your Harmonious team">
          {d.team.length ? <ul className="space-y-1 text-sm">{d.team.map((t) => <li key={t.role}><span className="text-xs text-muted-foreground">{t.role}</span><br />{t.name}</li>)}</ul>
            : <Empty title="Harmonious Support Team" body="Our support team handles your fund. A named team appears here once assigned." />}
          {onNavigate && <Button size="sm" variant="outline" className="mt-3" onClick={() => onNavigate("investors")}>View investors</Button>}
        </Card>
        {d.activity.length > 0 && (
          <Card title="Recent activity" className="lg:col-span-3">
            <ul className="space-y-1 text-sm">{d.activity.map((a, i) => <li key={i} className="flex flex-wrap justify-between gap-2">{onNavigate ? <button className="text-left hover:underline" onClick={() => onNavigate(a.target)}>{a.text}</button> : <span>{a.text}</span>}<span className="text-xs text-muted-foreground">{fmtDate(a.at)}</span></li>)}</ul>
          </Card>
        )}
      </div>
    </div>
  );
}
