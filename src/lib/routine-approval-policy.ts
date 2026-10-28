/** Explicit routine-only allowlist. Existing approve permissions must be checked first. */
export const ROUTINE_APPROVAL_ACTIONS = ["fund_economics", "fund_document_review", "fund_questionnaire_section", "side_letter", "marketing_post", "marketing_email", "marketing_collateral", "internal_service_change", "internal_entity_action"] as const;
export function routineApprovalAllowed(action: string, authorizedApprover: boolean): boolean {
  return authorizedApprover && ROUTINE_APPROVAL_ACTIONS.some((candidate) => candidate === action);
}
/** Unknown and financially consequential Approval Center categories stay protected. */
export function routineApprovalType(type: string, amount?: unknown): boolean {
  return amount == null && (type === "SERVICE_CHANGE" || type === "ENTITY_ACTION");
}