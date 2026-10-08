import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MkPage, mkHead } from "@/components/marketing-ui";
import { ItemDrawer, SampleTag, SeriesChip, StatusPill, useStudio, type Series } from "@/components/marketing/studio";
import { getStudioSignals, planStudioWeek } from "@/lib/marketing-studio.functions";
import { useQuery } from "@tanstack/react-query";
import { useOrgTz } from "@/components/marketing/use-org-tz";
import { addYmd, mondayOf, ymdIn, ymdStartUtc } from "@/lib/org-timezone";

export const Route = createFileRoute("/_authenticated/marketing_/studio")({
  head: mkHead("Marketing Studio", "Editorial command center for the five weekly Harmonious content series."),
  component: StudioDashboard,
});

const STATE_LABEL: Record<string, string> = { no_data: "No data", not_connected: "Not connected", not_measured: "Not yet measured" };
const JOB_LABEL: Record<string, string> = { completed: "Completed", partial: "Partial", failed: "Failed", missed: "Missed", skipped: "Skipped", blocked: "Blocked", running: "Running", scheduled: "Scheduled" };

function Panel({ title, sample, children, action }: { title: string; sample?: boolean; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-heading text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
        <div className="flex items-center gap-2">{sample && <SampleTag />}{action}</div>
      </header>
      {children}
    </section>
  );
}

function StudioDashboard() {
  const tz = useOrgTz();
  const { from, to } = useMemo(() => {
    const now = new Date();
    return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth() + 2, 1) };
  }, []);
  const q = useStudio(from, to);
  const plan = useServerFn(planStudioWeek);
  const loadSignals = useServerFn(getStudioSignals);
  const sig = useQuery({ queryKey: ["studio-signals"], queryFn: () => loadSignals(), retry: false, refetchInterval: 60000 });
  const S = sig.data as any;
  const qc = useQueryClient();
  const [open, setOpen] = useState<string | null | undefined>(undefined);
  const series = (q.data?.series ?? []) as Series[];
  const byKey = Object.fromEntries(series.map((s) => [s.key, s]));
  const items = (q.data?.items ?? []) as any[];
  // Week/today/month boundaries use the organization time zone.
  const todayYmd = ymdIn(new Date(), tz);
  const wkFrom = ymdStartUtc(mondayOf(todayYmd), tz), weekEnd = ymdStartUtc(addYmd(mondayOf(todayYmd), 7), tz);
  const thisWeek = items.filter((i) => i.publish_at && new Date(i.publish_at) >= wkFrom && new Date(i.publish_at) < weekEnd);
  const todays = items.filter((i) => i.publish_at && ymdIn(i.publish_at, tz) === todayYmd);
  const awaiting = items.filter((i) => ["internal_review", "ceo_approval"].includes(i.status));
  const scheduled = items.filter((i) => i.status === "scheduled");
  const published = items.filter((i) => ["published", "performance_review"].includes(i.status));
  const monthStart = ymdStartUtc(todayYmd.slice(0, 8) + "01", tz);
  const monthItems = items.filter((i) => i.publish_at && new Date(i.publish_at) >= monthStart);

  const Row = ({ i }: { i: any }) => (
    <button onClick={() => setOpen(i.id)} className="flex w-full items-center gap-2 border-l-2 py-1.5 pl-2 text-left text-sm hover:bg-muted" style={{ borderColor: byKey[i.series_key]?.color }}>
      <span className="min-w-0 flex-1 truncate">{i.article_title || i.topic || "Untitled"}</span>
      {i.publish_at && <span className="text-[11px] text-muted-foreground tabular-nums">{new Date(i.publish_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz })}</span>}
      <StatusPill status={i.status} />
    </button>
  );
  const Empty = ({ t }: { t: string }) => <p className="text-sm text-muted-foreground">{t}</p>;
  const Stat = ({ label, value, sub }: { label: string; value: string | number; sub?: string }) => (
    <div className="rounded-lg border border-border bg-card p-4"><div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div><div className="font-heading text-2xl font-semibold tabular-nums">{value}</div>{sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}</div>
  );

  return (
    <MkPage
      title="Marketing Studio"
      intro="Plan, review and track the five weekly series. Nothing is published from here without approval."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild><Link to="/marketing/studio/calendar">Editorial calendar</Link></Button>
          <Button variant="outline" asChild><Link to="/marketing/content-studio">Content Studio</Link></Button>
          <Button variant="outline" onClick={() => setOpen(null)}>New item</Button>
          <Button onClick={async () => { try { const r = await plan({ data: { week: mondayOf(todayYmd) } }); toast.success(r.created ? `Added ${r.created} proposed slots` : "This week is already planned"); qc.invalidateQueries({ queryKey: ["studio"] }); } catch (e: any) { toast.error(e.message); } }}>Plan this week</Button>
        </div>
      }
    >
      <div className="flex flex-wrap gap-2">{series.map((s) => <span key={s.key} title={s.purpose}><SeriesChip s={s} /></span>)}</div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="This week" value={thisWeek.length} sub={`${thisWeek.filter((i) => ["approved", "scheduled", "published", "performance_review"].includes(i.status)).length} approved or later`} />
        <Stat label="This month" value={monthItems.length} sub={`${monthItems.filter((i) => i.status === "published" || i.status === "performance_review").length} published`} />
        <Stat label="Awaiting approval" value={awaiting.length} />
        <Stat label="Scheduled" value={scheduled.length} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="This week's content">
          {series.map((s) => {
            const its = thisWeek.filter((i) => i.series_key === s.key);
            return <div key={s.key} className="mb-2"><div className="text-[11px] font-semibold" style={{ color: s.color }}>{s.name}</div>{its.length ? its.map((i) => <Row key={i.id} i={i} />) : <Empty t="Nothing planned" />}</div>;
          })}
        </Panel>
        <div className="space-y-4">
          <Panel title="Today">{todays.length ? todays.map((i) => <Row key={i.id} i={i} />) : <Empty t="Nothing scheduled today." />}</Panel>
          <Panel title="Awaiting approval">{awaiting.length ? awaiting.map((i) => <Row key={i.id} i={i} />) : <Empty t="Nothing waiting." />}</Panel>
          <Panel title="Scheduled">{scheduled.length ? scheduled.map((i) => <Row key={i.id} i={i} />) : <Empty t="Nothing scheduled." />}</Panel>
          <Panel title="Published">{published.length ? published.slice(0, 8).map((i) => <Row key={i.id} i={i} />) : <Empty t="Nothing published yet." />}</Panel>
        </div>
        <div className="space-y-4">
          <Panel title="Trending market stories"><StoryList rows={S?.stories} loading={sig.isLoading} /></Panel>
          <Panel title="SEC and IRS updates"><StoryList rows={S?.regulatory} loading={sig.isLoading} /></Panel>
          <Panel title="Suggested opportunities">{S?.ideas?.length ? <ul className="space-y-1 text-sm">{S.ideas.map((i: any) => <li key={i.id}>{i.title} <span className="text-[11px] text-muted-foreground">{byKey[i.series_key]?.name ?? ""}</span></li>)}</ul> : <Empty t={sig.isLoading ? "Loading…" : "No data"} />}</Panel>
          <Panel title="SEO opportunities">{S?.seo?.rows?.length ? <ul className="space-y-1 text-sm">{S.seo.rows.map((r: any) => <li key={r.query}>“{r.query}” <span className="text-[11px] text-muted-foreground tabular-nums">{r.impressions} impressions · {r.clicks} clicks</span></li>)}</ul> : <Empty t={sig.isLoading ? "Loading…" : STATE_LABEL[S?.seo?.state] ?? "No data"} />}</Panel>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Panel title="Social engagement">{S?.social?.state === "ok" ? <p className="font-heading text-2xl font-semibold tabular-nums">{S.social.engagement}<span className="ml-2 text-xs font-normal text-muted-foreground">interactions, last 14 days</span></p> : <Empty t={STATE_LABEL[S?.social?.state] ?? "No data"} />}</Panel>
        <Panel title="Website traffic"><Empty t={STATE_LABEL[S?.traffic?.state] ?? "Not connected"} /></Panel>
        <Panel title="Lead conversions"><Empty t={STATE_LABEL[S?.leads?.state] ?? "Not yet measured"} /></Panel>
      </div>

      <Panel title="Scheduled jobs (last 48 hours)">
        {S?.jobs?.length ? <ul className="divide-y text-sm">{S.jobs.map((j: any) => (
          <li key={j.key} className="flex flex-wrap items-center gap-2 py-1.5">
            <span className="min-w-0 flex-1">{j.label}</span>
            <span className="text-xs">{j.last ? `${JOB_LABEL[j.last.status] ?? j.last.status}${j.last.catch_up ? " (catch-up)" : ""}${j.last.failed_stage ? ` at ${j.last.failed_stage}` : ""} · ${new Date(j.last.started_at ?? j.last.slot_key).toLocaleString("en-US", { timeZone: tz })}` : "No runs recorded yet"}</span>
            {j.missed > 0 && <span className="rounded bg-destructive/10 px-1.5 text-xs text-destructive">{j.missed} missed</span>}
            {j.failed > 0 && <span className="rounded bg-destructive/10 px-1.5 text-xs text-destructive">{j.failed} failed/partial</span>}
          </li>))}</ul> : <Empty t={sig.isLoading ? "Loading…" : "No runs recorded yet"} />}
      </Panel>

      {open !== undefined && <ItemDrawer id={open} open series={series} people={q.data?.people ?? {}} onClose={() => setOpen(undefined)} />}
    </MkPage>
  );
}

function StoryList({ rows, loading }: { rows?: any[]; loading: boolean }) {
  if (!rows?.length) return <p className="text-sm text-muted-foreground">{loading ? "Loading…" : "No data"}</p>;
  return <ul className="space-y-1 text-sm">{rows.map((r) => <li key={r.id}><a href={r.url} target="_blank" rel="noreferrer" className="hover:underline">{r.headline}</a> <span className="text-[11px] text-muted-foreground">{r.publisher}{r.verification_status ? ` · ${r.verification_status}` : ""}</span></li>)}</ul>;
}
