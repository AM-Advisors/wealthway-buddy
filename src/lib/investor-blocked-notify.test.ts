import { describe, it, expect } from "vitest";
import { blockedEmailKey } from "./investor-blocked-notify.server";
describe("investor blocked alert repeat suppression", () => {
  it("same investor and step within the hour share one key", () => {
    const t = Date.UTC(2026, 9, 20, 18, 5);
    expect(blockedEmailKey("o1", "Verification", t)).toBe(blockedEmailKey("o1", "Verification", t + 40 * 60_000));
  });
  it("a new hour or a different step sends again", () => {
    const t = Date.UTC(2026, 9, 20, 18, 5);
    expect(blockedEmailKey("o1", "Verification", t)).not.toBe(blockedEmailKey("o1", "Verification", t + 61 * 60_000));
    expect(blockedEmailKey("o1", "Verification", t)).not.toBe(blockedEmailKey("o1", "Signing", t));
  });
});
