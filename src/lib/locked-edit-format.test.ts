import { describe, expect, it } from "vitest";
import { describeChanges } from "./locked-edit-format";

describe("locked edit formatting", () => {
  it("shows investment amounts as dollars with readable labels", () => {
    expect(describeChanges({ onboardingId: "x", investment: { amountCents: 21281343, commitmentCents: 21281343, acceptedCents: 21281343 } })).toEqual([
      { label: "Investment amount", value: "$212,813.43" },
      { label: "Commitment amount", value: "$212,813.43" },
      { label: "Accepted amount", value: "$212,813.43" },
    ]);
  });
  it("never shows a full tax ID", () => {
    expect(describeChanges({ taxId: "472152676" })).toEqual([{ label: "Tax ID", value: "Ending in 2676" }]);
  });
});
