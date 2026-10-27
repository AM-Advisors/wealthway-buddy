import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { SearchableSelect } from "./ui/searchable-select";
import { getFundHandoffs, saveFundHandoff } from "@/lib/sales-operations-handoff.functions";
import { handoffStatus, type HandoffData, type HandoffRow } from "@/lib/sales-operations-handoff-model";
import { invalidateFund } from "@/lib/fund-query-keys";

type Save = (input: { quoteId: string; action: "assign" | "acknowledge" | "complete"; ownerId?: string; dueDate?: string }) => Promise<unknown>;
function HandoffItem({ row, owners, onSave }: { row: HandoffRow; owners: HandoffData["owners"]; onSave: Save }) {
  const [owner, setOwner] = useState(row.ownerId ?? "");
  const [due, setDue] = useState(row.dueDate ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const state = handoffStatus(row, new Date().toLocaleDateString("en-CA"));
  const save = async (action: "assign" | "acknowledge" | "complete") => {
    setBusy(true); setError("");
    try { await onSave({ quoteId: row.quoteId, action, ...(action === "assign" ? { ownerId: owner, dueDate: due } : {}) }); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't save the handoff."); }
    finally { setBusy(false); }
  };
  return <article className="space-y-3 rounded-lg border p-4">
    <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="font-medium break-words">{row.title}</p><p className="text-sm text-muted-foreground">Quote {row.quoteNumber}</p></div><div className="flex flex-wrap gap-2"><Badge variant="outline">{state.label}</Badge>{state.overdue && <Badge variant="destructive">Overdue</Badge>}</div></div>
    <dl className="grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Receiving owner</dt><dd>{row.ownerName ?? (row.ownerId ? "Previously assigned staff" : "Not assigned")}</dd></div><div><dt className="text-muted-foreground">Due date</dt><dd>{row.dueDate ? new Date(`${row.dueDate}T12:00:00`).toLocaleDateString("en-US") : "Not set"}</dd></div></dl>
    {row.canAssign && <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"><div className="space-y-1"><Label>Receiving Operations owner</Label><SearchableSelect aria-label="Receiving Operations owner" value={owner} onValueChange={setOwner} options={owners.map(o => ({ value: o.id, label: o.name }))} disabled={busy} /></div><div className="space-y-1"><Label htmlFor={`due-${row.quoteId}`}>Handoff due date</Label><Input id={`due-${row.quoteId}`} type="date" value={due} onChange={e => setDue(e.target.value)} disabled={busy} /></div><Button disabled={busy || !owner || !due} onClick={() => save("assign")}>Save assignment</Button></div>}
    {row.canReceive && row.ownerId && row.dueDate && <div className="flex gap-2">{row.status === "open" && <Button disabled={busy} onClick={() => save("acknowledge")}>Acknowledge handoff</Button>}{row.status === "in_progress" && <Button disabled={busy} onClick={() => save("complete")}>Complete handoff</Button>}</div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </article>;
}
export function FundSalesHandoffView({ data, onSave }: { data: HandoffData; onSave: Save }) {
  return <section aria-label="Sales to Operations handoff" className="space-y-3"><h2 className="font-heading text-xl">Sales to Operations handoff</h2>{data.rows.map(row => <HandoffItem key={`${row.quoteId}:${row.ownerId}:${row.dueDate}:${row.status}`} row={row} owners={data.owners} onSave={onSave} />)}{!data.rows.length && <p className="text-sm text-muted-foreground">No signed Sales handoff linked to this fund.</p>}</section>;
}
export function FundSalesHandoff({ fundId }: { fundId: string }) {
  const get = useServerFn(getFundHandoffs), save = useServerFn(saveFundHandoff), qc = useQueryClient();
  const q = useQuery({ queryKey: ["fund-sales-handoff", fundId], queryFn: () => get({ data: { fundId } }), retry: false });
  if (q.isPending) return <p>Loading handoff…</p>;
  if (q.isError) return <div role="alert"><p>Couldn't load the Sales handoff.</p><Button variant="outline" onClick={() => q.refetch()}>Retry</Button></div>;
  return <FundSalesHandoffView data={q.data} onSave={async input => { await save({ data: { ...input, fundId } }); await invalidateFund(qc, fundId); await qc.invalidateQueries({ queryKey: ["staff-tasks"] }); }} />;
}