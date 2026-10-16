import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  clientServicesFn, decideClientServiceFn, decideMenuSwitchFn, pauseRemindersFn, requestMenuSwitchFn, saveClientServiceFn, sendPaymentReminderFn,
} from "@/lib/billing-records.functions";

const usd = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const CADENCE: Record<string, string> = { annual: "Yearly", quarterly: "Quarterly", one_time: "One-time" };

/** Staff-only: what a current client has, approvals, menu switch and reminder controls. */
export function ClientServicesPanel({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(clientServicesFn);
  const q = useQuery({ queryKey: ["client-services", clientId], queryFn: () => load({ data: { clientId } }), retry: false, staleTime: 30_000 });
  const save = useServerFn(saveClientServiceFn);
  const decide = useServerFn(decideClientServiceFn);
  const reqSwitch = useServerFn(requestMenuSwitchFn);
  const decideSwitch = useServerFn(decideMenuSwitchFn);
  const pause = useServerFn(pauseRemindersFn);
  const remind = useServerFn(sendPaymentReminderFn);
  const [form, setForm] = useState({ serviceKey: "", cadence: "annual" as "annual" | "quarterly" | "one_time", amount: "", startDate: new Date().toISOString().slice(0, 10), cardAutopay: false });
  const refresh = () => qc.invalidateQueries({ queryKey: ["client-services", clientId] });
  const run = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast.success(ok); refresh(); } catch (e) { toast.error((e as Error).message); } };
  const askNote = (msg: string, required: boolean) => { const n = window.prompt(msg) ?? null; if (required && !n?.trim()) return undefined; return n; };

  if (q.isLoading) return <section className="rounded-lg border p-4 text-sm text-muted-foreground">Loading services…</section>;
  if (q.error) return null; // staff-only; nothing to show otherwise
  const d = q.data!;
  const groups = [...new Set(d.catalog.map((c) => c.group))];
  const pending = (d.switches as any[]).find((s) => s.status === "pending");
  const gated = d.client.menu_gating === "entitlements";
  const decideWithNote = (maker: string, approveFn: (note: string | null) => Promise<unknown>, ok: string) => {
    const mine = maker === d.me;
    if (mine && !d.isSuperAdmin) return toast.error("A different staff member must approve this.");
    const note = mine ? askNote("Reason for approving your own entry (required, logged):", true) : null;
    if (mine && note === undefined) return;
    run(() => approveFn(note ?? null), ok);
  };

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg">Services this client has</h2>
        <Badge variant={gated ? "default" : "outline"}>{gated ? "Menu: purchased services only" : "Menu: full (legacy)"}</Badge>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1">Service</th><th>Billing</th><th>Amount</th><th>Start</th><th>Next due</th><th>Status</th><th /></tr></thead>
          <tbody>
            {(d.records as any[]).map((r) => (
              <tr key={r.id} className="border-t align-top">
                <td className="py-2">{r.label}{r.card_autopay && <span className="ml-1 text-xs text-muted-foreground">(card autopay)</span>}</td>
                <td>{CADENCE[r.cadence]}</td><td>{usd(Number(r.amount_cents))}</td><td>{r.start_date}</td><td>{r.next_due ?? "—"}</td>
                <td><Badge variant={r.status === "active" ? "default" : "outline"}>{r.status === "proposed" ? "Waiting for approval" : r.status}</Badge>{r.reminders_paused && <Badge variant="outline" className="ml-1">Reminders paused</Badge>}</td>
                <td className="space-x-1 whitespace-nowrap text-right">
                  {r.status === "proposed" && d.canPrepare && <>
                    <Button size="sm" variant="outline" onClick={() => decideWithNote(r.proposed_by, (note) => decide({ data: { id: r.id, action: "approve", note } }), "Service approved")}>Approve</Button>
                    <Button size="sm" variant="ghost" onClick={() => { const n = askNote("Reason for declining:", true); if (n !== undefined) run(() => decide({ data: { id: r.id, action: "decline", note: n } }), "Declined"); }}>Decline</Button>
                  </>}
                  {r.status === "active" && d.canManageReminders && <>
                    {!r.card_autopay && <Button size="sm" variant="outline" onClick={() => run(() => remind({ data: { recordId: r.id } }), "Reminder sent")}>Send reminder</Button>}
                    <Button size="sm" variant="ghost" onClick={() => { if (r.reminders_paused) run(() => pause({ data: { recordId: r.id, paused: false } }), "Reminders resumed"); else { const n = askNote("Why pause reminders?", true); if (n !== undefined) run(() => pause({ data: { recordId: r.id, paused: true, reason: n } }), "Reminders paused"); } }}>{r.reminders_paused ? "Resume" : "Pause"}</Button>
                  </>}
                  {r.status === "active" && d.canPrepare && <Button size="sm" variant="ghost" onClick={() => { if (window.confirm(`End ${r.label}?`)) run(() => decide({ data: { id: r.id, action: "end" } }), "Service ended"); }}>End</Button>}
                </td>
              </tr>
            ))}
            {!d.records.length && <tr><td colSpan={7} className="py-3 text-muted-foreground">No services recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {d.canPrepare && (
        <form className="grid gap-3 rounded-md border p-3 md:grid-cols-6" onSubmit={(e) => {
          e.preventDefault();
          if (!form.serviceKey) return toast.error("Pick a service.");
          const cents = Math.round(Number(form.amount || 0) * 100);
          run(() => save({ data: { clientId, serviceKey: form.serviceKey, cadence: form.cadence, amountCents: cents, startDate: form.startDate, cardAutopay: form.cardAutopay } }), "Service added - waiting for a second person to approve");
          setForm((f) => ({ ...f, serviceKey: "", amount: "" }));
        }}>
          <div className="md:col-span-2"><Label>Service</Label>
            <select className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={form.serviceKey} onChange={(e) => setForm({ ...form, serviceKey: e.target.value })}>
              <option value="">Choose…</option>
              {groups.map((g) => <optgroup key={g} label={g}>{d.catalog.filter((c) => c.group === g).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</optgroup>)}
            </select></div>
          <div><Label>Billing</Label>
            <select className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={form.cadence} onChange={(e) => setForm({ ...form, cadence: e.target.value as never })}>
              <option value="annual">Yearly</option><option value="quarterly">Quarterly</option><option value="one_time">One-time</option>
            </select></div>
          <div><Label>Amount (USD)</Label><Input className="mt-1" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^0-9.]/g, "") })} /></div>
          <div><Label>Start date</Label><Input className="mt-1" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
          <div className="flex flex-col justify-between"><Label className="flex items-center gap-2"><Switch checked={form.cardAutopay} onCheckedChange={(v) => setForm({ ...form, cardAutopay: v })} />Card autopay</Label><Button type="submit" size="sm">Add service</Button></div>
        </form>
      )}

      <div className="rounded-md border p-3 text-sm">
        <p className="font-medium">Purchased-services menu</p>
        {gated ? <p className="text-muted-foreground">This client only sees what they've purchased.</p> : <>
          <p className="text-muted-foreground">If switched now, they would lose: {d.preview.wouldLose.length ? d.preview.wouldLose.join(", ") : "nothing"}.</p>
          {pending ? (
            <div className="mt-2 flex flex-wrap items-center gap-2"><Badge variant="outline">Switch waiting for approval</Badge>
              {d.canPrepare && <>
                <Button size="sm" variant="outline" onClick={() => decideWithNote(pending.requested_by, (note) => decideSwitch({ data: { requestId: pending.id, approve: true, note } }), "Menu switched")}>Approve switch</Button>
                <Button size="sm" variant="ghost" onClick={() => { const n = askNote("Reason for declining:", true); if (n !== undefined) run(() => decideSwitch({ data: { requestId: pending.id, approve: false, note: n } }), "Declined"); }}>Decline</Button>
              </>}
            </div>
          ) : d.canPrepare && <Button size="sm" className="mt-2" variant="outline" onClick={() => run(() => reqSwitch({ data: { clientId } }), "Switch requested - a second person must approve")}>Switch to purchased-services menu</Button>}
        </>}
      </div>

      {!!d.payments.length && (
        <div className="text-sm"><p className="font-medium">Recorded migration payments</p>
          <ul className="mt-1 space-y-1">{(d.payments as any[]).map((p) => <li key={p.id} className="text-muted-foreground">{p.paid_on} · {usd(Number(p.amount_cents))} by {p.method} · covers {p.period_start ?? "?"} to {p.period_end ?? "?"} · <span className="font-medium text-foreground">{p.status}</span></li>)}</ul>
        </div>
      )}

      {!!d.events.length && (
        <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">History ({d.events.length})</summary>
          <ul className="mt-2 space-y-1">{(d.events as any[]).map((e, i) => <li key={i} className="text-muted-foreground">{new Date(e.created_at).toLocaleString()} · {String(e.event_kind).replace(/_/g, " ")}{e.detail?.service ? ` · ${e.detail.service}` : ""}{e.detail?.note ? ` · “${e.detail.note}”` : ""}</li>)}</ul>
        </details>
      )}
    </section>
  );
}
