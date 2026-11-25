import { describe, it, expect } from "vitest";
import { belongsInWorkQueue } from "@/lib/manager-onboarding-attention";

describe("belongsInWorkQueue", () => {
  it("keeps a live investment", () => expect(belongsInWorkQueue({ stage: "signature" })).toBe(true));
  it("drops closed investments", () => expect(belongsInWorkQueue({ stage: "closed" })).toBe(false));
  it("drops test investors", () => expect(belongsInWorkQueue({ stage: "signature", is_test_investor: true })).toBe(false));
  it("drops merged records", () => expect(belongsInWorkQueue({ stage: "signature", merged_into_onboarding_id: "x" })).toBe(false));
  it("drops removed records", () => expect(belongsInWorkQueue({ stage: "signature", removed_at: "2026-01-01" })).toBe(false));
});
