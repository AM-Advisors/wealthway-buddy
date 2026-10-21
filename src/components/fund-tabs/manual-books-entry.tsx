import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STATEMENT_CATEGORIES } from "@/lib/fund-books-model";
import { addManualLineFn, addManualTransactionFn, createManualStatementFn, removeManualLineFn } from "@/lib/fund-books.functions";
import { invalidateFund } from "@/lib/fund-query-keys";

const today = () => new Date().toISOString().slice(0, 10);
export const toCents = (s: string) => { const n = Number(String(s).replace(/[$,\s]/g, "")); return Number.isFinite(n) ? Math.round(n * 100) : NaN; };

/** Start a typed statement: header only; lines are added on the statement card below. */
export function ManualStatementForm({ fundId }: { fundId: string }) {
  const qc = useQueryClient();
  const create = useServerFn(createManualStatementFn);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ bankName: "", mask: "", start: "", end: "", opening: "", closing: "" });
  const m = useMutation({
    mutationFn: () => {
      const o = toCents(f.opening), c = toCents(f.closing);
      if (!Number.isFinite(o) || !Number.isFinite(c)) throw new Error("Enter the opening and closing balances.");
      return create({ data: { fundId, bankName: f.bankName.trim() || null, accountMask: f.mask.trim() || null, periodStart: f.start, periodEnd: f.end, openingCents: o, closingCents: c } });
    },
    onSuccess: () => { toast.success("Statement started. Add its lines below."); setOpen(false); setF({ bankName: "", mask: "", start: "", end: "", opening: "", closing: "" }); void invalidateFund(qc, fundId); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!open) return <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Enter a statement by hand</Button>;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="space-y-3 rounded-md border p-3">
      <p className="text-sm font-medium">Typed statement</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1"><Label>Bank</Label><Input value={f.bankName} onChange={set("bankName")} /></div>
        <div className="space-y-1"><Label>Account last 4</Label><Input inputMode="numeric" maxLength={4} value={f.mask} onChange={set("mask")} /></div>
        <div />
        <div className="space-y-1"><Label>Period from</Label><Input type="date" value={f.start} onChange={set("start")} /></div>
        <div className="space-y-1"><Label>Period to</Label><Input type="date" max={today()} value={f.end} onChange={set("end")} /></div>
        <div />
        <div className="space-y-1"><Label>Opening balance ($)</Label><Input inputMode="decimal" value={f.opening} onChange={set("opening")} /></div>
        <div className="space-y-1"><Label>Closing balance ($)</Label><Input inputMode="decimal" value={f.closing} onChange={set("closing")} /></div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={m.isPending || !f.start || !f.end} onClick={() => m.mutate()}>Start statement</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}

/** Add a typed line to an open hand-entered statement. */
export function ManualLineForm({ fundId, uploadId }: { fundId: string; uploadId: string }) {
  const qc = useQueryClient();
  const add = useServerFn(addManualLineFn);
  const [f, setF] = useState({ date: "", description: "", direction: "in" as "in" | "out", amount: "", category: "" });
  const m = useMutation({
    mutationFn: () => add({ data: { fundId, uploadId, postedOn: f.date, description: f.description, direction: f.direction, amountCents: toCents(f.amount), category: f.category || null } }),
    onSuccess: (r) => { toast.success(r.duplicate ? "Line added. It matches a line already in the books, so it's set to skip." : "Line added."); setF({ ...f, description: "", amount: "" }); void invalidateFund(qc, fundId); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="grid items-end gap-2 rounded-md bg-muted/40 p-2 sm:grid-cols-6">
      <div className="space-y-1"><Label className="text-xs">Date</Label><Input type="date" max={today()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
      <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Description</Label><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
      <div className="space-y-1"><Label className="text-xs">In / out</Label>
        <Select value={f.direction} onValueChange={(v) => setF({ ...f, direction: v as "in" | "out" })}><SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="in">Money in</SelectItem><SelectItem value="out">Money out</SelectItem></SelectContent></Select>
      </div>
      <div className="space-y-1"><Label className="text-xs">Amount ($)</Label><Input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
      <Button size="sm" disabled={m.isPending || !f.date || !f.description.trim() || !f.amount} onClick={() => m.mutate()}>Add line</Button>
    </div>
  );
}

export function RemoveManualLine({ fundId, lineId }: { fundId: string; lineId: string }) {
  const qc = useQueryClient();
  const rm = useServerFn(removeManualLineFn);
  const m = useMutation({ mutationFn: () => rm({ data: { fundId, lineId } }), onSuccess: () => void invalidateFund(qc, fundId), onError: (e: Error) => toast.error(e.message) });
  return <button type="button" className="text-xs text-destructive underline" disabled={m.isPending} onClick={() => m.mutate()}>Remove</button>;
}

/** One-off bank line not on a statement yet. */
export function ManualTransactionForm({ fundId, investors }: { fundId: string; investors: { id: string; name: string }[] }) {
  const qc = useQueryClient();
  const add = useServerFn(addManualTransactionFn);
  const blank = { date: "", description: "", direction: "in" as "in" | "out", amount: "", reference: "", category: "", investor: "none" };
  const [f, setF] = useState(blank);
  const m = useMutation({
    mutationFn: () => add({ data: { fundId, postedOn: f.date, description: f.description, direction: f.direction, amountCents: toCents(f.amount), reference: f.reference.trim() || null, category: f.category || null, onboardingId: f.investor === "none" ? null : f.investor } }),
    onSuccess: () => { toast.success("Bank transaction recorded."); setF(blank); void invalidateFund(qc, fundId); qc.invalidateQueries({ queryKey: ["fund-books", fundId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add a single bank transaction</CardTitle>
        <CardDescription>For a line that isn't on a statement yet. This is a record only; nothing is moved.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1"><Label>Date</Label><Input type="date" max={today()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
        <div className="space-y-1 sm:col-span-2"><Label>Description</Label><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        <div className="space-y-1"><Label>In / out</Label>
          <Select value={f.direction} onValueChange={(v) => setF({ ...f, direction: v as "in" | "out" })}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="in">Money in</SelectItem><SelectItem value="out">Money out</SelectItem></SelectContent></Select>
        </div>
        <div className="space-y-1"><Label>Amount ($)</Label><Input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
        <div className="space-y-1"><Label>Reference (optional)</Label><Input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></div>
        <div className="space-y-1"><Label>What it is</Label>
          <Select value={f.category || "none"} onValueChange={(v) => setF({ ...f, category: v === "none" ? "" : v })}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="none">Decide later</SelectItem>{STATEMENT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
        </div>
        <div className="space-y-1"><Label>Investor</Label>
          <Select value={f.investor} onValueChange={(v) => setF({ ...f, investor: v })}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="none">None</SelectItem>{investors.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent></Select>
        </div>
        <div className="flex items-end"><Button disabled={m.isPending || !f.date || !f.description.trim() || !f.amount} onClick={() => m.mutate()}>Record transaction</Button></div>
      </CardContent>
    </Card>
  );
}
