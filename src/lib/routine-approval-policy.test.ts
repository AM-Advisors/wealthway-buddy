import { expect, it } from "vitest";
import { routineApprovalAllowed, routineApprovalType, ROUTINE_APPROVAL_ACTIONS } from "./routine-approval-policy";
it.each(ROUTINE_APPROVAL_ACTIONS)("permits one existing authorized approver for %s", (action) => {
  expect(routineApprovalAllowed(action, true)).toBe(true);
  expect(routineApprovalAllowed(action, false)).toBe(false);
});
it.each(["payment", "banking", "tax_filing", "accreditation", "identity", "access_grant", "unknown"])("does not waive protected or unclassified action %s", (action) => {
  expect(routineApprovalAllowed(action, true)).toBe(false);
});
it("only simplifies known nonfinancial Approval Center categories", () => {
  expect(routineApprovalType("SERVICE_CHANGE")).toBe(true);
  expect(routineApprovalType("ENTITY_ACTION")).toBe(true);
  for (const type of ["PAYMENT", "BANKING", "NAV", "REPORT_RELEASE", "REGULATORY", "INVESTOR_TRANSFER", "OTHER"]) expect(routineApprovalType(type)).toBe(false);
});