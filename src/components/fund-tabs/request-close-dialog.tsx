import { useEffect, useMemo, useState } from "react";
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
import { SIDE_LETTER_FEE_CENTS } from "@/lib/side-letter-fee";
import { Switch } from "@/components/ui/switch";
import { estimateCloseFilingCosts } from "@/lib/blue-sky-fees";
import { closeManagementFee } from "@/lib/close-investor-terms";
import { CloseInvestorTerms } from "@/components/close-investor-terms";
import { missingCloseAttachments } from "@/lib/close-attachments";

const NEW = "__new";

export function RequestCloseDialog({ fundId, open, onOpenChange, onDone, request, canSend }: { fundId: string; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void; request: any | null; canSend: boolean }) {
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
  const [paSigned, setPaSigned] = useState(false);
  const [wireFile, setWireFile] = useState<File | null>(null);
  const [feePct, setFeePct] = useState<string | null>(null);
  const [feeOk, setFeeOk] = useState(false);
  const [wire, setWire] = useState({ method: "wire" as "wire" | "ach", beneficiary: "", bankName: "", routingLast4: "", accountLast4: "", reference: "", amount: "" });
  const [extra, setExtra] = useState({ closeAmount: "", feeBank: "", feeAddress: "", legalOn: false, legalPayee: "", legalDue: "", bdOn: false, bdPayee: "", bdName: "", bdDue: "", wireAddress: "" });
  const [legal, setLegal] = useState({ amount: "", detail: "" });
  const [bd, setBd] = useState({ amount: "", detail: "" });
  const [busy, setBusy] = useState<"draft" | "submit" | null>(null);

  useEffect(() => {
    if (!open) return;
    const d = request?.details ?? {};
    setPicked(new Set(request?.onboarding_ids ?? []));
    setDate(request?.target_date ?? "");
    setNotes(request?.notes ?? "");
    setAssetSel(d.assetMode === "new" ? NEW : d.existingAsset ?? "");
    setAsset({
      name: d.asset?.name ?? "", issuer: d.asset?.issuer ?? "", type: d.asset?.type ?? "",
      amount: d.asset?.amountCents == null ? "" : String(d.asset.amountCents / 100), notes: d.asset?.notes ?? "",
    });
    setPa(null);
    setWireFile(null);
    setPaSigned(d.purchaseAgreementSigned === true);
    setFeePct(d.managementFeePct == null ? null : String(d.managementFeePct));
    setFeeOk(d.feeConfirmed === true);
    setWire({
      method: d.wire?.method === "ach" ? "ach" : "wire", beneficiary: d.wire?.beneficiary ?? "",
      bankName: d.wire?.bankName ?? "", routingLast4: d.wire?.routingLast4 ?? "", accountLast4: d.wire?.accountLast4 ?? "",
      reference: d.wire?.reference ?? "", amount: d.wire?.amountCents == null ? "" : String(d.wire.amountCents / 100),
    });
    setExtra({
      closeAmount: d.closeAmountCents == null ? "" : String(d.closeAmountCents / 100), feeBank: d.feeBankName ?? "", feeAddress: d.feeAddress ?? "",
      legalOn: d.legalOn ?? d.legalFeesCents != null, legalPayee: d.legalPayee ?? "", legalDue: d.legalDueDate ?? "",
      bdOn: d.brokerDealerOn ?? d.brokerDealerFeesCents != null, bdPayee: d.brokerDealerPayee ?? "", bdName: d.brokerDealerName ?? "", bdDue: d.brokerDealerDueDate ?? "",
      wireAddress: d.wireAddress ?? "",
    });
    setLegal({ amount: d.legalFeesCents == null ? "" : String(d.legalFeesCents / 100), detail: d.legalFeesDetail ?? "" });
    setBd({ amount: d.brokerDealerFeesCents == null ? "" : String(d.brokerDealerFeesCents / 100), detail: d.brokerDealerDetail ?? "" });
  }, [open, request]);

  const rows = cq.data?.investors ?? [];
  const filedStates = cq.data?.filedStates ?? [];
  const assets = bq.data?.assets ?? [];
  const activeFeePct = tq.data?.activeFee?.management_fee_pct ?? null;
  const pctStr = feePct ?? (activeFeePct != null ? String(activeFeePct) : "");
  const selectedCents = rows.filter((r) => picked.has(r.id)).reduce((s, r) => s + (r.amountCents ?? 0), 0);
  const feeCents = closeManagementFee(rows.filter(r => picked.has(r.id)), toPct(pctStr));
  const notReady = rows.filter((r) => picked.has(r.id) && r.openItems.length > 0).length;
  const sideLetterCount = rows.filter((r) => picked.has(r.id)).reduce((s, r) => s + (r.sideLetters ?? 0), 0);
  const pickedRows = rows.filter((r) => picked.has(r.id));
  const filing = useMemo(() => estimateCloseFilingCosts({ investorStates: pickedRows.map((r) => r.state), filedStates }), [pickedRows.map((r) => r.id).join(), filedStates.join()]);
  const noAddress = pickedRows.filter((r) => !r.state);
  const missingAttachments = missingCloseAttachments({ hasPurchaseAgreement: !!(pa || request?.details?.purchaseAgreementPath), purchaseAgreementSigned: paSigned, hasWireInstructions: !!(wireFile || request?.details?.wireInstructionsPath) });
  const isNew = assetSel === NEW || (assets.length === 0 && assetSel === "");
  const toggle = (id: string) => { setFeeOk(false); setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); };

  async function onSave(intent: "draft" | "submit") {
    if (!cq.data || cq.error) { toast.error("Wait for investor terms to load before saving."); return; }
    if (intent === "submit" && !canSend) { toast.error("The fund manager sends saved close details for review."); return; }
    if (intent === "submit" && picked.size === 0) { toast.error("Pick at least one investor before sending for review."); return; }
    if (intent === "submit" && isNew && asset.name.trim().length < 2) { toast.error("Add the asset name."); return; }
    if (intent === "submit" && !feeOk) { toast.error("Confirm the management fee."); return; }
    if (intent === "submit" && pickedRows.some(r => r.terms.error)) { toast.error("Review the conflicting side-letter terms before sending."); return; }
    if (intent === "submit" && missingAttachments.length) { toast.error(missingAttachments.join(" ")); return; }
    if ([pa, wireFile].some(f => f && (!f.size || f.size > 20 * 1024 * 1024))) { toast.error("Each attachment must be a nonempty file, 20 MB or smaller."); return; }
    setBusy(intent);
    try {
      const purchaseAgreement = pa ? { fileName: pa.name, contentType: pa.type || "application/pdf", base64: await fileToBase64(pa) } : null;
      await submit({ data: {
        ...(request?.id ? { id: request.id } : {}),
        fundId, intent, onboardingIds: [...picked], targetDate: date || null, notes,
        details: {
          assetMode: isNew ? "new" : "existing", existingAsset: isNew ? "" : assetSel,
          asset: { name: asset.name, issuer: asset.issuer, type: asset.type, amountCents: toCents(asset.amount), notes: asset.notes },
          purchaseAgreement,
          purchaseAgreementSigned: paSigned,
          wireInstructions: wireFile ? { fileName: wireFile.name, contentType: wireFile.type || "application/pdf", base64: await fileToBase64(wireFile) } : null,
          managementFeePct: toPct(pctStr), managementFeeCents: feeCents, feeConfirmed: feeOk,
          wire: { method: wire.method, beneficiary: wire.beneficiary, bankName: wire.bankName, routingLast4: wire.routingLast4.slice(-4), accountLast4: wire.accountLast4.slice(-4), reference: wire.reference, amountCents: toCents(wire.amount) },
          investorStates: filing.lines.map((l) => l.state),
          legalFeesCents: extra.legalOn ? toCents(legal.amount) : null, legalFeesDetail: legal.detail,
          brokerDealerFeesCents: extra.bdOn ? toCents(bd.amount) : null, brokerDealerDetail: bd.detail,
          closeAmountCents: toCents(extra.closeAmount), feeBankName: extra.feeBank, feeAddress: extra.feeAddress,
          legalOn: extra.legalOn, legalPayee: extra.legalPayee, legalDueDate: extra.legalDue,
          brokerDealerOn: extra.bdOn, brokerDealerPayee: extra.bdPayee, brokerDealerName: extra.bdName, brokerDealerDueDate: extra.bdDue,
          wireAddress: extra.wireAddress,
        },
      } });
      toast.success(intent === "draft" ? "Close details saved. Nothing was sent for review or finalized." : "Close request sent to Harmonious for review.");
      await qc.invalidateQueries({ queryKey: ["client-fund-closes", fundId] });
      await qc.invalidateQueries({ queryKey: ["ops-close-requests"] });
      await qc.invalidateQueries({ queryKey: ["fund-books", fundId] });
      onOpenChange(false); onDone();
    } catch (e: any) {
      toast.error(e?.message ?? (intent === "draft" ? "Couldn't save the close details." : "Couldn't send the close request."));
    } finally { setBusy(null); }
  }

  const section = "space-y-2 rounded-md border p-3";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{request ? "Edit close details" : "Prepare fund close"}</DialogTitle>
          <DialogDescription>Save what you know without sending it. Only Send for review starts Harmonious review; saving never finalizes a close, files anything or moves money.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className={section}>
            <p className="font-medium">Close details</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1"><Label htmlFor="close-date">Close date requested</Label><Input id="close-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div className="space-y-1"><Label>Amount for close ($)</Label><Input inputMode="decimal" value={extra.closeAmount} onChange={(e) => setExtra({ ...extra, closeAmount: e.target.value })} placeholder={selectedCents ? String(selectedCents / 100) : ""} /></div>
            </div>
          </div>
          <div className={section}>
            <p className="font-medium">Investors in this close</p>
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
            <p className="font-medium">Asset being purchased</p>
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
            <div className="space-y-1"><Label htmlFor="signed-purchase-agreement">Signed purchase agreement (required to send)</Label><Input id="signed-purchase-agreement" type="file" onChange={(e) => { setPa(e.target.files?.[0] ?? null); setPaSigned(false); }} />{request?.details?.purchaseAgreementName && !pa && <p className="text-xs text-muted-foreground">On file: {request.details.purchaseAgreementName}. Choose a file only to replace it.</p>}</div>
            <label className="flex items-start gap-2"><Checkbox checked={paSigned} onCheckedChange={v => setPaSigned(v === true)} />I checked that this purchase agreement copy contains the required signatures.</label>
          </div>

          <div className={section}>
            <p className="font-medium">Fees</p>
            <div className="grid items-end gap-2 sm:grid-cols-2">
              <div className="space-y-1"><Label>Default management fee %</Label><Input inputMode="decimal" value={pctStr} onChange={(e) => { setFeePct(e.target.value); setFeeOk(false); }} /></div>
              <p>Amount on selected investors: <span className="font-semibold">{usd(feeCents)}</span></p>
            </div>
            <p className="text-xs text-muted-foreground">Applicable investor side letters override this default only for that investor. This is an estimate, not a charge.</p>
            <CloseInvestorTerms investors={pickedRows.map(r => ({ id: r.id, name: r.profileName || r.name, terms: r.terms }))} />
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1"><Label>Bank name</Label><Input value={extra.feeBank} onChange={(e) => setExtra({ ...extra, feeBank: e.target.value })} /></div>
              <div className="space-y-1"><Label>Address</Label><Input value={extra.feeAddress} onChange={(e) => setExtra({ ...extra, feeAddress: e.target.value })} /></div>
            </div>
            <label className="flex items-center gap-2"><Checkbox checked={feeOk} onCheckedChange={(v) => setFeeOk(!!v)} /> I confirm this percentage and amount are correct.</label>
            {activeFeePct != null && toPct(pctStr) !== Number(activeFeePct) && <p className="text-xs text-destructive">This differs from the fund's recorded fee of {activeFeePct}%. Harmonious will check it.</p>}
          </div>

          <div className={section}>
            <p className="font-medium">Legal fees</p>
            <label className="flex items-center gap-2"><Switch checked={extra.legalOn} onCheckedChange={(v) => setExtra({ ...extra, legalOn: v })} /> {extra.legalOn ? "Yes" : "No legal fees"}</label>
            {extra.legalOn && <div className="grid gap-2 sm:grid-cols-3">
              <div className="space-y-1"><Label>Payee account</Label><Input value={extra.legalPayee} onChange={(e) => setExtra({ ...extra, legalPayee: e.target.value })} /></div>
              <div className="space-y-1"><Label>Amount ($)</Label><Input inputMode="decimal" value={legal.amount} onChange={(e) => setLegal({ ...legal, amount: e.target.value })} /></div>
              <div className="space-y-1"><Label>Due date</Label><Input type="date" value={extra.legalDue} onChange={(e) => setExtra({ ...extra, legalDue: e.target.value })} /></div>
              <div className="space-y-1 sm:col-span-3"><Label>Details</Label><Input value={legal.detail} onChange={(e) => setLegal({ ...legal, detail: e.target.value })} /></div>
            </div>}
          </div>

          <div className={section}>
            <p className="font-medium">Broker-Dealer fee</p>
            <label className="flex items-center gap-2"><Switch checked={extra.bdOn} onCheckedChange={(v) => setExtra({ ...extra, bdOn: v })} /> {extra.bdOn ? "Yes" : "No Broker-Dealer fee"}</label>
            {extra.bdOn && <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1"><Label>Fee amount ($)</Label><Input inputMode="decimal" value={bd.amount} onChange={(e) => setBd({ ...bd, amount: e.target.value })} /></div>
              <div className="space-y-1"><Label>Payee account</Label><Input value={extra.bdPayee} onChange={(e) => setExtra({ ...extra, bdPayee: e.target.value })} /></div>
              <div className="space-y-1"><Label>Broker-Dealer name</Label><Input value={extra.bdName} onChange={(e) => setExtra({ ...extra, bdName: e.target.value })} /></div>
              <div className="space-y-1"><Label>Due date</Label><Input type="date" value={extra.bdDue} onChange={(e) => setExtra({ ...extra, bdDue: e.target.value })} /></div>
              <div className="space-y-1 sm:col-span-2"><Label>Details</Label><Input value={bd.detail} onChange={(e) => setBd({ ...bd, detail: e.target.value })} /></div>
            </div>}
          </div>

          <div className={section}>
            <p className="font-medium">Form D & Blue Sky fees</p>
            <p className="text-xs text-muted-foreground">Worked out from the addresses of the investors you picked and the filings already on the Compliance tab.</p>
            <div className="divide-y rounded border">
              <div className="flex justify-between p-2"><span>Electronic Form D Filing (always included)</span><span className="font-medium">{usd(filing.formDCents)}</span></div>
              {filing.lines.map((l) => (
                <div key={l.state} className="flex justify-between p-2">
                  <span>{l.state} Blue Sky notice · {l.investors} investor{l.investors === 1 ? "" : "s"}</span>
                  <span className={l.status === "review" ? "text-destructive" : "font-medium"}>{l.status === "filed" ? "Already filed · $0" : l.status === "none" ? "No state fee" : l.status === "review" ? "Needs review" : usd(l.cents)}</span>
                </div>
              ))}
              <div className="flex justify-between p-2 font-semibold"><span>Estimated total{filing.needsReview.length ? " (plus states needing review)" : ""}</span><span>{usd(filing.totalCents)}</span></div>
            </div>
            {noAddress.length > 0 && <p className="text-xs text-destructive">No state on file for: {noAddress.map((r) => r.name).join(", ")}. Add their address so their state is counted.</p>}
            <p className="text-xs text-muted-foreground">Harmonious confirms each state fee before filing. Nothing is filed or paid automatically.</p>
            <p>Side letters: {sideLetterCount === 0 ? "none for the selected investors" : <>{sideLetterCount} side letter{sideLetterCount === 1 ? "" : "s"} × {usd(SIDE_LETTER_FEE_CENTS)} = <span className="font-semibold">{usd(sideLetterCount * SIDE_LETTER_FEE_CENTS)}</span>. Harmonious confirms the total and credits any side letter already paid for.</>}</p>
          </div>

          <div className={section}>
            <p className="font-medium">Receiving account (wire to)</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1"><Label>Method</Label>
                <Select value={wire.method} onValueChange={(v) => setWire({ ...wire, method: v as "wire" | "ach" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="wire">Wire</SelectItem><SelectItem value="ach">ACH</SelectItem></SelectContent></Select>
              </div>
              <div className="space-y-1"><Label>Amount to send ($)</Label><Input inputMode="decimal" value={wire.amount} onChange={(e) => setWire({ ...wire, amount: e.target.value })} /></div>
              <div className="space-y-1"><Label>Bank address</Label><Input value={extra.wireAddress} onChange={(e) => setExtra({ ...extra, wireAddress: e.target.value })} /></div>
              <div className="space-y-1"><Label>Account name</Label><Input value={wire.beneficiary} onChange={(e) => setWire({ ...wire, beneficiary: e.target.value })} /></div>
              <div className="space-y-1"><Label>Bank name</Label><Input value={wire.bankName} onChange={(e) => setWire({ ...wire, bankName: e.target.value })} /></div>
              <div className="space-y-1"><Label>Routing number (last 4)</Label><Input maxLength={4} value={wire.routingLast4} onChange={(e) => setWire({ ...wire, routingLast4: e.target.value.replace(/\D/g, "") })} /></div>
              <div className="space-y-1"><Label>Account number (last 4)</Label><Input maxLength={4} value={wire.accountLast4} onChange={(e) => setWire({ ...wire, accountLast4: e.target.value.replace(/\D/g, "") })} /></div>
              <div className="space-y-1 sm:col-span-2"><Label>Reference / memo</Label><Input value={wire.reference} onChange={(e) => setWire({ ...wire, reference: e.target.value })} /></div>
            </div>
            <div className="space-y-1"><Label htmlFor="close-wire-instructions">Wire instructions copy (required to send)</Label><Input id="close-wire-instructions" type="file" onChange={e => setWireFile(e.target.files?.[0] ?? null)} />{request?.details?.wireInstructionsName && !wireFile && <p className="text-xs text-muted-foreground">On file: {request.details.wireInstructionsName}.</p>}</div>
            <p className="text-xs text-muted-foreground">Upload the full instructions separately. Uploading is not bank approval; Harmonious verifies instructions before any money moves.</p>
          </div>

          <div className="space-y-1"><Label htmlFor="close-notes">Notes (optional)</Label><Textarea id="close-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} /></div>
        </div>
        <DialogFooter>
          {missingAttachments.length > 0 && <p className="text-xs text-destructive">{missingAttachments.join(" ")} Drafts can still be saved.</p>}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy !== null}>Cancel</Button>
          <Button variant="secondary" onClick={() => onSave("draft")} disabled={busy !== null}>{busy === "draft" ? "Saving…" : "Save details"}</Button>
          {canSend ? <Button onClick={() => onSave("submit")} disabled={busy !== null || picked.size === 0 || missingAttachments.length > 0}>{busy === "submit" ? "Sending…" : "Send for review"}</Button> : <p className="max-w-xs text-right text-xs text-muted-foreground">The fund manager sends saved details for review. Operations can then review them on this same tab.</p>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
