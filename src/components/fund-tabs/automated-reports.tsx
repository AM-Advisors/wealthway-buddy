import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FundPaymentDialog, PaymentSummary, useFundPayment } from "@/components/fund-payment-checkout";
import { REPORT_FIELDS, computeNav, type ReportInputs } from "@/lib/fund-report-model";
import { decideReportFn, fundReportsFn, setReportFrequencyFn, submitReportFiguresFn } from "@/lib/fund-reports.functions";
import { fmtDate, toCents, usd } from "./shared";

const KIND_LABEL = { nav: "NAV report", financial_review: "Financial review" } as const;
const KEY = { nav: "nav_reporting", financial_review: "financial_review" } as const;

function lastPeriod(freq: "monthly" | "quarterly") {
  const now = new Date();
  const y = now.getUTCFullYear(), m = now.getUTCMonth();
  const endMonth = freq === "monthly" ? m - 1 : Math.floor(m / 3) * 3 - 1;
  const start = new Date(Date.UTC(y, freq === "monthly" ? endMonth : endMonth - 2, 1));
  const end = new Date(Date.UTC(y, endMonth + 1, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function AutomatedReports({ fundId, fundName }: { fundId: string; fundName: string }) {
  const qc = useQueryClient();
  const load = useServerFn(fundReportsFn);
  const q = useQuery({ queryKey: ["fund-reports", fundId], queryFn: () => load({ data: { fundId } }) });
  const setFreq = useServerFn(setReportFrequencyFn);
  const submit = useServerFn(submitReportFiguresFn);
  const decide = useServerFn(decideReportFn);
  const freq = q.data?.frequency ?? "quarterly";
  const [kind, setKind] = useState<"nav" | "financial_review">("nav");
  const [period, setPeriod] = useState<{ start: string; end: string } | null>(null);
  const p = period ?? lastPeriod(freq);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [units, setUnits] = useState("");
  const [notes, setNotes] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const inputs: ReportInputs = useMemo(() => {
    const o: any = { notes: notes || undefined, units: units ? Number(units) : null };
    for (const f of REPORT_FIELDS) { const c = toCents(vals[f.key] ?? ""); if (c != null) o[f.key] = c; }
    return o;
  }, [vals, units, notes]);
  const prior = (q.data?.drafts ?? []).find((d: any) => d.status === "approved" && d.period_end < p.start)?.computed?.navCents ?? null;
  const preview = computeNav(inputs, prior);
  const target = { kind: "service_request" as const, answers: { offering_id: fundId }, serviceKeys: [KEY[kind]] };
  const quote = useFundPayment(q.data && !q.data.staff ? target : null);
  const total = quote.data?.totalCents ?? 0;
  const refresh = () => qc.invalidateQueries({ queryKey: ["fund-reports", fundId] });

  const send = useMutation({
    mutationFn: (paymentId?: string) => submit({ data: { fundId, kind, periodStart: p.start, periodEnd: p.end, inputs: inputs as any, paymentId: paymentId ?? null } }),
    onSuccess: () => { toast.success("Draft built and sent to Harmonious for approval."); setVals({}); setNotes(""); setPayOpen(false); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const dm = useMutation({
    mutationFn: (a: { id: string; approve: boolean; note?: string | undefined }) => decide({ data: a }),
    onSuccess: () => { toast.success("Saved"); refresh(); }, onError: (e: Error) => toast.error(e.message),
  });
  const fm = useMutation({ mutationFn: (f: "monthly" | "quarterly") => setFreq({ data: { fundId, frequency: f } }), onSuccess: () => { setPeriod(null); refresh(); }, onError: (e: Error) => toast.error(e.message) });
  const filled = REPORT_FIELDS.some((f) => vals[f.key]?.trim());

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Automated NAV and financial review</CardTitle>
          <CardDescription>Enter the fund's figures. The platform builds the draft; Harmonious reviews and approves it before it's final.</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs">Frequency</Label>
          <Select value={freq} onValueChange={(v) => fm.mutate(v as any)}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="quarterly">Quarterly</SelectItem></SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1"><Label>Report</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="nav">NAV report</SelectItem><SelectItem value="financial_review">Financial review</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Period start</Label><Input type="date" value={p.start} onChange={(e) => setPeriod({ ...p, start: e.target.value })} /></div>
          <div className="space-y-1"><Label>Period end</Label><Input type="date" value={p.end} onChange={(e) => setPeriod({ ...p, end: e.target.value })} /></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {REPORT_FIELDS.map((f) => (
            <div key={f.key} className="space-y-1"><Label className="text-xs">{f.label} ($)</Label>
              <Input inputMode="decimal" value={vals[f.key] ?? ""} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} placeholder="0" /></div>
          ))}
          <div className="space-y-1"><Label className="text-xs">Units outstanding (optional)</Label><Input inputMode="decimal" value={units} onChange={(e) => setUnits(e.target.value)} /></div>
        </div>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} placeholder="Notes for Harmonious (valuation sources, unusual items)" />
        <div className="grid gap-3 rounded-lg border bg-muted/40 p-3 text-sm sm:grid-cols-4">
          <div><p className="text-xs text-muted-foreground">Gross assets</p><p className="font-semibold">{usd(preview.grossAssetsCents)}</p></div>
          <div><p className="text-xs text-muted-foreground">NAV</p><p className="font-semibold">{usd(preview.navCents)}</p></div>
          <div><p className="text-xs text-muted-foreground">NAV per unit</p><p className="font-semibold">{preview.navPerUnitCents == null ? "-" : usd(preview.navPerUnitCents)}</p></div>
          <div><p className="text-xs text-muted-foreground">Change vs prior</p><p className="font-semibold">{preview.changePct == null ? "-" : `${preview.changePct}%`}</p></div>
        </div>
        {!q.data?.staff && quote.data && <PaymentSummary items={quote.data.items} total={total} />}
        <Button disabled={!filled || send.isPending} onClick={() => (!q.data?.staff && total > 0 ? setPayOpen(true) : send.mutate(undefined))}>
          {!q.data?.staff && total > 0 ? `Pay and build ${KIND_LABEL[kind]}` : `Build ${KIND_LABEL[kind]}`}
        </Button>

        <div className="space-y-2">
          <h4 className="text-sm font-medium">Reports</h4>
          {!q.data?.drafts.length ? <p className="text-sm text-muted-foreground">No reports built yet.</p> : (
            <div className="divide-y rounded-md border">
              {q.data.drafts.map((r: any) => <DraftRow key={r.id} r={r} staff={!!q.data?.staff} onDecide={(approve, note) => dm.mutate({ id: r.id, approve, note })} />)}
            </div>
          )}
        </div>
      </CardContent>
      {payOpen && <FundPaymentDialog open={payOpen} onOpenChange={setPayOpen} target={target} onPaid={(id) => send.mutate(id)} />}
      <span className="sr-only">{fundName}</span>
    </Card>
  );
}

function DraftRow({ r, staff, onDecide }: { r: any; staff: boolean; onDecide: (approve: boolean, note?: string) => void }) {
  const [note, setNote] = useState("");
  const c = r.computed ?? {};
  return (
    <div className="space-y-2 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{KIND_LABEL[r.kind as keyof typeof KIND_LABEL]} · {fmtDate(r.period_start)} – {fmtDate(r.period_end)}</p>
        <Badge variant={r.status === "approved" ? "default" : r.status === "returned" ? "destructive" : "secondary"}>
          {r.status === "submitted" ? "Draft - Harmonious reviewing" : r.status === "approved" ? "Approved" : "Returned"}
        </Badge>
      </div>
      <p className="text-muted-foreground">NAV {usd(c.navCents)}{c.navPerUnitCents != null ? ` · ${usd(c.navPerUnitCents)} per unit` : ""}{c.changePct != null ? ` · ${c.changePct}% vs prior` : ""}{c.expenseRatioPct != null ? ` · expenses ${c.expenseRatioPct}% of NAV` : ""}</p>
      {Array.isArray(c.flags) && c.flags.length > 0 && <ul className="list-disc pl-5 text-xs">{c.flags.map((f: string) => <li key={f}>{f}</li>)}</ul>}
      {r.decision_note && <p className="text-xs text-muted-foreground">Harmonious: {r.decision_note}</p>}
      {staff && r.status === "submitted" && (
        <div className="flex flex-wrap items-center gap-2">
          <Input className="max-w-sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Review note (required to return)" />
          <Button size="sm" onClick={() => onDecide(true, note)}>Approve</Button>
          <Button size="sm" variant="outline" onClick={() => onDecide(false, note)}>Return</Button>
        </div>
      )}
    </div>
  );
}
