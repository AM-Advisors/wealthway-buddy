// Pure: who must pass the account identity check, and what the gate shows. No I/O.
export const STAFF_EXEMPT_ROLES = ["admin", "super_admin", "operations", "legal", "compliance", "fund_administration", "tax", "finance", "client_success", "executive", "sales", "account_executive", "bdr", "sales_management", "cro", "account_manager", "marketing_manager", "marketing_specialist"];
export const ACCOUNT_KYC_DECIDERS = ["admin", "super_admin", "compliance", "operations"];

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
