import { describe, expect, it } from "vitest";
import { applyLockedSections, defaultSections, proposalVisibleSections } from "./sales-documents-model";

const facts = { organization: "Acme Fund", contactName: null, lines: [{ label: "NAV (quarterly)", quantity: 1, unit_cents: 100, line_cents: 100, billing_frequency: "quarterly" }] };

describe("optional proposal sections", () => {
  it("needs, approach, timeline, next steps and about start hidden", () => {
    const out = proposalVisibleSections(applyLockedSections("proposal", "response", defaultSections("proposal", "response"), facts));
    expect(out.map((s) => s.key).filter((k) => ["needs", "approach", "timeline", "next", "about"].includes(k))).toEqual([]);
  });
  it("a switched-on section is shown", () => {
    const secs = defaultSections("proposal", "response").map((s) => s.key === "approach" ? { ...s, included: true } : s);
    expect(proposalVisibleSections(applyLockedSections("proposal", "response", secs, facts)).some((s) => s.key === "approach")).toBe(true);
  });
  it("needs and approach list the quoted services", () => {
    const out = applyLockedSections("proposal", "response", defaultSections("proposal", "response"), facts);
    expect(out.find((s) => s.key === "needs")!.body).toContain("NAV");
    expect(out.find((s) => s.key === "approach")!.body).toContain("NAV");
  });
});

describe("services and pricing follow the SOW", () => {
  it("typed text is replaced by SOW services and quote pricing", () => {
    const secs = defaultSections("proposal", "response").map((s) => s.key === "services" ? { ...s, body: "Custom typed $9,999 deal" } : s);
    const body = applyLockedSections("proposal", "response", secs, facts).find((s) => s.key === "services")!.body;
    expect(body).not.toContain("9,999");
    expect(body).toContain("Services from your Statement of Work:");
    expect(body).toContain("$1.00");
  });
});
