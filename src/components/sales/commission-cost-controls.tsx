import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { saveCommissionCosts, saveCommissionCostSettings } from "@/lib/sales-hub.functions";
import { Panel } from "./sales-ui";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function CommissionCostControls({ data, onChange }: { data: any; onChange: () => void }) {
  const save = useServerFn(saveCommissionCosts); const settings = useServerFn(saveCommissionCostSettings);
  const [target, setTarget] = useState(""); const [service, setService] = useState(""); const [kind, setKind] = useState<"provider" | "deal">("provider");
  const [amount, setAmount] = useState(""); const [reason, setReason] = useState(""); const [supersedes, setSupersedes] = useState<string | undefined>();
  const [percentages, setPercentages] = useState(JSON.stringify(data.costSettings.at(-1)?.service_cost_pct ?? {}, null, 2));
  const [overhead, setOverhead] = useState(String(data.costSettings.at(-1)?.overhead_pct ?? 0)); const [settingsReason, setSettingsReason] = useState("");
  const options = [...new Map<string, any>(data.rows.filter((r: any) => r.invoiceId || r.sowId).map((r: any) => [r.invoiceId ? `invoice:${r.invoiceId}` : `sow:${r.sowId}`, r])).entries()];
  const saveCost = async () => { try {
    const [type, id] = target.split(":");
    await save({ data: { ...(type === "invoice" ? { invoiceId: id } : { sowId: id }), serviceKey: service, kind, amountCents: Math.round(Number(amount) * 100), supersedesId: supersedes, reason } });
    setReason(""); setSupersedes(undefined); toast.success("Cost entry saved"); onChange();
  } catch (e) { toast.error((e as Error).message); } };
  const saveSettings = async () => { try { await settings({ data: { serviceCostPct: JSON.parse(percentages), overheadPct: Number(overhead), reason: settingsReason } }); setSettingsReason(""); toast.success("Cost settings version saved"); onChange(); } catch (e) { toast.error((e as Error).message); } };
  return <Panel title="Commission costs and assumptions">
    <p className="mb-3 text-sm text-muted-foreground">Costs and settings are append-only. Corrections supersede prior entries. Processing fees default to $0: no invoice card-fee record is available. Expected rows are estimates and never payable.</p>
    <div className="space-y-2">{data.canEdit && <>
      <select aria-label="Invoice or SOW" className="w-full rounded border bg-background p-2" value={target} onChange={e => setTarget(e.target.value)}><option value="">Choose invoice or SOW</option>{options.map(([key, r]) => <option key={key} value={key}>{r.client} · {r.invoice ?? "Signed SOW"}</option>)}{data.quotes.filter((q: any) => q.sowId).map((q: any) => <option key={`sow:${q.sowId}`} value={`sow:${q.sowId}`}>{q.label} · SOW</option>)}</select>
      <Input aria-label="Service key" placeholder="Service key" value={service} onChange={e => setService(e.target.value)} />
      <select aria-label="Cost kind" className="rounded border bg-background p-2" value={kind} onChange={e => setKind(e.target.value as "provider" | "deal")}><option value="provider">Provider cost</option><option value="deal">Deal cost</option></select>
      <Input aria-label="Cost in dollars" type="number" min="0" step="0.01" placeholder="Amount in dollars" value={amount} onChange={e => setAmount(e.target.value)} />
      <Input aria-label="Cost reason" placeholder="Required cost reason" value={reason} onChange={e => setReason(e.target.value)} />
      <Button disabled={!target || !service || !amount || !reason.trim()} onClick={saveCost}>{supersedes ? "Save correction" : "Add cost"}</Button>
      <label className="block text-sm">Service cost percentages (JSON object)<textarea className="block w-full rounded border bg-background p-2" value={percentages} onChange={e => setPercentages(e.target.value)} /></label>
      <Input aria-label="Overhead percent" type="number" min="0" max="100" value={overhead} onChange={e => setOverhead(e.target.value)} />
      <Input aria-label="Settings reason" placeholder="Required settings reason" value={settingsReason} onChange={e => setSettingsReason(e.target.value)} />
      <Button disabled={!settingsReason.trim()} onClick={saveSettings}>Save new settings version</Button>
    </>}
    {data.costSettings.map((v: any) => <p className="text-sm" key={v.id}>{v.effective_at} · Service costs {JSON.stringify(v.service_cost_pct)} · Overhead {v.overhead_pct}% · {v.reason}</p>)}
    {data.costEntries.map((entry: any) => <div className="rounded border p-2 text-sm" key={entry.id}>{entry.service_key} · {entry.kind} · ${(entry.amount_cents / 100).toFixed(2)} · {entry.reason}{entry.supersedes_id ? " · Correction" : ""}{data.canEdit && !data.costEntries.some((e: any) => e.supersedes_id === entry.id) && <Button size="sm" variant="outline" className="ml-2" onClick={() => { setTarget(entry.invoice_id ? `invoice:${entry.invoice_id}` : `sow:${entry.sow_id}`); setService(entry.service_key); setKind(entry.kind); setAmount(String(entry.amount_cents / 100)); setSupersedes(entry.id); setReason(""); }}>Correct</Button>}</div>)}
    </div>
  </Panel>;
}
