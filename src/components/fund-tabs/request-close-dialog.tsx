import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createFundCloseRequest, getCloseCandidates } from "@/lib/fund-close-requests.functions";
import { fundBooksFn, fundTeamFn } from "@/lib/fund-tabs.functions";
import { fileToBase64, toCents, toPct, usd } from "./shared";

const FORM_D_CENTS = 16000;
const NEW = "__new";

export function RequestCloseDialog({ fundId, open, onOpenChange, onDone }: { fundId: string; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const qc = useQueryClient();
  const loadCandidates = useServerFn(getCloseCandidates);
  const loadBooks = useServerFn(fundBooksFn);
  const loadTeam = useServerFn(fundTeamFn);
  const submit = useServerFn(createFundCloseRequest);
  const cq = useQuery({ queryKey: ["close-candidates", fundId], queryFn: () => loadCandidates({ data: { fundId } }), enabled: open });
  const bq = useQuery({ queryKey: ["fund-books", fundId], queryFn: () => loadBooks({ data: { fundId } }), enabled: open });
  const tq = useQuery({ queryKey: ["fund-team", fundId], queryFn: () => loadTeam({ data: { fundId } }), enabled: open });

  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [assetSel, setAssetSel] = useState<string>("");
  const [asset, setAsset] = useState({ name: "", issuer: "", type: "", amount: "", notes: "" });
  const [pa, setPa] = useState<File | null>(null);
  const [feePct, setFeePct] = useState<string | null>(null);
  const [feeOk, setFeeOk] = useState(false);
  const [wire, setWire] = useState({ method: "wire" as "wire" | "ach", beneficiary: "", bankName: "", routingLast4: "", accountLast4: "", reference: "", amount: "" });
  const [states, setStates] = useState("");
  const [legal, setLegal] = useState({ amount: "", detail: "" });
  const [bd, setBd] = useState({ amount: "", detail: "" });
  const [busy, setBusy] = useState(false);

  const rows = cq.data ?? [];
  const assets = bq.data?.assets ?? [];
  const activeFeePct = tq.data?.activeFee?.management_fee_pct ?? null;
  const pctStr = feePct ?? (activeFeePct != null ? String(activeFeePct) : "");
  const selectedCents = rows.filter((r) => picked.has(r.id)).reduce((s, r) => s + (r.amountCents ?? 0), 0);
  const feeCents = toPct(pctStr) != null ? Math.round((selectedCents * (toPct(pctStr) as number)) / 100) : null;
  const notReady = rows.filter((r) => picked.has(r.id) && r.openItems.length > 0).length;
  const stateList = useMemo(() => [...new Set(states.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean))], [states]);
  const isNew = assetSel === NEW || (assets.length === 0 && assetSel === "");
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function onSubmit() {
    if (isNew && asset.name.trim().length < 2) { toast.error("Add the asset name."); return; }
    if (!feeOk) { toast.error("Confirm the management fee."); return; }
    setBusy(true);
    try {
      const purchaseAgreement = pa ? { fileName: pa.name, contentType: pa.type || "application/pdf", base64: await fileToBase64(pa) } : null;
      await submit({ data: {
        fundId, onboardingIds: [...picked], targetDate: date || null, notes,
        details: {
          assetMode: isNew ? "new" : "existing", existingAsset: isNew ? "" : assetSel,
          asset: { name: asset.name, issuer: asset.issuer, type: asset.type, amountCents: toCents(asset.amount), notes: asset.notes },
          purchaseAgreement,
          managementFeePct: toPct(pctStr), managementFeeCents: feeCents, feeConfirmed: feeOk,
          wire: { method: wire.method, beneficiary: wire.beneficiary, bankName: wire.bankName, routingLast4: wire.routingLast4.slice(-4), accountLast4: wire.accountLast4.slice(-4), reference: wire.reference, amountCents: toCents(wire.amount) },
          investorStates: stateList,
          legalFeesCents: toCents(legal.amount), legalFeesDetail: legal.detail,
          brokerDealerFeesCents: toCents(bd.amount), brokerDealerDetail: bd.detail,
        },
      } });
      toast.success("Close request sent to Harmonious.");
      await qc.invalidateQueries({ queryKey: ["client-fund-closes", fundId] });
      await qc.invalidateQueries({ queryKey: ["fund-books", fundId] });
      setPicked(new Set()); setDate(""); setNotes(""); setPa(null); setFeeOk(false);
      onOpenChange(false); onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't send the close request.");
    } finally { setBusy(false); }
  }

  const section = "space-y-2 rounded-md border p-3";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Request Fund Close</DialogTitle>
          <DialogDescription>Harmonious reviews every request. Nothing closes, files or moves money automatically, and fees below are estimates Harmonious confirms.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className={section}>
            <p className="font-medium">1. Investors in this close</p>
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {cq.isLoading ? <p className="text-muted-foreground">Loading investors…</p> : rows.length === 0 ? <p className="text-muted-foreground">No investors in this fund yet.</p> : rows.map((r) => (
                <label key={r.id} className="flex cursor-pointer items-start gap-3 rounded p-2 hover:bg-muted">
                  <Checkbox checked={picked.has(r.id)} onCheckedChange={() => toggle(r.id)} className="mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium">{r.name}{r.profileName ? <span className="font-normal text-muted-foreground"> · {r.profileName}</span> : null}</p>
                    <p className="text-xs text-muted-foreground">{r.openItems.length ? `Not ready: ${r.openItems.slice(0, 2).join(", ")}${r.openItems.length > 2 ? "…" : ""}` : "Ready"}</p>
                  </div>
                  <span className="text-xs">{usd(r.amountCents)}</span>
                </label>
              ))}
            </div>
            {notReady > 0 && <p className="text-xs text-destructive">{notReady} selected investor{notReady === 1 ? " isn't" : "s aren't"} ready yet. Harmonious will follow up before closing them.</p>}
            <p className="text-xs text-muted-foreground">Selected: {usd(selectedCents)}</p>
          </div>

          <div className={section}>
            <p className="font-medium">2. Asset being purchased</p>
            {assets.length > 0 && (
              <Select value={assetSel} onValueChange={setAssetSel}>
                <SelectTrigger><SelectValue placeholder="Pick an asset" /></SelectTrigger>
                <SelectContent>{assets.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}<SelectItem value={NEW}>Add a new asset</SelectItem></SelectContent>
              </Select>
            )}
            {isNew && (
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1"><Label>Asset name</Label><Input value={asset.name} onChange={(e) => setAsset({ ...asset, name: e.target.value })} /></div>
                <div className="space-y-1"><Label>Issuer / company</Label><Input value={asset.issuer} onChange={(e) => setAsset({ ...asset, issuer: e.target.value })} /></div>
                <div className="space-y-1"><Label>Type (stock, SAFE, note, real estate…)</Label><Input value={asset.type} onChange={(e) => setAsset({ ...asset, type: e.target.value })} /></div>
                <div className="space-y-1"><Label>Purchase amount ($)</Label><Input inputMode="decimal" value={asset.amount} onChange={(e) => setAsset({ ...asset, amount: e.target.value })} /></div>
                <div className="space-y-1 sm:col-span-2"><Label>Other details</Label><Textarea rows={2} value={asset.notes} onChange={(e) => setAsset({ ...asset, notes: e.target.value })} /></div>
                <p className="text-xs text-muted-foreground sm:col-span-2">This asset will be added to your Assets list for Harmonious to confirm.</p>
              </div>
            )}
            <div className="space-y-1"><Label>Purchase agreement</Label><Input type="file" onChange={(e) => setPa(e.target.files?.[0] ?? null)} /></div>
          </div>

          <div className={section}>
            <p className="font-medium">3. Management fee</p>
            <div className="grid items-end gap-2 sm:grid-cols-2">
              <div className="space-y-1"><Label>Management fee %</Label><Input inputMode="decimal" value={pctStr} onChange={(e) => { setFeePct(e.target.value); setFeeOk(false); }} /></div>
              <p>Amount on selected investors: <span className="font-semibold">{usd(feeCents)}</span></p>
            </div>
            <label className="flex items-center gap-2"><Checkbox checked={feeOk} onCheckedChange={(v) => setFeeOk(!!v)} /> I confirm this percentage and amount are correct.</label>
            {activeFeePct != null && toPct(pctStr) !== Number(activeFeePct) && <p className="text-xs text-destructive">This differs from the fund's recorded fee of {activeFeePct}%. Harmonious will check it.</p>}
          </div>

          <div className={section}>
            <p className="font-medium">4. Where the money goes</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1"><Label>Method</Label>
                <Select value={wire.method} onValueChange={(v) => setWire({ ...wire, method: v as "wire" | "ach" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="wire">Wire</SelectItem><SelectItem value="ach">ACH</SelectItem></SelectContent></Select>
              </div>
              <div className="space-y-1"><Label>Amount to send ($)</Label><Input inputMode="decimal" value={wire.amount} onChange={(e) => setWire({ ...wire, amount: e.target.value })} /></div>
              <div className="space-y-1"><Label>Beneficiary</Label><Input value={wire.beneficiary} onChange={(e) => setWire({ ...wire, beneficiary: e.target.value })} /></div>
              <div className="space-y-1"><Label>Bank name</Label><Input value={wire.bankName} onChange={(e) => setWire({ ...wire, bankName: e.target.value })} /></div>
              <div className="space-y-1"><Label>Routing number (last 4)</Label><Input maxLength={4} value={wire.routingLast4} onChange={(e) => setWire({ ...wire, routingLast4: e.target.value.replace(/\D/g, "") })} /></div>
              <div className="space-y-1"><Label>Account number (last 4)</Label><Input maxLength={4} value={wire.accountLast4} onChange={(e) => setWire({ ...wire, accountLast4: e.target.value.replace(/\D/g, "") })} /></div>
              <div className="space-y-1 sm:col-span-2"><Label>Reference / memo</Label><Input value={wire.reference} onChange={(e) => setWire({ ...wire, reference: e.target.value })} /></div>
            </div>
            <p className="text-xs text-muted-foreground">Attach the full instructions to the purchase agreement or send them to Harmonious. Harmonious verifies instructions by phone before any money moves; nothing is sent from here.</p>
          </div>

          <div className={section}>
            <p className="font-medium">5. Filing fees (estimate)</p>
            <div className="space-y-1"><Label>States where investors live (e.g. TX, CA, NY)</Label><Input value={states} onChange={(e) => setStates(e.target.value)} /></div>
            <p>Harmonious Form D Filing Fee: <span className="font-semibold">{usd(FORM_D_CENTS)}</span></p>
            <p>Blue Sky state fees: {stateList.length ? `${stateList.length} state${stateList.length === 1 ? "" : "s"} (${stateList.join(", ")}). Needs Review: Harmonious confirms each state's fee.` : "add states above"}</p>
          </div>

          <div className={section}>
            <p className="font-medium">6. Other fees</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1"><Label>Legal fees ($)</Label><Input inputMode="decimal" value={legal.amount} onChange={(e) => setLegal({ ...legal, amount: e.target.value })} placeholder="Leave blank if none" /></div>
              <div className="space-y-1"><Label>Legal fee details</Label><Input value={legal.detail} onChange={(e) => setLegal({ ...legal, detail: e.target.value })} /></div>
              <div className="space-y-1"><Label>Broker/Dealer Fee ($)</Label><Input inputMode="decimal" value={bd.amount} onChange={(e) => setBd({ ...bd, amount: e.target.value })} placeholder="Leave blank if none" /></div>
              <div className="space-y-1"><Label>Broker/Dealer details</Label><Input value={bd.detail} onChange={(e) => setBd({ ...bd, detail: e.target.value })} /></div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label htmlFor="close-date">Target close date</Label><Input id="close-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label htmlFor="close-notes">Notes (optional)</Label><Textarea id="close-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSubmit} disabled={busy || picked.size === 0}>{busy ? "Sending…" : "Send request"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
