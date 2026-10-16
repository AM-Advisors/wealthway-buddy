import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { decideMigrationPaymentFn, fundMigrationPaymentsFn, recordMigrationPaymentFn } from "@/lib/billing-records.functions";

const usd = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

/** Staff-only record of what a migrated fund already paid Harmonious and what it covers. Record only - nothing is charged. */
export function MigrationPaymentsCard({ fundId }: { fundId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(fundMigrationPaymentsFn);
  const q = useQuery({ queryKey: ["migration-payments", fundId], queryFn: () => load({ data: { offeringId: fundId } }), retry: false, staleTime: 30_000 });
  const record = useServerFn(recordMigrationPaymentFn);
  const decide = useServerFn(decideMigrationPaymentFn);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ amount: "", paidOn: "", method: "wire" as const as string, periodStart: "", periodEnd: "", keys: [] as string[], note: "" });
  if (q.isLoading || q.error || !q.data) return null;
  const d = q.data;
  const refresh = () => qc.invalidateQueries({ queryKey: ["migration-payments", fundId] });
  const run = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast.success(ok); refresh(); } catch (e) { toast.error((e as Error).message); } };
  const confirm = (p: any) => {
    const mine = p.recorded_by === d.me;
    if (mine && !d.isSuperAdmin) return toast.error("A different staff member must confirm this.");
    const note = mine ? window.prompt("Reason for confirming your own record (required, logged):") : null;
    if (mine && !note?.trim()) return;
    run(() => decide({ data: { id: p.id, confirm: true, note } }), "Payment confirmed");
  };

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <header className="flex flex-wrap items-center gap-2">
        <div className="mr-auto"><h3 className="text-base font-medium">What this fund already paid</h3><p className="text-xs text-muted-foreground">For migrated funds. A record only - nothing is charged and no money moves.</p></div>
        {d.canPrepare && <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>{open ? "Cancel" : "Record a payment"}</Button>}
      </header>
      {open && (
        <form className="grid gap-3 rounded-md border p-3 md:grid-cols-3" onSubmit={(e) => {
          e.preventDefault();
          if (!f.amount || !f.paidOn) return toast.error("Amount and date paid are required.");
          run(() => record({ data: { offeringId: fundId, amountCents: Math.round(Number(f.amount) * 100), paidOn: f.paidOn, method: f.method as never, periodStart: f.periodStart || null, periodEnd: f.periodEnd || null, serviceKeys: f.keys, note: f.note || null } }), "Recorded - waiting for Finance to confirm");
          setOpen(false);
        }}>
          <div><Label>Amount paid (USD)</Label><Input className="mt-1" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^0-9.]/g, "") })} /></div>
          <div><Label>Date paid</Label><Input className="mt-1" type="date" value={f.paidOn} onChange={(e) => setF({ ...f, paidOn: e.target.value })} /></div>
          <div><Label>Method</Label><select className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{["wire", "ach", "card", "check", "other"].map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}</select></div>
          <div><Label>Covers from</Label><Input className="mt-1" type="date" value={f.periodStart} onChange={(e) => setF({ ...f, periodStart: e.target.value })} /></div>
          <div><Label>Covers to</Label><Input className="mt-1" type="date" value={f.periodEnd} onChange={(e) => setF({ ...f, periodEnd: e.target.value })} /></div>
          <div><Label>Note</Label><Input className="mt-1" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
          <fieldset className="md:col-span-3"><legend className="text-sm font-medium">Services included</legend>
            <div className="mt-1 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">{d.catalog.map((c) => (
              <label key={c.key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.keys.includes(c.key)} onChange={(e) => setF({ ...f, keys: e.target.checked ? [...f.keys, c.key] : f.keys.filter((k) => k !== c.key) })} />{c.label}</label>
            ))}</div></fieldset>
          <div className="md:col-span-3"><Button type="submit" size="sm">Save record</Button></div>
        </form>
      )}
      <ul className="space-y-2 text-sm">
        {(d.payments as any[]).map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2 border-t pt-2">
            <span className="font-medium">{usd(Number(p.amount_cents))}</span><span className="text-muted-foreground">{p.paid_on} · {String(p.method).toUpperCase()} · covers {p.period_start ?? "?"} to {p.period_end ?? "?"}</span>
            <span className="text-xs text-muted-foreground">{(p.included_service_keys ?? []).map((k: string) => d.catalog.find((c) => c.key === k)?.label ?? k).join(", ")}</span>
            <Badge variant={p.status === "confirmed" ? "default" : "outline"} className="ml-auto">{p.status === "pending" ? "Waiting for Finance" : p.status}</Badge>
            {p.status === "pending" && d.canConfirm && <>
              <Button size="sm" variant="outline" onClick={() => confirm(p)}>Confirm</Button>
              <Button size="sm" variant="ghost" onClick={() => { const n = window.prompt("Reason for rejecting:"); if (n?.trim()) run(() => decide({ data: { id: p.id, confirm: false, note: n } }), "Rejected"); }}>Reject</Button>
            </>}
          </li>
        ))}
        {!d.payments.length && <li className="text-muted-foreground">No payments recorded.</li>}
      </ul>
      {!d.fund?.client_id && <p className="text-xs text-muted-foreground">This fund has no client yet, so payments won't count toward a client's renewals until one is linked.</p>}
    </section>
  );
}
