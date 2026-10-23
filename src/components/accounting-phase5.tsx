import { useState } from "react";
import { useIsSuperAdmin } from "@/lib/use-is-super-admin";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { JOURNAL_SOURCE_LABELS } from "@/lib/ledger-trial-balance";
import { ALERT_LABELS, type AlertKind } from "@/lib/bank-alerts";
import {
  actOnBankAlertFn,
  advanceEntryFn,
  createOutboundBatchFn,
  decideCloseSheetFn,
  decideOutboundBatchFn,
  downloadOutboundBatchFn,
  draftManualEntryFn,
  explainDriftFn,
  importQboJournalFileFn,
  ledgerViewFn,
  listAccountingFundsFn,
  listBankAlertsFn,
  listCloseSheetsFn,
  managerCloseSheetsFn,
  openBookFn,
  prepareCloseSheetFn,
  qboViewFn,
  recordManualBalanceFn,
  recordOutboundResultFn,
  reverseEntryFn,
  runBankAlertScanFn,
  runDriftCheckFn,
  saveQboMappingFn,
  setQboLinkFn,
} from "@/lib/accounting-phase5.functions";

const money = (c: number | null | undefined) =>
  c == null ? "-" : `${c < 0 ? "−" : ""}$${Math.abs(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const toCentsInput = (s: string) => Math.round(Number(s.replace(/[$,\s]/g, "") || "0") * 100);
const today = () => new Date().toISOString().slice(0, 10);
const errMsg = (e: unknown) => (e as Error)?.message ?? "Something went wrong.";

function download(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Fund picker shared by the Phase 5 tabs. */
export function useAccountingFund() {
  const load = useServerFn(listAccountingFundsFn);
  const funds = useQuery({ queryKey: ["acct5-funds"], queryFn: () => load() });
  const [fundId, setFundId] = useState<string>("");
  const picker = (
    <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={fundId} onChange={(e) => setFundId(e.target.value)} aria-label="Fund">
      <option value="">Choose a Fund…</option>
      {(funds.data ?? []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
    </select>
  );
  return { fundId, picker };
}

function useAct<T>(fn: (v: T) => Promise<unknown>, keys: unknown[][], ok: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => { keys.forEach((k) => qc.invalidateQueries({ queryKey: k })); toast.success(ok); },
    onError: (e) => toast.error(errMsg(e)),
  });
}

const STATUS_TONE: Record<string, "secondary" | "outline" | "default"> = { draft: "outline", reviewed: "outline", approved: "secondary", posted: "default", reversed: "outline" };

// ------------------------------------------------------------ General ledger

export function GeneralLedgerPanel() {
  const { fundId, picker } = useAccountingFund();
  const [asOf, setAsOf] = useState("");
  const load = useServerFn(ledgerViewFn);
  const q = useQuery({ queryKey: ["acct5-ledger", fundId, asOf], queryFn: () => load({ data: { offeringId: fundId, ...(asOf ? { asOf } : {}) } }), enabled: !!fundId });
  const openBook = useServerFn(openBookFn);
  const advance = useServerFn(advanceEntryFn);
  const reverse = useServerFn(reverseEntryFn);
  const keys = [["acct5-ledger", fundId, asOf]];
  const open = useAct(() => openBook({ data: { offeringId: fundId } }), keys, "Ledger opened");
  const adv = useAct((v: { entryId: string; to: "reviewed" | "approved" | "posted" }) => advance({ data: { offeringId: fundId, ...v } }), keys, "Entry updated");
  const rev = useAct((v: { entryId: string; reason: string; dateOption: "current_date" | "next_open_period" | "specified"; reversalDate?: string }) => reverse({ data: { offeringId: fundId, ...v } }), keys, "Reversal drafted");
  const d = q.data;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {picker}
        <label className="flex items-center gap-2 text-sm text-muted-foreground">As of <Input type="date" className="w-40" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></label>
      </div>
      {!fundId ? <p className="text-sm text-muted-foreground">Choose a Fund to see its ledger.</p> : q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : q.error ? <p className="text-sm text-destructive">{errMsg(q.error)}</p> : !d?.book ? (
        <Card><CardContent className="space-y-3 pt-6"><p className="text-sm">This Fund has no ledger yet.</p><Button size="sm" onClick={() => open.mutate(undefined)} disabled={open.isPending}>Open ledger</Button></CardContent></Card>
      ) : (
        <>
          <Card>
            <CardHeader><div className="flex items-center justify-between"><CardTitle className="text-base">Trial balance</CardTitle><Badge variant={d.trialBalance!.ties ? "secondary" : "destructive"}>{d.trialBalance!.ties ? "Ties" : "Does not tie"}</Badge></div></CardHeader>
            <CardContent>
              {d.trialBalance!.rows.length === 0 ? <p className="text-sm text-muted-foreground">No recorded entries yet.</p> : (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1">Account</th><th className="text-right">Debits</th><th className="text-right">Credits</th><th className="text-right">Balance</th></tr></thead>
                  <tbody>
                    {d.trialBalance!.rows.map((r) => <tr key={r.id} className="border-t border-border"><td className="py-1">{r.code} {r.name}</td><td className="text-right">{money(r.debitCents)}</td><td className="text-right">{money(r.creditCents)}</td><td className="text-right font-medium">{money(r.balanceCents)}</td></tr>)}
                    <tr className="border-t border-border font-semibold"><td className="py-1">Total</td><td className="text-right">{money(d.trialBalance!.totalDebitCents)}</td><td className="text-right">{money(d.trialBalance!.totalCreditCents)}</td><td /></tr>
                  </tbody>
                </table>
              )}
              <p className="mt-2 text-xs text-muted-foreground">Cash per ledger: {money(d.cashCents)}</p>
            </CardContent>
          </Card>
          <ManualEntryCard offeringId={fundId} accounts={d.accounts} onDone={keys} />
          <Card>
            <CardHeader><CardTitle className="text-base">Journal entries</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {d.entries.length === 0 ? <p className="text-sm text-muted-foreground">No entries yet.</p> : d.entries.map((e) => (
                <div key={e.id} className="rounded-md border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div><span className="font-medium">#{e.entryNo}</span> · {e.date} · {e.memo ?? "-"}</div>
                    <div className="flex items-center gap-2"><Badge variant="outline">{JOURNAL_SOURCE_LABELS[e.source] ?? e.source}</Badge><Badge variant={STATUS_TONE[e.status] ?? "outline"}>{e.status === "posted" ? "Recorded" : e.status}</Badge><span className="font-medium">{money(e.totalCents)}</span></div>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Prepared by {e.preparedBy ?? "-"}{e.approvedBy ? ` · approved by ${e.approvedBy}` : ""}{e.postedBy ? ` · recorded by ${e.postedBy}` : ""}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {e.status === "draft" && <Button size="sm" variant="outline" onClick={() => adv.mutate({ entryId: e.id, to: "reviewed" })}>Mark reviewed</Button>}
                    {e.status === "reviewed" && <Button size="sm" variant="outline" onClick={() => adv.mutate({ entryId: e.id, to: "approved" })}>Approve</Button>}
                    {e.status === "approved" && <Button size="sm" onClick={() => adv.mutate({ entryId: e.id, to: "posted" })}>Record in ledger</Button>}
                    {e.status === "posted" && !e.reversesEntryId && <Button size="sm" variant="ghost" onClick={() => { const reason = window.prompt("Why is this entry being reversed?"); if (!reason?.trim()) return; const when = window.prompt("Reversal date: type a date in an open period (YYYY-MM-DD), \"today\", or leave blank for the first day of the next open period.", "")?.trim() ?? null; if (when === null) return; const dateOption = !when ? "next_open_period" : when.toLowerCase() === "today" ? "current_date" : "specified"; rev.mutate({ entryId: e.id, reason, dateOption, ...(dateOption === "specified" ? { reversalDate: when } : {}) }); }}>Reverse…</Button>}
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">A different person must approve than prepared, and a different person must record than approved. Corrections are reversals.</p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function ManualEntryCard({ offeringId, accounts, onDone }: { offeringId: string; accounts: any[]; onDone: unknown[][] }) {
  const draft = useServerFn(draftManualEntryFn);
  const blank = () => ({ accountId: "", debit: "", credit: "" });
  const [date, setDate] = useState(today());
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState([blank(), blank()]);
  const m = useAct(
    () => draft({ data: { offeringId, entryDate: date, memo, lines: lines.filter((l) => l.accountId).map((l) => ({ accountId: l.accountId, debitCents: toCentsInput(l.debit), creditCents: toCentsInput(l.credit) })) } }),
    onDone,
    "Draft entry saved",
  );
  const dr = lines.reduce((t, l) => t + toCentsInput(l.debit), 0);
  const cr = lines.reduce((t, l) => t + toCentsInput(l.credit), 0);
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Draft a journal entry</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <div className="flex flex-wrap gap-2"><Input type="date" className="w-40" value={date} onChange={(e) => setDate(e.target.value)} /><Input placeholder="Memo" value={memo} onChange={(e) => setMemo(e.target.value)} className="flex-1" /></div>
        {lines.map((l, i) => (
          <div key={i} className="flex flex-wrap gap-2">
            <select className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm" value={l.accountId} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, accountId: e.target.value } : x)))} aria-label="Account">
              <option value="">Account…</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
            </select>
            <Input className="w-32" placeholder="Debit" value={l.debit} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, debit: e.target.value } : x)))} />
            <Input className="w-32" placeholder="Credit" value={l.credit} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, credit: e.target.value } : x)))} />
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setLines([...lines, blank()])}>Add line</Button>
          <span className={`text-xs ${dr === cr && dr > 0 ? "text-muted-foreground" : "text-destructive"}`}>Debits {money(dr)} · Credits {money(cr)}</span>
          <Button size="sm" className="ml-auto" disabled={m.isPending || dr !== cr || dr === 0 || !memo.trim()} onClick={() => m.mutate(undefined, { onSuccess: () => { setMemo(""); setLines([blank(), blank()]); } })}>Save draft</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------ QuickBooks

const INBOUND_LABEL: Record<string, string> = { drafted: "Draft created", skipped_duplicate: "Already brought in", skipped_ours: "Came from our ledger", needs_mapping: "Needs mapping", unbalanced: "Not balanced", closed_period: "Closed period" };

export function QuickBooksPanel() {
  const isSuper = useIsSuperAdmin();
  const { fundId, picker } = useAccountingFund();
  const load = useServerFn(qboViewFn);
  const q = useQuery({ queryKey: ["acct5-qbo", fundId], queryFn: () => load({ data: { offeringId: fundId } }), enabled: !!fundId });
  const keys = [["acct5-qbo", fundId], ["acct5-ledger"]];
  const link = useServerFn(setQboLinkFn);
  const map = useServerFn(saveQboMappingFn);
  const imp = useServerFn(importQboJournalFileFn);
  const batch = useServerFn(createOutboundBatchFn);
  const decide = useServerFn(decideOutboundBatchFn);
  const dl = useServerFn(downloadOutboundBatchFn);
  const result = useServerFn(recordOutboundResultFn);
  const drift = useServerFn(runDriftCheckFn);
  const explain = useServerFn(explainDriftFn);

  const [company, setCompany] = useState("");
  const [mapName, setMapName] = useState("");
  const [mapAcct, setMapAcct] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [driftDate, setDriftDate] = useState(today());

  const linkM = useAct((status: "linked" | "unlinked") => link({ data: { offeringId: fundId, companyName: company, status } }), keys, "Saved");
  const mapM = useAct(() => map({ data: { offeringId: fundId, qboAccountName: mapName, accountId: mapAcct } }), keys, "Mapping saved");
  const impM = useAct(async (f: File) => {
    const r = await imp({ data: { offeringId: fundId, fileName: f.name, csv: await f.text() } });
    toast.message(Object.entries(r.counts).map(([k, v]) => `${INBOUND_LABEL[k] ?? k}: ${v}`).join(" · "));
  }, keys, "File processed");
  const batchM = useAct(() => batch({ data: { offeringId: fundId, entryIds: picked } }), keys, "Batch queued for approval");
  const decideM = useAct(async (v: { batchId: string; decision: "approved" | "declined"; reason?: string }) => {
    const r = await decide({ data: { offeringId: fundId, ...v } });
    if (r.csv) download(`quickbooks-batch-${v.batchId.slice(0, 8)}.csv`, r.csv);
  }, keys, "Decision recorded");
  const resultM = useAct((v: { batchId: string; entryId: string; outcome: "sent" | "failed" | "already_in_qbo"; detail?: string }) => result({ data: { offeringId: fundId, ...v } }), keys, "Result recorded");
  const driftM = useAct(async (f: File) => drift({ data: { offeringId: fundId, asOf: driftDate, csv: await f.text() } }), keys, "Drift check saved");
  const explainM = useAct((v: { snapshotId: string; explanation: string }) => explain({ data: { offeringId: fundId, ...v } }), keys, "Explanation saved");

  const d = q.data;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">{picker}</div>
      <p className="text-xs text-muted-foreground">Our ledger is the only set of books. Anything from QuickBooks becomes a draft entry that still needs second-person approval. Sending to QuickBooks needs a second person's approval and is done by importing the approved file into QuickBooks.</p>
      {!fundId ? null : q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : q.error ? <p className="text-sm text-destructive">{errMsg(q.error)}</p> : d && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">QuickBooks company</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {d.link ? (
                <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">Linked</Badge><span>{d.link.company_name}</span><Badge variant="outline">File exchange</Badge><Button size="sm" variant="ghost" onClick={() => linkM.mutate("unlinked")}>Unlink</Button></div>
              ) : (
                <div className="flex flex-wrap gap-2"><Input placeholder="QuickBooks company name" value={company} onChange={(e) => setCompany(e.target.value)} className="max-w-sm" /><Button size="sm" disabled={!company.trim()} onClick={() => linkM.mutate("linked")}>Link</Button></div>
              )}
              <p className="text-xs text-muted-foreground">A live QuickBooks connection isn't set up yet. Use file exchange: export from QuickBooks and upload here, and download approved batches to import into QuickBooks.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Account mappings</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {!d.hasBook ? <p className="text-muted-foreground">Open the Fund's ledger first (General ledger tab).</p> : (
                <>
                  {d.mappings.length === 0 ? <p className="text-muted-foreground">No mappings yet.</p> : <ul className="space-y-1">{d.mappings.map((m) => <li key={m.qboAccount}>{m.qboAccount} → {m.accountLabel}</li>)}</ul>}
                  <div className="flex flex-wrap gap-2">
                    <Input placeholder="QuickBooks account name" value={mapName} onChange={(e) => setMapName(e.target.value)} className="max-w-xs" />
                    <select className="h-9 rounded-md border border-input bg-background px-2" value={mapAcct} onChange={(e) => setMapAcct(e.target.value)} aria-label="Our account">
                      <option value="">Our account…</option>
                      {d.accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                    </select>
                    <Button size="sm" disabled={!mapName.trim() || !mapAcct} onClick={() => mapM.mutate(undefined, { onSuccess: () => setMapName("") })}>Save mapping</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Changing a mapping adds a new version; earlier imports keep the mapping they used.</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Bring in from QuickBooks</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <label className="flex flex-wrap items-center gap-2">Journal export (CSV)<Input type="file" accept=".csv,text/csv" className="max-w-xs" disabled={impM.isPending} onChange={(e) => { const f = e.target.files?.[0]; if (f) impM.mutate(f); e.target.value = ""; }} /></label>
              {d.inbound.length === 0 ? <p className="text-muted-foreground">Nothing brought in yet.</p> : (
                <table className="w-full text-xs"><thead className="text-left text-muted-foreground"><tr><th>QuickBooks no.</th><th>Date</th><th>Memo</th><th className="text-right">Amount</th><th>Result</th></tr></thead>
                  <tbody>{d.inbound.map((r: any) => <tr key={r.id} className="border-t border-border"><td className="py-1">{r.qbo_txn_id}</td><td>{r.txn_date ?? "-"}</td><td>{r.memo ?? "-"}</td><td className="text-right">{money(r.total_cents)}</td><td title={r.detail ?? ""}>{INBOUND_LABEL[r.outcome] ?? r.outcome}{r.detail && r.outcome !== "drafted" ? ` - ${r.detail}` : ""}</td></tr>)}</tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Send to QuickBooks</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {d.sendable.length === 0 ? <p className="text-muted-foreground">No recorded entries waiting to send.</p> : (
                <>
                  <div className="max-h-56 space-y-1 overflow-auto">
                    {d.sendable.map((e: any) => (
                      <label key={e.id} className="flex items-center gap-2"><input type="checkbox" checked={picked.includes(e.id)} onChange={(x) => setPicked(x.target.checked ? [...picked, e.id] : picked.filter((p) => p !== e.id))} />#{e.entry_no} · {e.entry_date} · {e.memo ?? "-"}</label>
                    ))}
                  </div>
                  <Button size="sm" disabled={!picked.length || batchM.isPending} onClick={() => batchM.mutate(undefined, { onSuccess: () => setPicked([]) })}>Queue {picked.length || ""} for approval</Button>
                </>
              )}
              {d.batches.map((b) => (
                <div key={b.id} className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>{b.entryIds.length} entr{b.entryIds.length === 1 ? "y" : "ies"} · queued by {b.createdBy ?? "-"} · {new Date(b.createdAt).toLocaleDateString()}</span>
                    {b.decision ? <Badge variant={b.decision.decision === "approved" ? "secondary" : "outline"}>{b.decision.decision === "approved" ? `Approved by ${b.decision.by ?? "-"}` : `Declined: ${b.decision.reason ?? ""}`}</Badge> : <Badge variant="outline">Waiting for approval</Badge>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {!b.decision && (!b.mine || isSuper) && <><Button size="sm" onClick={() => decideM.mutate({ batchId: b.id, decision: "approved" })}>Approve & download</Button><Button size="sm" variant="ghost" onClick={() => { const r = window.prompt("Why decline this batch?"); if (r?.trim()) decideM.mutate({ batchId: b.id, decision: "declined", reason: r }); }}>Decline…</Button></>}
                    {!b.decision && b.mine && !isSuper && <span className="text-xs text-muted-foreground">Another team member must approve this batch.</span>}
                    {b.decision?.decision === "approved" && <Button size="sm" variant="outline" onClick={async () => { try { const r = await dl({ data: { offeringId: fundId, batchId: b.id } }); download(`quickbooks-batch-${b.id.slice(0, 8)}.csv`, r.csv); } catch (e) { toast.error(errMsg(e)); } }}>Download file</Button>}
                  </div>
                  {b.decision?.decision === "approved" && (
                    <div className="mt-2 space-y-1">
                      {b.entryIds.map((id: string) => {
                        const latest = [...b.items].filter((x: any) => x.journal_entry_id === id).sort((x: any, y: any) => y.created_at.localeCompare(x.created_at))[0];
                        const done = latest && ["sent", "already_in_qbo"].includes(latest.outcome);
                        return (
                          <div key={id} className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-mono">{id.slice(0, 8)}</span>
                            <Badge variant="outline">{latest ? ({ exported: "In file", sent: "Imported into QuickBooks", failed: "Import failed", already_in_qbo: "Already in QuickBooks" } as Record<string, string>)[latest.outcome] : "-"}</Badge>
                            {!done && <><Button size="sm" variant="ghost" onClick={() => resultM.mutate({ batchId: b.id, entryId: id, outcome: "sent" })}>Mark imported</Button><Button size="sm" variant="ghost" onClick={() => { const r = window.prompt("What failed?"); if (r?.trim()) resultM.mutate({ batchId: b.id, entryId: id, outcome: "failed", detail: r }); }}>Mark failed…</Button></>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Drift check</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-2"><span>As of</span><Input type="date" className="w-40" value={driftDate} onChange={(e) => setDriftDate(e.target.value)} /><Input type="file" accept=".csv,text/csv" className="max-w-xs" disabled={driftM.isPending || !d.hasBook} onChange={(e) => { const f = e.target.files?.[0]; if (f) driftM.mutate(f); e.target.value = ""; }} /></div>
              <p className="text-xs text-muted-foreground">Upload a QuickBooks trial balance export. Differences are flagged, never corrected automatically.</p>
              {d.drift.map((s: any) => (
                <div key={s.id} className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span>As of {s.as_of}</span><Badge variant={Number(s.max_diff_cents) === 0 ? "secondary" : s.explanation ? "outline" : "destructive"}>{Number(s.max_diff_cents) === 0 ? "No differences" : `Largest difference ${money(Number(s.max_diff_cents))}`}</Badge></div>
                  {Number(s.max_diff_cents) !== 0 && <ul className="mt-1 text-xs">{(s.rows as any[]).filter((r) => r.diffCents !== 0).map((r) => <li key={r.account}>{r.account}: QuickBooks {money(r.qboCents)} · ledger {money(r.ledgerCents)}{r.mapped ? "" : " (not mapped)"}</li>)}</ul>}
                  {s.explanation ? <p className="mt-1 text-xs text-muted-foreground">Explanation: {s.explanation}</p> : Number(s.max_diff_cents) !== 0 && <Button size="sm" variant="ghost" onClick={() => { const r = window.prompt("Explain the difference"); if (r?.trim()) explainM.mutate({ snapshotId: s.id, explanation: r }); }}>Explain…</Button>}
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------ Bank alerts

export function BankAlertsPanel() {
  const { fundId, picker } = useAccountingFund();
  const [showResolved, setShowResolved] = useState(false);
  const load = useServerFn(listBankAlertsFn);
  const q = useQuery({ queryKey: ["acct5-alerts", fundId, showResolved], queryFn: () => load({ data: { offeringId: fundId || null, includeResolved: showResolved } }) });
  const keys = [["acct5-alerts"]];
  const act = useServerFn(actOnBankAlertFn);
  const scan = useServerFn(runBankAlertScanFn);
  const bal = useServerFn(recordManualBalanceFn);
  const [balance, setBalance] = useState("");
  const [asOf, setAsOf] = useState(today());
  const actM = useAct((v: { alertId: string; action: "acknowledged" | "assigned" | "resolved" | "reopened"; note?: string }) => act({ data: v }), keys, "Alert updated");
  const scanM = useAct(async () => { const r = await scan({ data: { offeringId: fundId } }); toast.message(`${r.created} new alert(s)`); }, keys, "Checked");
  const balM = useAct(() => bal({ data: { offeringId: fundId, asOf, balanceCents: toCentsInput(balance) } }), keys, "Balance recorded");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {picker}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />Show resolved</label>
        {fundId && <Button size="sm" variant="outline" onClick={() => scanM.mutate(undefined)} disabled={scanM.isPending}>Check now</Button>}
      </div>
      {fundId && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Record a bank statement balance:</span>
          <Input type="date" className="w-40" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          <Input placeholder="Balance" className="w-36" value={balance} onChange={(e) => setBalance(e.target.value)} />
          <Button size="sm" variant="outline" disabled={!balance.trim()} onClick={() => balM.mutate(undefined, { onSuccess: () => setBalance("") })}>Save</Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Alerts are signals only. Resolving one never changes a bank record, and nothing here moves money.</p>
      {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : q.error ? <p className="text-sm text-destructive">{errMsg(q.error)}</p> : (q.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No alerts.</p> : (
        <div className="space-y-2">
          {(q.data ?? []).map((a) => (
            <div key={a.id} className="rounded-md border border-border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><span className="font-medium">{ALERT_LABELS[a.kind as AlertKind] ?? a.kind}</span> · {a.fund}{a.amountCents != null ? ` · ${money(a.amountCents)}` : ""}</div>
                <Badge variant={a.state === "resolved" ? "secondary" : a.state === "open" ? "destructive" : "outline"}>{a.state === "open" ? "Open" : a.state === "acknowledged" ? "Acknowledged" : "Resolved"}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Found {new Date(a.detectedAt).toLocaleDateString()}
                {a.detail?.name ? ` · ${a.detail.name}` : ""}
                {a.detail?.ageDays != null ? ` · ${a.detail.ageDays} days` : ""}
                {a.kind === "balance_mismatch" ? ` · bank ${money(a.detail.bankCents)} vs ledger ${money(a.detail.ledgerCents)} on ${a.detail.asOf}` : ""}
                {a.assigneeName ? ` · assigned to ${a.assigneeName}` : ""}
              </p>
              {a.events.length > 0 && <ul className="mt-1 text-xs text-muted-foreground">{a.events.map((e: any, i: number) => <li key={i}>{new Date(e.created_at).toLocaleString()} - {e.action} by {e.actor ?? "-"}{e.note ? `: ${e.note}` : ""}</li>)}</ul>}
              <div className="mt-2 flex flex-wrap gap-2">
                {a.state === "open" && <Button size="sm" variant="outline" onClick={() => actM.mutate({ alertId: a.id, action: "acknowledged" })}>Acknowledge</Button>}
                {a.state !== "resolved" && <Button size="sm" variant="outline" onClick={() => actM.mutate({ alertId: a.id, action: "assigned" })}>Assign to me</Button>}
                {a.state !== "resolved" && <Button size="sm" onClick={() => { const n = window.prompt("How was this resolved?"); if (n?.trim()) actM.mutate({ alertId: a.id, action: "resolved", note: n }); }}>Resolve…</Button>}
                {a.state === "resolved" && <Button size="sm" variant="ghost" onClick={() => { const n = window.prompt("Why reopen?"); if (n?.trim()) actM.mutate({ alertId: a.id, action: "reopened", note: n }); }}>Reopen…</Button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------ Close sheets

function SheetBody({ kind, snapshot }: { kind: string; snapshot: any }) {
  if (kind === "investor_closing") {
    const t = snapshot.totals ?? {};
    return (
      <div className="space-y-2 text-xs">
        <p>{t.investors} investor(s) · committed {money(t.committedCents)} · called {money(t.calledCents)} · received {money(t.receivedCents)} · {t.unsigned} unsigned · {t.unreceived} not yet received</p>
        <table className="w-full"><thead className="text-left text-muted-foreground"><tr><th>Investor</th><th className="text-right">Committed</th><th className="text-right">Called</th><th className="text-right">Received</th><th>Signature</th></tr></thead>
          <tbody>{(snapshot.investors ?? []).map((r: any) => <tr key={r.applicationId} className="border-t border-border"><td className="py-1">{r.investor}</td><td className="text-right">{money(r.committedCents)}</td><td className="text-right">{money(r.calledCents)}</td><td className="text-right">{money(r.receivedCents)}</td><td>{r.signature}</td></tr>)}</tbody>
        </table>
        <p className="text-muted-foreground">Received means matched to the bank and reconciled.</p>
      </div>
    );
  }
  return (
    <ul className="space-y-1 text-xs">
      {(snapshot.items ?? []).map((i: any) => <li key={i.key} className="flex items-center gap-2"><Badge variant={i.ok ? "secondary" : "destructive"}>{i.ok ? "Done" : "Open"}</Badge>{i.label} - <span className="text-muted-foreground">{i.detail}</span></li>)}
    </ul>
  );
}

export function CloseSheetsPanel() {
  const isSuper = useIsSuperAdmin();
  const { fundId, picker } = useAccountingFund();
  const load = useServerFn(listCloseSheetsFn);
  const q = useQuery({ queryKey: ["acct5-close", fundId], queryFn: () => load({ data: { offeringId: fundId } }), enabled: !!fundId });
  const keys = [["acct5-close", fundId]];
  const prep = useServerFn(prepareCloseSheetFn);
  const decide = useServerFn(decideCloseSheetFn);
  const [closingDate, setClosingDate] = useState("");
  const [deadline, setDeadline] = useState("");
  const [month, setMonth] = useState(today().slice(0, 7));
  const prepM = useAct((v: { kind: "investor_closing" | "month_end"; key: string; approvalDeadline?: string | null }) => prep({ data: { offeringId: fundId, ...v } }), keys, "Sheet prepared");
  const decideM = useAct(async (v: { versionId: string; decision: "approved" | "returned"; reason?: string }) => {
    const r = await decide({ data: v });
    if (r.periodNote) toast.message(r.periodNote);
  }, keys, "Decision recorded");
  const d = q.data;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">{picker}</div>
      {!fundId ? <p className="text-sm text-muted-foreground">Choose a Fund.</p> : q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : q.error ? <p className="text-sm text-destructive">{errMsg(q.error)}</p> : d && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Investor closing sheet</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {d.closingDates.length === 0 ? <p className="text-muted-foreground">No investor closings are recorded for this Fund yet.</p> : (
                  <>
                    <select className="h-9 w-full rounded-md border border-input bg-background px-2" value={closingDate} onChange={(e) => setClosingDate(e.target.value)} aria-label="Closing date">
                      <option value="">Closing date…</option>
                      {d.closingDates.map((c: string) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <label className="flex items-center gap-2">Approval deadline <Input type="date" className="w-40" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></label>
                    <Button size="sm" disabled={!closingDate} onClick={() => prepM.mutate({ kind: "investor_closing", key: closingDate, approvalDeadline: deadline || null })}>Prepare sheet</Button>
                  </>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Month-end close</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Input type="month" className="w-44" value={month} onChange={(e) => setMonth(e.target.value)} />
                <Button size="sm" disabled={!month} onClick={() => prepM.mutate({ kind: "month_end", key: month })}>Prepare checklist</Button>
                <p className="text-xs text-muted-foreground">Sign-off needs every item to pass and a second person. If the period is already closed, sign-off locks it.</p>
              </CardContent>
            </Card>
          </div>
          {d.sheets.length === 0 ? <p className="text-sm text-muted-foreground">No close sheets yet.</p> : d.sheets.map((s: any) => {
            const v = s.versions[0];
            return (
              <Card key={s.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">{s.kind === "investor_closing" ? `Investor closing ${s.key}` : `Month-end ${s.key}`} · version {v.version}</CardTitle>
                    {v.decision ? <Badge variant={v.decision.decision === "approved" ? "secondary" : "outline"}>{v.decision.decision === "approved" ? `Approved by ${v.decision.by ?? "-"}` : `Returned: ${v.decision.reason ?? ""}`}</Badge> : <Badge variant="outline">Waiting for sign-off</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">Prepared by {v.preparedByName ?? "-"} on {new Date(v.createdAt).toLocaleDateString()}{v.approvalDeadline ? ` · approve by ${v.approvalDeadline}` : ""}</p>
                </CardHeader>
                <CardContent className="space-y-2">
                  <SheetBody kind={s.kind} snapshot={v.snapshot} />
                  {!v.decision && (!v.mine || isSuper) && <div className="flex gap-2"><Button size="sm" onClick={() => decideM.mutate({ versionId: v.id, decision: "approved" })}>Sign off</Button><Button size="sm" variant="ghost" onClick={() => { const r = window.prompt("Why return this sheet?"); if (r?.trim()) decideM.mutate({ versionId: v.id, decision: "returned", reason: r }); }}>Return…</Button></div>}
                  {!v.decision && v.mine && !isSuper && <p className="text-xs text-muted-foreground">Another team member must sign this off.</p>}
                  {v.decision && <Button size="sm" variant="ghost" onClick={() => prepM.mutate({ kind: s.kind, key: s.key, approvalDeadline: v.approvalDeadline })}>Start new version</Button>}
                  {s.versions.length > 1 && <p className="text-xs text-muted-foreground">{s.versions.length - 1} earlier version(s) kept.</p>}
                </CardContent>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}

/** Fund manager: approved close sheets for one Fund, read-only. */
export function ManagerCloseSheets({ offeringId }: { offeringId: string }) {
  const load = useServerFn(managerCloseSheetsFn);
  const q = useQuery({ queryKey: ["acct5-mgr-close", offeringId], queryFn: () => load({ data: { offeringId } }) });
  if (q.isLoading || q.error || !(q.data ?? []).length) return null;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Closings and month-end</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {(q.data ?? []).map((s: any) => (
          <div key={s.id} className="rounded-md border border-border p-3">
            <p className="text-sm font-medium">{s.kind === "investor_closing" ? `Investor closing ${s.key}` : `Month-end ${s.key}`} <Badge variant="secondary" className="ml-2">Approved</Badge></p>
            <div className="mt-2"><SheetBody kind={s.kind} snapshot={s.versions[0].snapshot} /></div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

