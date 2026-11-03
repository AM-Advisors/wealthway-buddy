import { describe, expect, it } from "vitest";
import { unresolvedAmlHits } from "@/lib/aml-match-model";
import { extractDiditDetails } from "@/lib/didit-auto-apply.server";

const ruledOut = { caption: "Christopher Michael Parr", match: false, review_status: "False Positive", datasets: ["Warnings and Regulatory Enforcement"] };
const open = { caption: "Christofer Par", match: true, review_status: null, datasets: ["Sanctions"] };

describe("screening look-alikes", () => {
  it("drops hits the provider marked not a match / false positive", () => {
    expect(unresolvedAmlHits([ruledOut])).toHaveLength(0);
  });
  it("keeps hits the provider has not ruled out", () => {
    expect(unresolvedAmlHits([ruledOut, open])).toHaveLength(1);
  });
  it("approved screening with only ruled-out look-alikes is approved", () => {
    expect(extractDiditDetails({ status: "Approved", aml: { status: "Approved", hits: [ruledOut, ruledOut] } }).amlStatus).toBe("approved");
  });
  it("an unresolved sanctions hit still goes to review", () => {
    expect(extractDiditDetails({ status: "Approved", aml: { status: "Approved", hits: [ruledOut, open] } }).amlStatus).toBe("review");
  });
});
