import { describe, expect, it } from "vitest";
import { readOnlyAllowsKey, readOnlyAllowsTarget } from "./read-only-view";

const el = (matches: string[]) => ({ closest: (s: string) => (matches.some((m) => s.includes(m)) ? {} : null) });

describe("Client View read-only guard", () => {
  it("allows clicks on Copy Link / Preview / Copy Invitation (marked view-safe)", () => {
    expect(readOnlyAllowsTarget(el(["[data-view-safe]"]))).toBe(true);
  });
  it("blocks clicks on any other button", () => {
    expect(readOnlyAllowsTarget(el(["button"]))).toBe(false);
    expect(readOnlyAllowsTarget(null)).toBe(false);
  });
  it("blocks typing and Enter on ordinary controls", () => {
    expect(readOnlyAllowsKey("a", { ctrlOrMeta: false, target: el(["input"]) })).toBe(false);
    expect(readOnlyAllowsKey("Enter", { ctrlOrMeta: false, target: el([]) })).toBe(false);
    expect(readOnlyAllowsKey(" ", { ctrlOrMeta: false, target: el([]) })).toBe(false);
  });
  it("allows Enter on a view-safe button", () => {
    expect(readOnlyAllowsKey("Enter", { ctrlOrMeta: false, target: el(["[data-view-safe]"]) })).toBe(true);
  });
  it("allows tabbing, copying text and scrolling, but not arrows inside menus or fields", () => {
    expect(readOnlyAllowsKey("Tab", { ctrlOrMeta: false, target: el(["input"]) })).toBe(true);
    expect(readOnlyAllowsKey("c", { ctrlOrMeta: true, target: el([]) })).toBe(true);
    expect(readOnlyAllowsKey("ArrowDown", { ctrlOrMeta: false, target: el([]) })).toBe(true);
    expect(readOnlyAllowsKey("ArrowDown", { ctrlOrMeta: false, target: el(["[role=combobox]"]) })).toBe(false);
  });
});
