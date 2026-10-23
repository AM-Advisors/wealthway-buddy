import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { paymentRemindersFn, pauseRemindersFn, sendPaymentReminderFn } from "@/lib/billing-records.functions";

export const Route = createFileRoute("/_authenticated/ops/payment-reminders")({
  head: () => ({
    meta: [
      { title: "Payment reminders | Harmonious operations" },
      { name: "description", content: "Upcoming, due and overdue service renewals for current clients, with reminder controls." },
      { property: "og:title", content: "Payment reminders | Harmonious operations" },
      { property: "og:description", content: "Upcoming, due and overdue service renewals for current clients, with reminder controls." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PaymentRemindersPage,
});

const usd = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const TABS = [["overdue", "Overdue"], ["due", "Due today"], ["upcoming", "Next 30 days"], ["later", "Later"]] as const;

function PaymentRemindersPage() {
  const qc = useQueryClient();
  const load = useServerFn(paymentRemindersFn);
  const q = useQuery({ queryKey: ["payment-reminders"], queryFn: () => load(), retry: false, staleTime: 30_000 });
  const remind = useServerFn(sendPaymentReminderFn);
  const pause = useServerFn(pauseRemindersFn);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("overdue");
  const run = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast.success(ok); qc.invalidateQueries({ queryKey: ["payment-reminders"] }); } catch (e) { toast.error((e as Error).message); } };
  const rows = (q.data?.rows ?? []) as any[];
  const shown = rows.filter((r) => r.bucket === tab);
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-3xl">Payment reminders</h1>
        <p className="mt-1 text-sm text-muted-foreground">Renewals from each client's services. Emails go out 30 and 7 days before, on the due date, and 7 and 14 days late, with operations@ copied. Card-autopay services aren't emailed. Reminders never charge or move money.</p>
      </header>
      <div className="flex flex-wrap gap-2">{TABS.map(([k, label]) => (
        <Button key={k} size="sm" variant={tab === k ? "default" : "outline"} onClick={() => setTab(k)}>{label} ({rows.filter((r) => r.bucket === k).length})</Button>
      ))}</div>
      {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="p-2">Client</th><th>Service</th><th>Amount</th><th>Due</th><th>Last reminder</th><th>Status</th><th /></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2"><Link to="/ops/clients/$clientId" params={{ clientId: r.client_id }} search={{ tab: undefined }} className="text-primary hover:underline">{r.client_name}</Link></td>
                <td>{r.label}</td><td>{usd(Number(r.amount_cents))}</td><td>{r.due_on}</td>
                <td>{r.last_sent_at ? new Date(r.last_sent_at).toLocaleDateString() : " · "}</td>
                <td>{r.card_autopay ? <Badge variant="outline">Card autopay</Badge> : r.reminders_paused ? <Badge variant="outline">Paused</Badge> : <Badge>Emailing</Badge>}</td>
                <td className="space-x-1 whitespace-nowrap p-2 text-right">{q.data?.canManage && !r.card_autopay && <>
                  <Button size="sm" variant="outline" onClick={() => run(() => remind({ data: { recordId: r.id } }), "Reminder sent")}>Send now</Button>
                  <Button size="sm" variant="ghost" onClick={() => { if (r.reminders_paused) run(() => pause({ data: { recordId: r.id, paused: false } }), "Resumed"); else { const n = window.prompt("Why pause reminders?"); if (n?.trim()) run(() => pause({ data: { recordId: r.id, paused: true, reason: n } }), "Paused"); } }}>{r.reminders_paused ? "Resume" : "Pause"}</Button>
                </>}</td>
              </tr>
            ))}
            {!shown.length && !q.isLoading && <tr><td colSpan={7} className="p-4 text-muted-foreground">Nothing here.</td></tr>}
          </tbody>
        </table>
      </div>
    </main>
  );
}
