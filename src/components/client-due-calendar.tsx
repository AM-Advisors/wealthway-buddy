import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type DueItem = {
  id: string;
  date: string; // yyyy-mm-dd
  kind: "invoice" | "request" | "agreement";
  label: string;
  detail?: string | null;
};

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function readableDay(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

const KIND_LABEL: Record<DueItem["kind"], string> = {
  invoice: "Invoice",
  request: "Request",
  agreement: "Agreement",
};

const KIND_DOT: Record<DueItem["kind"], string> = {
  invoice: "bg-primary",
  request: "bg-accent",
  agreement: "bg-muted-foreground",
};

/** Month view of everything with a date attached: invoices, requests and agreements. */
export function ClientDueCalendar({ items }: { items: DueItem[] }) {
  const today = new Date();
  const todayKey = ymd(today);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, DueItem[]>();
    for (const item of items) {
      if (!item.date) continue;
      const key = item.date.slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return map;
  }, [items]);

  const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const leading = (firstOfMonth.getDay() + 6) % 7; // Monday first
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) =>
      ymd(new Date(cursor.getFullYear(), cursor.getMonth(), i + 1)),
    ),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthKeys = cells.filter(Boolean) as string[];
  const monthCount = monthKeys.reduce((sum, key) => sum + (byDay.get(key)?.length ?? 0), 0);

  const overdue = items
    .filter((i) => i.kind === "invoice" && i.date.slice(0, 10) < todayKey)
    .sort((a, b) => a.date.localeCompare(b.date));

  const selectedItems = selected ? byDay.get(selected) ?? [] : [];

  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Dates to keep an eye on</CardTitle>
            <CardDescription>
              Invoice due dates, requests waiting on you and agreement dates in one month view.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
              }
            >
              Previous
            </Button>
            <span className="min-w-[8rem] flex-1 text-center sm:flex-none text-sm font-medium">
              {cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
              }
            >
              Next
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {monthCount === 0 ? "Nothing falls in this month." : `${monthCount} dated items this month.`}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((key, idx) => {
            if (!key) return <div key={`pad-${idx}`} className="min-h-12 rounded-md sm:min-h-16" />;
            const dayItems = byDay.get(key) ?? [];
            const isToday = key === todayKey;
            const isSelected = key === selected;
            const isLate = dayItems.some((i) => i.kind === "invoice") && key < todayKey;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(isSelected ? null : key)}
                className={`min-h-12 rounded-md border p-1 sm:min-h-16 text-left transition-colors hover:bg-muted/60 ${
                  isSelected ? "border-primary bg-muted/60" : ""
                } ${isToday ? "border-primary" : ""} ${isLate ? "bg-destructive/10" : ""}`}
              >
                <span className={`text-xs ${isToday ? "font-semibold" : "text-muted-foreground"}`}>
                  {Number(key.slice(8, 10))}
                </span>
                <span className="mt-1 flex flex-wrap gap-1">
                  {dayItems.slice(0, 3).map((i) => (
                    <span
                      key={i.id}
                      className={`h-1.5 w-1.5 rounded-full ${KIND_DOT[i.kind]}`}
                      aria-hidden
                    />
                  ))}
                </span>
                {dayItems.length > 0 && (
                  <span className="mt-0.5 hidden truncate text-[10px] text-muted-foreground sm:block">
                    {dayItems.length === 1 ? dayItems[0]!.label : `${dayItems.length} items`}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          {(Object.keys(KIND_LABEL) as DueItem["kind"][]).map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${KIND_DOT[k]}`} aria-hidden />
              {KIND_LABEL[k]}
            </span>
          ))}
        </div>

        {selected && (
          <div className="rounded-md border p-3">
            <p className="text-sm font-medium">{readableDay(selected)}</p>
            {selectedItems.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">Nothing on this day.</p>
            )}
            <ul className="mt-2 space-y-2">
              {selectedItems.map((i) => (
                <li key={i.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm">{i.label}</p>
                    {i.detail && <p className="text-xs text-muted-foreground">{i.detail}</p>}
                  </div>
                  <Badge variant="outline">{KIND_LABEL[i.kind]}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}

        {overdue.length > 0 && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
            <p className="text-sm font-medium">Past their due date</p>
            <ul className="mt-2 space-y-1">
              {overdue.slice(0, 5).map((i) => (
                <li key={i.id} className="text-xs text-muted-foreground">
                  {i.label} — was due {i.date.slice(0, 10)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
