/** Builds the invoice a client downloads or views — a real PDF, rendered in the
 *  browser so it needs no server round-trip. */

import { COMPANY } from "@/lib/company-details";
import { downloadPdfDoc, openPdfDoc, type PdfDocSpec } from "@/lib/pdf-render";

const money = (cents: number | null | undefined) =>
  typeof cents === "number"
    ? (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })
    : "—";

const STATUS: Record<string, string> = {
  issued: "Awaiting payment",
  paid: "Paid",
  void: "Cancelled",
};

export function invoiceFileName(invoice: any) {
  const number = String(invoice?.number ?? "invoice").replace(/[^A-Za-z0-9-]+/g, "-");
  return `Harmonious-${number}.pdf`;
}

export function invoicePdfSpec(invoice: any): PdfDocSpec {
  const lines = (invoice?.lines ?? []) as any[];

  const rows = lines.map((line) => ({
    label: `${line.label}${line.quantity ? ` (x${line.quantity})` : ""}`,
    value: money(Number(line.amount_cents)),
  }));
  rows.push({ label: "Total", value: money(Number(invoice?.total_cents)) });

  const notes: string[] = [];
  if (invoice?.client_payment_declared_at) {
    notes.push(
      `Payment reported by you: ${
        invoice.client_payment_method === "ach" ? "ACH" : "wire"
      } sent ${invoice.client_paid_on ?? ""}${
        invoice.client_payment_reference ? ` · reference ${invoice.client_payment_reference}` : ""
      }.`,
    );
  }
  notes.push(
    "Fees are billed under your statement of work. Harmonious facilitates payments and keeps the records; it does not hold client money, act as custodian or as escrow agent.",
  );
  notes.push(
    `Questions about this invoice: ${COMPANY.billingEmail || COMPANY.email}. Please quote ${
      invoice?.number ?? "the invoice number"
    } on your wire or ACH payment so we can match it.`,
  );

  return {
    kicker: "Invoice",
    title: String(invoice?.number ?? "Invoice"),
    subtitle: COMPANY.tagline,
    badge: STATUS[invoice?.status] ?? invoice?.status ?? "",
    meta: [
      { label: "Billed to", value: String(invoice?.client_name ?? "Your organisation") },
      {
        label: "Period",
        value: `${invoice?.period_start ?? "—"} to ${invoice?.period_end ?? "—"}`,
      },
      { label: "Issued", value: String(invoice?.issue_date ?? "—") },
      { label: "Due", value: String(invoice?.due_date ?? "On receipt") },
    ],
    sections: [
      {
        heading: "Items",
        rows: rows.length ? rows : [{ label: "No items", value: "—" }],
      },
    ],
    notes,
    fileName: invoiceFileName(invoice),
  };
}

/** Opens the invoice PDF in a new tab. */
export async function printInvoice(invoice: any) {
  return await openPdfDoc(invoicePdfSpec(invoice));
}

/** Saves the invoice PDF to the client's device. */
export async function downloadInvoice(invoice: any) {
  await downloadPdfDoc(invoicePdfSpec(invoice));
}
