import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
import { allowedActions } from "./professional-tax.server";

describe("professional tax actions", () => {
  it("preparers prepare and submit, never approve", () => {
    expect(allowedActions("1065", "draft", { prepare: true, review: false })).toEqual(["mark_prepared"]);
    expect(allowedActions("1065", "prepared", { prepare: true, review: false })).toEqual(["submit"]);
    expect(allowedActions("1065", "review", { prepare: true, review: false })).toEqual([]);
  });
  it("reviewers approve or return", () => {
    expect(allowedActions("1099", "review", { prepare: false, review: true })).toEqual(["approve", "return"]);
  });
  it("filing states are unreachable", () => {
    for (const k of ["1065", "1042", "1099"] as const)
      expect(allowedActions(k, "approved", { prepare: true, review: true })).toEqual([]);
  });
});
