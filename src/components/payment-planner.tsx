import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getPaymentPlans, savePaymentPlan } from "@/lib/payment-planning.functions";
import { paymentPlanDates, selectedPaymentTotals, type PaymentCadence, type PlanningPayment, type ReportingCadence } from "@/lib/payment-planning";

export function PaymentPlanner({ rows, scope, title = "Payment calculations" }: { rows: PlanningPayment[]; scope: "invoices" | "fund_invoices" | "client_payments" | "commissions"; title?: string }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [reporting, setReporting] = useState<ReportingCadence>("monthly");
  const [cadence, setCadence] = useState<PaymentCadence>("quarterly");
  const [first, setFirst] = useState(new Date().toISOString().slice(0, 10));
  const qc = useQueryClient();
  const load = useServerFn(getPaymentPlans); const save = useServerFn(savePaymentPlan);
  const plans = useQuery({ queryKey: ["payment-plans", scope], queryFn: () => load({ data: { scope } }) });
  const eligible = rows.filter(r => !["draft", "void", "cancelled", "canceled", "rejected"].includes(r.status));
  const chosen = eligible.filter(r => selected.includes(r.id));
  const totals = selectedPaymentTotals(eligible, selected, reporting);
  const format = (cents: number, currency = "USD") => (cents / 100).toLocaleString("en-US", { style: "currency", currency });
  let dates: string[] = []; try { dates = paymentPlanDates(first, cadence); } catch { /* Invalid date disables saving. */ }
  const mutation = useMutation({ mutationFn: () => save({ data: { scope, cadence, firstDueOn: first, items: chosen.map(r => ({ id: r.id, ...(r.lineId ? { lineId: r.lineId, userId: r.userId, layer: r.layer } : {}) })) } }), onSuccess: () => { toast.success("Payment schedule saved. No money is sent."); qc.invalidateQueries({ queryKey: ["payment-plans", scope] }); }, onError: (e: Error) => toast.error(e.message) });
  return <section className="space-y-4 border-y py-5" aria-label={title}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold">{title}</h2><Button size="sm" variant="outline" disabled={!eligible.length} onClick={() => setSelected(chosen.length === eligible.length ? [] : eligible.map(r => r.id))}>{chosen.length === eligible.length && eligible.length ? "Clear selection" : "Select all"}</Button></div>
    <div className="space-y-2"><Label>Show totals</Label><ToggleGroup type="single" variant="outline" value={reporting} onValueChange={v => { if (v) setReporting(v as ReportingCadence); }}>{(["monthly", "quarterly", "annual"] as const).map(v => <ToggleGroupItem key={v} value={v} className="capitalize">{v}</ToggleGroupItem>)}</ToggleGroup></div>
    <div className="max-h-64 space-y-2 overflow-y-auto">{eligible.map(r => <label key={r.id} className="flex items-start gap-3 border-b py-2 text-sm"><Checkbox checked={selected.includes(r.id)} onCheckedChange={v => setSelected(p => v ? [...new Set([...p, r.id])] : p.filter(id => id !== r.id))} /><span className="min-w-0 flex-1 break-words">{r.label}<span className="block text-xs text-muted-foreground">{r.date ?? "Date not recorded"} · {r.status.replace(/_/g, " ")}</span></span><span className="shrink-0 tabular-nums">{format(r.cents, r.currency)}</span></label>)}{!eligible.length && <p className="text-sm text-muted-foreground">No eligible payments on this page.</p>}</div>
    <div aria-live="polite" className="space-y-1 text-sm"><p className="font-medium">{chosen.length} selected</p>{totals.map(t => <div key={`${t.period}-${t.currency}`} className="flex justify-between gap-3"><span>{t.period} · {t.count} selected</span><strong>{format(t.cents, t.currency)}</strong></div>)}</div>
    <div className="space-y-3 border-t pt-4"><h3 className="text-sm font-semibold">Payment schedule · planning only</h3><div className="flex flex-wrap items-end gap-4"><div className="space-y-2"><Label>Pay schedule</Label><ToggleGroup type="single" variant="outline" value={cadence} onValueChange={v => { if (v) setCadence(v as PaymentCadence); }}><ToggleGroupItem value="quarterly">Quarterly</ToggleGroupItem><ToggleGroupItem value="annual">Annual</ToggleGroupItem></ToggleGroup></div><div className="space-y-2"><Label>First payment date</Label><Input aria-label="First payment date" type="date" value={first} onChange={e => setFirst(e.target.value)} /></div><Button disabled={!chosen.length || !dates.length || mutation.isPending} onClick={() => mutation.mutate()}>Save payment plan</Button></div><p className="text-xs text-muted-foreground">{dates.join(" · ")}</p><p className="text-xs text-muted-foreground">Planning record only. Invoice due dates, signed billing terms and commission payout deadlines remain unchanged. Payments are recorded separately.</p>
    {plans.error && <p role="alert" className="text-sm text-destructive">{plans.error.message}</p>}
    {(plans.data ?? []).filter(p => Array.isArray(p.items) && p.items.some((i: any) => eligible.some(r => r.id === i.id))).slice(0, 3).map(p => <p key={p.id} className="text-xs text-muted-foreground">Saved {p.cadence} plan · first {p.first_due_on} · {Array.isArray(p.items) ? p.items.length : 0} selected</p>)}</div>
  </section>;
}