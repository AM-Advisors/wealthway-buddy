import { describe, it, expect } from "vitest";
import { splitTabs } from "./tabs";

const v = Array.from({ length: 17 }, (_, i) => `t${i}`);
describe("splitTabs", () => {
  it("never shows more than 5 entries (4 tabs + More)", () => {
    expect(splitTabs(v, "t0").visible).toHaveLength(4);
  });
  it("keeps 5 or fewer tabs as they are", () => {
    expect(splitTabs(v.slice(0, 5), "t0").more).toEqual([]);
  });
  it("keeps the open tab visible", () => {
    expect(splitTabs(v, "t12").visible).toContain("t12");
  });
});
