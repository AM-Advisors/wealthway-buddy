import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EXPENSE_CATEGORIES } from "@/lib/fund-accounting-model";
import { previewInvoiceFeeEntry } from "@/lib/invoice-fee-accounting.functions";

export function InvoiceFeePreview({ lineId, label, issueDate }: { lineId: string; label: string; issueDate?: string | null }) {
  const [open, setOpen] = useState(false);
  const [entryDate, setEntryDate] = useState(issueDate ?? "");
  const [category, setCategory] = useState("");
  const load = useServerFn(previewInvoiceFeeEntry);
  const preview = useMutation({ mutationFn: () => load({ data: { lineId, entryDate, category: category as (typeof EXPENSE_CATEGORIES)[number]["key"] } }) });
  const changeDate = (value: string) => { setEntryDate(value); preview.reset(); };
  const changeCategory = (value: string) => { setCategory(value); preview.reset(); };
  const money = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
  return <Dialog open={open} onOpenChange={setOpen}>
    <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Eye className="mr-2 h-4 w-4" />Preview entry</Button>
    <DialogContent>
      <DialogHeader><DialogTitle>Fee accounting preview</DialogTitle><DialogDescription>{label} · Read-only, not saved or posted.</DialogDescription></DialogHeader>
      <label className="space-y-1 text-sm">Accounting date<Input type="date" aria-label="Accounting date" value={entryDate} onChange={e => changeDate(e.target.value)} /></label>
      <SearchableSelect aria-label="Expense category" value={category} onValueChange={changeCategory} options={EXPENSE_CATEGORIES.map(c => ({ value: c.key, label: c.label }))} placeholder="Choose expense category" />
      <Button disabled={!entryDate || !category || preview.isPending} onClick={() => preview.mutate()}>{preview.isPending ? "Checking…" : "Check accounting entry"}</Button>
      {preview.error ? <p role="alert" className="text-sm text-destructive">{preview.error.message}</p> : null}
      {preview.data ? <div aria-live="polite" className="space-y-3 text-sm">
        {preview.data.blockers.length ? <ul className="list-disc space-y-1 pl-5">{preview.data.blockers.map(b => <li key={b}>{b}</li>)}</ul> : <>
          <p className="font-medium">Balanced accrual preview</p>
          <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th className="py-2">Account</th><th>Debit</th><th>Credit</th></tr></thead><tbody>{preview.data.lines.map(l => <tr key={l.accountId} className="border-t"><td className="py-2 pr-2">{l.code} · {l.name}</td><td className="pr-2 tabular-nums">{money(l.debitCents)}</td><td className="tabular-nums">{money(l.creditCents)}</td></tr>)}</tbody></table></div>
          <p className="text-muted-foreground">Independent review and an approved accounting release are still required. Payment recording stays separate.</p>
        </>}
      </div> : null}
    </DialogContent>
  </Dialog>;
}