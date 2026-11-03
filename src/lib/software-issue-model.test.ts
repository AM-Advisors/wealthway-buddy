import { describe, expect, it } from "vitest";
import { nextSteps, sensitiveTextProblem } from "./software-issue-model";

describe("software issue stages", () => {
  it("only the retester can record a retest, and only after it is live", () => {
    expect(nextSteps("deployed", { owner: true, retester: false })).toEqual([]);
    expect(nextSteps("deployed", { owner: false, retester: true })).toEqual(["retest_passed", "retest_failed"]);
    expect(nextSteps("fixed", { owner: false, retester: true })).toEqual([]);
  });
  it("resolution requires a passed retest", () => {
    for (const s of ["reported", "in_progress", "fixed", "deployed", "retest_failed"] as const) expect(nextSteps(s, { owner: true, retester: true })).not.toContain("resolved");
    expect(nextSteps("retest_passed", { owner: true, retester: false })).toEqual(["resolved"]);
  });
  it("a failed retest goes back to the technical owner", () => {
    expect(nextSteps("retest_failed", { owner: true, retester: false })).toEqual(["in_progress"]);
  });
  it("blocks tax IDs, account numbers and passwords", () => {
    expect(sensitiveTextProblem("SSN 123-45-6789")).not.toBeNull();
    expect(sensitiveTextProblem("acct 123456789012")).not.toBeNull();
    expect(sensitiveTextProblem("password: hunter2")).not.toBeNull();
    expect(sensitiveTextProblem("Clicked Save on step 2 and nothing happened")).toBeNull();
  });
});
