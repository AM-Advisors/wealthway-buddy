import { describe, expect, it } from "vitest";
import { lineDetailsPending } from "./sales-quotes.server";
describe("lineDetailsPending", () => {
  it("flags a foundation line quoted without details", () => {
    expect(lineDetailsPending({ service_key: "FOUNDATION_ADMIN:onboarding_setup", foundation_snapshot: null })).toBe(true);
  });
  it("does not flag a foundation line with details", () => {
    expect(lineDetailsPending({ service_key: "FOUNDATION_ADMIN:onboarding_setup", foundation_snapshot: { input: {} } })).toBe(false);
  });
  it("flags bookkeeping quoted without its configuration", () => {
    expect(lineDetailsPending({ service_key: "BOOKKEEPING_ACCOUNTING", bookkeeping_snapshot: null })).toBe(true);
  });
});
