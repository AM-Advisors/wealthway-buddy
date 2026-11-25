import { describe, expect, it } from "vitest";

import {
  DEFAULT_ACCOUNTING_SECTION,
  FUND_ACCOUNTING_SECTIONS,
  FUND_BANKING_SECTIONS,
  accountingSectionsFor,
  defaultAccountingSection,
  isBankingSection,
} from "./fund-banking-sections";

describe("fund bank records have one home", () => {
  it("puts bank statements and bank transactions on the Banking tab", () => {
    expect(FUND_BANKING_SECTIONS).toContain("statements");
    expect(FUND_BANKING_SECTIONS).toContain("transactions");
  });

  it("keeps them out of the Accounting section list", () => {
    for (const s of FUND_ACCOUNTING_SECTIONS) {
      expect(isBankingSection(s.id)).toBe(false);
    }
    expect(FUND_ACCOUNTING_SECTIONS.map((s) => s.id)).not.toContain("statements");
    expect(FUND_ACCOUNTING_SECTIONS.map((s) => s.id)).not.toContain("transactions");
  });

  it("never opens Accounting on a section that moved to Banking", () => {
    expect(isBankingSection(defaultAccountingSection())).toBe(false);
    expect(defaultAccountingSection()).toBe(DEFAULT_ACCOUNTING_SECTION);
    expect(FUND_ACCOUNTING_SECTIONS.some((s) => s.id === DEFAULT_ACCOUNTING_SECTION)).toBe(true);
  });

  it("shows fees only to Harmonious staff", () => {
    expect(accountingSectionsFor(false).map((s) => s.id)).toEqual(["bills", "summary"]);
    expect(accountingSectionsFor(true).map((s) => s.id)).toEqual(["bills", "fees", "summary"]);
  });
});
