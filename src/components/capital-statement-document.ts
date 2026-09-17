/** Builds the capital account statement an investor views or downloads as a PDF. */

import { COMPANY } from "@/lib/company-details";
import { type PdfDocSpec } from "@/lib/pdf-render";

const money = (cents: number | null | undefined) =>
  typeof cents === "number"
    ? (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })
    : "—";

const day = (value: string | null | undefined) =>
  value
    ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—";

const pct = (value: number | null | undefined) =>
  typeof value === "number"
    ? `${value < 0.01 && value > 0 ? value.toFixed(4) : value.toFixed(2)}%`
    : "—";

export function capitalStatementFileName(statement: any) {
  const snap = statement?.snapshot ?? {};
  const fund = String(snap.fundName ?? "fund").replace(/[^A-Za-z0-9]+/g, "-");
  const date = String(statement?.statement_date ?? "").replace(/[^0-9-]/g, "");
  return `Harmonious-capital-account-${fund}-${date}.pdf`;
}

export function capitalStatementPdfSpec(statement: any): PdfDocSpec {
  const s = (statement?.snapshot ?? {}) as any;

  const interest = [
    { label: "Ownership", value: pct(s.ownershipPct) },
    {
      label: "Units held",
      value: s.shares === null || s.shares === undefined ? "—" : String(s.shares),
    },
  ];
  if (s.shareClass) interest.push({ label: "Class", value: String(s.shareClass) });
  if (s.fundValue) {
    interest.push({
      label: "Fund value recorded",
      value: `${money(s.fundValue.navCents)} as at ${day(s.fundValue.asOf)}`,
    });
    interest.push({
      label: "Your share of that value",
      value: money(s.fundValue.investorShareCents),
    });
  }

  return {
    kicker: "Capital account statement",
    title: String(s.fundName ?? "Capital account statement"),
    subtitle: `${s.legalEntityName ? `${s.legalEntityName} · ` : ""}Statement date ${day(
      statement?.statement_date ?? s.statementDate,
    )} · period to ${day(s.periodEnd)}${statement?.version ? ` · version ${statement.version}` : ""}`,
    sections: [
      {
        heading: "Investor",
        rows: [
          { label: "Name", value: String(s.investorName ?? "—") },
          ...(s.ownershipTitle ? [{ label: "Held as", value: String(s.ownershipTitle) }] : []),
          { label: "Closing date", value: day(s.closingDate) },
        ],
      },
      {
        heading: "Capital account",
        rows: [
          { label: "Commitment", value: money(s.commitmentCents) },
          { label: "Capital contributed", value: money(s.contributedCents) },
          { label: "Still outstanding", value: money(s.outstandingCents) },
          { label: "Distributions paid to date", value: money(s.distributionsCents) },
        ],
      },
      { heading: "Interest held", rows: interest },
    ],
    notes: [
      `${COMPANY.legalName} provides administrative, technology, onboarding, reporting, payment-facilitation and recordkeeping services under a master service agreement and statement of work. This statement is produced from the fund's own records as at the date shown. It is not a valuation, an audit, a tax return or investment advice, and ${COMPANY.name} is not the fund's investment adviser, broker-dealer, custodian, auditor, accountant, tax preparer or legal counsel unless a statement of work expressly says so. Questions: ${COMPANY.email}.`,
    ],
    fileName: capitalStatementFileName(statement),
  };
}
