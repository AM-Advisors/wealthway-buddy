/**
 * Where a fund's bank records live. Bank statements and bank transactions belong to the fund's
 * Banking tab; Accounting keeps bills, Harmonious fees and the summary. Both tabs read this one
 * list so a fund detail never appears in two places.
 */
export type FundBankingSection = "statements" | "transactions";

export const FUND_BANKING_SECTIONS: readonly FundBankingSection[] = ["statements", "transactions"];

export function isBankingSection(value: string): value is FundBankingSection {
  return (FUND_BANKING_SECTIONS as readonly string[]).includes(value);
}

export type AccountingSection = "bills" | "fees" | "summary";
export type AccountingSectionDef = { id: AccountingSection; label: string; staffOnly?: boolean };

export const FUND_ACCOUNTING_SECTIONS: readonly AccountingSectionDef[] = [
  { id: "bills", label: "Fund bills" },
  { id: "fees", label: "Harmonious fees", staffOnly: true },
  { id: "summary", label: "Summary" },
];

export const DEFAULT_ACCOUNTING_SECTION: AccountingSection = "summary";

/** Sections this person may open: Harmonious fees is staff only. */
export function accountingSectionsFor(staff: boolean): AccountingSectionDef[] {
  return FUND_ACCOUNTING_SECTIONS.filter((s) => staff || !s.staffOnly);
}

/** The section an Accounting link lands on when nothing was asked for. */
export function defaultAccountingSection(): AccountingSection {
  return DEFAULT_ACCOUNTING_SECTION;
}
