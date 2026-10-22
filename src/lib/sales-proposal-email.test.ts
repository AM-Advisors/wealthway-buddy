import { describe, expect, it } from "vitest";
import { aboutLast, applyLockedSections, defaultSections, proposalReadyEmail, servicesFromSow } from "./sales-documents-model";

describe("proposal email", () => {
  it("uses the standard wording with client, message and rep", () => {
    const { text } = proposalReadyEmail({ clientName: "Dana", repMessage: "Call me anytime.", repName: "McKay Pettit", link: "https://x/y", canSign: true });
    expect(text).toBe("Hello Dana,\n\nYour proposal is ready for review and authorization. Please click here to open your quote: https://x/y\n\nCall me anytime.\n\nThanks,\n\nMcKay Pettit");
  });
  it("leaves out an empty rep message", () => {
    const { text } = proposalReadyEmail({ clientName: "Dana", repMessage: "  ", repName: "Rep", link: "L", canSign: true });
    expect(text).not.toContain("\n\n\n");
    expect(text.split("\n\n")).toHaveLength(4);
  });
});

describe("proposal layout", () => {
  const facts = { organization: "Acme", contactName: "Dana", lines: [{ label: "Fund Administration", quantity: 1, unit_cents: 100000, line_cents: 100000, billing_frequency: "monthly" }] };
  it("puts About Harmonious last", () => {
    for (const kind of ["proposal", "rfq"] as const) {
      const out = applyLockedSections(kind, "response", defaultSections(kind, "response"), facts);
      expect(out[out.length - 1]!.key).toBe("about");
    }
    expect(aboutLast([{ key: "about" }, { key: "x" }]).map((s) => s.key)).toEqual(["x", "about"]);
  });
  it("describes services with the SOW wording, falling back to the name", () => {
    const t = servicesFromSow([{ label: "Fund Administration" }]);
    expect(t).toContain("• Fund Administration");
    expect(t).toContain("Services not listed above are not included");
  });
});
