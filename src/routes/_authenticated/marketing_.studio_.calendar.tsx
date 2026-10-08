import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MkPage, mkHead } from "@/components/marketing-ui";
import { ItemDrawer, SeriesChip, StatusPill, useStudio, type Series } from "@/components/marketing/studio";
import { moveStudioItem, saveStudioItem } from "@/lib/marketing-studio.functions";
import { STUDIO_STATUSES, STUDIO_STATUS_LABEL } from "@/lib/marketing-studio-model";
import { useOrgTz } from "@/components/marketing/use-org-tz";
import { addYmd, fmtYmd, mondayOf, moveToDay, weekdayOf, ymdIn, ymdStartUtc } from "@/lib/org-timezone";

export const Route = createFileRoute("/_authenticated/marketing_/studio_/calendar")({
  head: mkHead("Editorial calendar", "Month, week, day, kanban and campaign timeline for the Harmonious editorial series."),
  component: EditorialCalendar,
});

const VIEWS = ["month", "week", "day", "kanban", "timeline"] as const;
type View = (typeof VIEWS)[number];

function EditorialCalendar() {
  const [view, setView] = useState<View>("month");
  const tz = useOrgTz();
  const [anchorRaw, setAnchor] = useState<string | null>(null);
  const today = ymdIn(new Date(), tz);
  const anchor = anchorRaw ?? today;
  const [fSeries, setFSeries] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [fPlatform, setFPlatform] = useState("all");
  const [fOwner, setFOwner] = useState("all");
  const [open, setOpen] = useState<string | null | undefined>(undefined);
  const [draft, setDraft] = useState<any>(undefined);
  const save = useServerFn(saveStudioItem), move = useServerFn(moveStudioItem);
  const qc = useQueryClient();

  // Day boundaries come from the organization time zone, not the viewer's device clock.
  const { from, to, days, firstDay, lastDay } = useMemo(() => {
    const span = (f: string, n: number, list: boolean) => ({ firstDay: f, lastDay: addYmd(f, n - 1), from: ymdStartUtc(f, tz), to: ymdStartUtc(addYmd(f, n), tz), days: list ? Array.from({ length: n }, (_, i) => addYmd(f, i)) : [] });
    if (view === "day") return span(anchor, 1, true);
    if (view === "week") return span(mondayOf(anchor), 7, true);
    if (view === "timeline") return span(mondayOf(anchor), 56, false);
    return span(mondayOf(anchor.slice(0, 8) + "01"), 42, true);
  }, [view, anchor, tz]);
  const onDay = (i: any, d: string) => !!i.publish_at && ymdIn(i.publish_at, tz) === d;
  const q = useStudio(from, to);
  const series = (q.data?.series ?? []) as Series[];
  const byKey = Object.fromEntries(series.map((s) => [s.key, s]));
  const people = q.data?.people ?? {};
  const items = ((q.data?.items ?? []) as any[]).filter((i) =>
    (fSeries === "all" || i.series_key === fSeries) && (fStatus === "all" || i.status === fStatus) &&
    (fPlatform === "all" || (i.platforms ?? []).includes(fPlatform)) && (fOwner === "all" || i.author_id === fOwner || i.reviewer_id === fOwner));
  const refresh = () => qc.invalidateQueries({ queryKey: ["studio"] });

  const reschedule = async (id: string, day: string) => {
    const cur = items.find((i) => i.id === id); if (!cur) return;
    try { await save({ data: { id, publish_at: moveToDay(cur.publish_at, day, tz) } }); toast.success("Rescheduled"); refresh(); } catch (e: any) { toast.error(e.message); }
  };
  const restep = async (id: string, to: string) => {
    const cur = items.find((i) => i.id === id); if (!cur || cur.status === to) return;
    const back = STUDIO_STATUSES.indexOf(to as any) < STUDIO_STATUSES.indexOf(cur.status);
    const note = back ? window.prompt("Why are you sending it back?") : null;
    if (back && !note) return;
    try { await move({ data: { id, to: to as any, note } }); toast.success(`Moved to ${STUDIO_STATUS_LABEL[to as keyof typeof STUDIO_STATUS_LABEL]}`); refresh(); } catch (e: any) { toast.error(e.message); }
  };

  const Card = ({ i }: { i: any }) => (
    <div draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", i.id)} onClick={(e) => { e.stopPropagation(); setOpen(i.id); }}
      className="cursor-pointer rounded-sm border-l-2 bg-card px-1.5 py-1 text-[11px] shadow-sm hover:bg-muted" style={{ borderColor: byKey[i.series_key]?.color }}>
      <div className="flex items-center gap-1"><SeriesChip s={byKey[i.series_key]} short />{i.publish_at && <span className="text-muted-foreground tabular-nums">{new Date(i.publish_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })}</span>}</div>
      <div className="mt-0.5 line-clamp-2 font-medium">{i.article_title || i.topic || "Untitled"}</div>
      <StatusPill status={i.status} />
    </div>
  );
  const drop = (day: string) => ({ onDragOver: (e: React.DragEvent) => e.preventDefault(), onDrop: (e: React.DragEvent) => { e.preventDefault(); reschedule(e.dataTransfer.getData("text/plain"), day); } });
  const newOn = (day: string) => { setDraft({ publish_at: moveToDay(null, day, tz), series_key: series.find((s) => s.weekday === ((weekdayOf(day) + 6) % 7) + 1)?.key ?? series[0]?.key }); setOpen(null); };
  const step = (n: number) => setAnchor(() => { if (view !== "month") return addYmd(anchor, n * (view === "day" ? 1 : view === "timeline" ? 28 : 7)); const [y, m] = anchor.split("-").map(Number); const t = new Date(Date.UTC(y!, m! - 1 + n, 1)); return t.toISOString().slice(0, 10); });
  const sel = "rounded-md border border-input bg-background px-2 py-1 text-xs";

  return (
    <MkPage title="Editorial calendar" intro="Drag to reschedule or move between steps. Click a day to add an item." actions={<Button variant="outline" asChild><Link to="/marketing/studio">Studio dashboard</Link></Button>}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-border">{VIEWS.map((v) => <button key={v} onClick={() => setView(v)} className={`px-3 py-1 text-xs capitalize ${view === v ? "bg-primary text-primary-foreground" : ""}`}>{v}</button>)}</div>
        {view !== "kanban" && <><Button size="icon" variant="ghost" onClick={() => step(-1)} aria-label="Previous"><ChevronLeft className="h-4 w-4" /></Button><Button size="sm" variant="ghost" onClick={() => setAnchor(null)}>Today</Button><Button size="icon" variant="ghost" onClick={() => step(1)} aria-label="Next"><ChevronRight className="h-4 w-4" /></Button></>}
        <span className="font-heading text-sm font-semibold">{view === "month" ? fmtYmd(anchor, { month: "long", year: "numeric" }) : view === "day" ? fmtYmd(anchor, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : `${fmtYmd(firstDay, { month: "short", day: "numeric" })} – ${fmtYmd(lastDay, { month: "short", day: "numeric", year: "numeric" })}`}</span>
        <span className="text-[11px] text-muted-foreground">Times in {tz}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <select className={sel} value={fSeries} onChange={(e) => setFSeries(e.target.value)}><option value="all">All series</option>{series.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}</select>
          <select className={sel} value={fStatus} onChange={(e) => setFStatus(e.target.value)}><option value="all">All steps</option>{STUDIO_STATUSES.map((s) => <option key={s} value={s}>{STUDIO_STATUS_LABEL[s]}</option>)}</select>
          <select className={sel} value={fPlatform} onChange={(e) => setFPlatform(e.target.value)}><option value="all">All platforms</option>{["linkedin", "facebook", "instagram", "website", "email"].map((p) => <option key={p} value={p}>{p}</option>)}</select>
          <select className={sel} value={fOwner} onChange={(e) => setFOwner(e.target.value)}><option value="all">Everyone</option>{Object.entries(people).map(([id, n]) => <option key={id} value={id}>{n as string}</option>)}</select>
        </div>
      </div>

      {(view === "month" || view === "week") && (
        <div className="overflow-x-auto"><div className="grid min-w-[700px] grid-cols-7 gap-px rounded-lg border border-border bg-border">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="bg-muted px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{d}</div>)}
          {days.map((d) => {
            const its = items.filter((i) => onDay(i, d));
            return (
              <div key={d} {...drop(d)} onClick={() => newOn(d)} className={`space-y-1 bg-background p-1 ${view === "week" ? "min-h-64" : "min-h-28"} ${view === "month" && d.slice(0, 7) !== anchor.slice(0, 7) ? "opacity-50" : ""}`}>
                <div className={`text-[11px] tabular-nums ${d === today ? "font-bold text-primary" : "text-muted-foreground"}`}>{Number(d.slice(8))}</div>
                {its.map((i) => <Card key={i.id} i={i} />)}
              </div>
            );
          })}
        </div></div>
      )}

      {view === "day" && (
        <div {...drop(days[0]!)} className="space-y-2 rounded-lg border border-border p-3">
          {items.filter((i) => onDay(i, days[0]!)).map((i) => <Card key={i.id} i={i} />)}
          <Button size="sm" variant="outline" onClick={() => newOn(days[0]!)}>Add item for this day</Button>
        </div>
      )}

      {view === "kanban" && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {STUDIO_STATUSES.map((st) => (
            <div key={st} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); restep(e.dataTransfer.getData("text/plain"), st); }} className="w-56 shrink-0 space-y-1 rounded-lg border border-border bg-muted/40 p-2">
              <div className="flex justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><span>{STUDIO_STATUS_LABEL[st]}</span><span>{items.filter((i) => i.status === st).length}</span></div>
              {items.filter((i) => i.status === st).map((i) => <Card key={i.id} i={i} />)}
            </div>
          ))}
        </div>
      )}

      {view === "timeline" && (
        <div className="space-y-2 overflow-x-auto">
          {series.map((s) => (
            <div key={s.key} className="flex min-w-[800px] items-center gap-2">
              <div className="w-44 shrink-0 text-xs font-semibold" style={{ color: s.color }}>{s.name}</div>
              <div className="relative h-10 flex-1 rounded bg-muted">
                {items.filter((i) => i.series_key === s.key && i.publish_at).map((i) => {
                  const pct = ((new Date(i.publish_at).getTime() - from.getTime()) / (to.getTime() - from.getTime())) * 100;
                  return pct >= 0 && pct <= 100 ? <button key={i.id} title={i.article_title || i.topic} onClick={() => setOpen(i.id)} className="absolute top-1 h-8 w-2 rounded-sm" style={{ left: `${pct}%`, background: s.color }} /> : null;
                })}
              </div>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">Eight weeks from {fmtYmd(firstDay, { month: "short", day: "numeric", year: "numeric" })} ({tz}). Each mark is one planned item.</p>
        </div>
      )}

      {open !== undefined && <ItemDrawer id={open} open draft={draft} series={series} people={people} onClose={() => { setOpen(undefined); setDraft(undefined); }} />}
    </MkPage>
  );
}
