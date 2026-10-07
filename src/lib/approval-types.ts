/** Approval types — pure, configurable. Add a type here; nothing else needs to change. */
export type ApprovalTypeKey =
  | "CAPITAL_CALL" | "DISTRIBUTION" | "NAV" | "MANAGEMENT_FEE" | "WATERFALL" | "PAYMENT" | "INVESTOR_TRANSFER"
  | "REPORT_RELEASE" | "VALUATION" | "SERVICE_CHANGE" | "BANKING" | "ENTITY_ACTION" | "REGULATORY" | "OTHER";

export type ApprovalTypeConfig = {
  label: string;
  /** Certification the approver must tick; null = no certification. */
  certification: string | null;
  /** High-risk types always need a typed confirmation. */
  highRisk: boolean;
  /** Second distinct fund-manager approval required at/above this amount (USD); 0 = always; null = never. */
  twoPersonAt: number | null;
};

const AUTH = "I have reviewed the information presented and authorize Harmonious to proceed with this action.";
export const APPROVAL_TYPES: Record<ApprovalTypeKey, ApprovalTypeConfig> = {
  CAPITAL_CALL: { label: "Capital Call", certification: "I have reviewed the capital call amount, purpose and investor allocation summary and authorize Harmonious to issue investor notices.", highRisk: true, twoPersonAt: 1_000_000 },
  DISTRIBUTION: { label: "Distribution", certification: "I have reviewed the distribution amount and allocation summary and authorize Harmonious to prepare investor payments. I understand payments are released only through the separate controlled payment process.", highRisk: true, twoPersonAt: 250_000 },
  NAV: { label: "NAV", certification: "I have reviewed the NAV package and approve it for this period.", highRisk: false, twoPersonAt: null },
  MANAGEMENT_FEE: { label: "Management Fee", certification: "I have reviewed the management fee calculation and approve it.", highRisk: false, twoPersonAt: null },
  WATERFALL: { label: "Waterfall", certification: "I have reviewed the waterfall calculation and approve it.", highRisk: true, twoPersonAt: null },
  PAYMENT: { label: "Payment", certification: "I have reviewed this payment and authorize Harmonious to prepare it for release through the controlled payment process.", highRisk: true, twoPersonAt: 0 },
  INVESTOR_TRANSFER: { label: "Investor Transfer", certification: "I have reviewed this transfer of interest and approve it on behalf of the fund.", highRisk: true, twoPersonAt: 0 },
  REPORT_RELEASE: { label: "Report Release", certification: "I approve releasing this report to investors.", highRisk: false, twoPersonAt: null },
  VALUATION: { label: "Valuation", certification: "I have reviewed and approve this valuation.", highRisk: false, twoPersonAt: null },
  SERVICE_CHANGE: { label: "Service Change", certification: AUTH, highRisk: false, twoPersonAt: null },
  BANKING: { label: "Banking", certification: "I confirm these banking details or instructions are correct and authorize Harmonious to proceed.", highRisk: true, twoPersonAt: 0 },
  ENTITY_ACTION: { label: "Entity Action", certification: AUTH, highRisk: false, twoPersonAt: null },
  REGULATORY: { label: "Regulatory", certification: "I have reviewed this filing information and approve Harmonious preparing it. Filing remains a separate manual step.", highRisk: false, twoPersonAt: null },
  OTHER: { label: "Other", certification: null, highRisk: false, twoPersonAt: null },
};
export const APPROVAL_TYPE_KEYS = Object.keys(APPROVAL_TYPES) as ApprovalTypeKey[];
export const approvalType = (k: string) => APPROVAL_TYPES[k as ApprovalTypeKey] ?? APPROVAL_TYPES.OTHER;

export const APPROVAL_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft", INTERNAL_REVIEW: "In Review", AWAITING_APPROVAL: "Needs Your Approval", APPROVED: "Approved",
  CHANGES_REQUESTED: "Changes Requested", WITHDRAWN: "Withdrawn", EXPIRED: "Expired", COMPLETED: "Completed", SUPERSEDED: "Replaced by a newer version",
};

/** Number of distinct fund-manager approvals needed. */
export function requiredApprovers(type: string, amount: number | null | undefined): number {
  const t = approvalType(type).twoPersonAt;
  if (t == null) return 1;
  return t === 0 || (amount != null && Number(amount) >= t) ? 2 : 1;
}

/** Client filter buckets. */
export const CLIENT_APPROVAL_FILTERS = {
  needs: ["AWAITING_APPROVAL"], review: ["INTERNAL_REVIEW"], approved: ["APPROVED"], changes: ["CHANGES_REQUESTED"], completed: ["COMPLETED"],
} as const;
/** Statuses a client may ever see (drafts stay internal). */
export const CLIENT_VISIBLE_APPROVAL_STATUSES = ["INTERNAL_REVIEW", "AWAITING_APPROVAL", "APPROVED", "CHANGES_REQUESTED", "COMPLETED", "WITHDRAWN", "SUPERSEDED", "EXPIRED"];
