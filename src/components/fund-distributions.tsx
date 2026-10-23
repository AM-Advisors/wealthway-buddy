import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  setupDistributionFn, fundDistributionsFn, distributionSheetFn, approveDistributionFeeFn,
  setShareDestinationFn, distributionBankFileFn, recordShareTransferFn,
} from "@/lib/distributions-inkind.functions";
import { DISTRIBUTION_KIND_LABELS, CASH_DISTRIBUTION_FEE_CENTS, type DistributionKind } from "@/lib/distributions-inkind-model";
import { DISTRIBUTION_TYPES, DISTRIBUTION_TYPE_LABELS, type DistributionType } from "@/lib/distributions-model";

const usd = (c: number | null | undefined) => c == null ? "-" : (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const toCents = (s: string) => { const n = Number(s.replace(/[$,\s]/g, "")); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null; };
const err = (e: unknown) => toast.error((e as Error).message);

export function FundDistributions({ fundId, mode }: { fundId: string; mode: "client" | "harmonious" }) {
  const load = useServerFn(fundDistributionsFn);
  const q = useQuery({ queryKey: ["fund-distributions", fundId], queryFn: () => load({ data: { offeringId: fundId } }) });
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  if (q.isPending) return <p className="text-sm text-muted-foreground">Loading distributions…</p>;
  if (q.isError) return <p className="text-sm" role="alert">{(q.error as Error).message}</p>;
  const { batches, isStaff } = q.data;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Distributions</CardTitle>
            <CardDescription>Calculate, verify, approve and send cash or share distributions. Harmonious never moves money or shares on its own.</CardDescription>
          </div>
          <Button onClick={() => setOpen(true)}>New distribution</Button>
        </CardHeader>
        <CardContent>
          {batches.length === 0 ? <p className="text-sm text-muted-foreground">No distributions yet.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Distribution</TableHead><TableHead>Type</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Fee</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>{batches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>{b.title ?? "Distribution"}<div className="text-xs text-muted-foreground">{b.paymentDate ?? new Date(b.createdAt).toLocaleDateString()}</div></TableCell>
                  <TableCell>{DISTRIBUTION_KIND_LABELS[b.kind as DistributionKind] ?? b.kind}</TableCell>
                  <TableCell>{b.kind === "shares" ? `${b.shareCount?.toLocaleString()} sh ${b.shareIssuer ?? ""}` : usd(b.declaredCents)}{b.kind === "cash_and_shares" && <div className="text-xs text-muted-foreground">+ {b.shareCount?.toLocaleString()} sh {b.shareIssuer}</div>}</TableCell>
                  <TableCell><Badge variant="secondary" className="capitalize">{b.status.replaceAll("_", " ")}</Badge></TableCell>
                  <TableCell>{usd(b.feeCents)}{!b.feeApproved && <div className="text-xs text-destructive">Quote needs approval</div>}</TableCell>
                  <TableCell><Button size="sm" variant="outline" onClick={() => setSelected(b.id)}>Open</Button></TableCell>
                </TableRow>))}
              </TableBody>
            </Table>)}
        </CardContent>
      </Card>
      {selected && <DistributionDetail batchId={selected} fundId={fundId} mode={mode} isStaff={isStaff} onClose={() => setSelected(null)} />}
      <NewDistributionDialog fundId={fundId} open={open} onOpenChange={setOpen} onCreated={(id) => { setSelected(id); q.refetch(); }} />
    </div>
  );
}

function NewDistributionDialog({ fundId, open, onOpenChange, onCreated }: { fundId: string; open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const setup = useServerFn(setupDistributionFn);
  const [kind, setKind] = useState<DistributionKind>("cash");
  const [type, setType] = useState<DistributionType>("ordinary");
  const [f, setF] = useState({ title: "", paymentDate: "", cash: "", issuer: "", cls: "", count: "", price: "", isPublic: "private", custodian: "", fee: "", custodianCost: "", feeNote: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const shares = kind !== "cash";
  const shareValue = shares ? (Number(f.count) || 0) * (toCents(f.price) ?? 0) : 0;
  async function submit() {
    setBusy(true);
    try {
      const r = await setup({ data: {
        offeringId: fundId, kind, distributionType: type, title: f.title || null, paymentDate: f.paymentDate || null,
        cashCents: kind === "shares" ? null : toCents(f.cash),
        shareIssuer: shares ? f.issuer : null, shareClass: shares ? f.cls || null : null,
        shareCount: shares && Number(f.count) > 0 ? Math.floor(Number(f.count)) : null,
        sharePriceCents: shares ? toCents(f.price) : null, shareIsPublic: shares ? f.isPublic === "public" : null,
        shareCustodian: shares ? f.custodian : null,
        harmoniousFeeCents: shares ? toCents(f.fee) ?? 0 : null, custodianCostCents: shares ? toCents(f.custodianCost) ?? 0 : null,
        feeNote: shares ? f.feeNote : null,
      } });
      toast.success(`Calculated for ${r.recipients} investor(s)${r.unallocatedShares ? `; ${r.unallocatedShares} share(s) unallocated` : ""}.`);
      onOpenChange(false); onCreated(r.batchId);
    } catch (e) { err(e); } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>New distribution</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>What's being distributed</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as DistributionKind)}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(DISTRIBUTION_KIND_LABELS) as DistributionKind[]).map((k) => <SelectItem key={k} value={k}>{DISTRIBUTION_KIND_LABELS[k]}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Tax character</Label>
              <Select value={type} onValueChange={(v) => setType(v as DistributionType)}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DISTRIBUTION_TYPES.map((t) => <SelectItem key={t} value={t}>{DISTRIBUTION_TYPE_LABELS[t]}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Title</Label><Input value={f.title} onChange={set("title")} placeholder="Q3 proceeds" /></div>
            <div><Label>Payment date</Label><Input type="date" value={f.paymentDate} onChange={set("paymentDate")} /></div>
          </div>
          {kind !== "shares" && <div><Label>Cash to distribute (USD)</Label><Input inputMode="decimal" value={f.cash} onChange={set("cash")} placeholder="250,000" /></div>}
          {shares && <>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Company</Label><Input value={f.issuer} onChange={set("issuer")} /></div>
              <div><Label>Share class</Label><Input value={f.cls} onChange={set("cls")} placeholder="Common" /></div>
              <div><Label>Number of shares</Label><Input inputMode="numeric" value={f.count} onChange={set("count")} /></div>
              <div><Label>Value per share (USD)</Label><Input inputMode="decimal" value={f.price} onChange={set("price")} /></div>
              <div><Label>Public or private</Label>
                <Select value={f.isPublic} onValueChange={(v) => setF({ ...f, isPublic: v })}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="private">Private company</SelectItem><SelectItem value="public">Public company</SelectItem></SelectContent></Select></div>
              <div><Label>Custodian / transfer agent</Label><Input value={f.custodian} onChange={set("custodian")} /></div>
            </div>
            <p className="text-sm text-muted-foreground">Share value: {usd(shareValue)}</p>
          </>}
          <div className="rounded-md border p-3 space-y-2">
            <p className="text-sm font-medium">Harmonious fee (paid by the fund)</p>
            {!shares ? <p className="text-sm">{usd(CASH_DISTRIBUTION_FEE_CENTS)} standard cash distribution fee.</p> : <>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Harmonious fee (USD)</Label><Input inputMode="decimal" value={f.fee} onChange={set("fee")} /></div>
                <div><Label>Custodian cost (USD)</Label><Input inputMode="decimal" value={f.custodianCost} onChange={set("custodianCost")} /></div>
              </div>
              <div><Label>Quote notes</Label><Textarea value={f.feeNote} onChange={set("feeNote")} placeholder="Private company, transfer agent charges per certificate…" /></div>
              <p className="text-xs text-muted-foreground">The CEO or CRO must approve this quote before final approval.</p>
            </>}
          </div>
        </div>
        <DialogFooter><Button onClick={submit} disabled={busy}>{busy ? "Calculating…" : "Calculate distribution"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DistributionDetail({ batchId, fundId, mode, isStaff, onClose }: { batchId: string; fundId: string; mode: "client" | "harmonious"; isStaff: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const load = useServerFn(distributionSheetFn);
  const approveFee = useServerFn(approveDistributionFeeFn);
  const setDest = useServerFn(setShareDestinationFn);
  const bankFile = useServerFn(distributionBankFileFn);
  const recordTransfer = useServerFn(recordShareTransferFn);
  const q = useQuery({ queryKey: ["distribution-sheet", batchId], queryFn: () => load({ data: { batchId } }) });
  const refresh = () => { q.refetch(); qc.invalidateQueries({ queryKey: ["fund-distributions", fundId] }); };
  if (q.isPending) return <p className="text-sm text-muted-foreground">Loading sheet…</p>;
  if (q.isError) return <p className="text-sm" role="alert">{(q.error as Error).message}</p>;
  const { batch: b, rows } = q.data;
  const hasShares = b.kind !== "cash";
  const hasCash = b.kind !== "shares";
  const approved = ["approved", "executing", "completed"].includes(b.status);

  async function exportSheet() {
    const XLSX = await import("xlsx");
    const data = rows.map((r) => ({
      Investor: r.investor, "Ownership %": r.ownershipPct, Cash: (r.cashCents ?? 0) / 100,
      ...(hasShares ? { Shares: r.shares ?? 0, "Share value": (r.shareValueCents ?? 0) / 100, "Share destination": r.shareDestination ?? "" } : {}),
      Withholding: r.withholdingCents / 100, Net: r.netCents / 100, "Wire destination": r.destination ?? "", Verified: r.destinationVerified ? "Yes" : "No",
    }));
    data.push({ Investor: "Harmonious fee (fund expense)", "Ownership %": 0, Cash: 0, Withholding: 0, Net: -(b.harmoniousFeeCents + b.custodianCostCents) / 100, "Wire destination": b.feeNote ?? "", Verified: "" } as any);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Distribution");
    XLSX.writeFile(wb, `distribution-sheet-${b.id.slice(0, 8)}.xlsx`);
  }
  async function downloadBank() {
    try {
      const r = await bankFile({ data: { batchId } });
      const url = URL.createObjectURL(new Blob([r.csv], { type: "text/csv" }));
      const a = document.createElement("a"); a.href = url; a.download = r.filename; a.click(); URL.revokeObjectURL(url);
      toast.success(`Bank file for ${r.count} payment(s). Upload it to the bank yourself, then record each bank reference.`);
    } catch (e) { err(e); }
  }
  async function transferLetter() {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    doc.setFontSize(14); doc.text("Share Transfer Instruction", 20, 20);
    doc.setFontSize(10);
    doc.text([`To: ${b.shareCustodian ?? ""}`, `Issuer: ${b.shareIssuer ?? ""} ${b.shareClass ?? ""}`, `Total shares: ${b.shareCount?.toLocaleString() ?? ""}`, `Distribution: ${b.title ?? b.id}`, "", "Please transfer the shares below to each listed account:"], 20, 32);
    let y = 70;
    for (const r of rows.filter((x) => (x.shares ?? 0) > 0)) { doc.text(`${r.investor} — ${r.shares?.toLocaleString()} shares — ${r.shareDestination ?? "ACCOUNT NEEDED"}`, 20, y); y += 7; if (y > 270) { doc.addPage(); y = 20; } }
    doc.text("Authorized signature: ______________________   Date: __________", 20, Math.min(y + 15, 285));
    doc.save(`share-transfer-${b.id.slice(0, 8)}.pdf`);
  }

  const steps = [
    { l: "Calculated", done: true },
    { l: "Wire / share accounts verified", done: rows.every((r) => (!hasCash || r.cashCents <= 0 || r.destinationVerified) && (!hasShares || !(r.shares ?? 0) || !!r.shareDestination)) },
    { l: "Fee approved", done: b.feeApproved },
    { l: "Manager approved", done: b.managerApproved },
    { l: "Final approval", done: b.finalApproved },
    { l: "Sent & confirmed", done: b.status === "completed" },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">{b.title ?? "Distribution"} · {DISTRIBUTION_KIND_LABELS[b.kind as DistributionKind]}</CardTitle>
          <CardDescription>
            {hasCash && <>Cash {usd(b.cashCents)}. </>}
            {hasShares && <>{b.shareCount?.toLocaleString()} {b.shareClass ?? ""} shares of {b.shareIssuer} ({b.shareIsPublic ? "public" : "private"}) at {usd(b.sharePriceCents)} held by {b.shareCustodian}. </>}
            Fee {usd(b.harmoniousFeeCents)}{b.custodianCostCents ? ` + custodian ${usd(b.custodianCostCents)}` : ""}, paid by the fund.
          </CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="flex flex-wrap gap-2 text-xs">{steps.map((s, i) => <li key={s.l}><Badge variant={s.done ? "default" : "outline"}>{i + 1}. {s.l}</Badge></li>)}</ol>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={exportSheet}>Download distribution sheet</Button>
          {isStaff && !b.feeApproved && <Button size="sm" variant="outline" onClick={async () => { try { await approveFee({ data: { batchId } }); toast.success("Fee approved."); refresh(); } catch (e) { err(e); } }}>Approve fee quote</Button>}
          {isStaff && approved && hasCash && <Button size="sm" onClick={downloadBank}>Download bank file</Button>}
          {isStaff && approved && hasShares && <Button size="sm" onClick={transferLetter}>Share transfer letter</Button>}
          <Button size="sm" variant="link" asChild>
            {mode === "harmonious" ? <Link to="/ops/distributions">Approvals & payment recording</Link> : <Link to="/manager/distributions">Review & approve</Link>}
          </Button>
        </div>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Investor</TableHead><TableHead>Own %</TableHead>{hasCash && <TableHead>Cash</TableHead>}{hasShares && <TableHead>Shares</TableHead>}
            <TableHead>Withholding</TableHead><TableHead>Net</TableHead>{hasCash && <TableHead>Wire</TableHead>}{hasShares && <TableHead>Share account</TableHead>}<TableHead>Status</TableHead>
          </TableRow></TableHeader>
          <TableBody>{rows.map((r) => (
            <TableRow key={r.lineId}>
              <TableCell>{r.investor}</TableCell><TableCell>{r.ownershipPct}%</TableCell>
              {hasCash && <TableCell>{usd(r.cashCents)}</TableCell>}
              {hasShares && <TableCell>{r.shares?.toLocaleString() ?? 0}<div className="text-xs text-muted-foreground">{usd(r.shareValueCents)}</div></TableCell>}
              <TableCell>{usd(r.withholdingCents)}</TableCell><TableCell>{usd(r.netCents)}</TableCell>
              {hasCash && <TableCell>{r.cashCents > 0 ? (r.destinationVerified ? <span className="text-sm">{r.destination}</span> : <Badge variant="destructive">Not verified</Badge>) : "-"}</TableCell>}
              {hasShares && <TableCell>{(r.shares ?? 0) > 0 ? (r.shareDestination ?? (isStaff && !approved ? <ShareDest onSave={async (d) => { try { await setDest({ data: { lineId: r.lineId, destination: d } }); refresh(); } catch (e) { err(e); } }} /> : <Badge variant="destructive">Needed</Badge>)) : "-"}</TableCell>}
              <TableCell className="space-y-1">
                <span className="text-xs capitalize">{r.paymentState.replaceAll("_", " ")}{r.shareTransfer ? ` · shares ${r.shareTransfer}` : ""}</span>
                {isStaff && approved && (r.shares ?? 0) > 0 && r.shareTransfer !== "confirmed" && <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={async () => { try { await recordTransfer({ data: { lineId: r.lineId, event: "instructed" } }); refresh(); } catch (e) { err(e); } }}>Instructed</Button>
                  <Button size="sm" variant="outline" onClick={async () => { const ref = window.prompt("Custodian confirmation reference"); if (!ref) return; try { await recordTransfer({ data: { lineId: r.lineId, event: "confirmed", confirmationRef: ref } }); refresh(); } catch (e) { err(e); } }}>Confirmed</Button>
                </div>}
              </TableCell>
            </TableRow>))}
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground">Wire instructions are verified by each investor through their own secure step. Cash payments are marked paid only after the bank reference is recorded and reconciled on the approvals page.</p>
      </CardContent>
    </Card>
  );
}

function ShareDest({ onSave }: { onSave: (d: string) => void }) {
  const [v, setV] = useState("");
  return <div className="flex gap-1"><Input className="h-8 w-40" value={v} onChange={(e) => setV(e.target.value)} placeholder="Brokerage acct" /><Button size="sm" variant="outline" onClick={() => onSave(v)}>Save</Button></div>;
}
