import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fundRegulatoryFn, saveFranchiseFeeFn, removeFranchiseFeeFn } from "@/lib/fund-regulatory.functions";
import { usd, fmtDate, toCents } from "./shared";

const statusLabel = (s: string) => ({ prepared: "Prepared", filed: "Filed", not_required: "Not required", recorded: "Recorded" } as Record<string, string>)[s] ?? s;

export function RegulatoryTab({ fundId }: { fundId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(fundRegulatoryFn);
  const save = useServerFn(saveFranchiseFeeFn);
  const remove = useServerFn(removeFranchiseFeeFn);
  const q = useQuery({ queryKey: ["fund-regulatory", fundId], queryFn: () => load({ data: { fundId } }) });
  const [edit, setEdit] = useState<any | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const refresh = () => qc.invalidateQueries({ queryKey: ["fund-regulatory", fundId] });

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const { filings, fees, calendar } = q.data!;

  const submit = async () => {
    try {
      await save({ data: { fundId, id: edit.id ?? null, state: edit.state ?? "", description: edit.description ?? "", amountCents: toCents(String(edit.amount ?? "0")) ?? 0, dueDate: edit.due_date || null, filedOn: edit.filed_on || null, confirmation: edit.confirmation_number ?? "" } });
      toast.success("Saved"); setEdit(null); refresh();
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader><CardTitle>Regulatory calendar</CardTitle><CardDescription>Upcoming and past deadlines for this fund. Dates are estimates; Harmonious confirms each one.</CardDescription></CardHeader>
        <CardContent>
          {calendar.length === 0 ? <p className="text-sm text-muted-foreground">No deadlines yet. They appear after a close or when a franchise fee is added.</p> : (
            <ul className="divide-y">
              {calendar.map((c, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div><p className="font-medium">{c.title}</p><p className="text-xs text-muted-foreground">{c.detail}</p></div>
                  <div className="flex items-center gap-2">
                    <span>{fmtDate(c.date)}</span>
                    {c.done ? <Badge variant="secondary">Done</Badge> : c.date < today ? <Badge variant="destructive">Past due</Badge> : <Badge variant="outline">Upcoming</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Form D and Blue Sky filings</CardTitle><CardDescription>Harmonious prepares and submits these by hand. The $160 Form D fee is the Harmonious Form D Filing Fee.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          {filings.length === 0 ? <p className="text-sm text-muted-foreground">No filings yet.</p> : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-2">Filing</th><th>Where</th><th>Status</th><th>Investors</th><th>Amount sold</th><th>Fee</th><th>Filed on</th><th>Confirmation</th></tr></thead>
              <tbody className="divide-y">
                {filings.map((f: any) => (
                  <tr key={f.id}>
                    <td className="py-2 font-medium">{f.type}</td><td>{f.jurisdiction}</td>
                    <td><Badge variant={f.status === "filed" ? "secondary" : "outline"}>{statusLabel(f.status)}</Badge></td>
                    <td>{f.investors ?? "-"}</td><td>{f.amountCents != null ? usd(f.amountCents) : "-"}</td>
                    <td>{f.feeNeedsReview ? "Needs review" : f.feeCents != null ? usd(f.feeCents) : "-"}</td>
                    <td>{f.filedOn ? fmtDate(f.filedOn) : "-"}</td><td>{f.confirmation || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div><CardTitle>State franchise fees</CardTitle><CardDescription>Track each state's franchise tax or annual fee, its cost and filing date. Recording here doesn't pay anything.</CardDescription></div>
          <Button size="sm" onClick={() => setEdit({})}>Add fee</Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {fees.length === 0 ? <p className="text-sm text-muted-foreground">No franchise fees recorded.</p> : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-2">State</th><th>Description</th><th>Cost</th><th>Due</th><th>Filed on</th><th>Confirmation</th><th /></tr></thead>
              <tbody className="divide-y">
                {fees.map((f: any) => (
                  <tr key={f.id}>
                    <td className="py-2 font-medium">{f.state}</td><td>{f.description || "-"}</td><td>{usd(f.amount_cents)}</td>
                    <td>{f.due_date ? fmtDate(f.due_date) : "-"}</td><td>{f.filed_on ? fmtDate(f.filed_on) : <Badge variant="outline">Not filed</Badge>}</td><td>{f.confirmation_number || "-"}</td>
                    <td className="space-x-2 text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => setEdit({ ...f, amount: (f.amount_cents / 100).toFixed(2) })}>Edit</Button>
                      {!f.filed_on && <Button size="sm" variant="ghost" onClick={async () => { await remove({ data: { fundId, id: f.id } }); refresh(); }}>Remove</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit?.id ? "Edit franchise fee" : "Add franchise fee"}</DialogTitle></DialogHeader>
          {edit && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>State</Label><Input value={edit.state ?? ""} placeholder="DE" onChange={(e) => setEdit({ ...edit, state: e.target.value })} /></div>
              <div><Label>Cost ($)</Label><Input inputMode="decimal" value={edit.amount ?? ""} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} /></div>
              <div className="sm:col-span-2"><Label>Description</Label><Input value={edit.description ?? ""} placeholder="Annual LLC franchise tax" onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
              <div><Label>Due date</Label><Input type="date" value={edit.due_date ?? ""} onChange={(e) => setEdit({ ...edit, due_date: e.target.value })} /></div>
              <div><Label>Filing date</Label><Input type="date" value={edit.filed_on ?? ""} onChange={(e) => setEdit({ ...edit, filed_on: e.target.value })} /></div>
              <div className="sm:col-span-2"><Label>Confirmation number</Label><Input value={edit.confirmation_number ?? ""} onChange={(e) => setEdit({ ...edit, confirmation_number: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={submit}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
