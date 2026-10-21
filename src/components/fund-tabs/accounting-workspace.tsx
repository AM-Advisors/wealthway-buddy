import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fundBooksFn } from "@/lib/fund-tabs.functions";
import { accountingSummaryFn } from "@/lib/fund-books.functions";
import { FundAccountingPanel } from "@/components/fund-accounting-panel";
import { FundPayments } from "@/components/fund-payments";
import { Ledger, Transactions } from "./banking-tab";
import { StatementUpload } from "./statement-upload";
import { ManualTransactionForm } from "./manual-books-entry";
import { usd } from "./shared";

const SECTIONS = [
  { id: "statements", label: "Bank statements" },
  { id: "transactions", label: "Bank transactions" },
  { id: "bills", label: "Fund bills" },
  { id: "fees", label: "Harmonious fees", staffOnly: true },
  { id: "summary", label: "Summary" },
] as const;
type Section = (typeof SECTIONS)[number]["id"];

/** Fund → Accounting: where Harmonious enters the fund's real records. Records only; nothing moves money. */
export function AccountingWorkspace({ fundId, staff, extra }: { fundId: string; staff: boolean; extra?: React.ReactNode }) {
  const [section, setSection] = useState<Section>("statements");
  const load = useServerFn(fundBooksFn);
  const q = useQuery({ queryKey: ["fund-books", fundId], queryFn: () => load({ data: { fundId } }) });
  const d = q.data as any;
  const books = q.isLoading ? <p className="text-sm text-muted-foreground">Loading books…</p> : q.error || !d ? <p className="text-sm text-destructive">{(q.error as Error)?.message ?? "Couldn't load the books."}</p> : null;
  return (
    <div className="space-y-5">
      <nav aria-label="Accounting sections" className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
        {SECTIONS.filter((s) => staff || !("staffOnly" in s)).map((s) => (
          <button key={s.id} type="button" aria-current={section === s.id ? "page" : undefined} onClick={() => setSection(s.id)}
            className={cn("rounded-md px-3 py-1.5 text-sm transition-colors", section === s.id ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            {s.label}
          </button>
        ))}
      </nav>
      <p className="text-xs text-muted-foreground">Everything here is a record only. Nothing is paid, collected or moved, and postings need a second person's approval.</p>

      {section === "statements" && (books ?? <StatementUpload fundId={fundId} investors={d.investors ?? []} canEnter={staff} />)}
      {section === "transactions" && (books ?? <div className="space-y-5"><Transactions fundId={fundId} d={d} />{staff && <ManualTransactionForm fundId={fundId} investors={d.investors ?? []} />}</div>)}
      {section === "bills" && (staff ? <FundAccountingPanel offeringId={fundId} defaultTab="expenses" /> : <p className="text-sm text-muted-foreground">Harmonious enters and approves the fund's bills. Ask your Harmonious team for a copy of any bill.</p>)}
      {section === "fees" && staff && (
        <Card><CardHeader><CardTitle className="text-base">Harmonious: fees, invoices and payments received</CardTitle><CardDescription>Bill fees, issue invoices and record payments received for this fund. Nothing is charged or moved automatically.</CardDescription></CardHeader><CardContent><FundPayments fundId={fundId} backTo="admin" /></CardContent></Card>
      )}
      {section === "summary" && <div className="space-y-5"><Summary fundId={fundId} />{!books && d && <Ledger fundId={fundId} d={d} />}{extra}</div>}
    </div>
  );
}

function Summary({ fundId }: { fundId: string }) {
  const load = useServerFn(accountingSummaryFn);
  const q = useQuery({ queryKey: ["accounting-summary", fundId], queryFn: () => load({ data: { fundId } }) });
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading summary…</p>;
  if (q.error || !q.data) return <p className="text-sm text-destructive">{(q.error as Error)?.message ?? "Couldn't load the summary."}</p>;
  const s = q.data;
  const tiles: { l: string; v: string; n?: string }[] = [
    { l: "Cash per latest statement", v: s.statementCashCents == null ? "-" : usd(s.statementCashCents), n: s.statementAsOf ? `as of ${s.statementAsOf}` : "No applied statement yet" },
    { l: "Net of recorded bank lines", v: usd(s.bankLinesCashCents), n: `${s.bankLines} line(s)` },
    { l: "Unmatched bank lines", v: String(s.unmatchedLines) },
    { l: "Statements still in review", v: String(s.draftStatements) },
    { l: "Unpaid fund bills", v: String(s.unpaidBills), n: usd(s.unpaidBillsCents) },
    ...(s.staff ? [{ l: "Open Harmonious invoices", v: String(s.openInvoices ?? 0), n: usd(s.openInvoicesCents ?? 0) }] : []),
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {tiles.map((t) => (
        <Card key={t.l}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t.l}</p><p className="text-xl font-semibold">{t.v}</p>{t.n && <p className="text-xs text-muted-foreground">{t.n}</p>}</CardContent></Card>
      ))}
    </div>
  );
}
