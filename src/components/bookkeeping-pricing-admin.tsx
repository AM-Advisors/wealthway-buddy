import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getBookkeepingConfiguration, saveBookkeepingConfiguration } from "@/lib/bookkeeping.functions";
import { type BookkeepingConfig } from "@/lib/bookkeeping-model";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
  return <section className="space-y-5">
    <div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold">Bookkeeping &amp; Accounting</h2><Badge variant="secondary">Proposed · unpublished</Badge></div>
    <Table><TableHeader><TableRow><TableHead>Tier</TableHead><TableHead>Annual reconciliation ($/mo)</TableHead><TableHead>Quarterly reconciliation ($/mo)</TableHead><TableHead>Monthly reconciliation ($/mo)</TableHead><TableHead>Transactions</TableHead><TableHead>Accounts</TableHead></TableRow></TableHeader><TableBody>{config.tiers.map((t, i) => <TableRow key={t.key}><TableCell className="font-medium">{t.name}</TableCell>{(["annual", "quarterly", "monthly"] as const).map(c => <TableCell key={c}>{t.key === "enterprise" && c === "annual" ? "Custom only" : <Input aria-label={`${t.name} ${c} reconciliation monthly price`} type="number" min="0" disabled={!editable} value={t.monthlyCents[c] === null ? "" : Number(t.monthlyCents[c]) / 100} onChange={e => setDraft({ ...config, tiers: config.tiers.map((x, j) => j === i ? { ...x, monthlyCents: { ...x.monthlyCents, [c]: Math.round(Number(e.target.value) * 100) } } : x) })} />}</TableCell>)}<TableCell>{t.transactions}</TableCell><TableCell>{t.accounts ?? "Custom"}</TableCell></TableRow>)}</TableBody></Table>
    <div className="grid gap-3 sm:grid-cols-2">{config.addons.map((a, i) => <div className="flex items-center justify-between gap-3 border-b py-2" key={a.key}><Label htmlFor={`bk-rate-${a.key}`}>{a.name}<span className="block text-xs text-muted-foreground">$ / {a.cadence.replace("_", " ")}</span></Label><Input id={`bk-rate-${a.key}`} className="w-28 shrink-0" type="number" min="0" disabled={!editable} value={a.unitCents / 100} onChange={e => setDraft({ ...config, addons: config.addons.map((x, j) => j === i ? { ...x, unitCents: Math.round(Number(e.target.value) * 100) } : x) })} /></div>)}</div>
    <div className="border-t pt-4 text-sm text-muted-foreground"><p>Monthly / quarterly / annual billing: ×1 / ×3 / ×12. No prepayment discount.</p><p>Managed monthly targets: Essential 20, Growth 15, Professional 10, Enterprise 7 business days. Quarterly 20; annual 30, after required records. Self-Service has no managed guarantee.</p><p>Excluded unless separately contracted: {config.exclusions.join(", ")}.</p></div>
    {editable && <div className="flex flex-wrap items-end gap-3"><div className="space-y-1"><Label htmlFor="bk-version-effective">Effective date</Label><Input id="bk-version-effective" type="date" value={effectiveOn} onChange={e => setEffectiveOn(e.target.value)} /></div><div className="min-w-48 flex-1 space-y-1"><Label htmlFor="bk-version-reason">Reason</Label><Input id="bk-version-reason" value={reason} onChange={e => setReason(e.target.value)} /></div><Button disabled={m.isPending || !effectiveOn || reason.trim().length < 3} onClick={() => m.mutate()}>Record proposed version</Button></div>}
    <div className="space-y-2"><h3 className="text-sm font-semibold">Version history</h3>{q.data.versions.length === 0 ? <p className="text-sm text-muted-foreground">No proposed version recorded.</p> : q.data.versions.map(v => <div key={v.id} className="flex flex-wrap justify-between gap-2 border-b py-2 text-sm"><span>Effective {v.effective_on} · {v.reason}</span><span className="text-muted-foreground">{new Date(v.created_at).toLocaleDateString()}</span></div>)}</div>
  </section>;
}