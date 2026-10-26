import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { assignInvoiceFeeTarget, listInvoiceFeeAccounting } from "@/lib/invoice-fee-accounting.functions";

export function InvoiceFeeAccounting({ invoiceId, canManage = false }: { invoiceId?: string; canManage?: boolean }) {
  const load = useServerFn(listInvoiceFeeAccounting);
  const save = useServerFn(assignInvoiceFeeTarget);
  const cache = useQueryClient();
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("all");
  const query = useQuery({ queryKey: ["invoice-fee-accounting", invoiceId], queryFn: () => load({ data: { invoiceId } }), retry: false });
  const mutation = useMutation({ mutationFn: (data: { lineId: string; targetId: string; targetKind: "fund" | "company"; reason: string }) => save({ data }), onSuccess: () => { toast.success("Fee assignment recorded."); void cache.invalidateQueries({ queryKey: ["invoice-fee-accounting"] }); }, onError: (error: Error) => toast.error(error.message) });
  const targets = query.data?.targets ?? [];
  const rows = query.data?.rows ?? [];
  return <section className="space-y-3">
    <h3 className="font-medium">Fees and bookkeeping</h3>
    {query.isPending ? <p className="text-sm text-muted-foreground">Loading fees…</p> : null}
    {query.error ? <div className="text-sm text-destructive">{query.error.message}<Button variant="outline" size="sm" className="ml-2" onClick={() => void query.refetch()}>Retry</Button></div> : null}
    {!invoiceId && targets.length > 0 ? <SearchableSelect aria-label="Fund or company filter" value={filter} onValueChange={setFilter} options={[{ value: "all", label: "All funds and companies" }, { value: "unassigned", label: "Needs assignment" }, ...targets.map(t => ({ value: `${t.kind}:${t.id}`, label: t.name, detail: t.kind === "fund" ? "Fund" : "Company" }))]} /> : null}
    {!query.isPending && !query.error && !rows.length ? <p className="text-sm text-muted-foreground">No issued fees to review.</p> : null}
    {rows.filter((r: any) => filter === "all" || (filter === "unassigned" ? !r.target : `${r.target?.kind}:${r.target?.id}` === filter)).map((row: any) => {
      const selected = choices[row.id] ?? (row.target ? `${row.target.kind}:${row.target.id}` : "");
      const target = targets.find(t => `${t.kind}:${t.id}` === selected);
      return <div key={row.id} className="space-y-2 border-b border-border py-3">
        <div className="flex flex-wrap justify-between gap-2"><div className="min-w-0"><p className="break-words font-medium">{row.label}</p><p className="text-xs text-muted-foreground">{row.number} · {row.issueDate ?? "Date not set"}{row.dueDate ? ` · due ${row.dueDate}` : ""}</p></div><span className="tabular-nums">{(row.amountCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}</span></div>
        <div className="flex flex-wrap items-center gap-2"><span className="text-sm">{row.target?.name ?? "Fund or company not assigned"}</span><Badge variant="outline">{row.accountingStatus}</Badge></div>
        {canManage && !row.fixedFund && ["Needs assignment", "Awaiting accounting review"].includes(row.accountingStatus) ? <div className="grid gap-2 md:grid-cols-3">
          <SearchableSelect aria-label={`Fund or company for ${row.label}`} value={selected} onValueChange={value => setChoices(old => ({ ...old, [row.id]: value }))} options={targets.filter(t => t.client_id === row.clientId).map(t => ({ value: `${t.kind}:${t.id}`, label: t.name, detail: t.kind === "fund" ? "Fund" : "Company" }))} placeholder="Choose fund or company" />
          <Input aria-label={`Assignment reason for ${row.label}`} placeholder="Assignment reason" value={reasons[row.id] ?? ""} onChange={event => setReasons(old => ({ ...old, [row.id]: event.target.value }))} />
          <Button variant="outline" disabled={!target || (reasons[row.id] ?? "").trim().length < 3 || mutation.isPending} onClick={() => { if (target) mutation.mutate({ lineId: row.id, targetId: target.id, targetKind: target.kind, reason: reasons[row.id] ?? "" }); }}>Record assignment</Button>
        </div> : null}
      </div>;
    })}
  </section>;
}