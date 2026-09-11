import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { getMyDesk } from "@/lib/staff-portal.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Kind = "request" | "quote" | "hold" | "signoff" | "payment";

interface CalendarItem {
  id: string;
  kind: Kind;
  day: string; // yyyy-mm-dd — the day it is due
  raised: string; // yyyy-mm-dd — the day it arrived
  dueLabel: string;
  title: string;
  clientId: string;
  clientName: string;
  fundName: string | null;
  detail: string;
  status: string;
  overdue: boolean;
}

/** Working targets, in days, from the day an item arrives to the day it is due. */
const TARGET_DAYS = {
  request: 5,
  quote: 10,
  activate: 2,
  hold: 3,
  signoff: 7,
  match: 2,
} as const;

const KIND_LABEL: Record<Kind, string> = {
  request: "Request",
  quote: "Quote",
  hold: "Hold",
  signoff: "Sign-off",
  payment: "Payment",
};

const KIND_DOT: Record<Kind, string> = {
  request: "bg-primary",
  quote: "bg-accent",
  hold: "bg-destructive",
  signoff: "bg-amber-500",
  payment: "bg-emerald-500",
};

function serviceLabel(key?: string | null) {
  if (!key) return "Service";
  return key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function money(cents?: number | null) {
  if (cents == null) return null;
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function dayKey(value: string | Date) {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** Plain-date strings (yyyy-mm-dd) must not be shifted by the browser's time zone. */
function plainDayKey(value?: string | null) {
  if (!value) return "";
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match ? match[1]! : dayKey(value);
}

function ageInDays(iso?: string | null) {
  if (!iso) return 0;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.floor((Date.now() - then) / 86_400_000);
}

/** The day something is due: the day it arrived plus the team's working target. */
function dueKey(from: string | null | undefined, days: number) {
  if (!from) return "";
  const d = new Date(from);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  return dayKey(d);
}

/** "due today", "due in 3 days", "3 days late" — plain wording for a due date. */
function dueWording(key: string) {
  if (!key) return "No due date";
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return "No due date";
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const diff = Math.round((new Date(y, m - 1, d).getTime() - start) / 86_400_000);
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  if (diff > 1) return `Due in ${diff} days`;
  if (diff === -1) return "1 day late";
  return `${Math.abs(diff)} days late`;
}

function isPast(key: string) {
  return Boolean(key) && key < dayKey(new Date());
}

function longDay(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return key;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** A month view of everything waiting on the team, by client. */
export function StaffCalendar() {
  const [showAll, setShowAll] = useState(false);
  const [clientFilter, setClientFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState<"all" | Kind>("all");
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selected, setSelected] = useState<string | null>(dayKey(today));

  const desk = useServerFn(getMyDesk);
  const { data, isLoading, error } = useQuery({
    queryKey: ["staff-desk", showAll],
    queryFn: () => desk({ data: { showAll } }),
  });

  const items = useMemo<CalendarItem[]>(() => {
    if (!data) return [];
    const out: CalendarItem[] = [];

    for (const r of data.requests as any[]) {
      const age = ageInDays(r.created_at);
      const raised = dayKey(r.created_at);
      const due = dueKey(r.created_at, TARGET_DAYS.request);
      out.push({
        id: `request-${r.id}`,
        kind: "request",
        day: due || raised,
        raised,
        dueLabel: "Reply to the client by",
        title: serviceLabel(r.service_key),
        clientId: String(r.client_id),
        clientName: r.clientName ?? "—",
        fundName: r.fundName ?? null,
        detail:
          (r.status === "requested" ? "Waiting for a first look" : "In review") +
          ` · raised ${age} day${age === 1 ? "" : "s"} ago`,
        status: r.status === "requested" ? "New" : "In review",
        overdue: isPast(due || raised),
      });
    }

    for (const q of data.quotes as any[]) {
      const raised = dayKey(q.updated_at ?? q.created_at);
      const signed = q.status !== "quoted";
      const start = plainDayKey(q.effective_date);
      // A signed proposal is due to be switched on quickly, or by its own start date.
      const due = signed
        ? start && !isPast(start)
          ? start
          : dueKey(q.updated_at ?? q.created_at, TARGET_DAYS.activate)
        : dueKey(q.updated_at ?? q.created_at, TARGET_DAYS.quote);
      const fee = money(q.proposed_fee_cents);
      out.push({
        id: `quote-${q.id}`,
        kind: "quote",
        day: due || raised,
        raised,
        dueLabel: signed ? "Switch the service on by" : "Client signature due by",
        title: serviceLabel(q.service_key),
        clientId: String(q.client_id),
        clientName: q.clientName ?? "—",
        fundName: q.fundName ?? null,
        detail:
          (fee ? `${fee} proposed` : "No fee set") +
          (q.effective_date ? ` · starts ${q.effective_date}` : " · no start date yet"),
        status: signed ? "Signed — activate" : "With the client",
        overdue: isPast(due || raised),
      });
    }

    for (const h of data.holds as any[]) {
      const age = ageInDays(h.placed_at);
      const raised = dayKey(h.placed_at);
      const due = dueKey(h.placed_at, TARGET_DAYS.hold);
      out.push({
        id: `hold-${h.id}`,
        kind: "hold",
        day: due || raised,
        raised,
        dueLabel: "Clear or escalate by",
        title: h.service_key ? serviceLabel(h.service_key) : `${h.scope ?? "Client"} hold`,
        clientId: String(h.client_id),
        clientName: h.clientName ?? "—",
        fundName: h.fundName ?? null,
        detail: `${h.reason ?? "On hold"} · open ${age} day${age === 1 ? "" : "s"}`,
        status: "Open hold",
        overdue: isPast(due || raised),
      });
    }

    for (const s of ((data as any).signOffs ?? []) as any[]) {
      const raised = dayKey(s.since ?? new Date());
      const due = dueKey(s.since ?? new Date().toISOString(), TARGET_DAYS.signoff);
      out.push({
        id: `signoff-${s.id}`,
        kind: "signoff",
        day: due || raised,
        raised,
        dueLabel: "Chase the signature by",
        title: `${s.personName} to sign`,
        clientId: String(s.client_id),
        clientName: s.clientName ?? "—",
        fundName: null,
        detail: s.outstanding
          .map((o: any) => `${o.title} (v${o.version})`)
          .join(", "),
        status: `${s.outstanding.length} document${s.outstanding.length === 1 ? "" : "s"}`,
        overdue: isPast(due || raised),
      });
    }

    for (const i of ((data as any).invoices ?? []) as any[]) {
      const raised = plainDayKey(i.issue_date) || dayKey(i.created_at);
      const due = plainDayKey(i.due_date) || raised;
      out.push({
        id: `invoice-${i.id}`,
        kind: "payment",
        day: due,
        raised,
        dueLabel: "Payment due by",
        title: `${i.number ?? "Invoice"} ${money(i.total_cents) ?? ""}`.trim(),
        clientId: String(i.client_id),
        clientName: i.clientName ?? "—",
        fundName: i.fundName ?? null,
        detail: `${String(i.status).replace(/_/g, " ")}${
          i.approval_status ? ` · client approval ${String(i.approval_status).replace(/_/g, " ")}` : ""
        }`,
        status: "Unpaid",
        overdue: isPast(due),
      });
    }

    for (const p of ((data as any).declaredPayments ?? []) as any[]) {
      const raised = plainDayKey(p.client_paid_on) || dayKey(p.client_payment_declared_at);
      const due = dueKey(p.client_payment_declared_at, TARGET_DAYS.match) || raised;
      out.push({
        id: `declared-${p.id}`,
        kind: "payment",
        day: due,
        raised,
        dueLabel: "Match against the bank by",
        title: `${p.number ?? "Invoice"} reported paid`,
        clientId: String(p.client_id),
        clientName: p.clientName ?? "—",
        fundName: p.fundName ?? null,
        detail: `${(p.client_payment_method ?? "payment").toString().toUpperCase()} · reference ${
          p.client_payment_reference ?? "none given"
        }`,
        status: "Awaiting matching",
        overdue: isPast(due),
      });
    }

    return out.filter((i) => i.day);
  }, [data]);

  const visible = useMemo(
    () =>
      items.filter(
        (i) =>
          (clientFilter === "all" || i.clientId === clientFilter) &&
          (kindFilter === "all" || i.kind === kindFilter),
      ),
    [items, clientFilter, kindFilter],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of visible) {
      const list = map.get(item.day) ?? [];
      list.push(item);
      map.set(item.day, list);
    }
    return map;
  }, [visible]);

  const grid = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const offset = (first.getDay() + 6) % 7; // Monday-first
    const start = new Date(cursor.year, cursor.month, 1 - offset);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      return { date: d, key: dayKey(d), inMonth: d.getMonth() === cursor.month };
    });
  }, [cursor]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading the calendar…</p>;
  if (error) {
    return (
      <p className="text-sm text-destructive">{(error as Error).message || "That didn't load."}</p>
    );
  }
  if (!data) return null;

  if (data.clients.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">No clients assigned to you yet</CardTitle>
          <CardDescription>
            Ask an administrator to add you to the clients you look after. The calendar fills in
            from the requests, fee proposals and holds on those clients.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const todayKey = dayKey(new Date());
  const selectedItems = selected ? (byDay.get(selected) ?? []) : [];
  const overdueItems = visible
    .filter((i) => i.overdue)
    .sort((a, b) => a.day.localeCompare(b.day));
  const monthCount = visible.filter((i) => {
    const [y, m] = i.day.split("-").map(Number);
    return y === cursor.year && (m ?? 0) - 1 === cursor.month;
  }).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setCursor((c) =>
                c.month === 0 ? { year: c.year - 1, month: 11 } : { ...c, month: c.month - 1 },
              )
            }
          >
            Previous
          </Button>
          <span className="min-w-[10rem] text-center font-medium">{monthLabel}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setCursor((c) =>
                c.month === 11 ? { year: c.year + 1, month: 0 } : { ...c, month: c.month + 1 },
              )
            }
          >
            Next
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const now = new Date();
              setCursor({ year: now.getFullYear(), month: now.getMonth() });
              setSelected(dayKey(now));
            }}
          >
            Today
          </Button>
        </div>

        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="All clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            {(data.clients as any[]).map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as "all" | Kind)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Everything" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everything</SelectItem>
            <SelectItem value="request">Requests only</SelectItem>
            <SelectItem value="quote">Quotes only</SelectItem>
            <SelectItem value="hold">Holds only</SelectItem>
            <SelectItem value="signoff">Sign-offs only</SelectItem>
            <SelectItem value="payment">Payments only</SelectItem>
          </SelectContent>
        </Select>

        {data.isAdmin ? (
          <Button variant="outline" size="sm" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Show only my clients" : "Show every client"}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${KIND_DOT.request}`} /> Requests
        </span>
        <span className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${KIND_DOT.quote}`} /> Quotes
        </span>
        <span className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${KIND_DOT.hold}`} /> Holds
        </span>
        <span>
          {monthCount} item{monthCount === 1 ? "" : "s"} due this month
        </span>
        <span>Each item sits on the day it is due.</span>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <div className="grid grid-cols-7 border-b bg-muted/50 text-xs font-medium">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-2 text-center">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {grid.map((cell) => {
            const dayItems = byDay.get(cell.key) ?? [];
            const isSelected = selected === cell.key;
            return (
              <button
                type="button"
                key={cell.key}
                onClick={() => setSelected(cell.key)}
                className={[
                  "min-h-24 border-b border-r p-2 text-left align-top transition-colors",
                  cell.inMonth ? "" : "bg-muted/30 text-muted-foreground",
                  isSelected ? "ring-2 ring-inset ring-primary" : "hover:bg-muted/40",
                ].join(" ")}
                aria-label={`${longDay(cell.key)} — ${dayItems.length} item${dayItems.length === 1 ? "" : "s"} due`}
              >
                <span
                  className={[
                    "text-xs",
                    cell.key === todayKey ? "rounded bg-primary px-1.5 py-0.5 text-primary-foreground" : "",
                  ].join(" ")}
                >
                  {cell.date.getDate()}
                </span>
                <div className="mt-1 space-y-1">
                  {dayItems.slice(0, 3).map((item) => (
                    <div key={item.id} className="flex items-center gap-1 text-[11px] leading-tight">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${KIND_DOT[item.kind]}`} />
                      <span className={`truncate ${item.overdue ? "text-destructive" : ""}`}>
                        {item.clientName}: {item.title}
                      </span>
                    </div>
                  ))}
                  {dayItems.length > 3 ? (
                    <div className="text-[11px] text-muted-foreground">
                      +{dayItems.length - 3} more
                    </div>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {selected ? longDay(selected) : "Pick a day"}
          </CardTitle>
          <CardDescription>
            {selectedItems.length === 0
              ? "Nothing is due on this day."
              : `${selectedItems.length} item${selectedItems.length === 1 ? "" : "s"} due for your team.`}
          </CardDescription>
        </CardHeader>
        {selectedItems.length > 0 ? (
          <CardContent className="space-y-3">
            {selectedItems.map((item) => (
              <div key={item.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">
                    {item.clientName}: {item.title}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{KIND_LABEL[item.kind]}</Badge>
                    <Badge variant={item.overdue ? "destructive" : "secondary"}>
                      {dueWording(item.day)}
                    </Badge>
                    <Badge variant="secondary">{item.status}</Badge>
                  </div>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {item.fundName ? `${item.fundName} · ` : ""}
                  {item.detail}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.dueLabel} {longDay(item.day)}
                  {item.raised ? ` · raised ${longDay(item.raised)}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link to="/admin/pricing">Open in Pricing and agreements</Link>
                  </Button>
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/admin/contracts/$clientId" params={{ clientId: item.clientId }}>
                      Open client
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Past their due date</CardTitle>
          <CardDescription>
            Requests, fee proposals and holds whose due date has already passed, oldest first.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {overdueItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing is overdue right now.</p>
          ) : (
            overdueItems.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
              >
                <div>
                  <span className="font-medium">
                    {item.clientName}: {item.title}
                  </span>
                  <span className="text-muted-foreground"> · {item.detail}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{KIND_LABEL[item.kind]}</Badge>
                  <Badge variant="destructive">{dueWording(item.day)}</Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const [y, m] = item.day.split("-").map(Number);
                      if (y && m) setCursor({ year: y, month: m - 1 });
                      setSelected(item.day);
                    }}
                  >
                    Show on calendar
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
