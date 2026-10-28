import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { invoicePdfSpec } from "@/components/invoice-document";
import { invoiceBalance } from "@/lib/invoice-balance";
import { listInvoices, listMyInvoices } from "@/lib/invoices.functions";
import { listPeriodFundReports } from "@/lib/period-reports.functions";
import { renderPdf, type PdfDocSpec } from "@/lib/pdf-render";
import {
  invoicesInPeriod,
  periodRange,
  reportRows,
  reportsInPeriod,
  safeFilePart,
  statementTotals,
  type Period,
} from "@/lib/period-downloads-model";

const money = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const STATUS: Record<string, string> = { issued: "Awaiting payment", paid: "Paid", void: "Cancelled" };

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
const pdfBlob = (b: Uint8Array) => new Blob([b.slice() as unknown as BlobPart], { type: "application/pdf" });

async function saveSheet(sheets: { name: string; rows: (string | number)[][] }[], fileName: string) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const s of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows), s.name.slice(0, 31));
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  save(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), fileName);
}

/** Quarterly / yearly downloads to send clients: billing statement, invoice
 *  bundle and released fund financial reports, each as PDF or Excel. */
export function PeriodDownloads({ mode }: { mode: "client" | "staff" }) {
  const now = new Date();
  const [kind, setKind] = useState<"quarter" | "year">("quarter");
  const [year, setYear] = useState(now.getUTCFullYear());
  const [quarter, setQuarter] = useState<1 | 2 | 3 | 4>((Math.floor(now.getUTCMonth() / 3) + 1) as 1 | 2 | 3 | 4);
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const loadStaff = useServerFn(listInvoices);
  const loadMine = useServerFn(listMyInvoices);
  const loadReports = useServerFn(listPeriodFundReports);

  const inv = useQuery({
    queryKey: ["period-downloads", mode],
    queryFn: async () => {
      if (mode === "staff") {
        const r: any = await loadStaff();
        return { invoices: (r.invoices ?? []).map((i: any) => ({ ...i, client_name: i.clientName })), clients: r.clients ?? [] };
      }
      const r: any = await loadMine();
      return { invoices: r.invoices ?? [], clients: [] as any[] };
    },
  });
  const rep = useQuery({
    queryKey: ["period-fund-reports", mode, clientId],
    enabled: mode === "client" || !!clientId,
    queryFn: () => loadReports({ data: mode === "staff" ? { clientId } : {} }),
  });

  const period: Period = kind === "year" ? { kind, year } : { kind, year, quarter };
  const range = periodRange(period);

  const scoped = useMemo(() => {
    const all = (inv.data?.invoices ?? []) as any[];
    const forClient = mode === "staff" ? all.filter((i) => i.client_id === clientId) : all;
    return invoicesInPeriod(forClient, period).sort((a, b) => String(a.issue_date).localeCompare(String(b.issue_date)));
  }, [inv.data, clientId, mode, kind, year, quarter]);
  const reports = useMemo(() => reportsInPeriod((rep.data?.reports ?? []) as any[], period), [rep.data, kind, year, quarter]);
  const fundName = (id: string) => rep.data?.funds.find((f) => f.id === id)?.name ?? "Fund";

  const clientName =
    mode === "staff"
      ? inv.data?.clients.find((c: any) => c.id === clientId)?.name ?? "Client"
      : scoped[0]?.client_name ?? "Your organization";
  const base = `Harmonious-${safeFilePart(clientName)}-${range.slug}`;
  const totals = statementTotals(scoped, invoiceBalance);
  const years = Array.from({ length: 5 }, (_, i) => now.getUTCFullYear() + 1 - i);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The download could not be created.");
    } finally {
      setBusy(null);
    }
  }

  const statementSpec = (): PdfDocSpec => ({
    kicker: "Billing statement",
    title: range.label,
    subtitle: clientName,
    meta: [
      { label: "Period", value: `${range.start} to ${range.end}` },
      { label: "Invoices", value: String(totals.count) },
      { label: "Prepared", value: new Date().toISOString().slice(0, 10) },
    ],
    sections: [
      {
        heading: "Invoices",
        rows: scoped.length
          ? scoped.map((i) => {
              const b = invoiceBalance(i);
              return {
                label: `${i.number ?? "Invoice"} · issued ${i.issue_date ?? "-"} · ${STATUS[i.status] ?? i.status}`,
                value: i.status === "void" ? `${money(Number(i.total_cents))} cancelled` : `${money(Number(i.total_cents))} · paid ${money(b.paidCents)}`,
              };
            })
          : [{ label: "No invoices in this period", value: "-" }],
      },
      {
        heading: "Summary",
        rows: [
          { label: "Billed", value: money(totals.billedCents) },
          { label: "Paid", value: money(totals.paidCents) },
          { label: "Balance due", value: money(totals.remainingCents) },
          ...(totals.cancelledCents ? [{ label: "Cancelled (not owed)", value: money(totals.cancelledCents) }] : []),
        ],
      },
    ],
    notes: ["Amounts reflect invoices and payments recorded on the date prepared."],
    fileName: `${base}-billing-statement.pdf`,
  });

  const statementRows = (): (string | number)[][] => [
    ["Invoice", "Issued", "Due", "Service period", "Status", "Total", "Paid", "Remaining"],
    ...scoped.map((i) => {
      const b = invoiceBalance(i);
      return [i.number ?? "", i.issue_date ?? "", i.due_date ?? "", `${i.period_start ?? ""} to ${i.period_end ?? ""}`, STATUS[i.status] ?? i.status, Number(i.total_cents) / 100, b.paidCents / 100, i.status === "void" ? 0 : b.remainingCents / 100];
    }),
    [],
    ["Billed", totals.billedCents / 100],
    ["Paid", totals.paidCents / 100],
    ["Balance due", totals.remainingCents / 100],
  ];

  async function bundlePdf() {
    if (!scoped.length) throw new Error("There are no invoices in this period.");
    const { PDFDocument } = await import("pdf-lib");
    const merged = await PDFDocument.create();
    for (const i of scoped) {
      const doc = await PDFDocument.load(await renderPdf(invoicePdfSpec(i)));
      (await merged.copyPages(doc, doc.getPageIndices())).forEach((p) => merged.addPage(p));
    }
    save(pdfBlob(await merged.save()), `${base}-invoices.pdf`);
  }

  const bundleRows = (): (string | number)[][] => [
    ["Invoice", "Issued", "Status", "Item", "Quantity", "Amount"],
    ...scoped.flatMap((i) => (i.lines ?? []).map((l: any) => [i.number ?? "", i.issue_date ?? "", STATUS[i.status] ?? i.status, l.label ?? "", l.quantity ?? "", Number(l.amount_cents) / 100])),
  ];

  const reportSpec = (): PdfDocSpec => ({
    kicker: "Fund financial report",
    title: range.label,
    subtitle: clientName,
    meta: [{ label: "Period", value: `${range.start} to ${range.end}` }, { label: "Statements", value: String(reports.length) }],
    sections: reports.length
      ? reports.map((r) => ({
          heading: `${fundName(r.offering_id)} · ${r.payload?.label ?? r.report_type} · ${r.period_start} to ${r.period_end} (v${r.version})`,
          rows: reportRows(r.payload).map((x) => ({ label: `${x.section ? `${x.section}: ` : ""}${x.label}`, value: money(x.amountCents) })),
        }))
      : [{ text: "No published fund financial statements for this period." }],
    notes: ["Only statements that have been reviewed and published are included."],
    fileName: `${base}-fund-financials.pdf`,
  });

  const reportSheets = () =>
    reports.length
      ? reports.map((r, n) => ({
          name: `${n + 1} ${String(r.payload?.label ?? r.report_type)}`,
          rows: [
            ["Fund", fundName(r.offering_id)],
            ["Statement", r.payload?.label ?? r.report_type],
            ["Period", `${r.period_start} to ${r.period_end}`],
            ["Version", r.version],
            [],
            ["Section", "Line", "Amount"],
            ...reportRows(r.payload).map((x) => [x.section, x.label, x.amountCents / 100]),
          ],
        }))
      : [{ name: "Fund financials", rows: [["No published fund financial statements for this period."]] }];

  const ready = mode === "client" || !!clientId;
  const select = "h-9 rounded-md border border-input bg-background px-2 text-sm";

  const item = (key: string, title: string, desc: string, pdf: () => Promise<void>, xlsx: () => Promise<void>) => (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={!ready || !!busy} onClick={() => run(`${key}-pdf`, pdf)}>
          {busy === `${key}-pdf` ? "Preparing…" : "PDF"}
        </Button>
        <Button size="sm" variant="outline" disabled={!ready || !!busy} onClick={() => run(`${key}-xlsx`, xlsx)}>
          {busy === `${key}-xlsx` ? "Preparing…" : "Excel"}
        </Button>
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quarterly and yearly downloads</CardTitle>
        <CardDescription>
          {mode === "staff" ? "Choose a client and period, then download files to send them." : "Download your statement, invoices and fund financials for any quarter or year."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          {mode === "staff" && (
            <div className="space-y-1">
              <Label htmlFor="pd-client">Client</Label>
              <select id="pd-client" className={select} value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">Choose a client</option>
                {(inv.data?.clients ?? []).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="pd-kind">Period</Label>
            <select id="pd-kind" className={select} value={kind} onChange={(e) => setKind(e.target.value as "quarter" | "year")}>
              <option value="quarter">Quarter</option>
              <option value="year">Full year</option>
            </select>
          </div>
          {kind === "quarter" && (
            <div className="space-y-1">
              <Label htmlFor="pd-q">Quarter</Label>
              <select id="pd-q" className={select} value={quarter} onChange={(e) => setQuarter(Number(e.target.value) as 1 | 2 | 3 | 4)}>
                {[1, 2, 3, 4].map((q) => <option key={q} value={q}>Q{q}</option>)}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="pd-y">Year</Label>
            <select id="pd-y" className={select} value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
        {inv.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-2">
            {item("statement", "Billing statement", `${totals.count} invoice${totals.count === 1 ? "" : "s"} · billed ${money(totals.billedCents)} · balance due ${money(totals.remainingCents)}`,
              async () => save(pdfBlob(await renderPdf(statementSpec())), `${base}-billing-statement.pdf`),
              () => saveSheet([{ name: "Statement", rows: statementRows() }], `${base}-billing-statement.xlsx`))}
            {item("bundle", "Invoice bundle", "Every invoice for the period in one file.", bundlePdf,
              async () => {
                if (!scoped.length) throw new Error("There are no invoices in this period.");
                await saveSheet([{ name: "Invoices", rows: statementRows() }, { name: "Items", rows: bundleRows() }], `${base}-invoices.xlsx`);
              })}
            {item("financials", "Fund financial report", rep.isLoading ? "Loading…" : `${reports.length} published statement${reports.length === 1 ? "" : "s"} for this period.`,
              async () => save(pdfBlob(await renderPdf(reportSpec())), `${base}-fund-financials.pdf`),
              () => saveSheet(reportSheets(), `${base}-fund-financials.xlsx`))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
