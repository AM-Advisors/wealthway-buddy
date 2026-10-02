import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addFundAssetFn, decideAssetMarkFn, recordAssetMarkFn } from "@/lib/fund-books.functions";
import { fundK1ReportsFn } from "@/lib/fund-k1-report.functions";
import { fmtDate, toCents, usd } from "./shared";

const CLASSES = ["private_common", "private_preferred", "safe", "convertible_note", "debt", "fund_interest", "spv_interest", "real_estate", "digital_security", "cash_equivalent", "other"] as const;
const METHODS = ["recent_financing", "transaction_price", "secondary_transaction", "market_comparable", "public_market", "cost", "appraisal", "manager_mark", "third_party", "other"] as const;
const nice = (s: string) => s.replace(/_/g, " ");
const today = () => new Date().toISOString().slice(0, 10);

/** Add assets and record values. Manager values wait for Harmonious approval; staff values apply at once. */
export function AssetManager({ fundId, assets }: { fundId: string; assets: any[] }) {
  const qc = useQueryClient();
  const who = useServerFn(fundK1ReportsFn);
  const sq = useQuery({ queryKey: ["fund-k1-reports", fundId], queryFn: () => who({ data: { fundId } }) });
  const staff = !!sq.data?.staff;
  const add = useServerFn(addFundAssetFn);
  const mark = useServerFn(recordAssetMarkFn);
  const decide = useServerFn(decideAssetMarkFn);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["fund-tabs"] }); qc.invalidateQueries(); };
  const [f, setF] = useState({ assetName: "", issuerName: "", assetClass: "private_preferred" as (typeof CLASSES)[number], instrument: "", acquisitionDate: today(), cost: "" });
  const addM = useMutation({
    mutationFn: () => add({ data: { fundId, assetName: f.assetName.trim(), issuerName: f.issuerName.trim() || f.assetName.trim(), assetClass: f.assetClass, instrument: f.instrument || null, acquisitionDate: f.acquisitionDate || null, costCents: toCents(f.cost) ?? 0 } }),
    onSuccess: () => { toast.success("Asset added."); setF({ ...f, assetName: "", issuerName: "", instrument: "", cost: "" }); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const [mk, setMk] = useState<{ assetId: string; value: string; date: string; method: (typeof METHODS)[number]; note: string } | null>(null);
  const markM = useMutation({
    mutationFn: () => mark({ data: { fundId, assetId: mk!.assetId, valueCents: toCents(mk!.value) ?? 0, date: mk!.date, method: mk!.method, note: mk!.note || null } }),
    onSuccess: (r) => { toast.success(r.status === "effective" ? "Value recorded." : "Value sent to Harmonious for approval."); setMk(null); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const decM = useMutation({
    mutationFn: (a: { valuationId: string; approve: boolean }) => decide({ data: { fundId, valuationId: a.valuationId, approve: a.approve, note: a.approve ? null : "Returned for changes" } }),
    onSuccess: () => { toast.success("Saved"); refresh(); }, onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Manage assets and values</CardTitle>
        <CardDescription>Add each investment and record its value. Values you enter show as "Manager mark" until Harmonious approves them.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1"><Label className="text-xs">Asset name</Label><Input value={f.assetName} onChange={(e) => setF({ ...f, assetName: e.target.value })} placeholder="Acme Inc. Series A" /></div>
          <div className="space-y-1"><Label className="text-xs">Company / issuer</Label><Input value={f.issuerName} onChange={(e) => setF({ ...f, issuerName: e.target.value })} placeholder="Acme Inc." /></div>
          <div className="space-y-1"><Label className="text-xs">Type</Label>
            <Select value={f.assetClass} onValueChange={(v) => setF({ ...f, assetClass: v as any })}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CLASSES.map((c) => <SelectItem key={c} value={c} className="capitalize">{nice(c)}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label className="text-xs">Instrument (optional)</Label><Input value={f.instrument} onChange={(e) => setF({ ...f, instrument: e.target.value })} placeholder="Preferred stock" /></div>
          <div className="space-y-1"><Label className="text-xs">Purchase date</Label><Input type="date" value={f.acquisitionDate} onChange={(e) => setF({ ...f, acquisitionDate: e.target.value })} /></div>
          <div className="space-y-1"><Label className="text-xs">Cost ($)</Label><Input inputMode="decimal" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} placeholder="0" /></div>
        </div>
        <Button disabled={!f.assetName.trim() || addM.isPending} onClick={() => addM.mutate()}>Add asset</Button>

        {assets.length > 0 && (
          <div className="divide-y rounded-md border">
            {assets.map((a) => (
              <div key={a.id} className="space-y-2 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><p className="font-medium">{a.asset_name}</p><p className="text-xs text-muted-foreground">Cost {usd(Number(a.cost_basis_cents ?? 0))} · Latest value {a.latestValueCents == null ? "not set" : `${usd(Number(a.latestValueCents))} (${fmtDate(a.latestValueDate)})`}</p></div>
                  <Button size="sm" variant="outline" onClick={() => setMk({ assetId: a.id, value: "", date: today(), method: staff ? "third_party" : "manager_mark", note: "" })}>Record value</Button>
                </div>
                {a.pendingMark && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">Manager mark {usd(a.pendingMark.valueCents)} · {fmtDate(a.pendingMark.date)} - waiting for Harmonious</Badge>
                    {staff && <><Button size="sm" onClick={() => decM.mutate({ valuationId: a.pendingMark.id, approve: true })}>Approve</Button><Button size="sm" variant="outline" onClick={() => decM.mutate({ valuationId: a.pendingMark.id, approve: false })}>Return</Button></>}
                  </div>
                )}
                {mk?.assetId === a.id && (
                  <div className="grid gap-2 rounded-md bg-muted/40 p-3 sm:grid-cols-4">
                    <Input inputMode="decimal" placeholder="Value ($)" value={mk.value} onChange={(e) => setMk({ ...mk, value: e.target.value })} />
                    <Input type="date" value={mk.date} onChange={(e) => setMk({ ...mk, date: e.target.value })} />
                    <Select value={mk.method} onValueChange={(v) => setMk({ ...mk, method: v as any })}><SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{METHODS.map((m) => <SelectItem key={m} value={m} className="capitalize">{nice(m)}</SelectItem>)}</SelectContent></Select>
                    <Input placeholder="Source / note" value={mk.note} onChange={(e) => setMk({ ...mk, note: e.target.value })} />
                    <div className="flex gap-2 sm:col-span-4"><Button size="sm" disabled={!mk.value || markM.isPending} onClick={() => markM.mutate()}>Save value</Button><Button size="sm" variant="ghost" onClick={() => setMk(null)}>Cancel</Button></div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
