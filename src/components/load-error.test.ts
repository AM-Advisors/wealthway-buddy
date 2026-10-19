import { describe, it, expect } from "vitest";
import { isAccessDenied } from "./load-error";
describe("isAccessDenied", () => {
  it("treats refusals as access errors", () => { expect(isAccessDenied(new Error("Unauthorized"))).toBe(true); expect(isAccessDenied({ status: 403 })).toBe(true); });
  it("does not blame access for other failures", () => { expect(isAccessDenied(new Error("Your profile documents could not be loaded."))).toBe(false); expect(isAccessDenied(new Error("Network timeout"))).toBe(false); });
});
