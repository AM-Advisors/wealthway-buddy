import { describe, expect, it } from "vitest";
import { ABOUT_HARMONIOUS, applyLockedSections } from "@/lib/sales-documents-model";

const facts = { organization: "Roas Capital Management", contactName: "Ross Vincent Mahoney", lines: [{ label: "White Glove Fund Administration", quantity: 1, unit_cents: 1200000, line_cents: 1200000, billing_frequency: "annual" }] };
const typed = [
  { key: "summary", title: "Summary", body: "Rep wording" },
  { key: "pricing", title: "Pricing", body: "Only $5 total!" },
  { key: "terms", title: "Terms", body: "Rep terms" },
  { key: "about", title: "About Harmonious", body: "We are cheap" },
];

describe("controlled proposal sections", () => {
  const out = applyLockedSections("rfq", "response", typed, facts);
  const body = (k: string) => out.find((s) => s.key === k)!.body;
  it("About Harmonious is always the approved wording", () => expect(body("about")).toBe(ABOUT_HARMONIOUS));
  it("pricing comes only from the quote", () => { expect(body("pricing")).toContain("$12,000.00"); expect(body("pricing")).not.toContain("$5"); });
  it("summary is generated from quote and prospect", () => expect(body("summary")).toBe("Harmonious proposes White Glove Fund Administration for Roas Capital Management, prepared for Ross Vincent Mahoney."));
  it("typed terms are replaced by the MSA notice when no MSA is given", () => expect(body("terms")).not.toBe("Rep terms"));
  it("proposal services section drops typed prices", () => {
    const p = applyLockedSections("proposal", "response", [{ key: "services", title: "Services", body: "We do admin\n- Admin: $1" }], facts);
    expect(p.find((s) => s.key === "services")!.body).not.toContain("$1\n");
    expect(p.find((s) => s.key === "services")!.body).toContain("$12,000.00");
  });
  it("uses the saved controlled wording when present", () => {
    const o = applyLockedSections("rfq", "response", typed, { ...facts, about: "Marketing approved wording for Harmonious." });
    expect(o.find((s) => s.key === "about")!.body).toBe("Marketing approved wording for Harmonious.");
  });
  it("reps' summary note stays editable, sits under the summary and is capped at 300 characters", () => {
    const o = applyLockedSections("rfq", "response", [...typed, { key: "summary_note", title: "x", body: "Looking forward to working with you. ".repeat(20) }], facts);
    expect(o[1]!.key).toBe("summary_note");
    expect(o[1]!.body.startsWith("Looking forward")).toBe(true);
    expect(o[1]!.body.length).toBe(300);
  });
});

import { pricingText as _pt } from "./sales-documents-model";
import { test as _t, expect as _e } from "vitest";
_t("pricing line never shows a cadence in the name that contradicts its billing frequency", () => {
  const out = _pt([{ label: "White Glove Fund Administration (annual)", quantity: 1, unit_cents: 1200000, line_cents: 1200000, billing_frequency: "quarterly" } as any]);
  _e(out).toContain("- White Glove Fund Administration: 1 x $12,000.00 = $12,000.00 per quarter");
});

import { applyLockedSections as _als, NO_MSA_TERMS as _nomsa } from "./sales-documents-model";
const _msa = { version: "v3.0", effectiveDate: "2026-01-01", sections: [{ section_no: "1", title: "Services framework", body: "Harmonious provides services." }, { section_no: "2", title: "Fees and payment", body: "Fees are due on invoice." }] };
_t("terms section is the published MSA and replaces typed terms", () => {
  const out = _als("rfq", "response", [{ key: "terms", title: "Terms", body: "Net 15, our own terms" }], { msa: _msa, organization: "Roas", contactName: null, lines: [] });
  const t = out.find((x) => x.key === "terms")!;
  _e(t.title).toBe("Terms — Master Services Agreement v3.0");
  _e(t.body).toContain("1. Services framework\nHarmonious provides services.");
  _e(t.body).toContain("2. Fees and payment");
  _e(t.body).not.toContain("Net 15");
});
_t("terms fall back to MSA notice when none is published", () => {
  const out = _als("proposal", "response", [], { msa: null, organization: null, contactName: null, lines: [] });
  _e(out.find((x) => x.key === "terms")!.body).toBe(_nomsa);
});
_t("pricing totals are split by billing frequency with annual equivalent", () => {
  const out = _pt([
    { label: "Fund Admin", quantity: 1, unit_cents: 300000, line_cents: 300000, billing_frequency: "quarterly" },
    { label: "Setup", quantity: 1, unit_cents: 250000, line_cents: 250000, billing_frequency: "one_time" },
  ] as any);
  _e(out).toContain("One-time total: $2,500.00");
  _e(out).toContain("Quarterly total: $3,000.00");
  _e(out).toContain("Annual equivalent (recurring fees): $12,000.00");
  _e(out).not.toMatch(/^Total:/m);
});
