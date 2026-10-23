import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";

import { listReminderTracking } from "@/lib/reminder-tracking.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/ops/reminders")({
  head: () => ({
    meta: [
      { title: "Reminder tracking - Harmonious Operations" },
      { name: "description", content: "Delivery, open, click and in-portal read rates for reminder emails." },
      { property: "og:title", content: "Reminder tracking - Harmonious Operations" },
      { property: "og:description", content: "Delivery, open, click and in-portal read rates for reminder emails." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RemindersPage,
});

const fmt = (s: string | null) => (s ? new Date(s).toLocaleString() : "—");
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");

function RemindersPage() {
  const load = useServerFn(listReminderTracking);
  const [days, setDays] = useState(30);
  const [q, setQ] = useState("");
  const query = useQuery({ queryKey: ["reminder-tracking", days], queryFn: () => load({ data: { days } }) });
  const all = query.data?.reminders ?? [];
  const rows = useMemo(() => all.filter((r) => !q || `${r.document} ${r.recipient} ${r.fund ?? ""}`.toLowerCase().includes(q.toLowerCase())), [all, q]);
  const tracked = rows.filter((r) => r.tracked);
  const stats = [
    { label: "Sent", value: String(rows.length) },
    { label: "Delivered", value: pct(tracked.filter((r) => r.deliveredAt).length, tracked.length) },
    { label: "Bounced", value: pct(tracked.filter((r) => r.bouncedAt).length, tracked.length) },
    { label: "Opened (estimate)", value: pct(tracked.filter((r) => r.firstOpenedAt).length, tracked.length) },
    { label: "Clicked", value: pct(tracked.filter((r) => r.firstClickedAt).length, tracked.length) },
    { label: "Read in portal", value: pct(rows.filter((r) => r.readInPortalAt).length, rows.filter((r) => r.inInbox).length) },
  ];
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground">Reminder tracking</h1>
        <p className="text-sm text-muted-foreground">Every reminder email, and whether it was delivered, opened, clicked and read in the portal. Opens are estimates — some email apps block or pre-load them.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Input placeholder="Search document, person or fund" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
        <select className="rounded-md border border-input bg-background px-3 text-sm" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[7, 30, 90, 365].map((d) => <option key={d} value={d}>Last {d} days</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {stats.map((s) => (
          <Card key={s.label}><CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">{s.label}</CardTitle></CardHeader><CardContent className="text-2xl font-semibold text-foreground">{s.value}</CardContent></Card>
        ))}
      </div>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          {query.isLoading ? <p className="p-6 text-sm text-muted-foreground">Loading…</p> : query.error ? <p className="p-6 text-sm text-destructive">{(query.error as Error).message}</p> : !rows.length ? <p className="p-6 text-sm text-muted-foreground">No reminders in this period.</p> : (
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs text-muted-foreground">
                <tr>{["Sent", "Document", "To", "Fund", "Status", "Opened", "Clicked", "Read in portal"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 whitespace-nowrap">{fmt(r.createdAt)}<div className="text-xs text-muted-foreground">{r.sentBy ?? ""}</div></td>
                    <td className="px-3 py-2">{r.document}</td>
                    <td className="px-3 py-2">{r.recipient}</td>
                    <td className="px-3 py-2">{r.fund ?? "—"}</td>
                    <td className="px-3 py-2">
                      {!r.accepted ? <Badge variant="destructive">Not sent</Badge>
                        : r.bouncedAt ? <Badge variant="destructive" title={r.bounceReason ?? ""}>Bounced</Badge>
                        : r.deliveredAt ? <Badge>Delivered</Badge>
                        : r.tracked ? <Badge variant="secondary">Sent</Badge>
                        : <Badge variant="outline">Sent (no tracking)</Badge>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.firstOpenedAt ? `${fmt(r.firstOpenedAt)} · ${r.openCount}×` : "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.firstClickedAt ? `${fmt(r.firstClickedAt)} · ${r.clickCount}×` : "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.inInbox ? fmt(r.readInPortalAt) : "Not in portal"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
