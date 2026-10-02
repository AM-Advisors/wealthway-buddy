import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FundPaymentDialog, PaymentSummary, useFundPayment } from "@/components/fund-payment-checkout";
import { K1_FIELDS, type K1Totals } from "@/lib/k1-report-model";
import { decideK1ReportFn, fundK1ReportsFn, submitK1FiguresFn } from "@/lib/fund-k1-report.functions";
import { toCents, usd } from "./shared";

/** Year-end K-1 report: client enters fund totals, platform splits by investor, Harmonious approves into tax records. */
export function K1Report({ fundId }: { fundId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(fundK1ReportsFn);
  const submit = useServerFn(submitK1FiguresFn);
  const decide = useServerFn(decideK1ReportFn);
  const key = ["fund-k1-reports", fundId];
  const q = useQuery({ queryKey: key, queryFn: () => load({ data: { fundId } }) });
  const [year, setYear] = useState(String(new Date().getUTCFullYear() - 1));
  const [vals, setVals] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const totals: K1Totals = useMemo(() => {
    const o: any = {};
    for (const f of K1_FIELDS) { const c = toCents(vals[f.key] ?? ""); if (c != null) o[f.key] = c; }
    return o;
  }, [vals]);
  const staff = !!q.data?.staff;
  const target = { kind: "service_request" as const, answers: { offering_id: fundId }, serviceKeys: ["tax_k1"] };
  const quote = useFundPayment(q.data && !staff ? target : null);
  const total = quote.data?.totalCents ?? 0;
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const send = useMutation({
    mutationFn: (paymentId?: string) => submit({ data: { fundId, taxYear: Number(year), totals: totals as any, notes: notes || undefined, paymentId: paymentId ?? null } }),
    onSuccess: () => { toast.success("K-1 draft built and sent to Harmonious for approval."); setVals({}); setNotes(""); setPayOpen(false); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const dm = useMutation({
    mutationFn: (a: { id: string; approve: boolean; note?: string | undefined }) => decide({ data: a }),
    onSuccess: (r) => { toast.success(r.recorded ? `${r.recorded} K-1 draft(s) added to the tax records.` : "Saved"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const filled = K1_FIELDS.some((f) => vals[f.key]?.trim());
  const validYear = /^\d{4}$/.test(year);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">K-1 report</CardTitle>
        <CardDescription>Enter the fund's year totals. The platform splits them across investors; once Harmonious approves, draft K-1s go into the fund's tax records for the tax team to finalize. Nothing is filed from here.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="max-w-40 space-y-1"><Label>Tax year</Label><Input inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} /></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {K1_FIELDS.map((f) => (
            <div key={f.key} className="space-y-1"><Label className="text-xs">Box {f.box} · {f.label} ($)</Label>
              <Input inputMode="decimal" value={vals[f.key] ?? ""} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} placeholder="0" /></div>
          ))}
        </div>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} placeholder="Notes for Harmonious (special allocations, state items)" />
        <p className="text-xs text-muted-foreground">Amounts are split by each investor's funded amount (or commitment if nobody has funded yet).</p>
        {!staff && quote.data && <PaymentSummary items={quote.data.items} total={total} />}
        <Button disabled={!filled || !validYear || send.isPending} onClick={() => (!staff && total > 0 ? setPayOpen(true) : send.mutate(undefined))}>
          {!staff && total > 0 ? "Pay and build K-1s" : "Build K-1s"}
        </Button>
        <div className="space-y-2">
          <h4 className="text-sm font-medium">K-1 reports</h4>
          {!q.data?.drafts.length ? <p className="text-sm text-muted-foreground">No K-1 reports yet.</p> : (
            <div className="divide-y rounded-md border">{q.data.drafts.map((r: any) => <K1Row key={r.id} r={r} staff={staff} onDecide={(approve, note) => dm.mutate({ id: r.id, approve, note })} />)}</div>
          )}
        </div>
      </CardContent>
      {payOpen && <FundPaymentDialog open={payOpen} onOpenChange={setPayOpen} target={target} onPaid={(id) => send.mutate(id)} />}
    </Card>
  );
}

function K1Row({ r, staff, onDecide }: { r: any; staff: boolean; onDecide: (approve: boolean, note?: string) => void }) {
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const lines = (r.computed?.lines ?? []) as any[];
  const flags = (r.computed?.flags ?? []) as string[];
  return (
    <div className="space-y-2 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">Tax year {r.inputs?.taxYear} · {lines.length} investor{lines.length === 1 ? "" : "s"}</p>
        <Badge variant={r.status === "approved" ? "default" : r.status === "returned" ? "destructive" : "secondary"}>
          {r.status === "submitted" ? "Draft - Harmonious reviewing" : r.status === "approved" ? "Approved" : "Returned"}
        </Badge>
      </div>
      {flags.length > 0 && <ul className="list-disc pl-5 text-xs">{flags.map((f) => <li key={f}>{f}</li>)}</ul>}
      <Button size="sm" variant="ghost" onClick={() => setOpen(!open)}>{open ? "Hide" : "Show"} investor split</Button>
      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground"><tr><th className="py-1">Investor</th><th className="text-right">Share</th>{K1_FIELDS.map((f) => <th key={f.box} className="text-right">Box {f.box}</th>)}</tr></thead>
            <tbody>{lines.map((l) => <tr key={l.onboardingId} className="border-t"><td className="py-1">{l.name}</td><td className="text-right">{l.sharePct}%</td>{K1_FIELDS.map((f) => <td key={f.box} className="text-right">{l.boxes?.[f.box] ? usd(l.boxes[f.box]) : "-"}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
      {r.decision_note && <p className="text-xs text-muted-foreground">Harmonious: {r.decision_note}</p>}
      {staff && r.status === "submitted" && (
        <div className="flex flex-wrap items-center gap-2">
          <Input className="max-w-sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Review note (required to return)" />
          <Button size="sm" onClick={() => onDecide(true, note)}>Approve and add to tax records</Button>
          <Button size="sm" variant="outline" onClick={() => onDecide(false, note)}>Return</Button>
        </div>
      )}
    </div>
  );
}
