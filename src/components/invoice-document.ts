/** Builds a printable invoice a client can save as a PDF from their browser.
 *  Kept as plain HTML so the download works without a server round-trip. */

import { COMPANY, companyAddressLines, companyLogoUrl } from "@/lib/company-details";


const money = (cents: number | null | undefined) =>
  typeof cents === "number"
    ? (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })
    : "—";

const escape = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const STATUS: Record<string, string> = {
  issued: "Awaiting payment",
  paid: "Paid",
  void: "Cancelled",
};

export function invoiceFileName(invoice: any) {
  const number = String(invoice?.number ?? "invoice").replace(/[^A-Za-z0-9-]+/g, "-");
  return `Harmonious-${number}.html`;
}

export function buildInvoiceHtml(invoice: any) {
  const lines = (invoice?.lines ?? []) as any[];
  const rows = lines
    .map(
      (line) => `
        <tr>
          <td>${escape(line.label)}</td>
          <td class="qty">${escape(line.quantity ?? "")}</td>
          <td class="amount">${money(Number(line.amount_cents))}</td>
        </tr>`,
    )
    .join("");

  const paid = invoice?.client_payment_declared_at
    ? `<p class="note">Payment reported by you: ${escape(
        invoice.client_payment_method === "ach" ? "ACH" : "wire",
      )} sent ${escape(invoice.client_paid_on ?? "")}${
        invoice.client_payment_reference ? ` · reference ${escape(invoice.client_payment_reference)}` : ""
      }.</p>`
    : "";

  const addressLines = companyAddressLines()
    .map((line) => `<p>${escape(line)}</p>`)
    .join("");
  const contactLines = [
    COMPANY.phone ? `<p>${escape(COMPANY.phone)}</p>` : "",
    `<p>${escape(COMPANY.billingEmail || COMPANY.email)}</p>`,
    `<p>${escape(COMPANY.website)}</p>`,
  ].join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escape(invoice?.number ?? "Invoice")} — Harmonious</title>
<style>
  :root { color-scheme: light; }
  body { font-family: Poppins, "Helvetica Neue", Arial, sans-serif; color: #221F20; margin: 0; padding: 48px; }
  h1 { font-family: Rubik, Arial, sans-serif; color: #142647; font-size: 26px; margin: 0 0 4px; }
  .brand { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #5DC6D1; padding-bottom: 16px; }
  .brand p { margin: 2px 0; font-size: 13px; color: #55585c; }
  .meta { margin-top: 24px; display: flex; gap: 48px; font-size: 13px; }
  .meta strong { display: block; color: #142647; text-transform: uppercase; letter-spacing: .06em; font-size: 11px; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 28px; font-size: 14px; }
  th { text-align: left; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: #142647; border-bottom: 1px solid #d8dce2; padding: 8px 0; }
  td { padding: 10px 0; border-bottom: 1px solid #eef1f4; }
  .qty, th.qty { text-align: center; width: 80px; }
  .amount, th.amount { text-align: right; width: 140px; }
  tfoot td { font-weight: 600; border-bottom: none; padding-top: 16px; }
  .note { margin-top: 20px; font-size: 12px; color: #55585c; }
  .status { display: inline-block; margin-top: 6px; padding: 3px 10px; border-radius: 999px; background: #eef7f9; color: #142647; font-size: 12px; }
  .logo { height: 44px; margin-bottom: 10px; }
  .doc-type { font-size: 11px; letter-spacing: .18em; text-transform: uppercase; color: #55585c; margin: 0 0 2px; }
  .from { margin-top: 22px; font-size: 12px; color: #55585c; }
  .from strong { display: block; color: #142647; text-transform: uppercase; letter-spacing: .06em; font-size: 11px; margin-bottom: 4px; }
  .from p { margin: 1px 0; }
  @media print { body { padding: 24px; } }
</style>
</head>
<body>
  <div class="brand">
    <div>
      <img class="logo" src="${escape(companyLogoUrl())}" alt="${escape(COMPANY.name)}" />
      <p>${escape(COMPANY.tagline)}</p>
    </div>
    <div style="text-align:right">
      <p class="doc-type">Invoice</p>
      <h1>${escape(invoice?.number ?? "Invoice")}</h1>
      <span class="status">${escape(STATUS[invoice?.status] ?? invoice?.status ?? "")}</span>
    </div>
  </div>


  <div class="meta">
    <div>
      <strong>Billed to</strong>
      ${escape(invoice?.client_name ?? "Your organisation")}
    </div>
    <div>
      <strong>Period</strong>
      ${escape(invoice?.period_start ?? "")} to ${escape(invoice?.period_end ?? "")}
    </div>
    <div>
      <strong>Issued</strong>
      ${escape(invoice?.issue_date ?? "")}
    </div>
    <div>
      <strong>Due</strong>
      ${escape(invoice?.due_date ?? "On receipt")}
    </div>
  </div>

  <table>
    <thead>
      <tr><th>Description</th><th class="qty">Qty</th><th class="amount">Amount</th></tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="3">No items</td></tr>'}</tbody>
    <tfoot>
      <tr><td>Total</td><td class="qty"></td><td class="amount">${money(Number(invoice?.total_cents))}</td></tr>
    </tfoot>
  </table>

  ${paid}
  <p class="note">
    Fees are billed under your statement of work. Harmonious facilitates payments and keeps the
    records; it does not hold client money, act as custodian or as escrow agent.
  </p>
</body>
</html>`;
}

/** Opens the invoice in a print window so the client can save it as a PDF. */
export function printInvoice(invoice: any) {
  const win = window.open("", "_blank", "noopener,noreferrer,width=900,height=1000");
  if (!win) return false;
  win.document.write(buildInvoiceHtml(invoice));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
  return true;
}

/** Saves the invoice to the client's device as a self-contained file. */
export function downloadInvoice(invoice: any) {
  const blob = new Blob([buildInvoiceHtml(invoice)], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = invoiceFileName(invoice);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
