import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
import { readinessViewerAllowed } from "./investor-onboarding.server";
import { wireVisibleToCaller } from "./diligence.functions";

describe("investor visibility", () => {
  it("readiness is not shown to the investor, only staff and managers", () => {
    expect(readinessViewerAllowed("investor")).toBe(false);
    expect(readinessViewerAllowed("staff")).toBe(true);
    expect(readinessViewerAllowed("manager")).toBe(true);
  });
  it("wire details stay hidden from investors until they are approved to fund", () => {
    expect(wireVisibleToCaller(false, false)).toBe(false);
    expect(wireVisibleToCaller(false, true)).toBe(true);
    expect(wireVisibleToCaller(true, false)).toBe(true);
  });
});
