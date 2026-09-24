import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HelpTip } from "@/components/help-tip";
import { toCsv } from "@/lib/company-360-model";
import { ownershipView, reportHeader, stakeholderTransactions, toModelTxs, type WsTx } from "@/lib/company-360-views";

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
        <TabsContent value="documents"><p className="text-sm text-muted-foreground">Documents linked to this stakeholder appear in the Documents tab of the company.</p></TabsContent>
        <TabsContent value="activity"><p className="text-sm text-muted-foreground">{txs.length} recorded equity events involve this stakeholder.</p></TabsContent>
      </Tabs>
    </>
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
  const reversedBy = new Map(txs.filter((t) => t.reversesTransactionId).map((t) => [t.reversesTransactionId!, t.id]));
  if (txs.length === 0) return <p className="text-sm text-muted-foreground">No equity transactions recorded.</p>;
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
          <tr><th className="p-2">Date</th><th className="p-2">Type</th><th className="p-2">From</th><th className="p-2">To</th><th className="p-2">Security</th><th className="p-2 text-right">Quantity</th><th className="p-2 text-right">Amount</th><th className="p-2">Status</th></tr>
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
            </tr>
          ))}
        </tbody>
      </table>
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
