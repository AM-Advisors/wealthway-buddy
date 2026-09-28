import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { getPortfolioAsOf, getPortfolioAssets, savePortfolioAsset } from "@/lib/valuation.functions";
import { ASSET_CLASS_LABELS, PORTFOLIO_ASSET_CLASSES, type PortfolioAssetClass } from "@/lib/valuation-model";
import { money, prettyStatus } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const today = () => new Date().toISOString().slice(0, 10);
const blank = { issuerName: "", assetName: "", assetClass: "private_preferred" as PortfolioAssetClass, instrument: "", acquisitionDate: "", quantity: "", ownershipPct: "", cost: "", note: "" };

/** Fund-scoped asset register on the existing portfolio asset layer. Server scopes every read and write to this fund. */
export function FundAssets({ fundId }: { fundId: string }) {
  const list = useServerFn(getPortfolioAssets);
  const asOf = useServerFn(getPortfolioAsOf);
  const save = useServerFn(savePortfolioAsset);
  const qc = useQueryClient();
  const wantsAdd = useRouterState({ select: (s) => (s.location.search as any)?.add === "asset" });
  const [open, setOpen] = useState(wantsAdd);
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const assets = useQuery({ queryKey: ["fund-assets", fundId], queryFn: () => list({ data: { fundId } }) });
  const values = useQuery({ queryKey: ["fund-assets-asof", fundId], queryFn: () => asOf({ data: { fundId, date: today() } }) });
  const byId = new Map((values.data?.lines ?? []).map((l: any) => [l.assetId, l]));

  if (assets.isError) return <p className="text-sm text-muted-foreground">You don't have access to this fund's investments.</p>;

  const submit = async () => {
    setBusy(true);
    try {
      const num = (v: string) => (v.trim() === "" ? undefined : Number(v));
      const cost = num(f.cost);
      await save({ data: {
        fundId, issuerName: f.issuerName.trim(), assetName: f.assetName.trim(), assetClass: f.assetClass,
        ...(f.instrument.trim() ? { instrument: f.instrument.trim() } : {}),
        ...(f.acquisitionDate ? { acquisitionDate: f.acquisitionDate } : {}),
        ...(num(f.quantity) === undefined ? {} : { quantity: num(f.quantity)! }),
        ...(num(f.ownershipPct) === undefined ? {} : { ownershipPct: num(f.ownershipPct)! }),
        ...(cost === undefined ? {} : { costBasisCents: Math.round(cost * 100) }),
        ...(f.note.trim() ? { note: f.note.trim() } : {}),
      } });
      toast.success("Asset added to this fund");
      setF(blank); setOpen(false);
      qc.invalidateQueries({ queryKey: ["fund-assets", fundId] });
      qc.invalidateQueries({ queryKey: ["fund-assets-asof", fundId] });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const field = (k: keyof typeof blank, label: string, type = "text") => (
    <div className="space-y-1"><Label htmlFor={`a-${k}`}>{label}</Label><Input id={`a-${k}`} type={type} value={f[k] as string} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
  );

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-xl">Investments</h2><p className="mt-1 text-sm text-muted-foreground">Assets this fund holds. Values show only approved, effective valuations.</p></div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setOpen(true)}>+ Add Asset</Button>
          <Button size="sm" variant="outline" asChild><Link to="/manager/valuations">Valuations</Link></Button>
        </div>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Asset register</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-y bg-muted/50 text-xs text-muted-foreground"><tr>{["Asset", "Issuer", "Type", "Instrument", "Acquired", "Quantity", "Ownership", "Cost Basis", "Latest Value", "Valuation Date", "Status", ""].map((h) => <th key={h} className="px-2 py-2.5 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y">
              {(assets.data ?? []).map((a: any) => { const v: any = byId.get(a.id); return (
                <tr key={a.id}>
                  <td className="px-2 py-3 font-medium">{a.asset_name}</td><td className="px-2 py-3">{a.issuer_name}</td>
                  <td className="px-2 py-3">{ASSET_CLASS_LABELS[a.asset_class as PortfolioAssetClass] ?? a.asset_class}</td>
                  <td className="px-2 py-3">{a.instrument ?? "—"}</td><td className="px-2 py-3">{a.acquisition_date ?? "—"}</td>
                  <td className="px-2 py-3">{a.quantity ?? "—"}</td><td className="px-2 py-3">{a.ownership_pct == null ? "—" : `${a.ownership_pct}%`}</td>
                  <td className="px-2 py-3">{a.cost_basis_cents == null ? "—" : money(a.cost_basis_cents)}</td>
                  <td className="px-2 py-3">{v?.valuationId ? money(v.valueCents) : "Not valued"}</td><td className="px-2 py-3">{v?.effectiveDate ?? "—"}</td>
                  <td className="px-2 py-3"><Badge variant="secondary">{prettyStatus(a.status)}</Badge></td>
                  <td className="px-2 py-3"><Button size="sm" variant="ghost" asChild><Link to="/manager/valuations">Valuations & evidence</Link></Button></td>
                </tr>); })}
              {assets.data && assets.data.length === 0 ? <tr><td colSpan={12} className="px-3 py-10 text-center text-muted-foreground">No assets yet. Use + Add Asset.</td></tr> : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add asset to this fund</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {field("issuerName", "Issuer / company")}{field("assetName", "Asset / investment name")}
            <div className="space-y-1"><Label htmlFor="a-class">Asset class</Label>
              <select id="a-class" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.assetClass} onChange={(e) => setF({ ...f, assetClass: e.target.value as PortfolioAssetClass })}>
                {PORTFOLIO_ASSET_CLASSES.map((c) => <option key={c} value={c}>{ASSET_CLASS_LABELS[c]}</option>)}
              </select></div>
            {field("instrument", "Instrument / security")}
            {field("acquisitionDate", "Acquisition date", "date")}{field("quantity", "Quantity", "number")}
            {field("ownershipPct", "Ownership %", "number")}{field("cost", "Cost basis (USD)", "number")}
          </div>
          <div className="space-y-1"><Label htmlFor="a-note">Notes</Label><Textarea id="a-note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
          <p className="text-xs text-muted-foreground">This records the position only. It doesn't post accounting or set a value — valuations go through review.</p>
          <Button disabled={busy || !f.issuerName.trim() || !f.assetName.trim()} onClick={submit}>{busy ? "Saving…" : "Add asset"}</Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
