import { describe, expect, it } from "vitest";
import {
  defaultQuoteSections,
  isQuoteSectionShown,
  quoteClientSections,
  quoteLockFacts,
  quoteSectionBody,
  quoteShowsPricing,
  sanitizeQuoteSections,
} from "./quote-sections-model";

const facts = quoteLockFacts({
  organization: "Northstar Capital",
  contactName: null,
  lines: [{ label: "Fund Accounting", quantity: 1, unitCents: 400000 }, { label: "K-1 Tax Prep", quantity: 3, unitCents: 150000 }],
});

describe("quote sections", () => {
  it("keeps every part of the quote on record when it is switched off", () => {
    const stored = sanitizeQuoteSections([{ key: "needs", body: "Audit support", included: false }]);
    expect(stored).toHaveLength(9);
    const needs = stored.find((s) => s.key === "needs");
    expect(needs?.included).toBe(false);
    expect(needs?.body).toBe("Audit support");
  });

  it("starts with only pricing and notes switched on", () => {
    expect(defaultQuoteSections().filter(isQuoteSectionShown).map((s) => s.key)).toEqual(["pricing", "notes"]);
  });

  it("drops parts that are not part of a quote", () => {
    const stored = sanitizeQuoteSections([{ key: "secret_terms", body: "x", included: true }]);
    expect(stored.some((s) => s.key === "secret_terms")).toBe(false);
    expect(stored.find((s) => s.key === "secret_terms")).toBeUndefined();
  });

  it("hides switched-off parts from the client page but shows switched-on ones", () => {
    const titles = quoteClientSections(
      [{ key: "needs", included: true }, { key: "approach", included: false }, { key: "pricing", included: true }],
      facts, null, null,
    ).map((s) => s.title);
    expect(titles).toContain("Your needs");
    expect(titles).not.toContain("Our approach");
    expect(titles).toContain("Pricing");
  });

  it("fills generated parts from the quote's own services and prices", () => {
    const body = quoteClientSections([{ key: "needs", included: true }], facts, null, null).find((s) => s.title === "Your needs")?.body;
    expect(body).toContain("Northstar Capital");
    expect(body).toContain("Fund Accounting");
  });

  it("follows the notes switch instead of always showing the note", () => {
    const on = quoteClientSections([{ key: "notes", included: true }], facts, null, "Welcome aboard").map((s) => s.title);
    const off = quoteClientSections([{ key: "notes", included: false }], facts, null, "Welcome aboard").map((s) => s.title);
    expect(on).toContain("Notes");
    expect(off).not.toContain("Notes");
  });

  it("hides the fee table when the pricing switch is off, and shows it by default", () => {
    expect(quoteShowsPricing(null)).toBe(true);
    expect(quoteShowsPricing([{ key: "pricing", body: "", included: false }])).toBe(false);
  });

  it("keeps typed wording for a part that is switched back off", () => {
    const stored = sanitizeQuoteSections([{ key: "timeline", body: "Kickoff in Q3", included: true }]);
    const again = sanitizeQuoteSections(stored.map((s) => (s.key === "timeline" ? { ...s, included: false } : s)));
    expect(again.find((s) => s.key === "timeline")?.body).toBe("Kickoff in Q3");
    expect(again.find((s) => s.key === "timeline")?.included).toBe(false);
  });

  it("shows the controlled About Harmonious wording when that switch is on", () => {
    const body = quoteSectionBody({ key: "about", title: "About Harmonious", body: "" }, facts, "Harmonious, founded 2019.");
    expect(body).toBe("Harmonious, founded 2019.");
  });

  it("orders client sections the way the client page shows them", () => {
    const titles = quoteClientSections(
      [{ key: "about", included: true }, { key: "summary", included: true }, { key: "pricing", included: true }],
      facts, null, null,
    ).map((s) => s.title);
    expect(titles).toEqual(["Summary", "Pricing", "About Harmonious"]);
  });
});
