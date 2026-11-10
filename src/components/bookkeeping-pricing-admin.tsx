import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getBookkeepingConfiguration, saveBookkeepingConfiguration } from "@/lib/bookkeeping.functions";
import { type BookkeepingConfig } from "@/lib/bookkeeping-model";
import { ADDONS, BOOKKEEPING_OPTIONS } from "@/lib/bookkeeping-options";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const toCents = (v: string) => v === "" ? null : Math.round(Number(v) * 100);
const toCount = (v: string) => v === "" ? null : Math.max(0, Math.round(Number(v)));
const PRICE_SLOTS = [["platform", "Platform access"], ["monthly", "Monthly"], ["quarterly", "Quarterly"], ["annual", "Annual"]] as const;

export function BookkeepingPricingAdmin() {
  const load = useServerFn(getBookkeepingConfiguration);
  const save = useServerFn(saveBookkeepingConfiguration);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["bookkeeping-proposed-configuration"], queryFn: () => load() });
  const [draft, setDraft] = useState<BookkeepingConfig | null>(null);
  const [effectiveOn, setEffectiveOn] = useState("");
  const [reason, setReason] = useState("");
  const m = useMutation({ mutationFn: () => { if (!q.data) throw new Error("Configuration not loaded."); return save({ data: { configuration: draft ?? q.data.configuration, effectiveOn, reason } }); }, onSuccess: () => { setDraft(null); setReason(""); void qc.invalidateQueries({ queryKey: ["bookkeeping-proposed-configuration"] }); toast.success("Proposed version recorded; nothing published or billed."); }, onError: (e: Error) => toast.error(e.message) });
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  if (!q.data) return <p className="text-sm text-muted-foreground">Loading proposed bookkeeping…</p>;
  const config = draft ?? q.data.configuration;
  const editable = q.data.canManage;
  const setOption = (i: number, next: BookkeepingConfig["options"][number]) => setDraft({ ...config, options: config.options.map((x, j) => j === i ? next : x) });
  const slotAllowed = (key: string, slot: string) => key === "self_service" ? slot === "platform" : slot !== "platform" && (BOOKKEEPING_OPTIONS[key as keyof typeof BOOKKEEPING_OPTIONS].frequencies as string[]).includes(slot);
  return <section className="space-y-5">
    <div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold">Bookkeeping</h2><Badge variant="secondary">Proposed · unpublished</Badge></div>
    <p className="text-sm text-muted-foreground">Leave a price blank to show "Request a quote". Prices stay proposed and are never shown to clients until a separately approved release. Fund Accounting is priced with fund services.</p>
    <Table><TableHeader><TableRow><TableHead>Option</TableHead>{PRICE_SLOTS.map(([, l]) => <TableHead key={l}>{l} ($/mo)</TableHead>)}</TableRow></TableHeader><TableBody>{config.options.map((o, i) => <TableRow key={o.key}><TableCell className="font-medium">{BOOKKEEPING_OPTIONS[o.key].name}</TableCell>{PRICE_SLOTS.map(([slot]) => <TableCell key={slot}>{slotAllowed(o.key, slot) ? <Input aria-label={`${BOOKKEEPING_OPTIONS[o.key].name} ${slot} monthly price`} type="number" min="0" placeholder="Request a quote" disabled={!editable} value={o.monthlyCents[slot] === null ? "" : Number(o.monthlyCents[slot]) / 100} onChange={e => setOption(i, { ...o, monthlyCents: { ...o.monthlyCents, [slot]: toCents(e.target.value) } })} /> : <span className="text-xs text-muted-foreground">Not offered</span>}</TableCell>)}</TableRow>)}</TableBody></Table>
    <div className="space-y-2"><h3 className="text-sm font-semibold">Scope limits</h3><p className="text-xs text-muted-foreground">Work beyond these limits triggers a scope review and an approved quote before additional charges. Blank means set in each quote.</p>
      <Table><TableHeader><TableRow><TableHead>Option</TableHead><TableHead>Entities</TableHead><TableHead>Bank and credit accounts</TableHead><TableHead>Monthly transactions</TableHead></TableRow></TableHeader><TableBody>{config.options.map((o, i) => <TableRow key={o.key}><TableCell className="font-medium">{BOOKKEEPING_OPTIONS[o.key].shortName}</TableCell>{(["entities", "financialAccounts", "monthlyTransactions"] as const).map(k => <TableCell key={k}><Input aria-label={`${BOOKKEEPING_OPTIONS[o.key].shortName} ${k}`} type="number" min="0" disabled={!editable} value={o.limits[k] ?? ""} onChange={e => setOption(i, { ...o, limits: { ...o.limits, [k]: k === "entities" ? (toCount(e.target.value) || null) : toCount(e.target.value) } })} /></TableCell>)}</TableRow>)}</TableBody></Table></div>
    <div className="space-y-2"><h3 className="text-sm font-semibold">Add-ons</h3><div className="grid gap-3 sm:grid-cols-2">{config.addons.map((a, i) => <div className="flex items-center justify-between gap-3 border-b py-2" key={a.key}><Label htmlFor={`bk-rate-${a.key}`}>{ADDONS.find(x => x.key === a.key)?.name ?? a.key}<span className="block text-xs text-muted-foreground">$ / {a.cadence.replace("_", " ")}</span></Label><Input id={`bk-rate-${a.key}`} className="w-32 shrink-0" type="number" min="0" placeholder="Request a quote" disabled={!editable} value={a.unitCents === null ? "" : a.unitCents / 100} onChange={e => setDraft({ ...config, addons: config.addons.map((x, j) => j === i ? { ...x, unitCents: toCents(e.target.value) } : x) })} /></div>)}</div></div>
    <div className="border-t pt-4 text-sm text-muted-foreground space-y-1">
      <p>Billing frequency is separate from service frequency: monthly / quarterly / annual invoices are ×1 / ×3 / ×12 of the monthly-equivalent price.</p>
      <p>Managed close: {config.closeBusinessDays.monthly ?? "agreed"} business days monthly, {config.closeBusinessDays.quarterly ?? "agreed"} quarterly, after period end and required records. Review: {config.reviewBusinessDays ?? "dates agreed in each engagement"}{config.reviewBusinessDays ? " business days" : ""}. Self-Service has no review or close schedule.</p>
      <p>Support levels only set response times; they never change scope, frequency or deadlines.</p>
      <p>Excluded unless separately contracted: {config.exclusions.join(", ")}.</p>
    </div>
    {editable && <div className="flex flex-wrap items-end gap-3"><div className="space-y-1"><Label htmlFor="bk-version-effective">Effective date</Label><Input id="bk-version-effective" type="date" value={effectiveOn} onChange={e => setEffectiveOn(e.target.value)} /></div><div className="min-w-48 flex-1 space-y-1"><Label htmlFor="bk-version-reason">Reason</Label><Input id="bk-version-reason" value={reason} onChange={e => setReason(e.target.value)} /></div><Button disabled={m.isPending || !effectiveOn || reason.trim().length < 3} onClick={() => m.mutate()}>Record proposed version</Button></div>}
    <div className="space-y-2"><h3 className="text-sm font-semibold">Version history</h3>{q.data.versions.length === 0 ? <p className="text-sm text-muted-foreground">No proposed version recorded.</p> : q.data.versions.map(v => <div key={v.id} className="flex flex-wrap justify-between gap-2 border-b py-2 text-sm"><span>Effective {v.effective_on} · {v.reason}</span><span className="text-muted-foreground">{new Date(v.created_at).toLocaleDateString()}</span></div>)}</div>
  </section>;
}
