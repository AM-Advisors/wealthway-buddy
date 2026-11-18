import { describe, expect, it } from "vitest";
import { formDDueDate, fundFilingStatus, normalizeUsState } from "./regulatory-filings-model";

const base = { regType: "506b", formD: "harmonious" as const, blueSky: "harmonious" as const, firstSaleOn: "2026-11-01", investors: [], filings: [], today: "2026-11-10" };

describe("normalizeUsState", () => {
  it("treats TX and Texas as the same state", () => {
    expect(normalizeUsState("TX")).toBe("TX");
    expect(normalizeUsState("Texas")).toBe("TX");
    expect(normalizeUsState("TEXAS")).toBe("TX");
  });
  it("reads a state after a city", () => {
    expect(normalizeUsState("Shelley Idaho")).toBe("ID");
    expect(normalizeUsState("Austin, TX")).toBe("TX");
    expect(normalizeUsState("New York")).toBe("NY");
  });
  it("leaves unreadable values blank instead of guessing", () => {
    expect(normalizeUsState("")).toBeNull();
    expect(normalizeUsState("Ontario")).toBeNull();
  });
});

describe("fundFilingStatus", () => {
  it("Form D is due 15 days after the first sale", () => {
    expect(formDDueDate("2026-11-01")).toBe("2026-11-16");
  });
  it("one Blue Sky state per state even when spelled differently", () => {
    const s = fundFilingStatus({ ...base, investors: [{ region: "TX", amountCents: 1 }, { region: "Texas", amountCents: 1 }, { region: "CA", amountCents: 1 }] });
    expect(s.blueSky.required).toEqual(["CA", "TX"]);
  });
  it("past the due date with no filed Form D is overdue", () => {
    const s = fundFilingStatus({ ...base, investors: [{ region: "TX", amountCents: 1 }], today: "2026-11-20" });
    expect(s.formD.overdue).toBe(true);
    expect(s.urgency).toBe("overdue");
  });
  it("money received with no first sale date asks for the date", () => {
    const s = fundFilingStatus({ ...base, firstSaleOn: null, investors: [{ region: "TX", amountCents: 1 }] });
    expect(s.formD.stage).toBe("needs_first_sale");
  });
  it("a state clears only by a recorded filing or Not required", () => {
    const s = fundFilingStatus({ ...base, investors: [{ region: "TX", amountCents: 1 }, { region: "CA", amountCents: 1 }],
      filings: [{ kind: "form_d", jurisdiction: "SEC", status: "filed", filedOn: "2026-11-05" }, { kind: "blue_sky", jurisdiction: "TX", status: "filed", filedOn: "2026-11-06" }, { kind: "blue_sky", jurisdiction: "CA", status: "prepared", filedOn: null }] });
    expect(s.blueSky.outstanding).toEqual(["CA"]);
    expect(s.formD.annualAmendmentDue).toBe("2027-11-05");
  });
  it("Reg CF funds have no Form D", () => {
    expect(fundFilingStatus({ ...base, regType: "regcf", investors: [{ region: "TX", amountCents: 1 }] }).formD.stage).toBe("not_needed");
  });
});
