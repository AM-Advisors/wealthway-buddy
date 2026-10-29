import { describe, it, expect } from "vitest";
import { prettyStatus } from "./status";
describe("prettyStatus", () => {
  it("formats stored values for display", () => {
    expect(prettyStatus("not_started")).toBe("Not started");
    expect(prettyStatus("in_progress")).toBe("In progress");
    expect(prettyStatus(null)).toBe("Not started");
  });
});
