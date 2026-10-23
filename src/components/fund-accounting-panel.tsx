import { useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  accountingOverviewFn, decideExpenseFn, decideFeeTermFn, decideInvestmentFn, decideSettlementFn, feePreviewFn, listMappingsFn,
  postExpenseFn, postInvestmentFn, postSettlementFn, prepareExpenseFn, prepareSettlementFn, prepareInvestmentFn, reverseInvestmentFn, setMappingFn,
} from "@/lib/fund-accounting.functions";
import { openBillCopyFn, uploadBillCopyFn } from "@/lib/fund-books.functions";
import { fileToBase64 } from "@/components/fund-tabs/shared";
import { EXPENSE_CATEGORIES } from "@/lib/fund-accounting-model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const money = (c: number) => `$${((Number(c) || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const toCents = (s: string) => Math.round(Number(s.replace(/[$,]/g, "")) * 100);
const short = (id: string | null) => (id ? id.slice(0, 8) : "-");

function useAct(offeringId: string) {
  const qc = useQueryClient();
  return (fn: () => Promise<unknown>, msg: string) =>
    fn().then(() => { toast.success(msg); qc.invalidateQueries({ queryKey: ["fund-accounting", offeringId] }); }).catch((e: Error) => toast.error(e.message));
}

function DecisionButtons({ row, decide, post, act }: { row: any; decide: any; post: any; act: ReturnType<typeof useAct> }) {
  const [reason, setReason] = useState("");
  if (row.status === "prepared")
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Input className="h-8 w-48" placeholder="Reason (required to reject)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <Button size="sm" onClick={() => act(() => decide({ data: { id: row.id, approve: true, reason: reason || null } }), "Approved")}>Approve</Button>
        <Button size="sm" variant="outline" onClick={() => act(() => decide({ data: { id: row.id, approve: false, reason: reason || null } }), "Rejected")}>Reject</Button>
      </div>
    );
  if (row.status === "approved") return <Button size="sm" onClick={() => act(() => post({ data: { id: row.id } }), "Posted to the ledger")}>Post</Button>;
  return null;
}

function Lineage({ row }: { row: any }) {
  return (
    <p className="text-xs text-muted-foreground">
      Source: {row.source_reference}{row.evidence_reference ? ` · Evidence: ${row.evidence_reference}` : ""} · Journal {short(row.journal_entry_id)} · Bank line {short(row.bank_line_id)} · Prepared {short(row.prepared_by)}{row.decided_by ? ` · Decided ${short(row.decided_by)}` : ""}
    </p>
  );
}

export function FundAccountingPanel({ offeringId, defaultTab = "investments" }: { offeringId: string; defaultTab?: string }) {
  const load = useServerFn(accountingOverviewFn);
  const q = useQuery({ queryKey: ["fund-accounting", offeringId], queryFn: () => load({ data: { offeringId } }) });
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading fund accounting…</p>;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const d = q.data as any;
  return (
    <Tabs defaultValue={defaultTab}>
      <TabsList className="flex-wrap">
        <TabsTrigger value="investments">Investments</TabsTrigger>
        <TabsTrigger value="expenses">Expenses</TabsTrigger>
        <TabsTrigger value="payables">Payables</TabsTrigger>
        <TabsTrigger value="fees">Fee terms</TabsTrigger>
        <TabsTrigger value="mappings">Account mappings</TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
      </TabsList>
      <TabsContent value="investments"><Investments offeringId={offeringId} d={d} /></TabsContent>
      <TabsContent value="expenses"><Expenses offeringId={offeringId} d={d} /></TabsContent>
      <TabsContent value="payables"><Payables offeringId={offeringId} d={d} /></TabsContent>
      <TabsContent value="fees"><FeeTerms offeringId={offeringId} /></TabsContent>
      <TabsContent value="mappings"><Mappings offeringId={offeringId} /></TabsContent>
      <TabsContent value="history">
        <Card><CardContent className="space-y-1 p-4 text-sm">
          {d.events.length === 0 && <p className="text-muted-foreground">No activity yet.</p>}
          {d.events.map((e: any) => <p key={e.id}><span className="text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span> · {e.record_table.replace("fund_", "")} {short(e.record_id)} · {e.action} by {short(e.actor_user_id)}{e.reason ? ` · ${e.reason}` : ""}</p>)}
        </CardContent></Card>
      </TabsContent>
    </Tabs>
  );
}

function Investments({ offeringId, d }: { offeringId: string; d: any }) {
  const act = useAct(offeringId);
  const prepare = useServerFn(prepareInvestmentFn), decide = useServerFn(decideInvestmentFn), post = useServerFn(postInvestmentFn), reverse = useServerFn(reverseInvestmentFn);
  const [f, setF] = useState({ kind: "purchase", assetId: "", issuer: "", security: "", tradeDate: "", settlementDate: "", principal: "", costs: "0", source: "", evidence: "" });
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const submit = () => act(() => prepare({ data: {
    offeringId, kind: f.kind as any, assetId: f.kind === "additional_purchase" ? f.assetId || null : null,
    newIssuerName: f.kind === "purchase" ? f.issuer : null, newAssetName: f.kind === "purchase" ? f.security : null, newAssetClass: null, instrument: null,
    tradeDate: f.tradeDate, settlementDate: f.settlementDate || null, quantity: null, unitPriceCents: null, principalCents: toCents(f.principal),
    transactionCostCents: toCents(f.costs || "0"), sourceReference: f.source, evidenceReference: f.evidence || null,
    idempotencyKey: `${f.kind}|${f.assetId || f.issuer}|${f.tradeDate}|${toCents(f.principal)}|${f.source}`, bankLineId: null,
  } }), "Prepared for review");
  return (
    <div className="space-y-4">
      <Card><CardContent className="grid gap-2 p-4 sm:grid-cols-2">
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={f.kind} onChange={set("kind")}>
          <option value="purchase">New security purchase</option>
          <option value="additional_purchase">Additional purchase of an existing holding</option>
        </select>
        {f.kind === "additional_purchase" ? (
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={f.assetId} onChange={set("assetId")}>
            <option value="">Select holding…</option>
            {d.assets.map((a: any) => <option key={a.id} value={a.id}>{a.issuer_name} - {a.asset_name} ({money(a.cost_basis_cents)})</option>)}
          </select>
        ) : (
          <div className="grid grid-cols-2 gap-2"><Input placeholder="Issuer" value={f.issuer} onChange={set("issuer")} /><Input placeholder="Security" value={f.security} onChange={set("security")} /></div>
        )}
        <Input type="date" aria-label="Trade date" value={f.tradeDate} onChange={set("tradeDate")} />
        <Input type="date" aria-label="Settlement date" value={f.settlementDate} onChange={set("settlementDate")} />
        <Input placeholder="Purchase price ($)" value={f.principal} onChange={set("principal")} />
        <Input placeholder="Transaction costs ($)" value={f.costs} onChange={set("costs")} />
        <Input placeholder="Source reference" value={f.source} onChange={set("source")} />
        <Input placeholder="Evidence reference" value={f.evidence} onChange={set("evidence")} />
        <div className="sm:col-span-2"><Button onClick={submit}>Prepare purchase</Button></div>
      </CardContent></Card>
      {d.investments.map((r: any) => (
        <Card key={r.id}><CardContent className="space-y-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">{r.new_issuer_name ?? d.assets.find((a: any) => a.id === r.asset_id)?.issuer_name ?? "Holding"} · {r.kind === "purchase" ? "Purchase" : "Additional purchase"} · {money(r.total_cost_cents)}</p>
            <Badge variant="outline">{r.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">Trade {r.trade_date}{r.settlement_date ? ` · Settles ${r.settlement_date}` : ""} · Price {money(r.principal_cents)} · Costs {money(r.transaction_cost_cents)}</p>
          <Lineage row={r} />
          <DecisionButtons row={r} decide={decide} post={post} act={act} />
          {r.status === "posted" && <Button size="sm" variant="outline" onClick={() => { const why = window.prompt("Reason for reversal"); if (why) act(() => reverse({ data: { id: r.id, reason: why } }), "Reversed"); }}>Reverse</Button>}
        </CardContent></Card>
      ))}
    </div>
  );
}

export function Expenses({ offeringId, d }: { offeringId: string; d: any }) {
  const act = useAct(offeringId);
  const prepare = useServerFn(prepareExpenseFn), decide = useServerFn(decideExpenseFn), post = useServerFn(postExpenseFn);
  const upload = useServerFn(uploadBillCopyFn), openCopy = useServerFn(openBillCopyFn);
  const [f, setF] = useState({ category: "legal", vendor: "", description: "", invoice: "", invoiceDate: "", date: "", amount: "", mode: "paid", paidOn: "", source: "", evidence: "" });
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const submit = () => act(() => prepare({ data: {
    offeringId, category: f.category, vendor: f.vendor, description: f.description, invoiceNumber: f.invoice || null, invoiceDate: f.invoiceDate || null,
    serviceStart: null, serviceEnd: null, expenseDate: f.date, amountCents: toCents(f.amount), paymentMode: f.mode as any,
    paidOn: f.mode === "paid" ? f.paidOn || null : null, sourceReference: f.source, evidenceReference: f.evidence || null, bankLineId: null,
  } }), "Prepared for review");
  return (
    <div className="space-y-4">
      <Card><CardContent className="grid gap-2 p-4 sm:grid-cols-2">
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={f.category} onChange={set("category")}>
          {EXPENSE_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={f.mode} onChange={set("mode")}>
          <option value="accrued">Needs to be paid</option><option value="paid">Already paid</option>
        </select>
        <Input placeholder="Vendor" value={f.vendor} onChange={set("vendor")} />
        <Input placeholder="Description" value={f.description} onChange={set("description")} />
        <Input placeholder="Invoice number" value={f.invoice} onChange={set("invoice")} />
        <label className="text-xs text-muted-foreground">Invoice date<Input type="date" value={f.invoiceDate} onChange={set("invoiceDate")} /></label>
        <Input placeholder="Amount ($)" value={f.amount} onChange={set("amount")} />
        <label className="text-xs text-muted-foreground">Expense date<Input type="date" value={f.date} onChange={set("date")} /></label>
        {f.mode === "paid" && <label className="text-xs text-muted-foreground">Paid on<Input type="date" max={new Date().toISOString().slice(0, 10)} value={f.paidOn} onChange={set("paidOn")} /></label>}
        <Input placeholder="Source reference" value={f.source} onChange={set("source")} />
        <Input placeholder="Evidence reference" value={f.evidence} onChange={set("evidence")} />
        <div className="sm:col-span-2"><Button onClick={submit}>Prepare bill for review</Button></div>
      </CardContent></Card>
      {d.expenses.map((r: any) => (
        <Card key={r.id}><CardContent className="space-y-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">{r.vendor_status === "unknown" ? `Vendor unknown (source: ${r.vendor})` : r.vendor} · {EXPENSE_CATEGORIES.find((c) => c.key === r.category)?.label ?? r.category} · {money(r.amount_cents)} · {r.payment_mode}</p>
            <Badge variant="outline">{r.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{r.description}{r.invoice_number ? ` · Invoice ${r.invoice_number}` : ""} · {r.expense_date}{r.paid_on ? ` · Paid ${r.paid_on}` : ""}</p>
          <Lineage row={r} />
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {r.bill_copy_path
              ? <Button size="sm" variant="outline" onClick={() => openCopy({ data: { fundId: offeringId, expenseId: r.id } }).then((x) => window.open(x.url, "_blank", "noopener")).catch((e: Error) => toast.error(e.message))}>Open bill copy</Button>
              : <label className="cursor-pointer rounded-md border px-2 py-1">Attach bill copy<input type="file" className="hidden" accept=".pdf,image/*" onChange={async (e) => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; act(async () => upload({ data: { fundId: offeringId, expenseId: r.id, fileName: file.name, contentType: file.type, base64: await fileToBase64(file) } }), "Bill copy attached"); }} /></label>}
          </div>
          <DecisionButtons row={r} decide={decide} post={post} act={act} />
        </CardContent></Card>
      ))}
    </div>
  );
}

export function Payables({ offeringId, d }: { offeringId: string; d: any }) {
  const act = useAct(offeringId);
  const decide = useServerFn(decideSettlementFn), post = useServerFn(postSettlementFn), prepare = useServerFn(prepareSettlementFn);
  const pay = (e: any) => {
    const paidOn = window.prompt("Date paid (YYYY-MM-DD)", new Date().toISOString().slice(0, 10));
    if (!paidOn) return;
    const ref = window.prompt("Payment reference (check number, wire reference)") ?? "";
    if (!ref.trim()) { toast.error("A payment reference is required."); return; }
    act(() => prepare({ data: { offeringId, expenseId: e.id, liabilityPurpose: "accrued_expenses", openingLiabilityReference: null, amountCents: Number(e.amount_cents), paidOn: paidOn.trim(), sourceReference: ref.trim(), idempotencyKey: `bill|${e.id}|${paidOn.trim()}|${ref.trim()}`, bankLineId: null } }), "Payment prepared for review");
  };
  const accrued = d.expenses.filter((e: any) => e.payment_mode === "accrued" && e.status === "posted");
  return (
    <div className="space-y-4">
      <Card><CardContent className="space-y-1 p-4 text-sm">
        <p className="font-medium">Open accrued expenses</p>
        {accrued.length === 0 && <p className="text-muted-foreground">None.</p>}
        {accrued.map((e: any) => <div key={e.id} className="flex flex-wrap items-center justify-between gap-2"><span>{e.vendor} · {money(e.amount_cents)} · {e.expense_date}</span><Button size="sm" variant="outline" onClick={() => pay(e)}>Record payment</Button></div>)}
        <p className="pt-2 text-xs text-muted-foreground">Settling a payable records the payment against the liability. It never records the expense again. Opening liabilities from the prior administrator are settled the same way.</p>
      </CardContent></Card>
      {d.settlements.map((r: any) => (
        <Card key={r.id}><CardContent className="space-y-2 p-4">
          <div className="flex items-center justify-between"><p className="font-medium">{r.opening_liability_reference ?? "Accrued expense"} · {money(r.amount_cents)} · paid {r.paid_on}</p><Badge variant="outline">{r.status}</Badge></div>
          <Lineage row={r} />
          <DecisionButtons row={r} decide={decide} post={post} act={act} />
        </CardContent></Card>
      ))}
    </div>
  );
}

function FeeTerms({ offeringId }: { offeringId: string }) {
  const act = useAct(offeringId);
  const preview = useServerFn(feePreviewFn), decide = useServerFn(decideFeeTermFn);
  const [period, setPeriod] = useState({ start: "2026-01-01", end: "2026-03-31" });
  const q = useQuery({ queryKey: ["fund-accounting", offeringId, "fees", period], queryFn: () => preview({ data: { offeringId, ...period } }) });
  const d = q.data as any;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        Preview period <Input type="date" className="w-40" value={period.start} onChange={(e) => setPeriod({ ...period, start: e.target.value })} />
        to <Input type="date" className="w-40" value={period.end} onChange={(e) => setPeriod({ ...period, end: e.target.value })} />
        <Badge variant="secondary">Read-only - nothing is posted</Badge>
      </div>
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {d && (
        <>
          <Card><CardContent className="space-y-2 p-4 text-sm">
            <p className="font-medium">Fee terms and approval history</p>
            {d.terms.length === 0 && <p className="text-muted-foreground">No formal fee terms yet.</p>}
            {d.terms.map((t: any) => (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
                <span>v{t.version} · {t.positionId ? "Investor (side letter)" : t.classId ? "Class" : "Fund standard"} · {(t.rateBps / 100).toFixed(2)}% of {t.basis.replace(/_/g, " ")} · from {t.startsOn}{t.endsOn ? ` to ${t.endsOn}` : ""} · {t.source}</span>
                <span className="flex items-center gap-2">
                  <Badge variant="outline">{t.status}</Badge>
                  {t.status === "pending" && <Button size="sm" variant="outline" onClick={() => { const why = window.prompt("Approval reason (you must not be the preparer)"); if (why) act(() => decide({ data: { id: t.id, approve: true, reason: why } }), "Approved"); }}>Approve</Button>}
                </span>
              </div>
            ))}
          </CardContent></Card>
          <Card><CardContent className="space-y-1 p-4 text-sm">
            <p className="font-medium">Preview total: {money(d.totalNetCents)}{d.blocked ? " · BLOCKED by a term conflict" : ""}</p>
            {d.lines.map((l: any) => <p key={l.positionId}>{l.name} · {l.appliedLevel ?? "no term"} · {(l.effectiveRateBps / 100).toFixed(2)}% × {money(l.basisAmountCents)} = {money(l.netFeeCents)}</p>)}
          </CardContent></Card>
        </>
      )}
    </div>
  );
}

function Mappings({ offeringId }: { offeringId: string }) {
  const act = useAct(offeringId);
  const load = useServerFn(listMappingsFn), save = useServerFn(setMappingFn);
  const q = useQuery({ queryKey: ["fund-accounting", offeringId, "mappings"], queryFn: () => load({ data: { offeringId } }) });
  if (!q.data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const d = q.data as any;
  const active = (p: string) => d.mappings.find((m: any) => m.purpose === p && m.active);
  return (
    <Card><CardContent className="space-y-2 p-4 text-sm">
      <p className="text-muted-foreground">Each posting purpose points to an account in this fund's chart. An unmapped purpose blocks posting. Changing a mapping keeps the previous one in history.</p>
      {d.purposes.map((p: string) => (
        <div key={p} className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
          <span>{p.replace("expense:", "Expense · ").replace(/_/g, " ")}</span>
          <select className="h-8 rounded-md border bg-background px-2" value={active(p)?.account_id ?? ""} onChange={(e) => e.target.value && act(() => save({ data: { offeringId, purpose: p, accountId: e.target.value, note: null } }), "Mapping saved")}>
            <option value="">Not mapped - posting blocked</option>
            {d.accounts.map((a: any) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
          </select>
        </div>
      ))}
    </CardContent></Card>
  );
}
