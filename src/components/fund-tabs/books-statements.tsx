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
import { addLiabilityFn, booksFiguresFn, listLiabilitiesFn, saveStatementDraftFn, settleLiabilityFn } from "@/lib/fund-books.functions";
import { CentsBarChart, CentsDonut } from "./charts";
import { fmtDate, toCents, usd } from "./shared";

const KINDS: Record<string, string> = { accrued_expense: "Accrued expense", payable: "Bill to pay", loan: "Loan", management_fee_payable: "Management fee owed", other: "Other" };
const today = () => new Date().toISOString().slice(0, 10);

/** The fund's books: cash from applied bank activity, approved asset values, and recorded liabilities -> statements and charts. */
export function BooksStatements({ fundId }: { fundId: string }) {
  const qc = useQueryClient();
  const y = new Date().getUTCFullYear();
  const [start, setStart] = useState(`${y}-01-01`);
  const [end, setEnd] = useState(today());
  const build = useServerFn(booksFiguresFn);
  const save = useServerFn(saveStatementDraftFn);
  const q = useQuery({ queryKey: ["fund-books-figures", fundId, start, end], queryFn: () => build({ data: { fundId, start, end, taxYear: Number(end.slice(0, 4)) } }), enabled: start <= end });
  const sm = useMutation({ mutationFn: () => save({ data: { fundId, start, end, periodType: start.slice(5) === "01-01" && end.slice(5) === "12-31" ? "annual" : "quarterly" } }), onSuccess: () => toast.success("Saved as a draft statement package for Harmonious review."), onError: (e: Error) => toast.error(e.message) });
  const f = q.data; const st = f?.statements;
  const row = (l: string, c: number, bold = false) => <div className={`flex justify-between py-1 ${bold ? "border-t font-semibold" : ""}`}><span>{l}</span><span>{usd(c)}</span></div>;
  const empty = !f || !f.entryCount;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Fund books and financial statements</CardTitle>
        <CardDescription>Cash comes from bank activity you've applied, investments from approved asset values, and liabilities from the list below. Statements stay a draft until Harmonious reviews and approves them; investors see nothing until then.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1"><Label className="text-xs">From</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">As of</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          {st && !empty && <Button variant="outline" disabled={sm.isPending} onClick={() => sm.mutate()}>Save as draft package (Harmonious)</Button>}
        </div>
        {q.isLoading ? <p className="text-sm text-muted-foreground">Loading the books…</p> : q.error ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> : empty ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">The books are empty. Apply a bank statement or connect the bank on the Banking tab, add an asset on the Assets tab, or record a liability below — the statements and charts fill in from those.</p>
        ) : st && (
          <>
            <div className="grid gap-5 lg:grid-cols-2">
              <div><p className="mb-1 text-sm font-medium">Balance sheet by month</p><CentsBarChart data={f.series} xKey="label" series={[{ key: "cash", label: "Cash" }, { key: "investments", label: "Investments" }, { key: "liabilities", label: "Liabilities" }, { key: "netAssets", label: "Net assets" }]} /></div>
              <div><p className="mb-1 text-sm font-medium">What the fund holds (as of {fmtDate(end)})</p><CentsDonut data={[{ name: "Cash", value: Math.max(0, st.balanceSheet.cashCents) }, ...f.assets.map((a: any) => ({ name: a.name, value: a.valueCents }))]} /></div>
            </div>
            <div className="grid gap-4 text-sm md:grid-cols-3">
              <div className="rounded-md border p-3"><p className="mb-1 font-medium">Balance sheet</p>{row("Cash", st.balanceSheet.cashCents)}{row("Investments at value", st.balanceSheet.investmentsCents)}{row("Total assets", st.balanceSheet.totalAssetsCents, true)}{row("Liabilities", st.balanceSheet.liabilitiesCents)}{row("Partners' capital", st.balanceSheet.partnersCapitalCents, true)}</div>
              <div className="rounded-md border p-3"><p className="mb-1 font-medium">Income statement</p>{row("Income", st.incomeStatement.incomeCents)}{row("Expenses", -st.incomeStatement.expensesCents)}{row("Net income", st.incomeStatement.netIncomeCents, true)}{row("Unrealized gain (loss)", st.incomeStatement.unrealizedGainCents)}{row("Total return", st.incomeStatement.totalReturnCents, true)}</div>
              <div className="rounded-md border p-3"><p className="mb-1 font-medium">Changes in capital</p>{row("Opening", st.changesInCapital.openingCents)}{row("Contributions", st.changesInCapital.contributionsCents)}{row("Distributions", -st.changesInCapital.distributionsCents)}{row("Net income", st.changesInCapital.netIncomeCents)}{row("Unrealized", st.changesInCapital.unrealizedCents)}{row("Closing", st.changesInCapital.closingCents, true)}</div>
            </div>
            {st.changesInCapital.closingCents !== st.balanceSheet.partnersCapitalCents && (
              <p className="text-xs text-muted-foreground">Partners' capital on the balance sheet differs from the capital roll-forward by {usd(Math.abs(st.changesInCapital.closingCents - st.balanceSheet.partnersCapitalCents))} — usually liabilities or asset purchases not yet in the books. Harmonious reviews this before approval.</p>
            )}
          </>
        )}
        <Liabilities fundId={fundId} onChange={() => qc.invalidateQueries({ queryKey: ["fund-books-figures", fundId] })} />
      </CardContent>
    </Card>
  );
}

function Liabilities({ fundId, onChange }: { fundId: string; onChange: () => void }) {
  const qc = useQueryClient();
  const list = useServerFn(listLiabilitiesFn), add = useServerFn(addLiabilityFn), settle = useServerFn(settleLiabilityFn);
  const key = ["fund-liabilities", fundId];
  const q = useQuery({ queryKey: key, queryFn: () => list({ data: { fundId } }) });
  const [v, setV] = useState({ description: "", kind: "accrued_expense", amount: "", incurredOn: today() });
  const done = () => { qc.invalidateQueries({ queryKey: key }); onChange(); };
  const am = useMutation({ mutationFn: () => add({ data: { fundId, description: v.description, kind: v.kind as any, amountCents: toCents(v.amount) ?? 0, incurredOn: v.incurredOn, note: null } }), onSuccess: () => { setV({ ...v, description: "", amount: "" }); done(); }, onError: (e: Error) => toast.error(e.message) });
  const sm = useMutation({ mutationFn: (id: string) => settle({ data: { fundId, id, settledOn: today() } }), onSuccess: done, onError: (e: Error) => toast.error(e.message) });
  const ok = v.description.trim() && (toCents(v.amount) ?? 0) > 0;
  return (
    <div className="space-y-3 rounded-md border p-3">
      <div><p className="text-sm font-medium">Liabilities</p><p className="text-xs text-muted-foreground">What the fund owes — unpaid bills, accrued fees, loans. Mark one paid when it's settled; it stays on earlier balance sheets.</p></div>
      <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] sm:items-end">
        <Input placeholder="Description (e.g. Audit fee accrued)" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
        <Select value={v.kind} onValueChange={(k) => setV({ ...v, kind: k })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(KINDS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select>
        <Input inputMode="decimal" placeholder="Amount $" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} />
        <Input type="date" value={v.incurredOn} onChange={(e) => setV({ ...v, incurredOn: e.target.value })} />
        <Button disabled={!ok || am.isPending} onClick={() => am.mutate()}>Add</Button>
      </div>
      {!!q.data?.length && (
        <table className="w-full text-sm"><thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1">Description</th><th>Type</th><th>Since</th><th className="text-right">Amount</th><th /></tr></thead>
          <tbody>{q.data.map((l: any) => <tr key={l.id} className="border-t"><td className="py-1">{l.description}</td><td>{KINDS[l.kind] ?? l.kind}</td><td>{fmtDate(l.incurred_on)}</td><td className="text-right">{usd(Number(l.amount_cents))}</td>
            <td className="text-right">{l.settled_on ? <Badge variant="outline">Paid {fmtDate(l.settled_on)}</Badge> : <Button size="sm" variant="ghost" disabled={sm.isPending} onClick={() => sm.mutate(l.id)}>Mark paid</Button>}</td></tr>)}</tbody></table>
      )}
    </div>
  );
}
