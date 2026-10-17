import { describe, expect, it } from "vitest";
import { migrationApplies } from "./fund-origin";
describe("fund setup origin", () => {
  it("excludes migration requirements for a new fund such as Erebor", () => { expect(migrationApplies("new")).toBe(false); });
  it("includes migration steps only for marked migrations", () => { expect(migrationApplies("migration")).toBe(true); });
  it("does not infer migration for an unclassified existing fund", () => { expect(migrationApplies(null)).toBe(false); });
});
