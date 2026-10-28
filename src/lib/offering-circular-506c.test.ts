import { describe, expect, it } from "vitest";
import { offeringCircular506cSpec, type OfferingCircular506cFacts } from "@/lib/offering-circular-506c";

const facts: OfferingCircular506cFacts = {
  fundName: "Roas Hedge LP",
  gpName: "ROAS Capital Management L.L.C.",
  stateOfFormation: "Delaware",
  formedDate: "August 10, 2026",
  principalAddress: "1050 Martha Lane, Gallatin, TN 37066",
  targetRaise: "$100,000,000",
  minimumInvestment: "$50,000",
  signatoryTitle: "Managing Partner",
  arbitrationCity: "Lewes",
  arbitrationState: "Delaware",
  circularDate: "October 28, 2026",
  series: [
    { name: "Series A-1 Preferred Interest", range: "At least $50,000 and less than $100,000", preferredReturn: "16% preferred return" },
    { name: "Series A-2 Preferred Interest", range: "At least $100,000 and less than $200,000", preferredReturn: "18% preferred return" },
    { name: "Series A-3 Preferred Interest", range: "$200,000 or more", preferredReturn: "20% preferred return" },
    { name: "Series B Preferred Interest", range: "$250,000 or more", preferredReturn: "No preferred return", notes: "Tiered ROAS Hedge Allocation per PPM; one-year lock-up" },
  ],
};

describe("offeringCircular506cSpec", () => {
  const spec = offeringCircular506cSpec(facts);
  const allText = spec.sections.map((s) => `${s.heading ?? ""}\n${s.text ?? ""}`).join("\n");

  it("names the fund, general partner and 506(c) exemption", () => {
    expect(spec.subtitle).toContain("Roas Hedge LP");
    expect(spec.subtitle).toContain("Rule 506(c)");
    expect(spec.meta).toContainEqual({ label: "General Partner", value: "ROAS Capital Management L.L.C." });
    expect(allText).toContain("Rule 506(c) of Regulation D");
  });

  it("requires accreditation verification before admission and before funds are sent", () => {
    expect(allText).toContain("verified as required by Rule 506(c)");
    expect(allText).toContain("no funds may be sent, until verification is complete");
  });

  it("lists every series with its range and preferred return", () => {
    const rows = spec.sections.find((s) => s.heading === "Series of preferred interests")?.rows ?? [];
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({ label: "Series A-1 Preferred Interest · At least $50,000 and less than $100,000", value: "16% preferred return" });
    expect(rows[3]?.value).toContain("one-year lock-up");
  });

  it("states the governing documents control", () => {
    expect(allText).toContain("Private Placement Memorandum, Limited Partnership Agreement and Subscription Agreement control");
  });

  it("includes a signature page for individuals and entities", () => {
    const sig = spec.sections.find((s) => s.heading === "Investor signature");
    const ent = spec.sections.find((s) => s.heading === "Entity investors");
    expect(sig?.text).toContain("Signature:");
    expect(sig?.text).toContain("Printed name:");
    expect(ent?.text).toContain("Entity name:");
    expect(ent?.text).toContain("Title:");
  });

  it("records the arbitration venue from fund facts", () => {
    expect(allText).toContain("arbitration in Lewes, Delaware");
  });

  it("builds a safe file name from the fund name", () => {
    expect(spec.fileName).toBe("Roas-Hedge-LP-506c-Offering-Circular.pdf");
  });
});
