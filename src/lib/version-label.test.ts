import { describe, it, expect } from "vitest";
import { versionLabel } from "./version-label";
describe("versionLabel", () => {
  it("first version reads 1.0", () => expect(versionLabel(1)).toBe("1.0"));
  it("second version reads 1.1", () => expect(versionLabel(2)).toBe("1.1"));
  it("eighth version reads 1.7", () => expect(versionLabel(8)).toBe("1.7"));
});
