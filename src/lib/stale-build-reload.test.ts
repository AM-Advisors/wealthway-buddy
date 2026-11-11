import { describe, expect, it } from "vitest";
import { isStaleBuildError, shouldReloadForStaleBuild } from "./stale-build-reload";

describe("stale build recovery", () => {
  it("recognizes missing page files after an update", () => {
    expect(isStaleBuildError(new TypeError("Failed to fetch dynamically imported module: https://ops.harmonious.co/assets/ops.clients.index-Bbf2O1uk.js"))).toBe(true);
    expect(isStaleBuildError(new TypeError("Importing a module script failed."))).toBe(true);
  });
  it("ignores ordinary errors", () => {
    expect(isStaleBuildError(new TypeError("e.matches is not a function"))).toBe(false);
    expect(isStaleBuildError(new Error("Not authorized"))).toBe(false);
  });
  it("reloads at most once per minute so a broken page never loops", () => {
    expect(shouldReloadForStaleBuild(null, 1_000_000)).toBe(true);
    expect(shouldReloadForStaleBuild(1_000_000, 1_030_000)).toBe(false);
    expect(shouldReloadForStaleBuild(1_000_000, 1_061_000)).toBe(true);
  });
});
