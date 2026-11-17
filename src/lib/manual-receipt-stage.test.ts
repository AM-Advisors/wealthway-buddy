import { describe, expect, it } from "vitest";
import { manualReceiptStageUpdate } from "@/lib/investor-onboarding-model";

describe("manualReceiptStageUpdate", () => {
  it("does not move an investor who has not completed anything to funded", () => {
    expect(manualReceiptStageUpdate("profile_selected", "funded")).toEqual({});
    expect(manualReceiptStageUpdate(null, "funded")).toEqual({});
  });
  it("moves an approved investor to funded when the full amount arrives", () => {
    expect(manualReceiptStageUpdate("approved_to_fund", "funded")).toEqual({ stage: "funded" });
  });
  it("leaves the stage alone for a partial receipt", () => {
    expect(manualReceiptStageUpdate("awaiting_funds", "partially_funded" as any)).toEqual({});
  });
});
