import { describe, expect, it } from "vitest";
import { renderTemplate, sideLetterItemsComplete } from "./fund-doc-templates";

const values = {
  fund: "Example Fund I", manager: "Example Manager", investor: "Jane Doe", date: "2026-10-22",
  include_sl_management_fee: "true", management_rate: "1.5%",
  include_sl_carry: "true", carry_rate: "12%",
  include_sl_minimum: "true", minimum: "$25,000",
  include_sl_information_rights: "true", rights: "Monthly reports within 30 days",
};

describe("multi-item side-letter generation", () => {
  it("includes all four terms in one letter with independent fee and carry values", () => {
    const result = renderTemplate("sl_combined", values);
    expect(result.category).toBe("side_letter");
    expect(result.body).toContain("management fee charged to Jane Doe will be 1.5%");
    expect(result.body).toContain("distributions to Jane Doe will be 12%");
    expect(result.body).toContain("not less than $25,000");
    expect(result.body).toContain("Monthly reports within 30 days");
    expect(result.body.match(/Between Example Fund I/g)).toHaveLength(1);
  });
  it("omits deselected items without losing their recorded input", () => {
    const input = { ...values, include_sl_carry: "false" };
    expect(renderTemplate("sl_combined", input).body).not.toContain("12%");
    expect(input.carry_rate).toBe("12%");
  });
  it("rejects zero selected items", () => {
    expect(() => renderTemplate("sl_combined", {})).toThrow("Select at least one");
  });
  it("rejects an incomplete selected item", () => {
    expect(sideLetterItemsComplete({ ...values, rights: "  " })).toBe(false);
    expect(() => renderTemplate("sl_combined", { ...values, rights: "" })).toThrow();
  });
  it("preserves legacy single-item rendering", () => {
    expect(renderTemplate("sl_carry", { ...values, rate: "15%" }).body).toContain("will be 15%");
  });
});