import { afterEach, expect, it, vi } from "vitest";
import { pendingApproval } from "./pending-approval";
afterEach(() => vi.useRealTimers());
it("undo prevents submission of a confirmed approval", () => {
  vi.useFakeTimers();
  const submit = vi.fn();
  const undo = pendingApproval(submit);
  expect(undo()).toBe(true);
  vi.advanceTimersByTime(10000);
  expect(submit).not.toHaveBeenCalled();
});
it("submits once after the undo window, never reversing completed history", () => {
  vi.useFakeTimers();
  const submit = vi.fn();
  const undo = pendingApproval(submit);
  vi.advanceTimersByTime(4999);
  expect(submit).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(submit).toHaveBeenCalledTimes(1);
  expect(undo()).toBe(false);
  vi.advanceTimersByTime(10000);
  expect(submit).toHaveBeenCalledTimes(1);
});