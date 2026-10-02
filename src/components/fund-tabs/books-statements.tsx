import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { booksFiguresFn, saveStatementDraftFn } from "@/lib/fund-books.functions";
import { usd } from "./shared";

/** Balance sheet, income statement and changes in capital built from the books; staff save it as a draft package for review. */
export function BooksStatements({ fundId }: { fundId: string }) {
  const y = new Date().getUTCFullYear();
  const [start, setStart] = useState(`${y}-01-01`);
  const [end, setEnd] = useState(new Date().toISOString().slice(0, 10));
  const build = useServerFn(booksFiguresFn);
  const save = useServerFn(saveStatementDraftFn);
  const bm = useMutation({ mutationFn: () => build({ data: { fundId, start, end, taxYear: Number(end.slice(0, 4)) } }), onError: (e: Error) => toast.error(e.message) });
  const sm = useMutation({ mutationFn: () => save({ data: { fundId, start, end, periodType: start.slice(5) === "01-01" && end.slice(5) === "12-31" ? "annual" : "quarterly" } }), onSuccess: () => toast.success("Saved as a draft statement package for Harmonious review."), onError: (e: Error) => toast.error(e.message) });
  const st = bm.data?.statements;
  const row = (l: string, c: number, bold = false) => <div className={`flex justify-between py-1 ${bold ? "border-t font-semibold" : ""}`}><span>{l}</span><span>{usd(c)}</span></div>;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Financial statements from the books</CardTitle>
        <CardDescription>Built from applied bank activity and approved asset values. A draft until Harmonious reviews and approves it; investors see nothing until then.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1"><Label className="text-xs">From</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">To</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          <Button disabled={bm.isPending} onClick={() => bm.mutate()}>Build statements</Button>
          {st && <Button variant="outline" disabled={sm.isPending} onClick={() => sm.mutate()}>Save as draft package (Harmonious)</Button>}
        </div>
        {st && (
          <div className="grid gap-4 text-sm md:grid-cols-3">
            <div className="rounded-md border p-3"><p className="mb-1 font-medium">Balance sheet</p>{row("Cash", st.balanceSheet.cashCents)}{row("Investments at value", st.balanceSheet.investmentsCents)}{row("Total assets", st.balanceSheet.totalAssetsCents, true)}{row("Liabilities", st.balanceSheet.liabilitiesCents)}{row("Partners' capital", st.balanceSheet.partnersCapitalCents, true)}</div>
            <div className="rounded-md border p-3"><p className="mb-1 font-medium">Income statement</p>{row("Income", st.incomeStatement.incomeCents)}{row("Expenses", -st.incomeStatement.expensesCents)}{row("Net income", st.incomeStatement.netIncomeCents, true)}{row("Unrealized gain (loss)", st.incomeStatement.unrealizedGainCents)}{row("Total return", st.incomeStatement.totalReturnCents, true)}</div>
            <div className="rounded-md border p-3"><p className="mb-1 font-medium">Changes in capital</p>{row("Opening", st.changesInCapital.openingCents)}{row("Contributions", st.changesInCapital.contributionsCents)}{row("Distributions", -st.changesInCapital.distributionsCents)}{row("Net income", st.changesInCapital.netIncomeCents)}{row("Unrealized", st.changesInCapital.unrealizedCents)}{row("Closing", st.changesInCapital.closingCents, true)}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
