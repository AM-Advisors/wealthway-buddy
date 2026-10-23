// Pure: who must pass the account identity check, and what the gate shows. No I/O.
export const STAFF_EXEMPT_ROLES = ["admin", "super_admin", "operations", "legal", "compliance", "fund_administration", "tax", "finance", "client_success", "executive", "sales", "account_executive", "bdr", "sales_management", "cro", "account_manager", "marketing_manager", "marketing_specialist", "leadership"];
export const ACCOUNT_KYC_DECIDERS = ["admin", "super_admin", "compliance", "operations", "account_manager"];

export type AccountCheckStatus = "not_started" | "pending" | "review" | "approved" | "declined" | "expired" | "sent_back";
export type GateState = "exempt" | "approved" | "start" | "in_progress" | "review" | "retry";

export function resolveGate(input: { roles: string[]; grandfathered: boolean; latest: AccountCheckStatus | null }): GateState {
  if (input.roles.some((r) => STAFF_EXEMPT_ROLES.includes(r))) return "exempt";
  if (input.latest === "approved" || input.grandfathered) return "approved";
  switch (input.latest) {
    case null: case "not_started": return "start";
    case "pending": return "in_progress";
    case "review": return "review";
    default: return "retry"; // declined, expired, sent_back
  }
}

export const gateOpen = (s: GateState) => s === "exempt" || s === "approved";

/** Only verification-session events carry a result; profile notices ("ACTIVE") never do. */
export function isAccountDecisionEvent(webhookType: string, sessionId: string | null): boolean {
  return !!sessionId && (webhookType === "status.updated" || webhookType === "data.updated");
}

/** A payload may change a check only if it is the result for that check's own session. */
export function isSessionDecisionFor(check: { session_id?: string | null }, decision: Record<string, any> | null | undefined): boolean {
  const sid = decision?.["session_id"] ?? decision?.["decision"]?.["session_id"];
  return !!sid && !!check.session_id && String(sid) === String(check.session_id);
}

/** Provider "Expired"/"Abandoned" lets the person start a fresh check instead of waiting on review. */
export function accountStatusFromProvider(raw: string | null | undefined, mapped: "approved" | "declined" | "review" | "pending" | "not_started" | string): AccountCheckStatus {
  const r = String(raw ?? "").trim().toLowerCase();
  if (r === "expired" || r === "abandoned") return "expired";
  return mapped === "approved" ? "approved" : mapped === "declined" ? "declined" : mapped === "review" ? "review" : "pending";
}
