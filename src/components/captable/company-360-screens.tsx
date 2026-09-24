import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HelpTip } from "@/components/help-tip";
import { toCsv } from "@/lib/company-360-model";
import { activityLabel, DOC_GROUPS, docGroup, groupDocuments, ownershipView, reportHeader, stakeholderActivity, stakeholderDocuments, stakeholderTransactions, toModelTxs, type WsDoc, type WsEvent, type WsTx } from "@/lib/company-360-views";
import { reverseCapTransaction } from "@/lib/captable.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

import { fmtDate, fmtMoney, fmtNumber, fmtPercent, useCapTable } from "./captable-context";
import { CapTableEmpty, CapTableSection } from "./captable-states";

function useOwnership(asOf?: string) {
  const { workspace } = useCapTable();
  return useMemo(() => {
    if (!workspace?.company) return null;
    const txs = workspace.transactions as unknown as WsTx[];
    const model = toModelTxs(workspace.company.id, txs, workspace.securities);
    return {
      txs,
      view: ownershipView(workspace.company.id, model, workspace.stakeholders, {
        ...(asOf ? { asOf } : {}), authorized: workspace.company.authorizedShares,
      }),
    };
  }, [workspace, asOf]);
}

const STATUS_LABEL: Record<string, string> = { draft: "Draft", review: "Review", posted: "Finalized" };

/* ------------------------------------------------------------ Stakeholders */
export function StakeholdersScreen() {
  return <CapTableSection><StakeholdersInner /></CapTableSection>;
}
function StakeholdersInner() {
  const { workspace } = useCapTable();
  const data = useOwnership();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  if (!data || !workspace) return null;
  const rows = data.view.rows.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()));
  const selected = workspace.stakeholders.find((s) => s.id === open);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input placeholder="Search stakeholders" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <HelpTip helpKey="stakeholder" />
      </div>
      {rows.length === 0 ? (
        <CapTableEmpty title="No stakeholders yet" body="Add a stakeholder, then issue securities to create ownership." />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr><th className="p-2">Stakeholder</th><th className="p-2">Type</th><th className="p-2 text-right">Securities</th><th className="p-2 text-right">Outstanding %</th><th className="p-2 text-right">Fully diluted %</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="cursor-pointer border-t hover:bg-muted/30" onClick={() => setOpen(r.id)}>
                  <td className="p-2 font-medium">{r.name}</td>
                  <td className="p-2 capitalize">{r.type.replace(/_/g, " ")}</td>
                  <td className="p-2 text-right">{r.securities}</td>
                  <td className="p-2 text-right">{fmtPercent(r.pctOutstanding)}</td>
                  <td className="p-2 text-right">{fmtPercent(r.pctFullyDiluted)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Sheet open={Boolean(selected)} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {selected ? <Stakeholder360 id={selected.id} /> : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Stakeholder360({ id }: { id: string }) {
  const { workspace } = useCapTable();
  const data = useOwnership();
  if (!workspace || !data) return null;
  const sh = workspace.stakeholders.find((s) => s.id === id)!;
  const row = data.view.rows.find((r) => r.id === id);
  const holdings = data.view.positions.filter((p) => p.stakeholderId === id);
  const txs = stakeholderTransactions(id, data.txs);
  return (
    <>
      <SheetHeader><SheetTitle>{sh.name}</SheetTitle></SheetHeader>
      <Tabs defaultValue="overview" className="mt-4">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="holdings">Holdings</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="space-y-2 text-sm">
          <p><span className="text-muted-foreground">Type:</span> <span className="capitalize">{sh.type.replace(/_/g, " ")}</span></p>
          {sh.email ? <p><span className="text-muted-foreground">Email:</span> {sh.email}</p> : null}
          <p><span className="text-muted-foreground">Outstanding:</span> {fmtNumber(row?.outstanding)} ({fmtPercent(row?.pctOutstanding)})</p>
          <p><span className="text-muted-foreground">Fully diluted:</span> {fmtNumber(row?.fullyDiluted)} ({fmtPercent(row?.pctFullyDiluted)})</p>
        </TabsContent>
        <TabsContent value="holdings">
          {holdings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No securities have been issued to this stakeholder.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {holdings.map((h) => (
                <li key={`${h.securityClass}-${h.instrument}`} className="flex justify-between rounded border p-2">
                  <span>{h.securityClass} <span className="text-muted-foreground">({h.instrument})</span></span>
                  <span>{fmtNumber(h.quantity)}</span>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
        <TabsContent value="transactions"><TxTable txs={txs} /></TabsContent>
        <TabsContent value="documents"><StakeholderDocs id={sh.id} txs={txs} /></TabsContent>
        <TabsContent value="activity"><StakeholderActivity id={sh.id} txs={txs} /></TabsContent>
      </Tabs>
    </>
  );
}

function useDocs(): WsDoc[] {
  const { workspace } = useCapTable();
  return ((workspace as any)?.documents ?? []) as WsDoc[];
}
function StakeholderDocs({ id, txs }: { id: string; txs: WsTx[] }) {
  const docs = stakeholderDocuments(id, useDocs(), txs);
  if (docs.length === 0) return <p className="text-sm text-muted-foreground">No documents are linked to this stakeholder yet.</p>;
  return <DocList docs={docs} />;
}
function StakeholderActivity({ id, txs }: { id: string; txs: WsTx[] }) {
  const { workspace } = useCapTable();
  const docs = stakeholderDocuments(id, useDocs(), txs);
  const events = stakeholderActivity(id, (workspace?.events ?? []) as WsEvent[], txs.map((t) => t.id), docs.map((d) => d.id),
    txs.map((t) => t.securityId).filter(Boolean) as string[]);
  if (events.length === 0) return <p className="text-sm text-muted-foreground">No activity recorded for this stakeholder yet.</p>;
  return (
    <ol className="space-y-2 text-sm">
      {events.map((e) => (
        <li key={e.id} className="rounded border p-2">
          <p className="font-medium capitalize">{activityLabel(e.action)}</p>
          <p className="text-xs text-muted-foreground">{fmtDate(e.occurredAt)}{e.reason ? ` · ${e.reason}` : ""}</p>
        </li>
      ))}
    </ol>
  );
}
function DocList({ docs }: { docs: WsDoc[] }) {
  const { workspace } = useCapTable();
  const name = (sid: string | null) => (sid ? workspace?.stakeholders.find((s) => s.id === sid)?.name : null);
  return (
    <ul className="space-y-2 text-sm">
      {docs.map((d) => {
        const links = [name(d.stakeholderId) && `Stakeholder: ${name(d.stakeholderId)}`, d.securityId && "Security", d.transactionId && "Transaction", d.roundId && "Round"].filter(Boolean);
        return (
          <li key={d.id} className="rounded border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{d.title}</span>
              <Badge variant="secondary" className="capitalize">{d.status.replace(/_/g, " ")}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {docGroup(d)} · <span className="capitalize">{d.docType.replace(/_/g, " ")}</span> · Added {fmtDate(d.createdAt)} · Version 1
              {d.uploadedBy ? " · Uploaded by a team member" : " · Generated"}
            </p>
            {links.length ? <p className="mt-1 text-xs">{links.join(" · ")}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------ Documents */
export function DocumentsScreen() {
  return <CapTableSection><DocumentsInner /></CapTableSection>;
}
function DocumentsInner() {
  const docs = useDocs();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [rel, setRel] = useState<string>("all");
  const statuses = [...new Set(docs.map((d) => d.status))];
  const filtered = docs.filter((d) =>
    (!q || d.title.toLowerCase().includes(q.toLowerCase()) || d.docType.toLowerCase().includes(q.toLowerCase())) &&
    (cat === "all" || docGroup(d) === cat) && (status === "all" || d.status === status) &&
    (rel === "all" || (rel === "stakeholder" ? d.stakeholderId : rel === "security" ? d.securityId : rel === "transaction" ? d.transactionId : d.roundId)));
  const groups = groupDocuments(filtered);
  const sel = "h-9 rounded-md border bg-background px-2 text-sm";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Search documents" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Category" className={sel} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="all">All categories</option>{DOC_GROUPS.map((g) => <option key={g}>{g}</option>)}
        </select>
        <select aria-label="Status" className={sel} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>{statuses.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
        <select aria-label="Related record" className={sel} value={rel} onChange={(e) => setRel(e.target.value)}>
          <option value="all">Any related record</option><option value="stakeholder">Stakeholder</option>
          <option value="security">Security</option><option value="transaction">Transaction</option><option value="round">Round</option>
        </select>
      </div>
      {docs.length === 0 ? <CapTableEmpty title="No company documents yet" body="Documents you upload or generate will appear here, grouped by purpose." /> : null}
      {DOC_GROUPS.filter((g) => groups[g].length).map((g) => (
        <Card key={g}>
          <CardHeader className="pb-2"><CardTitle className="text-base">{g} <span className="text-sm font-normal text-muted-foreground">({groups[g].length})</span></CardTitle></CardHeader>
          <CardContent><DocList docs={groups[g]} /></CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ Reversal */
function ReverseDialog({ tx, onClose }: { tx: WsTx; onClose: () => void }) {
  const { workspace, refetch } = useCapTable() as any;
  const run = useServerFn(reverseCapTransaction);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await run({ data: { companyId: workspace.company.id, originalId: tx.id, correctionType: "full_reversal", effectiveDate: date, reason } });
      toast.success("Reversal recorded. The original stays on file, linked to this reversal.");
      refetch(); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not record the reversal."); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Record correction / reversal <HelpTip helpKey="reversal" /></DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="rounded border bg-muted/40 p-2">Original: <span className="capitalize">{tx.kind.replace(/_/g, " ")}</span> of {fmtNumber(Math.abs(tx.quantity))} on {fmtDate(tx.effectiveDate)}</p>
          <p className="text-muted-foreground">The original is never changed. A full reversal is recorded and linked to it; if the numbers were wrong, record the corrected transaction afterwards.</p>
          <label className="block">Effective date<Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="block">Reason<Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this being reversed?" /></label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || reason.trim().length < 5} onClick={submit}>Record reversal</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------ Transactions */
function TxTable({ txs }: { txs: WsTx[] }) {
  const { workspace } = useCapTable();
  const name = (id: string | null) => (id ? workspace?.stakeholders.find((s) => s.id === id)?.name ?? "—" : "—");
  const cls = (id: string | null) => {
    const s = id ? workspace?.securities.find((x) => x.id === id) : null;
    return s ? s.className ?? s.securityLabel : "—";
  };
  const [reversing, setReversing] = useState<WsTx | null>(null);
  const canManage = Boolean((workspace as any)?.canManage);
  const reversedBy = new Map(txs.filter((t) => t.reversesTransactionId).map((t) => [t.reversesTransactionId!, t.id]));
  if (txs.length === 0) return <p className="text-sm text-muted-foreground">No equity transactions recorded.</p>;
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
          <tr><th className="p-2">Date</th><th className="p-2">Type</th><th className="p-2">From</th><th className="p-2">To</th><th className="p-2">Security</th><th className="p-2 text-right">Quantity</th><th className="p-2 text-right">Amount</th><th className="p-2">Status</th>{canManage ? <th className="p-2" /> : null}</tr>
        </thead>
        <tbody>
          {txs.map((t) => (
            <tr key={t.id} id={`tx-${t.id}`} className="border-t align-top">
              <td className="p-2 whitespace-nowrap">{fmtDate(t.effectiveDate)}</td>
              <td className="p-2 capitalize">
                {t.reversesTransactionId ? "Reversal" : t.kind.replace(/_/g, " ")}
                {t.reversesTransactionId ? <a className="block text-xs text-primary underline" href={`#tx-${t.reversesTransactionId}`}>Reverses original</a> : null}
                {reversedBy.has(t.id) ? <a className="block text-xs text-primary underline" href={`#tx-${reversedBy.get(t.id)}`}>Reversed — see correction</a> : null}
              </td>
              <td className="p-2">{name(t.counterpartyId)}</td>
              <td className="p-2">{name(t.stakeholderId)}</td>
              <td className="p-2">{cls(t.securityId)}</td>
              <td className="p-2 text-right">{fmtNumber(t.quantity)}</td>
              <td className="p-2 text-right">{fmtMoney(t.amount)}</td>
              <td className="p-2"><Badge variant={t.postingStatus === "posted" ? "default" : "secondary"}>{STATUS_LABEL[t.postingStatus] ?? t.postingStatus}</Badge></td>
              {canManage ? <td className="p-2">{t.postingStatus === "posted" && !t.reversesTransactionId && !reversedBy.has(t.id) ? <Button size="sm" variant="ghost" onClick={() => setReversing(t)}>Reverse</Button> : null}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
      {reversing ? <ReverseDialog tx={reversing} onClose={() => setReversing(null)} /> : null}
    </div>
  );
}

export function TransactionsScreen() {
  return <CapTableSection><TransactionsInner /></CapTableSection>;
}
function TransactionsInner() {
  const data = useOwnership();
  const [filter, setFilter] = useState<"all" | "draft" | "review" | "posted">("all");
  if (!data) return null;
  const txs = filter === "all" ? data.txs : data.txs.filter((t) => t.postingStatus === filter);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Company equity events only — never fund bank or capital movements. Finalized entries cannot be edited or deleted; corrections are recorded as reversals that link back to the original. <HelpTip helpKey="reversal" />
      </p>
      <div className="flex flex-wrap gap-2">
        {(["all", "draft", "review", "posted"] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
            {f === "all" ? "All" : STATUS_LABEL[f]}
          </Button>
        ))}
      </div>
      <TxTable txs={txs} />
    </div>
  );
}

/* ------------------------------------------------------------ Reports */
const REPORTS = [
  { key: "current", label: "Current Cap Table", asOf: false },
  { key: "fully_diluted", label: "Fully Diluted Cap Table", asOf: false },
  { key: "register", label: "Stakeholder Register", asOf: false },
  { key: "by_stakeholder", label: "Ownership by Stakeholder", asOf: true },
  { key: "by_class", label: "Ownership by Security Class", asOf: true },
  { key: "ledger", label: "Transaction Ledger", asOf: false },
  { key: "historical", label: "Historical Cap Table", asOf: true },
] as const;

export function ReportsScreen() {
  return <CapTableSection><ReportsInner /></CapTableSection>;
}
function ReportsInner() {
  const { workspace } = useCapTable();
  const [asOf, setAsOf] = useState("");
  const data = useOwnership(asOf || undefined);
  if (!data || !workspace?.company) return null;
  const { view, txs } = data;

  const build = (key: string) => {
    switch (key) {
      case "current":
      case "by_stakeholder":
      case "historical":
        return view.rows.filter((r) => r.outstanding || r.fullyDiluted).map((r) => ({ stakeholder: r.name, outstanding: r.outstanding, pct_outstanding: r.pctOutstanding.toFixed(4), fully_diluted: r.fullyDiluted, pct_fully_diluted: r.pctFullyDiluted.toFixed(4) }));
      case "fully_diluted":
        return view.positions.map((p) => ({ stakeholder: view.nameOf(p.stakeholderId), class: p.securityClass, instrument: p.instrument, quantity: p.quantity }));
      case "register":
        return workspace.stakeholders.map((s) => ({ name: s.name, type: s.type, email: s.email ?? "" }));
      case "by_class":
        return view.summary.byClass.map((c) => ({ class: c.key, quantity: c.quantity, pct_fully_diluted: c.pctFullyDiluted.toFixed(4) }));
      case "ledger":
        return txs.map((t) => ({ date: t.effectiveDate, type: t.kind, quantity: t.quantity, status: STATUS_LABEL[t.postingStatus] ?? t.postingStatus, reverses: t.reversesTransactionId ?? "" }));
      default:
        return [];
    }
  };

  const download = (key: string, label: string) => {
    const h = reportHeader(workspace.company!.name, label, asOf || null, view.summary.latestEffectiveDate);
    const meta = Object.entries(h).map(([k, v]) => `# ${k}: ${v}`).join("\n");
    const blob = new Blob([`${meta}\n${toCsv(build(key))}`], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${workspace.company!.name}-${key}${asOf ? `-${asOf}` : ""}.csv`;
    a.click();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generated from finalized transactions</CardTitle>
          <CardDescription>
            Reports are snapshots for sharing. They never replace the ledger as the source of ownership.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3 text-sm">
          <label className="space-y-1">
            <span className="flex items-center gap-1 text-muted-foreground">As of date <HelpTip helpKey="as_of_date" /></span>
            <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="w-44" />
          </label>
          <div className="space-y-1">
            <p className="flex items-center gap-1 text-muted-foreground">Issued & Outstanding <HelpTip helpKey="outstanding_shares" /></p>
            <p className="font-semibold">{fmtNumber(view.summary.outstanding)}</p>
          </div>
          <div className="space-y-1">
            <p className="flex items-center gap-1 text-muted-foreground">Fully diluted <HelpTip helpKey="fully_diluted" /></p>
            <p className="font-semibold">{fmtNumber(view.summary.fullyDiluted)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground">Data cutoff</p>
            <p className="font-semibold">{fmtDate(view.summary.latestEffectiveDate)}</p>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => (
          <Card key={r.key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{r.label}</CardTitle>
              <CardDescription>{build(r.key).length} rows{r.asOf && asOf ? ` · as of ${fmtDate(asOf)}` : ""}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button size="sm" variant="outline" onClick={() => download(r.key, r.label)}>Download CSV</Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
