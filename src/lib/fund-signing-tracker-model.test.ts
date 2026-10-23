import { describe, expect, it } from "vitest";
import { signingTrackerState } from "./fund-signing-tracker-model";
describe("document signing evidence", () => {
  it("manual signed logs never claim completed platform signing", () => {
    expect(signingTrackerState(undefined, "signed")).toBe("Reported signed");
  });
  it("completed evidence wins over later pending manual reports", () => {
    expect(signingTrackerState({ status: "signed", signed_at: "2026-10-23T00:00:00Z" }, "pending")).toBe("Signed");
  });
  it("sent requests remain pending without signed evidence", () => {
    expect(signingTrackerState({ status: "sent" })).toBe("Pending signature");
    expect(signingTrackerState({ status: "signed" })).toBe("Pending");
  });
});