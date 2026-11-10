import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { calculateBookkeeping, type BookkeepingConfig, type BookkeepingInput } from "@/lib/bookkeeping-model";
import { ADDONS, BOOKKEEPING_OPTIONS, CHARGED_LABELS, FREQUENCY_LABELS, OPTION_KEYS, SUPPORT_LEVELS, coverageConflicts, type BookkeepingOption, type ChargedScope } from "@/lib/bookkeeping-options";
import { getBookkeepingEntityCoverage } from "@/lib/bookkeeping.functions";

const money = (n: number | null) => n === null ? "Custom price required" : `$${(n / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
const NONE = "__none";

export function BookkeepingConfigurator({ configuration, versionId, clientId, onAdd }: { configuration: BookkeepingConfig; versionId: string | null; clientId: string | null; onAdd: (input: BookkeepingInput, invoiceCents: number) => void }) {
  const [input, setInput] = useState<BookkeepingInput>({ configVersionId: versionId ?? "00000000-0000-0000-0000-000000000000", option: "managed", frequency: "monthly", supportLevel: "self_serve", billing: "quarterly", entityId: null, entityReferences: ["Proposed legal entity"], expectedTransactions: 50, financialAccounts: 2, accountingMethod: "cash", reporting: "standard", reportingRequirements: "", effectiveOn: "", termMonths: 12, addons: [], excludedScope: [], customMonthlyCents: null, customReason: "" });
  const [entities, setEntities] = useState("");
  const loadCoverage = useServerFn(getBookkeepingEntityCoverage);
  const coverage = useQuery({ queryKey: ["bookkeeping-entity-coverage", clientId], queryFn: () => loadCoverage({ data: { clientId: clientId! } }), enabled: !!clientId });
  const patch = (value: Partial<BookkeepingInput>) => setInput(previous => ({ ...previous, ...value }));
  const chosenEntity = (coverage.data ?? []).find(e => e.id === input.entityId) ?? null;
  const typed = entities.split("\n").map(v => v.trim()).filter(Boolean);
  const readyInput: BookkeepingInput = { ...input, configVersionId: versionId ?? input.configVersionId, entityReferences: chosenEntity ? [chosenEntity.legalName, ...typed.filter(t => t !== chosenEntity.legalName)] : typed, effectiveOn: input.effectiveOn || "2026-01-01" };
  const def = BOOKKEEPING_OPTIONS[input.option];
  const conflict = chosenEntity ? coverageConflicts({ option: input.option, effectiveOn: readyInput.effectiveOn, termMonths: input.termMonths, excluded: input.excludedScope as ChargedScope[] }, chosenEntity.coverage.filter(r => r.source !== "request")) : null;
  let result: ReturnType<typeof calculateBookkeeping> | null = null;
  let error = "";
  try { result = calculateBookkeeping(configuration, readyInput); } catch (e) { error = (e as Error).message; }
  const setOption = (option: BookkeepingOption) => patch({ option, frequency: BOOKKEEPING_OPTIONS[option].defaultFrequency, excludedScope: [] });
  const addonState = (key: string) => input.addons?.find(a => a.key === key);
  const setAddon = (key: (typeof ADDONS)[number]["key"], quantity: number, quotedCents: number | null) => patch({ addons: [...(input.addons ?? []).filter(a => a.key !== key), ...(quantity > 0 || quotedCents !== null ? [{ key, quantity, quotedCents }] : [])] });
  const blocked = !versionId || !result || result.invoiceCents === null || !input.effectiveOn || result.blockers.length > 0 || !!conflict?.blocked || (conflict?.unresolved.length ?? 0) > 0;
  return <section className="mt-5 space-y-4 border-t pt-5" aria-label="Bookkeeping quote configuration">
    <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">Bookkeeping</h2><Badge variant="secondary">Proposed · internal draft only</Badge></div>
    {!versionId && <p className="text-sm text-muted-foreground">An authorized executive must record the proposed pricing version in Services administration before it can be added to a draft.</p>}
    <p className="text-sm text-muted-foreground">Service option, service frequency, support level and billing frequency are separate choices. Fund Accounting is quoted as a fund service, not here.</p>
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="space-y-1"><Label>Service option</Label><Select value={input.option} onValueChange={v => setOption(v as BookkeepingOption)}><SelectTrigger aria-label="Bookkeeping service option"><SelectValue /></SelectTrigger><SelectContent>{OPTION_KEYS.map(k => <SelectItem key={k} value={k}>{BOOKKEEPING_OPTIONS[k].name}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1"><Label>{input.option === "managed" ? "Close frequency" : "Review frequency"}</Label>
        {def.frequencies.length === 0 ? <p className="pt-2 text-sm text-muted-foreground">None: the client maintains the books</p>
          : <Select value={input.frequency ?? def.defaultFrequency ?? "monthly"} onValueChange={v => patch({ frequency: v as BookkeepingInput["frequency"] })}><SelectTrigger aria-label="Service frequency"><SelectValue /></SelectTrigger><SelectContent>{def.frequencies.map(f => <SelectItem key={f} value={f}>{FREQUENCY_LABELS[f]}</SelectItem>)}</SelectContent></Select>}</div>
      <div className="space-y-1"><Label>Support level</Label><Select value={input.supportLevel} onValueChange={v => patch({ supportLevel: v as BookkeepingInput["supportLevel"] })}><SelectTrigger aria-label="Support level"><SelectValue /></SelectTrigger><SelectContent>{SUPPORT_LEVELS.map(l => <SelectItem key={l.key} value={l.key}>{l.name} · {l.response}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1"><Label>Billing frequency</Label><Select value={input.billing} onValueChange={v => patch({ billing: v as BookkeepingInput["billing"] })}><SelectTrigger aria-label="Bookkeeping billing frequency"><SelectValue /></SelectTrigger><SelectContent>{(["monthly", "quarterly", "annual"] as const).map(v => <SelectItem key={v} value={v}>{FREQUENCY_LABELS[v]}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1"><Label>Entity</Label><Select value={input.entityId ?? NONE} onValueChange={v => patch({ entityId: v === NONE ? null : v, excludedScope: [] })} disabled={!clientId}><SelectTrigger aria-label="Covered entity"><SelectValue placeholder="Choose entity" /></SelectTrigger><SelectContent><SelectItem value={NONE}>{clientId ? "Not on file yet (type below)" : "Choose a client first"}</SelectItem>{(coverage.data ?? []).map(e => <SelectItem key={e.id} value={e.id}>{e.legalName}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1"><Label htmlFor="bk-transactions">Monthly transactions</Label><Input id="bk-transactions" type="number" min="0" value={input.expectedTransactions} onChange={e => patch({ expectedTransactions: Number(e.target.value) })} /></div>
      <div className="space-y-1"><Label htmlFor="bk-accounts">Bank and credit accounts</Label><Input id="bk-accounts" type="number" min="0" value={input.financialAccounts} onChange={e => patch({ financialAccounts: Number(e.target.value) })} /></div>
      <div className="space-y-1"><Label>Accounting basis</Label><Select value={input.accountingMethod} onValueChange={v => patch({ accountingMethod: v as "cash" | "accrual" })}><SelectTrigger aria-label="Accounting method"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cash">Cash</SelectItem><SelectItem value="accrual">Accrual</SelectItem></SelectContent></Select></div>
      <div className="space-y-1"><Label>Reporting</Label><Select value={input.reporting} onValueChange={v => patch({ reporting: v as "standard" | "custom" })}><SelectTrigger aria-label="Reporting complexity"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="standard">Standard reports</SelectItem><SelectItem value="custom">Custom reporting</SelectItem></SelectContent></Select></div>
      <div className="space-y-1"><Label htmlFor="bk-effective">Effective date</Label><Input id="bk-effective" type="date" value={input.effectiveOn} onChange={e => patch({ effectiveOn: e.target.value })} /></div>
      <div className="space-y-1"><Label htmlFor="bk-term">Contract term (months)</Label><Input id="bk-term" type="number" min="1" max="120" value={input.termMonths} onChange={e => patch({ termMonths: Number(e.target.value) })} /></div>
      <div className="space-y-1"><Label htmlFor="bk-custom">Custom monthly price ($)</Label><Input id="bk-custom" type="number" min="0" placeholder="Use approved rate" value={input.customMonthlyCents == null ? "" : input.customMonthlyCents / 100} onChange={e => patch({ customMonthlyCents: e.target.value === "" ? null : Math.round(Number(e.target.value) * 100) })} /></div>
    </div>
    <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1"><Label htmlFor="bk-entities">{chosenEntity ? "Other legal entities (one per line)" : "Legal entities (one per line)"}</Label><Textarea id="bk-entities" placeholder="Legal entity name" value={entities} onChange={e => setEntities(e.target.value)} /></div><div className="space-y-1"><Label htmlFor="bk-reporting">Reporting requirements</Label><Textarea id="bk-reporting" value={input.reportingRequirements} onChange={e => patch({ reportingRequirements: e.target.value })} /></div></div>
    {input.customMonthlyCents != null && <div className="space-y-1"><Label htmlFor="bk-reason">Custom price reason</Label><Input id="bk-reason" value={input.customReason} onChange={e => patch({ customReason: e.target.value })} /></div>}
    {conflict && conflict.duplicates.length > 0 && <div className="space-y-2 rounded-md border p-3 text-sm" role="status">
      <p className="font-medium">Already covered for {chosenEntity?.legalName} in this period</p>
      {conflict.duplicates.map(d => <p key={d.label} className="text-muted-foreground">{d.label}: {d.scope.map(s => CHARGED_LABELS[s]).join(", ")}</p>)}
      {conflict.blocked ? <p className="text-destructive">{conflict.reason}</p> : conflict.covered.map(s => <label key={s} className="flex items-center gap-2"><Checkbox checked={(input.excludedScope ?? []).includes(s)} onCheckedChange={(v) => patch({ excludedScope: v ? [...(input.excludedScope ?? []), s] : (input.excludedScope ?? []).filter(x => x !== s) })} />Exclude {CHARGED_LABELS[s]} from this quote</label>)}
    </div>}
    <div className="space-y-1"><h3 className="text-sm font-semibold">Add-ons</h3><p className="text-xs text-muted-foreground">Add-ons without an approved price need a quoted price and executive approval.</p></div>
    <div className="grid gap-x-5 gap-y-2 sm:grid-cols-2">{ADDONS.map(a => { const cfg = configuration.addons.find(x => x.key === a.key); const st = addonState(a.key); return <div key={a.key} className="flex items-center justify-between gap-3 border-b py-2"><Label htmlFor={`bk-addon-${a.key}`} className="min-w-0 text-sm">{a.name}<span className="block text-xs text-muted-foreground">{cfg?.unitCents == null ? "Request a quote" : money(cfg.unitCents)} / {cfg?.cadence === "monthly" ? "month" : (cfg?.cadence ?? "").replace("_", " ")}</span></Label><div className="flex shrink-0 gap-2">{cfg?.unitCents == null && <Input aria-label={`${a.name} quoted price`} className="w-24" type="number" min="0" placeholder="$ quoted" value={st?.quotedCents == null ? "" : st.quotedCents / 100} onChange={e => setAddon(a.key, st?.quantity ?? 0, e.target.value === "" ? null : Math.round(Number(e.target.value) * 100))} />}<Input id={`bk-addon-${a.key}`} aria-label={`${a.name} quantity`} className="w-20" type="number" min="0" value={st?.quantity ?? 0} onChange={e => setAddon(a.key, Number(e.target.value), st?.quotedCents ?? null)} /></div></div>; })}</div>
    {result && <><div className="grid gap-3 border-y py-4 sm:grid-cols-5">{[["Monthly-equivalent", result.monthlyCents], ["Recurring invoice", result.invoiceCents], ["Annual recurring", result.annualCents], ["One-time", result.oneTimeCents], ["Quoted usage", result.usageCents]].map(([label, value]) => <div key={String(label)}><p className="text-xs text-muted-foreground">{label}</p><p className="font-semibold">{money(value as number | null)}</p></div>)}</div>
      <p className="text-sm text-muted-foreground">{input.option === "self_service" ? "No Harmonious review or close schedule." : result.businessDays === null ? `${FREQUENCY_LABELS[result.input.frequency!]} ${input.option === "managed" ? "close" : "review"}, dates agreed in the engagement.` : `${FREQUENCY_LABELS[result.input.frequency!]} ${input.option === "managed" ? "close" : "review"} within ${result.businessDays} business days after period end and required records.`} {result.support.title}: does not change scope or schedule.</p>
      {result.blockers.map(b => <p key={b} className="text-sm text-destructive">{b}</p>)}</>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button variant="outline" disabled={blocked} onClick={() => { if (result?.invoiceCents != null && result) onAdd(readyInput, result.invoiceCents); }}>Add proposed bookkeeping line</Button>
  </section>;
}
