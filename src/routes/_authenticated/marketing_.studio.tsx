import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MkPage, mkHead } from "@/components/marketing-ui";
import { ItemDrawer, SampleTag, SeriesChip, StatusPill, useStudio, type Series } from "@/components/marketing/studio";
import { planStudioWeek } from "@/lib/marketing-studio.functions";
import { weekStart } from "@/lib/marketing-studio-model";

export const Route = createFileRoute("/_authenticated/marketing_/studio")({
  head: mkHead("Marketing Studio", "Editorial command center for the five weekly Harmonious content series."),
  component: StudioDashboard,
});

/** Clearly labeled placeholder panels until live sources are connected in later phases. */
const SAMPLE = {
  stories: ["Secondary volumes hit a record quarter (sample headline)", "Late-stage rounds return with structured terms (sample)", "Two venture-backed IPOs price above range (sample)"],
  regulatory: ["SEC: sample Form D guidance update", "IRS: sample partnership audit notice", "FinCEN: sample beneficial ownership reminder"],
  opportunities: ["Explain what a record secondary market means for LPs", "Fund Academy: Form D timelines, step by step", "Founders Friday: dilution lessons from recent rounds"],
  seo: ["“how to start an SPV” — rising (sample)", "“Form D filing deadline” — steady (sample)"],
};

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
  const { from, to } = useMemo(() => {
    const now = new Date();
    return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth() + 2, 1) };
  }, []);
  const q = useStudio(from, to);
  const plan = useServerFn(planStudioWeek);
  const qc = useQueryClient();
  const [open, setOpen] = useState<string | null | undefined>(undefined);
  const series = (q.data?.series ?? []) as Series[];
  const byKey = Object.fromEntries(series.map((s) => [s.key, s]));
  const items = (q.data?.items ?? []) as any[];
  const wk = weekStart(new Date());
  const weekEnd = new Date(`${wk}T00:00:00Z`); weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  const thisWeek = items.filter((i) => i.publish_at && new Date(i.publish_at) >= new Date(`${wk}T00:00:00Z`) && new Date(i.publish_at) < weekEnd);
  const today = new Date().toDateString();
  const todays = items.filter((i) => i.publish_at && new Date(i.publish_at).toDateString() === today);
  const awaiting = items.filter((i) => ["internal_review", "ceo_approval"].includes(i.status));
  const scheduled = items.filter((i) => i.status === "scheduled");
  const published = items.filter((i) => ["published", "performance_review"].includes(i.status));
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const monthItems = items.filter((i) => i.publish_at && new Date(i.publish_at) >= monthStart);

  const Row = ({ i }: { i: any }) => (
    <button onClick={() => setOpen(i.id)} className="flex w-full items-center gap-2 border-l-2 py-1.5 pl-2 text-left text-sm hover:bg-muted" style={{ borderColor: byKey[i.series_key]?.color }}>
      <span className="min-w-0 flex-1 truncate">{i.article_title || i.topic || "Untitled"}</span>
      {i.publish_at && <span className="text-[11px] text-muted-foreground tabular-nums">{new Date(i.publish_at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span>}
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
          <Button variant="outline" onClick={() => setOpen(null)}>New item</Button>
          <Button onClick={async () => { try { const r = await plan({ data: { week: wk } }); toast.success(r.created ? `Added ${r.created} proposed slots` : "This week is already planned"); qc.invalidateQueries({ queryKey: ["studio"] }); } catch (e: any) { toast.error(e.message); } }}>Plan this week</Button>
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
          <Panel title="Trending market stories" sample><ul className="space-y-1 text-sm">{SAMPLE.stories.map((t) => <li key={t}>{t}</li>)}</ul></Panel>
          <Panel title="SEC and IRS updates" sample><ul className="space-y-1 text-sm">{SAMPLE.regulatory.map((t) => <li key={t}>{t}</li>)}</ul></Panel>
          <Panel title="Suggested opportunities" sample><ul className="space-y-1 text-sm">{SAMPLE.opportunities.map((t) => <li key={t}>{t}</li>)}</ul></Panel>
          <Panel title="SEO opportunities" sample><ul className="space-y-1 text-sm">{SAMPLE.seo.map((t) => <li key={t}>{t}</li>)}</ul></Panel>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Panel title="Social engagement" sample><p className="text-sm text-muted-foreground">Connects to post results in a later phase.</p></Panel>
        <Panel title="Website traffic" sample><p className="text-sm text-muted-foreground">Connects to site analytics in a later phase.</p></Panel>
        <Panel title="Lead conversions" sample><p className="text-sm text-muted-foreground">Connects to Sales leads in a later phase.</p></Panel>
      </div>

      {open !== undefined && <ItemDrawer id={open} open series={series} people={q.data?.people ?? {}} onClose={() => setOpen(undefined)} />}
    </MkPage>
  );
}
