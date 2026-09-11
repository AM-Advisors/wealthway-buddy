/** Builds a printable capital account statement an investor can save as a PDF
 *  from their browser. Plain HTML so the download needs no server round-trip. */

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

const day = (value: string | null | undefined) =>
  value
    ? new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—";

const pct = (value: number | null | undefined) =>
  typeof value === "number" ? `${value < 0.01 && value > 0 ? value.toFixed(4) : value.toFixed(2)}%` : "—";

export function capitalStatementFileName(statement: any) {
  const snap = statement?.snapshot ?? {};
  const fund = String(snap.fundName ?? "fund").replace(/[^A-Za-z0-9]+/g, "-");
  const date = String(statement?.statement_date ?? "").replace(/[^0-9-]/g, "");
  return `Harmonious-capital-account-${fund}-${date}.html`;
}

export function buildCapitalStatementHtml(statement: any) {
  const s = (statement?.snapshot ?? {}) as any;
  const addressLines = companyAddressLines()
    .map((line) => `<div>${escape(line)}</div>`)
    .join("");

  const row = (label: string, value: string) => `
    <tr><th>${escape(label)}</th><td>${value}</td></tr>`;

  const valuation = s.fundValue
    ? row("Fund value recorded", `${money(s.fundValue.navCents)} as at ${day(s.fundValue.asOf)}`) +
      row("Your share of that value", money(s.fundValue.investorShareCents))
    : "";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>Capital account statement — ${escape(s.fundName)}</title>
<style>
  :root { color-scheme: light; }
  body { font-family: "Poppins", system-ui, sans-serif; color: #221F20; margin: 0; padding: 40px; background: #fff; }
  .sheet { max-width: 720px; margin: 0 auto; }
  header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; border-bottom: 2px solid #142647; padding-bottom: 20px; }
  header img { height: 40px; }
  .from { font-size: 12px; color: #4a4a4a; text-align: right; line-height: 1.6; }
  h1 { font-family: "Rubik", system-ui, sans-serif; font-size: 22px; color: #142647; margin: 28px 0 4px; }
  .sub { color: #4a4a4a; font-size: 13px; margin: 0 0 24px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { text-align: left; font-weight: 500; color: #4a4a4a; width: 45%; padding: 10px 0; border-bottom: 1px solid #ececec; vertical-align: top; }
  td { text-align: right; padding: 10px 0; border-bottom: 1px solid #ececec; }
  .section { margin-top: 28px; }
  .section h2 { font-family: "Rubik", system-ui, sans-serif; font-size: 14px; text-transform: uppercase; letter-spacing: .06em; color: #5DC6D1; margin: 0 0 6px; }
  footer { margin-top: 36px; font-size: 11px; color: #6b6b6b; line-height: 1.7; border-top: 1px solid #ececec; padding-top: 16px; }
  @media print { body { padding: 0; } }
</style></head>
<body><div class="sheet">
  <header>
    <img src="${escape(companyLogoUrl())}" alt="${escape(COMPANY.name)}" />
    <div class="from">
      <div><strong>${escape(COMPANY.legalName)}</strong></div>
      ${addressLines}
      <div>${escape(COMPANY.website)}</div>
      <div>${escape(COMPANY.email)}</div>
    </div>
  </header>

  <h1>Capital account statement</h1>
  <p class="sub">${escape(s.fundName)}${s.legalEntityName ? ` — ${escape(s.legalEntityName)}` : ""}<br />
  Statement date ${day(statement?.statement_date ?? s.statementDate)} · period to ${day(s.periodEnd)}${
    statement?.version ? ` · version ${escape(statement.version)}` : ""
  }</p>

  <div class="section">
    <h2>Investor</h2>
    <table>
      ${row("Name", escape(s.investorName))}
      ${s.ownershipTitle ? row("Held as", escape(s.ownershipTitle)) : ""}
      ${row("Closing date", day(s.closingDate))}
    </table>
  </div>

  <div class="section">
    <h2>Capital account</h2>
    <table>
      ${row("Commitment", money(s.commitmentCents))}
      ${row("Capital contributed", money(s.contributedCents))}
      ${row("Still outstanding", money(s.outstandingCents))}
      ${row("Distributions paid to date", money(s.distributionsCents))}
    </table>
  </div>

  <div class="section">
    <h2>Interest held</h2>
    <table>
      ${row("Ownership", pct(s.ownershipPct))}
      ${row("Units held", s.shares === null || s.shares === undefined ? "—" : escape(s.shares))}
      ${s.shareClass ? row("Class", escape(s.shareClass)) : ""}
      ${valuation}
    </table>
  </div>

  <footer>
    ${escape(COMPANY.legalName)} provides administrative, technology, onboarding, reporting,
    payment-facilitation and recordkeeping services under a master service agreement and statement
    of work. This statement is produced from the fund's own records as at the date shown. It is not
    a valuation, an audit, a tax return or investment advice, and ${escape(COMPANY.name)} is not the
    fund's investment adviser, broker-dealer, custodian, auditor, accountant, tax preparer or legal
    counsel unless a statement of work expressly says so. Questions: ${escape(COMPANY.email)}.
  </footer>
</div></body></html>`;
}
