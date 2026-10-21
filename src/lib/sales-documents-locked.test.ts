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
  it("terms stay editable", () => expect(body("terms")).toBe("Rep terms"));
  it("proposal services section drops typed prices", () => {
    const p = applyLockedSections("proposal", "response", [{ key: "services", title: "Services", body: "We do admin\n- Admin: $1" }], facts);
    expect(p.find((s) => s.key === "services")!.body).not.toContain("$1\n");
    expect(p.find((s) => s.key === "services")!.body).toContain("$12,000.00");
  });
});
