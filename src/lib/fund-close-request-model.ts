export type CloseRequestIntent = "draft" | "submit";

export type CloseRequestStatus = "draft" | "submitted" | "in_review" | "approved" | "completed" | "returned";

export function closeStatusForIntent(intent: CloseRequestIntent): Extract<CloseRequestStatus, "draft" | "submitted"> {
  return intent === "draft" ? "draft" : "submitted";
}

/** Completion remains a protected staff action after approval and recorded filing outcomes. */
export function canFinalizeCloseRequest(input: {
  isStaff: boolean;
  status: CloseRequestStatus;
  filingStatuses: string[];
}) {
  return input.isStaff
    && input.status === "approved"
    && input.filingStatuses.length > 0
    && input.filingStatuses.every((status) => status === "filed" || status === "not_required");
}
