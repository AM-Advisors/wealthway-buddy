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
import { BankFeedPanel } from "@/components/bank-feed-panel";
import { LEDGER_CATEGORIES } from "@/lib/fund-doc-templates";
import { addLedgerEntryFn, fundBooksFn, tagTransactionFn, voidLedgerEntryFn } from "@/lib/fund-tabs.functions";
import { fmtDate, toCents, usd } from "./shared";

const NONE = "__none";

export function BankingTab({ fundId }: { fundId: string }) {
  const load = useServerFn(fundBooksFn);
  const q = useQuery({ queryKey: ["fund-books", fundId], queryFn: () => load({ data: { fundId } }) });
  const d = q.data;
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connect your bank</CardTitle>
          <CardDescription>Connect the fund's bank account securely through Plaid. This is read-only: no money can be moved from here.</CardDescription>
        </CardHeader>
        <CardContent><BankFeedPanel fundId={fundId} /></CardContent>
      </Card>
      {q.isLoading ? <p className="text-sm text-muted-foreground">Loading books…</p> : q.error || !d ? <p className="text-sm text-destructive">{(q.error as Error)?.message ?? "Couldn't load the books."}</p> : (
        <>
          <Transactions fundId={fundId} d={d} />
          <Ledger fundId={fundId} d={d} />
        </>
      )}
    </div>
  );
}

function Transactions({ fundId, d }: { fundId: string; d: any }) {
  const qc = useQueryClient();
  const tag = useServerFn(tagTransactionFn);
  const m = useMutation({
    mutationFn: (v: { id: string; onboardingId: string | null; assetLabel: string | null }) => tag({ data: { fundId, bankTransactionId: v.id, onboardingId: v.onboardingId, assetLabel: v.assetLabel } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fund-books", fundId] }), onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Bank transactions</CardTitle>
        <CardDescription>Assign incoming wires to the investor they came from and outgoing payments to the asset they were for. Assigning is a label only; Harmonious still reconciles funding.</CardDescription>
      </CardHeader>
      <CardContent>
        {d.transactions.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No transactions yet. Connect the bank above.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-2">Date</th><th>Description</th><th className="text-right">Amount</th><th>Investor</th><th>Asset</th></tr></thead>
              <tbody>
                {d.transactions.map((t: any) => (
                  <tr key={t.id} className="border-t">
                    <td className="py-2 whitespace-nowrap">{fmtDate(t.posted_on)}</td>
                    <td>{t.name || t.description || "-"}</td>
                    <td className="text-right">{t.direction === "out" ? "-" : ""}{usd(Math.abs(Number(t.amount_cents)))}</td>
                    <td className="w-48">
                      <Select value={t.tag?.onboarding_id ?? NONE} onValueChange={(v) => m.mutate({ id: t.id, onboardingId: v === NONE ? null : v, assetLabel: t.tag?.asset_label ?? null })}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value={NONE}>None</SelectItem>{d.investors.map((i: any) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </td>
                    <td className="w-48">
                      <Select value={t.tag?.asset_label ?? NONE} onValueChange={(v) => m.mutate({ id: t.id, onboardingId: t.tag?.onboarding_id ?? null, assetLabel: v === NONE ? null : v })}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value={NONE}>None</SelectItem>{d.assets.map((a: string) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Ledger({ fundId, d }: { fundId: string; d: any }) {
  const qc = useQueryClient();
  const add = useServerFn(addLedgerEntryFn);
  const voidFn = useServerFn(voidLedgerEntryFn);
  const [f, setF] = useState({ date: new Date().toISOString().slice(0, 10), description: "", category: LEDGER_CATEGORIES[0] as string, direction: "out" as "in" | "out", amount: "" });
  const refresh = () => qc.invalidateQueries({ queryKey: ["fund-books", fundId] });
  const m = useMutation({
    mutationFn: () => { const c = toCents(f.amount); if (!c) throw new Error("Enter an amount."); return add({ data: { fundId, entryDate: f.date, description: f.description, category: f.category, direction: f.direction, amountCents: c, bankTransactionId: null } }); },
    onSuccess: () => { toast.success("Entry added"); setF({ ...f, description: "", amount: "" }); refresh(); }, onError: (e: Error) => toast.error(e.message),
  });
  const vm = useMutation({ mutationFn: (v: { id: string; reason: string }) => voidFn({ data: { fundId, ...v } }), onSuccess: refresh, onError: (e: Error) => toast.error(e.message) });
  const r = d.report;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Bookkeeping</CardTitle>
        <CardDescription>Record income and expenses. Entries are never edited; void and re-enter to correct one.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          {[["Income", r.income], ["Expenses", r.expense], ["Net", r.net]].map(([l, v]) => (
            <div key={l} className="rounded-md border p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="text-lg font-semibold">{usd(v as number)}</p></div>
          ))}
        </div>
        {r.byCategory.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1">Category</th><th className="text-right">In</th><th className="text-right">Out</th></tr></thead>
            <tbody>{r.byCategory.map((c: any) => <tr key={c.category} className="border-t"><td className="py-1">{c.category}</td><td className="text-right">{usd(c.inCents)}</td><td className="text-right">{usd(c.outCents)}</td></tr>)}</tbody>
          </table>
        )}
        <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-6">
          <div className="space-y-1"><Label>Date</Label><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
          <div className="space-y-1 sm:col-span-2"><Label>Description</Label><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          <div className="space-y-1"><Label>Category</Label>
            <Select value={f.category} onValueChange={(v) => setF({ ...f, category: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{LEDGER_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-1"><Label>In / out</Label>
            <Select value={f.direction} onValueChange={(v) => setF({ ...f, direction: v as "in" | "out" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="in">Income</SelectItem><SelectItem value="out">Expense</SelectItem></SelectContent></Select>
          </div>
          <div className="space-y-1"><Label>Amount ($)</Label><Input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
          <div className="sm:col-span-6"><Button size="sm" disabled={m.isPending || f.description.trim().length < 2} onClick={() => m.mutate()}>Add entry</Button></div>
        </div>
        {d.entries.length > 0 && (
          <div className="divide-y rounded-md border">
            {d.entries.map((e: any) => (
              <div key={e.id} className={`flex flex-wrap items-center justify-between gap-2 p-2 text-sm ${e.voided_at ? "opacity-60" : ""}`}>
                <span>{fmtDate(e.entry_date)} · {e.description} <span className="text-xs text-muted-foreground">({e.category})</span></span>
                <span className="flex items-center gap-2">
                  {e.direction === "out" ? "-" : "+"}{usd(Number(e.amount_cents))}
                  {e.voided_at ? <Badge variant="outline">Voided</Badge> : <Button size="sm" variant="ghost" onClick={() => { const reason = prompt("Why are you voiding this entry?"); if (reason && reason.trim().length >= 3) vm.mutate({ id: e.id, reason }); }}>Void</Button>}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
