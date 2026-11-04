import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
import { effectiveKycStatus } from "./investor-onboarding.server";

describe("effectiveKycStatus", () => {
  it("approved login check wins over a stuck person 'review'", () => {
    expect(effectiveKycStatus("review", [{ status: "approved" }])).toBe("approved");
  });
  it("keeps person result when no login check", () => {
    expect(effectiveKycStatus("review", [])).toBe("review");
  });
  it("unstarted login check does not override", () => {
    expect(effectiveKycStatus("approved", [{ status: "pending" }])).toBe("approved");
  });
});
