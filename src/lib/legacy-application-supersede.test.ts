import { describe, expect, it } from "vitest";
import { isOpenOnboarding, liveLegacyApplications, preferredOnboarding } from "@/lib/legacy-application-supersede";

describe("older applications vs current investment records", () => {
  it("hides an older application when the same fund has an investment record in any stage", () => {
    const apps = [{ id: "a1", offering_id: "f1" }, { id: "a2", offering_id: "f2" }];
    expect(liveLegacyApplications(apps, [{ offering_id: "f1" }]).map((a) => a.id)).toEqual(["a2"]);
  });
  it("treats closed, complete, declined and cancelled investments as not open", () => {
    for (const stage of ["closed", "complete", "declined", "cancelled"]) expect(isOpenOnboarding({ stage })).toBe(false);
    expect(isOpenOnboarding({ stage: "signature" })).toBe(true);
    expect(isOpenOnboarding({ stage: "signature", closed_at: "2026-01-01" })).toBe(false);
  });
  it("opens the open investment first, otherwise the most recent", () => {
    expect(preferredOnboarding([
      { id: "old", stage: "closed", updated_at: "2026-10-01" },
      { id: "open", stage: "awaiting_funds", updated_at: "2026-01-01" },
    ])?.id).toBe("open");
    expect(preferredOnboarding([
      { id: "a", stage: "closed", updated_at: "2026-01-01" },
      { id: "b", stage: "closed", updated_at: "2026-10-01" },
    ])?.id).toBe("b");
  });
});
