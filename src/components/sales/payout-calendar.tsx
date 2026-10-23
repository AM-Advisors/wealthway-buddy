import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Panel, money } from "@/components/sales/sales-ui";
import { buildPayoutCalendar, type CalendarRow, type CalendarSow, type CalendarStatus } from "@/lib/payout-calendar-model";

const STATUS_LABEL: Record<CalendarStatus, string> = { expected: "Expected", scheduled: "Scheduled", paid_out: "Paid out", cancelled: "Cancelled" };
const STATUS_CLASS: Record<CalendarStatus, string> = { expected: "bg-muted text-muted-foreground border border-dashed border-border", scheduled: "bg-primary text-primary-foreground", paid_out: "bg-accent text-accent-foreground", cancelled: "bg-destructive/15 text-destructive line-through" };
const iso = (d: Date) => d.toISOString().slice(0, 10);
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

type Selected = { title: string; rows: CalendarRow[]; quoteId?: string; note?: string } | null;

export function PayoutCalendar({ rows, sows, onOpenDeal }: { rows: CalendarRow[]; sows: CalendarSow[]; onOpenDeal: (quoteId: string) => void }) {
  const now = new Date();
  const [view, setView] = useState<"month" | "quarter">("quarter");
  const [anchor, setAnchor] = useState({ y: now.getUTCFullYear(), m: view === "quarter" ? Math.floor(now.getUTCMonth() / 3) * 3 : now.getUTCMonth() });
  const [person, setPerson] = useState("all");
  const [client, setClient] = useState("all");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<Selected>(null);
  const span = view === "quarter" ? 3 : 1;
  const startM = view === "quarter" ? Math.floor(anchor.m / 3) * 3 : anchor.m;
  const from = iso(new Date(Date.UTC(anchor.y, startM, 1)));
  const to = iso(new Date(Date.UTC(anchor.y, startM + span, 0)));
  const filtered = rows.filter(r => (person === "all" || r.name === person) && (client === "all" || r.client === client) && (status === "all" || r.status === status));
  const visibleQuotes = new Set(filtered.map(r => r.quoteId));
  const cal = useMemo(() => buildPayoutCalendar(filtered, sows.filter(s => client === "all" || s.client === client).filter(s => person === "all" && status === "all" ? true : visibleQuotes.has(s.id)), { from, to }), [filtered, sows, from, to]);
  const move = (dir: number) => { const d = new Date(Date.UTC(anchor.y, startM + dir * span, 1)); setAnchor({ y: d.getUTCFullYear(), m: d.getUTCMonth() }); };
  const people = [...new Set(rows.map(r => r.name).filter(Boolean))] as string[];
  const clients = [...new Set(rows.map(r => r.client))];
  const select = "h-9 rounded-md border border-input bg-background px-2 text-sm";
  const sowById = useMemo(() => new Map(sows.map(s => [s.id, s])), [sows]);

  return (
    <Panel title="Payout calendar">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => move(-1)} aria-label="Previous">‹</Button>
        <span className="min-w-40 text-center font-medium">{view === "quarter" ? `Q${startM / 3 + 1} ${anchor.y}` : `${MONTHS[startM]} ${anchor.y}`}</span>
        <Button size="sm" variant="outline" onClick={() => move(1)} aria-label="Next">›</Button>
        <Button size="sm" variant={view === "month" ? "default" : "outline"} onClick={() => setView("month")}>Month</Button>
        <Button size="sm" variant={view === "quarter" ? "default" : "outline"} onClick={() => setView("quarter")}>Quarter</Button>
        <select className={select} value={person} onChange={e => setPerson(e.target.value)} aria-label="Person"><option value="all">All people</option>{people.map(p => <option key={p}>{p}</option>)}</select>
        <select className={select} value={client} onChange={e => setClient(e.target.value)} aria-label="Client"><option value="all">All clients</option>{clients.map(c => <option key={c}>{c}</option>)}</select>
        <select className={select} value={status} onChange={e => setStatus(e.target.value)} aria-label="Status"><option value="all">All statuses</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded px-2 py-0.5 bg-secondary text-secondary-foreground">SOW signed</span>
        <span className="rounded px-2 py-0.5 border-l-4 border-accent bg-accent/10">Payment period</span>
        {(Object.keys(STATUS_LABEL) as CalendarStatus[]).map(s => <span key={s} className={`rounded px-2 py-0.5 ${STATUS_CLASS[s]}`}>{STATUS_LABEL[s]} payout</span>)}
      </div>
      <div className={`grid gap-4 ${view === "quarter" ? "lg:grid-cols-3" : ""}`}>
        {Array.from({ length: span }, (_, i) => <MonthGrid key={i} y={anchor.y} m={startM + i} cal={cal} onSelect={setSelected} />)}
      </div>
      <div className="mt-4 space-y-1">
        <p className="text-sm font-medium">Payment periods</p>
        {cal.spans.length ? cal.spans.map(s => {
          const sow = sowById.get(s.quoteId);
          const hasAmounts = sow && sow.signedAmountCents != null;
          return (
            <button key={s.key} className="flex w-full flex-wrap justify-between gap-2 rounded border-l-4 border-accent bg-accent/10 px-2 py-1 text-left text-sm" onClick={() => setSelected({ title: `${s.client} · ${s.service}`, rows: filtered.filter(r => r.quoteId === s.quoteId && r.service === s.service), quoteId: s.quoteId, note: `${s.frequency === "quarterly" ? "Quarterly" : "Annual"} period ${s.start} – ${s.end} · ${money(s.amountCents)} billed${sow ? ` · Signed amount ${money(sow.signedAmountCents ?? 0)} · Received ${money(sow.receivedAmountCents ?? 0)} · Committed ${money(sow.committedAmountCents ?? 0)}` : ""}` })}>
              <span>{s.client} · {s.service} <span className="text-muted-foreground">({s.frequency})</span></span><span>{s.start} – {s.end} · {money(s.amountCents)}</span>
              {hasAmounts && <span className="w-full text-xs text-muted-foreground">Signed amount {money(sow!.signedAmountCents ?? 0)} · Received {money(sow!.receivedAmountCents ?? 0)} · Committed {money(sow!.committedAmountCents ?? 0)}</span>}
            </button>
          );
        }) : <p className="text-sm text-muted-foreground">No scheduled payment periods from signed SOWs in this range.</p>}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">View only. Signed amount is the contract value on the signed statement of work, Amount received is what the client has paid, and Committed is the total scheduled payouts. Expected payouts are projections until the client pays; Finance records payouts in the tracker below.</p>
      <Dialog open={Boolean(selected)} onOpenChange={o => { if (!o) setSelected(null); }}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-auto">
          <DialogHeader><DialogTitle>{selected?.title}</DialogTitle>{selected?.note && <DialogDescription>{selected.note}</DialogDescription>}</DialogHeader>
          <div className="space-y-2">
            {selected?.rows.map((r, i) => (
              <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border p-2 text-sm">
                <div><div className="font-medium">{r.client} · {r.service}</div><div className="text-muted-foreground">{r.name ?? "Unassigned"} · {r.layer.toUpperCase()} · payout {r.payoutDue ?? "—"}</div></div>
                <div className="flex items-center gap-2">{money(r.amountCents)}<Badge variant="outline">{STATUS_LABEL[r.status as CalendarStatus] ?? r.status}</Badge>
                  <Button size="sm" variant="link" onClick={() => { setSelected(null); onOpenDeal(r.quoteId); }}>Deal payouts</Button></div>
              </div>
            ))}
            {!selected?.rows.length && selected?.quoteId && <Button variant="outline" onClick={() => { const id = selected.quoteId!; setSelected(null); onOpenDeal(id); }}>Open deal payouts</Button>}
          </div>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

function MonthGrid({ y, m, cal, onSelect }: { y: number; m: number; cal: ReturnType<typeof buildPayoutCalendar>; onSelect: (s: Selected) => void }) {
  const first = new Date(Date.UTC(y, m, 1));
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const lead = first.getUTCDay();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => iso(new Date(Date.UTC(y, m, i + 1))))];
  return (
    <div>
      <p className="mb-1 text-sm font-medium">{MONTHS[first.getUTCMonth()]} {first.getUTCFullYear()}</p>
      <div className="grid grid-cols-7 gap-px rounded border border-border bg-border text-xs">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i} className="bg-muted p-1 text-center text-muted-foreground">{d}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="min-h-14 bg-background" />;
          const day = cal.days.find(x => x.date === d);
          const signed = cal.signed.filter(s => s.date === d);
          const inPeriod = cal.spans.some(s => s.start <= d && s.end >= d);
          return (
            <div key={i} className={`min-h-14 space-y-0.5 p-1 ${inPeriod ? "bg-accent/10" : "bg-background"}`}>
              <div className="text-muted-foreground">{Number(d.slice(8))}</div>
              {signed.map(s => <button key={s.quoteId} className="block w-full truncate rounded bg-secondary px-1 text-left text-secondary-foreground" title={`SOW signed · ${s.client} · ${s.label}`} onClick={() => onSelect({ title: `SOW signed · ${s.client}`, rows: [], quoteId: s.quoteId, note: `${s.label} signed ${s.date}${s.signedAmountCents != null ? ` · Signed amount ${money(s.signedAmountCents)}` : ""}${s.receivedAmountCents != null ? ` · Received ${money(s.receivedAmountCents)}` : ""}${s.committedAmountCents != null ? ` · Committed ${money(s.committedAmountCents)}` : ""}` })}>✎ {s.client}</button>)}
              {day && (Object.entries(day.totals) as [CalendarStatus, number][]).map(([s, v]) => (
                <button key={s} className={`block w-full truncate rounded px-1 text-left ${STATUS_CLASS[s]}`} onClick={() => onSelect({ title: `${STATUS_LABEL[s]} payouts · ${d}`, rows: day.rows.filter(r => r.status === s) })}>{money(v)}</button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
