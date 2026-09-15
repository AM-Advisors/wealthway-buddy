/** Builds a printable share certificate the company or the shareholder can
 *  save as a PDF from the browser. Plain HTML, no server round-trip. */

import { COMPANY, companyAddressLines, companyLogoUrl } from "@/lib/company-details";

const escape = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const day = (value: string | null | undefined) =>
  value
    ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—";

const money = (cents: number | null | undefined) =>
  typeof cents === "number"
    ? (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })
    : "—";

const qty = (value: number | null | undefined) =>
  typeof value === "number" ? value.toLocaleString("en-US", { maximumFractionDigits: 4 }) : "—";

export function certificateFileName(certificate: any) {
  const holder = String(certificate?.snapshot?.holderName ?? "holder").replace(
    /[^A-Za-z0-9]+/g,
    "-",
  );
  return `Share-certificate-${certificate?.certificate_no ?? "draft"}-${holder}.html`;
}

export function buildCertificateHtml(certificate: any) {
  const s = (certificate?.snapshot ?? {}) as any;
  const addressLines = companyAddressLines()
    .map((line) => `<div>${escape(line)}</div>`)
    .join("");

  const statusNote =
    certificate?.status === "issued"
      ? `Signed by ${escape(certificate?.signer_name)}${
          certificate?.signer_title ? `, ${escape(certificate.signer_title)}` : ""
        } on ${day(certificate?.signed_at)}.`
      : certificate?.status === "cancelled" || certificate?.status === "replaced"
        ? `This certificate was ${escape(certificate.status)} on ${day(certificate?.cancelled_at)}${
            certificate?.cancelled_reason ? ` — ${escape(certificate.cancelled_reason)}` : ""
          }.`
        : "Draft — not yet signed by the company signatory.";

  const row = (label: string, value: string) =>
    `<tr><th>${escape(label)}</th><td>${value}</td></tr>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>Share certificate ${escape(certificate?.certificate_no)}</title>
<style>
  :root { color-scheme: light; }
  body { font-family: "Poppins", system-ui, sans-serif; color: #221F20; margin: 0; padding: 40px; background: #fff; }
  .sheet { max-width: 720px; margin: 0 auto; border: 8px double #142647; padding: 36px; }
  header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; border-bottom: 2px solid #142647; padding-bottom: 20px; }
  header img { height: 36px; }
  .from { font-size: 12px; color: #4a4a4a; text-align: right; line-height: 1.6; }
  h1 { font-family: "Rubik", system-ui, sans-serif; font-size: 24px; letter-spacing: 0.06em; text-transform: uppercase; margin: 28px 0 4px; }
  .company { font-size: 18px; font-weight: 600; margin: 0 0 20px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th { text-align: left; width: 42%; font-weight: 500; color: #4a4a4a; padding: 9px 0; border-bottom: 1px solid #e6ecf3; font-size: 14px; }
  td { padding: 9px 0; border-bottom: 1px solid #e6ecf3; font-size: 14px; font-weight: 600; }
  .status { margin-top: 24px; padding: 14px 16px; background: #f4f8fb; border-left: 4px solid #5DC6D1; font-size: 13px; }
  footer { margin-top: 28px; font-size: 11px; color: #6b7a90; line-height: 1.7; }
  @media print { body { padding: 0; } }
</style></head>
<body><div class="sheet">
  <header>
    <img src="${escape(companyLogoUrl())}" alt="${escape(COMPANY.name)}" />
    <div class="from">${addressLines}</div>
  </header>

  <h1>Share certificate</h1>
  <p class="company">${escape(s.companyName)}</p>

  <table>
    ${row("Certificate number", escape(certificate?.certificate_no))}
    ${row("Holder", escape(s.holderName))}
    ${row("Security", escape(s.securityType))}
    ${row("Class", escape(s.shareClass || "—"))}
    ${row("Units held", qty(s.quantity))}
    ${row("Price per unit", money(s.pricePerShareCents))}
    ${row("Issued on", day(s.issuedOn))}
    ${row("Verification code", escape(certificate?.verification_code))}
  </table>

  <div class="status">${statusNote}</div>

  <footer>
    This certificate reflects the company's own cap table records held on the ${escape(COMPANY.name)}
    platform. ${escape(COMPANY.name)} maintains these records administratively and is not the
    company's transfer agent, registrar, counsel or auditor.
  </footer>
</div></body></html>`;
}
