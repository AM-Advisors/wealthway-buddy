import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Fund Setup must never move the page on its own: clicking a step, Next/Back or a
 * setup status card opens the right section but leaves the reader where they are.
 */
const source = () => readFileSync("src/components/fund-setup-canonical.tsx", "utf8");

describe("Fund Setup does not scroll the page", () => {
  it("has no programmatic scroll calls", () => {
    const src = source();
    expect(src).not.toContain("scrollIntoView");
    expect(src).not.toMatch(/window\.scrollTo\(/);
    expect(src).not.toMatch(/document\.documentElement\.scrollTop\s*=/);
  });

  it("still opens the step that holds a section's work", () => {
    const src = source();
    expect(src).toContain('new CustomEvent("fund-setup-jump"');
    expect(src).toContain("ANCHOR_STEP");
  });
});
