/** Pure rules for a fund's open/closed status. Browser-safe; the server and DB re-check everything. */
export type FundLifecycle = "open" | "closed";
export const CLOSED_FUND_MESSAGE = "This fund is closed to new investments.";

/** New investments need the fund launched for onboarding (is_open) AND not closed. */
export function fundAcceptsInvestments(o: { is_open?: boolean | null; lifecycle_status?: string | null } | null | undefined): boolean {
  return !!o && o.is_open !== false && o.lifecycle_status !== "closed";
}

/** Closed funds show prospective investors no pre-commitment documents. */
export function prospectDocumentsVisible(o: { lifecycle_status?: string | null } | null | undefined): boolean {
  return o?.lifecycle_status !== "closed";
}

/** Who may close a fund or request a reopen: an assigned manager or Operations staff. */
export function canRequestStatusChange(v: { isManager: boolean; isStaff: boolean }): boolean {
  return v.isManager || v.isStaff;
}

/**
 * Who may approve a reopen: an assigned fund manager who did not make the request.
 * A Super Admin may approve their own request only with a recorded reason (selfApproved).
 */
export function reopenApprovalError(v: { isManager: boolean; isSuperAdmin: boolean; isRequester: boolean; selfApproved: boolean }): string | null {
  if (!v.isManager && !v.isSuperAdmin) return "Only a fund manager of this fund can approve reopening it.";
  if (v.isRequester && !(v.isSuperAdmin && v.selfApproved)) return "A different fund manager must approve your reopen request.";
  return null;
}
