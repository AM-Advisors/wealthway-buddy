import { invalidateFund } from "@/lib/fund-query-keys";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STATEMENT_CATEGORIES } from "@/lib/fund-books-model";
import { applyStatementFn, listStatementsFn, updateStatementLineFn, uploadStatementFn } from "@/lib/fund-books.functions";
import { ManualLineForm, ManualStatementForm, RemoveManualLine } from "./manual-books-entry";
import { fileToBase64, fmtDate, usd } from "./shared";

const keep = (l: any) => ({ onboardingId: l.matched_onboarding_id ?? null, assetId: l.matched_asset_id ?? null, vendor: l.matched_vendor ?? null });
const assignValue = (l: any) => l.matched_onboarding_id ? `inv:${l.matched_onboarding_id}` : l.matched_asset_id ? `asset:${l.matched_asset_id}` : l.matched_vendor ? `vendor:${l.matched_vendor}` : "none";
const assignLabel = (l: any, investors: { id: string; name: string }[], u: any) =>
  l.matched_onboarding_id ? (investors.find((i) => i.id === l.matched_onboarding_id)?.name ?? "Investor")
  : l.matched_asset_id ? (u.investments?.find((a: any) => a.id === l.matched_asset_id)?.name ?? "Investment")
  : l.matched_vendor ?? "-";

/** Upload a bank statement, check the lines the reader found, then apply them to the books. Never moves money. */
export function StatementUpload({ fundId, investors, canEnter = false }: { fundId: string; investors: { id: string; name: string }[]; canEnter?: boolean }) {
  const qc = useQueryClient();
  const list = useServerFn(listStatementsFn);
  const upload = useServerFn(uploadStatementFn);
  const update = useServerFn(updateStatementLineFn);
  const apply = useServerFn(applyStatementFn);
  const key = ["bank-statements", fundId];
  const q = useQuery({ queryKey: key, queryFn: () => list({ data: { fundId } }) });
  const [busy, setBusy] = useState(false);
  const refresh = () => { void invalidateFund(qc, fundId); };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try { const r = await upload({ data: { fundId, fileName: f.name, contentType: f.type, base64: await fileToBase64(f) } }); toast.success(`Read ${r.lines} transaction(s). Check them below.`); refresh(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const lineM = useMutation({ mutationFn: (a: { lineId: string; category: string | null; onboardingId: string | null; skip: boolean }) => update({ data: { fundId, ...a } }), onSuccess: refresh, onError: (e: Error) => toast.error(e.message) });
  const applyM = useMutation({ mutationFn: (uploadId: string) => apply({ data: { fundId, uploadId } }), onSuccess: (r: any) => { toast.success(`${r.applied} line(s) added to the books and Banking. Investor deposits are recorded on their investments.`); for (const n of (r.receiptNotes ?? []) as string[]) toast.warning(n); refresh(); }, onError: (e: Error) => toast.error(e.message) });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Bank statements</CardTitle>
        <CardDescription>Upload a statement (PDF or CSV). The platform reads each transaction and suggests what it is; you check every line, then apply it to the books. Lines already in the books are skipped. Nothing moves money.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input type="file" accept=".pdf,.csv,.txt,application/pdf,text/csv" disabled={busy} onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
        {canEnter && <ManualStatementForm fundId={fundId} />}
        {busy && <p className="text-sm text-muted-foreground">Reading the statement… this can take up to a minute.</p>}
        {(q.data ?? []).map((u: any) => {
          const open = u.status !== "applied";
          return (
            <div key={u.id} className="space-y-2 rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><p className="font-medium">{u.file_name}{u.entered_manually ? <span className="ml-2 text-xs font-normal text-muted-foreground">Typed by hand</span> : null}</p><p className="text-xs text-muted-foreground">{[u.bank_name, u.account_mask ? `••••${u.account_mask}` : null, u.period_start ? `${fmtDate(u.period_start)} to ${fmtDate(u.period_end)}` : null].filter(Boolean).join(" · ")}</p></div>
                <div className="flex items-center gap-2">
                  {u.tie.known && <Badge variant={u.tie.ties ? "default" : "destructive"}>{u.tie.ties ? "Balances tie" : `Off by ${usd(Math.abs(u.tie.gapCents))}`}</Badge>}
                  <Badge variant="outline">{u.status === "applied" ? "Applied" : "Needs review"}</Badge>
                </div>
              </div>
              {u.tie.known && <p className="text-xs text-muted-foreground">Opening {usd(Number(u.opening_balance_cents))} · Closing {usd(Number(u.closing_balance_cents))}</p>}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-left text-muted-foreground"><tr><th className="py-1">Date</th><th>Description</th><th className="text-right">Amount</th><th>What it is</th><th>Assigned to</th><th>Skip</th>{open && u.entered_manually && canEnter ? <th /> : null}</tr></thead>
                  <tbody>{u.lines.map((l: any) => (
                    <tr key={l.id} className={`border-t ${l.skip ? "opacity-50" : ""}`}>
                      <td className="py-1 whitespace-nowrap">{fmtDate(l.posted_on)}</td>
                      <td className="max-w-56 truncate" title={l.description}>{l.description}{l.duplicate_of && <span className="ml-1 text-muted-foreground">(already in books)</span>}</td>
                      <td className="text-right whitespace-nowrap">{l.direction === "in" ? "+" : "−"}{usd(Number(l.amount_cents))}</td>
                      <td className="min-w-44">{open && !l.applied_tx_id ? (
                        <Select value={l.confirmed_category ?? l.suggested_category ?? ""} onValueChange={(v) => lineM.mutate({ lineId: l.id, category: v, ...keep(l), skip: l.skip })}>
                          <SelectTrigger className="h-8"><SelectValue placeholder="Pick one" /></SelectTrigger>
                          <SelectContent>{STATEMENT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                        </Select>) : (l.confirmed_category ?? l.suggested_category ?? "-")}</td>
                      <td className="min-w-40">{open && !l.applied_tx_id ? (
                        <Select value={assignValue(l)} onValueChange={(v) => {
                          const base = { lineId: l.id, category: l.confirmed_category ?? l.suggested_category, skip: l.skip, onboardingId: null as string | null, assetId: null as string | null, vendor: null as string | null };
                          if (v.startsWith("inv:")) base.onboardingId = v.slice(4);
                          else if (v.startsWith("asset:")) base.assetId = v.slice(6);
                          else if (v.startsWith("vendor:")) base.vendor = v.slice(7);
                          else if (v === "new-vendor") { const name = window.prompt("Vendor name")?.trim(); if (!name) return; base.vendor = name.slice(0, 120); }
                          lineM.mutate(base);
                        }}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            <SelectGroup><SelectLabel>Investors</SelectLabel>{investors.map((i) => <SelectItem key={i.id} value={`inv:${i.id}`}>{i.name}</SelectItem>)}</SelectGroup>
                            {(u.investments ?? []).length > 0 && <SelectGroup><SelectLabel>Investments</SelectLabel>{u.investments.map((a: any) => <SelectItem key={a.id} value={`asset:${a.id}`}>{a.name}</SelectItem>)}</SelectGroup>}
                            <SelectGroup><SelectLabel>Vendors</SelectLabel>{(u.vendors ?? []).map((n: string) => <SelectItem key={n} value={`vendor:${n}`}>{n}</SelectItem>)}<SelectItem value="new-vendor">+ New vendor…</SelectItem></SelectGroup>
                          </SelectContent>
                        </Select>) : assignLabel(l, investors, u)}</td>
                      <td>{open && !l.applied_tx_id ? <input type="checkbox" aria-label="Skip line" checked={l.skip} onChange={(e) => lineM.mutate({ lineId: l.id, category: l.confirmed_category ?? l.suggested_category, ...keep(l), skip: e.target.checked })} /> : l.skip ? "Yes" : ""}</td>
                      {open && u.entered_manually && canEnter ? <td>{!l.applied_tx_id && <RemoveManualLine fundId={fundId} lineId={l.id} />}</td> : null}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              {open && u.entered_manually && canEnter && <ManualLineForm fundId={fundId} uploadId={u.id} />}
              {!u.lines.length && <p className="text-xs text-muted-foreground">No lines yet.</p>}
              {open && <Button size="sm" disabled={applyM.isPending || (u.tie.known && !u.tie.ties)} onClick={() => applyM.mutate(u.id)}>Apply to books</Button>}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
