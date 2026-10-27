import { describe, expect, it } from "vitest";
import { validateOperationsTransfer } from "./fund-request-handoff-model";
const input = { owner: "fictional-ops", dueDate: "2026-11-15", roles: ["operations"], status: "SUBMITTED", taskId: "fictional-primary-task" };
describe("Operations request transfer", () => {
  it("requires a receiving owner", () => expect(() => validateOperationsTransfer({ ...input, owner: null })).toThrow("owner"));
  it("requires a deadline", () => expect(() => validateOperationsTransfer({ ...input, dueDate: null })).toThrow("deadline"));
  it("rejects a Sales-only receiving owner", () => expect(() => validateOperationsTransfer({ ...input, roles: ["sales"] })).toThrow("Operations owner"));
  it("retains the existing primary task", () => expect(() => validateOperationsTransfer({ ...input, taskId: null })).toThrow("linked task"));
  it.each(["COMPLETED", "CANCELLED", "CANCELLATION_REVIEW"])("refuses a %s request", status => expect(() => validateOperationsTransfer({ ...input, status })).toThrow("cannot be transferred"));
  it("allows the required Operations assignment", () => expect(() => validateOperationsTransfer(input)).not.toThrow());
});