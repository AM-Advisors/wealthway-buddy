import { describe, expect, it } from "vitest";
import { completionMessage, newlyCompleted } from "./completion-confirmations";

describe("completion confirmations", () => {
  it("announces an item that moved from open to done", () => {
    const prev = new Map([["sign", false], ["about", true]]);
    expect(newlyCompleted(prev, [{ key: "sign", label: "Sign", done: true }, { key: "about", label: "About", done: true }]).map((i) => i.key)).toEqual(["sign"]);
  });
  it("never announces already-finished work on first load", () => {
    expect(newlyCompleted(null, [{ key: "sign", label: "Sign", done: true }])).toEqual([]);
  });
  it("says when nothing is left", () => {
    expect(completionMessage("Sign", 0)).toContain("Nothing else is needed");
    expect(completionMessage("Sign", 2)).toContain("2 items left");
  });
});
