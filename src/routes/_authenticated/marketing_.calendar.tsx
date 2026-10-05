import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChannelChip, MkPage, mkHead } from "@/components/marketing-ui";
import { STATUS_LABEL } from "@/lib/marketing-model";
import { decideMarketingEmail, decideMarketingPost, getMarketingCalendar } from "@/lib/marketing.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/marketing_/calendar")({
  head: mkHead("Marketing calendar", "Calendar of scheduled and published social posts and emails."),
  component: CalendarPage,
});

const FILTERS = ["all", "linkedin", "facebook", "instagram", "email"] as const;
const startOfWeek = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - x.getDay()); return x; };
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
type Action = "submit" | "approve" | "reject";

const STEPS = ["Write", "Approve", "Send", "Live"] as const;
const stepOf = (s: string) => (s === "draft" || s === "rejected" ? 0 : s === "submitted" ? 1 : s === "approved" || s === "scheduled" ? 2 : s === "published" || s === "sent" ? 3 : -1);
/** Write → Approve → Send → Live progress for a calendar item. */
function FlowSteps({ status }: { status: string }) {
  const at = stepOf(status);
  if (at < 0) return null;
  return (
    <div className="mt-1 flex gap-0.5" title={`Step ${at + 1} of 4: ${STEPS[at]}`}>
      {STEPS.map((s, i) => <span key={s} className={`h-1 flex-1 rounded ${i <= at ? "bg-primary" : "bg-muted"}`} />)}
    </div>
  );
}

/** Quick approval actions on a calendar item. The server enforces roles and author ≠ approver. */
function ItemActions({ it, busy, run }: { it: any; busy: boolean; run: (it: any, a: Action) => void }) {
  const btn = "rounded border px-1 py-0.5 text-[10px] font-medium disabled:opacity-50";
  if (it.status === "draft" || it.status === "rejected")
    return (
      <div className="mt-1 flex gap-1">
        <Link to={it.kind === "post" ? "/marketing/posts/$id" : "/marketing/emails/$id"} params={{ id: it.id }} className={`${btn} hover:bg-muted`}>Write</Link>
        <button className={`${btn} hover:bg-muted`} disabled={busy} onClick={() => run(it, "submit")}>Submit</button>
      </div>
    );
  if (it.status === "submitted" && it.canApprove)
    return (
      <div className="mt-1 flex flex-wrap gap-1">
        <button className={`${btn} border-primary bg-primary text-primary-foreground`} disabled={busy} onClick={() => run(it, "approve")}>Approve & send</button>
        <button className={`${btn} hover:bg-muted`} disabled={busy} onClick={() => run(it, "reject")}>Send back</button>
      </div>
    );
  if (it.status === "submitted") return <div className="mt-1 text-[10px] text-muted-foreground">Waiting for another approver</div>;
  return null;
}

function CalendarPage() {
  const [view, setView] = useState<"month" | "week">("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const load = useServerFn(getMarketingCalendar);
  const decidePost = useServerFn(decideMarketingPost), decideEmail = useServerFn(decideMarketingEmail);
  const [busy, setBusy] = useState<string | null>(null);

  const days = useMemo(() => {
    const first = view === "month" ? startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1)) : startOfWeek(anchor);
    const n = view === "month" ? 42 : 7;
    return Array.from({ length: n }, (_, i) => { const d = new Date(first); d.setDate(first.getDate() + i); return d; });
  }, [anchor, view]);
  const from = days[0]!.toISOString(), to = new Date(days[days.length - 1]!.getTime() + 864e5).toISOString();
  const q = useQuery({ queryKey: ["mk-cal", from, to], queryFn: () => load({ data: { from, to } }), retry: false });
  const run = async (it: any, action: Action) => {
    setBusy(it.id);
    try {
      const fn = it.kind === "post" ? decidePost : decideEmail;
      await fn({ data: { id: it.id, action } });
      toast.success(action === "submit" ? "Sent for approval" : action === "approve" ? "Approved — it goes live at its scheduled time" : "Sent back to the author");
      await q.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(null); }
  };

  const byDay = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const it of q.data ?? []) {
      if (filter !== "all" && !it.channels.includes(filter)) continue;
      const k = dayKey(new Date(it.at));
      m.set(k, [...(m.get(k) ?? []), it].sort((a, b) => a.at.localeCompare(b.at)));
    }
    return m;
  }, [q.data, filter]);

  const shift = (dir: number) => setAnchor((a) => { const d = new Date(a); if (view === "month") d.setMonth(d.getMonth() + dir); else d.setDate(d.getDate() + 7 * dir); return d; });
  const label = view === "month" ? anchor.toLocaleString("en-US", { month: "long", year: "numeric" }) : `Week of ${days[0]!.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  const today = dayKey(new Date());

  return (
    <MkPage title="Calendar" intro="Every scheduled and published post and email. Click an item to open it."
      actions={<div className="flex gap-2"><Button variant="outline" asChild><Link to="/marketing/emails/$id" params={{ id: "new" }}>New email</Link></Button><Button asChild><Link to="/marketing/posts/$id" params={{ id: "new" }}>New post</Link></Button></div>}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" onClick={() => shift(-1)} aria-label="Previous"><ChevronLeft className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" onClick={() => setAnchor(new Date())}>Today</Button>
          <Button size="icon" variant="outline" onClick={() => shift(1)} aria-label="Next"><ChevronRight className="h-4 w-4" /></Button>
          <h2 className="ml-2 text-lg font-semibold">{label}</h2>
        </div>
        <div className="flex flex-wrap gap-1">
          {(["month", "week"] as const).map((v) => <Button key={v} size="sm" variant={view === v ? "default" : "outline"} onClick={() => setView(v)} className="capitalize">{v}</Button>)}
          <span className="mx-1" />
          {FILTERS.map((f) => <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)} className="capitalize">{f}</Button>)}
        </div>
      </div>
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      <div className="grid grid-cols-7 overflow-hidden rounded-lg border">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="border-b bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">{d}</div>)}
        {days.map((d) => {
          const items = byDay.get(dayKey(d)) ?? [];
          const out = view === "month" && d.getMonth() !== anchor.getMonth();
          return (
            <div key={d.toISOString()} className={`${view === "week" ? "min-h-64" : "min-h-28"} border-b border-r p-1 ${out ? "bg-muted/40" : "bg-card"}`}>
              <div className={`mb-1 text-xs ${dayKey(d) === today ? "font-bold text-primary" : "text-muted-foreground"}`}>{d.getDate()}</div>
              <div className="space-y-1">{items.map((it) => (
                <div key={it.kind + it.id} className="rounded border bg-background p-1 text-[11px] hover:border-primary">
                  <Link to={it.kind === "post" ? "/marketing/posts/$id" : "/marketing/emails/$id"} params={{ id: it.id }} className="block" title={STATUS_LABEL[it.status] ?? it.status}>
                    <span className="flex flex-wrap items-center gap-0.5">{it.channels.map((c: string) => <ChannelChip key={c} c={c} />)}{it.source === "clickup" && <span className="rounded bg-muted px-1 text-[9px] text-muted-foreground">ClickUp</span>}</span>
                    <span className="mt-0.5 block truncate">{new Date(it.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} {it.title}</span>
                    <span className="block text-muted-foreground">{STATUS_LABEL[it.status] ?? it.status}</span>
                  </Link>
                  <ItemActions it={it} busy={busy === it.id} run={run} />
                </div>))}</div>
            </div>
          );
        })}
      </div>
    </MkPage>
  );
}
