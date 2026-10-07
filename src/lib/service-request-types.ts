/** Service Request Center config — pure. Types, dynamic fields, entitlement keys, team routing, client timelines. */
import type { ResponsibilityStatus } from "@/lib/responsibility";

export type FieldDef = { key: string; label: string; kind: "text" | "textarea" | "money" | "date" | "select" | "email"; required?: boolean; options?: string[] };
export type RequestTypeDef = {
  label: string; team: string; features: string[]; fields: FieldDef[]; stages: string[];
  /** Once work starts, cancelling needs Harmonious review (money moved, notices sent, filings made). */
  irreversible: boolean;
  approvalType?: string;
};

const notes: FieldDef = { key: "notes", label: "Notes", kind: "textarea" };
const BASIC = ["Submitted", "Harmonious Review", "In Progress", "Complete"];

export const REQUEST_TYPES: Record<string, RequestTypeDef> = {
  CAPITAL_CALL: { label: "Request a Capital Call", team: "capital_operations", features: ["CAPITAL_CALL_ADMIN", "PROACTIVE_CAPITAL_CALLS"], irreversible: true, approvalType: "CAPITAL_CALL",
    fields: [{ key: "amount", label: "Requested amount", kind: "money", required: true }, { key: "purpose", label: "Purpose", kind: "text", required: true }, { key: "deadline", label: "Desired funding deadline", kind: "date", required: true }, { key: "use", label: "Investment / use of proceeds", kind: "textarea" }, notes],
    stages: ["Submitted", "Harmonious Review", "Calculation", "Your Approval", "Investor Notices", "Funding", "Reconciliation", "Complete"] },
  DISTRIBUTION: { label: "Request a Distribution", team: "capital_operations", features: ["DISTRIBUTION_ADMIN", "PROACTIVE_DISTRIBUTIONS"], irreversible: true, approvalType: "DISTRIBUTION",
    fields: [{ key: "amount", label: "Requested gross amount", kind: "money", required: true }, { key: "type", label: "Distribution type", kind: "select", options: ["Cash", "Cash & shares", "Shares", "Return of capital", "Not sure"], required: true }, { key: "pay_date", label: "Desired payment date", kind: "date" }, notes],
    stages: ["Submitted", "Harmonious Review", "Calculation", "Your Approval", "Payment Preparation", "Investor Notices", "Complete"] },
  NEW_INVESTMENT: { label: "Add an Investment", team: "fund_accounting", features: ["INVESTMENT_ACCOUNTING"], irreversible: false,
    fields: [{ key: "issuer", label: "Issuer / asset", kind: "text", required: true }, { key: "amount", label: "Investment amount", kind: "money", required: true }, { key: "date", label: "Investment date", kind: "date" }, { key: "security", label: "Security type", kind: "text" }, notes], stages: BASIC },
  NEW_INVESTOR: { label: "Add an Investor", team: "investor_operations", features: ["INVESTOR_RECORDS", "SUBSCRIPTION_TRACKING"], irreversible: false,
    fields: [{ key: "name", label: "Investor name", kind: "text", required: true }, { key: "email", label: "Investor email", kind: "email", required: true }, { key: "entity_type", label: "Investor / entity type", kind: "select", options: ["Individual", "Joint", "Trust", "Entity", "IRA", "Not sure"] }, { key: "commitment", label: "Commitment if known", kind: "money" }, { key: "close", label: "Close", kind: "text" }, notes],
    stages: ["Submitted", "Harmonious Review", "Investor Onboarding", "Complete"] },
  NEW_CLOSE: { label: "Request a New Close", team: "investor_operations", features: ["SUBSCRIPTION_TRACKING"], irreversible: true, fields: [{ key: "date", label: "Target close date", kind: "date", required: true }, notes], stages: ["Submitted", "Harmonious Review", "Close Preparation", "Your Approval", "Complete"] },
  INVESTOR_TRANSFER: { label: "Transfer an Investor Interest", team: "investor_operations", features: ["INVESTOR_RECORDS"], irreversible: true, approvalType: "INVESTOR_TRANSFER",
    fields: [{ key: "from", label: "Current investor", kind: "text", required: true }, { key: "to", label: "Receiving investor", kind: "text", required: true }, { key: "interest", label: "Interest / amount", kind: "text", required: true }, { key: "effective", label: "Requested effective date", kind: "date" }],
    stages: ["Submitted", "Harmonious Review", "Documentation", "Your Approval", "Recorded", "Complete"] },
  FUND_EXPENSE: { label: "Request a Fund Expense Payment", team: "treasury", features: ["TREASURY_COORDINATION", "BASIC_GL"], irreversible: true, approvalType: "PAYMENT",
    fields: [{ key: "payee", label: "Payee", kind: "text", required: true }, { key: "amount", label: "Amount", kind: "money", required: true }, { key: "due", label: "Due date", kind: "date" }, notes], stages: ["Submitted", "Harmonious Review", "Your Approval", "Payment Preparation", "Complete"] },
  BANKING: { label: "Banking Request", team: "treasury", features: ["TREASURY_COORDINATION"], irreversible: true,
    fields: [{ key: "kind", label: "Request type", kind: "select", options: ["New account", "Update instructions", "Statement / letter", "Signer change", "Other"], required: true }, { key: "account", label: "Account", kind: "text" }, { key: "amount", label: "Amount if applicable", kind: "money" }, { key: "description", label: "Description", kind: "textarea", required: true }], stages: BASIC },
  NAV: { label: "Request NAV / Valuation", team: "fund_accounting", features: ["QUARTERLY_NAV", "MONTHLY_NAV"], irreversible: false,
    fields: [{ key: "period", label: "Period", kind: "text", required: true }, { key: "as_of", label: "As-of date", kind: "date" }, { key: "reason", label: "Reason / special request", kind: "textarea" }], stages: ["Submitted", "Harmonious Review", "Preparation", "Your Approval", "Complete"] },
  VALUATION: { label: "Portfolio Valuation", team: "fund_accounting", features: ["INVESTMENT_ACCOUNTING"], irreversible: false, fields: [{ key: "asset", label: "Asset", kind: "text", required: true }, { key: "as_of", label: "As-of date", kind: "date" }, notes], stages: BASIC },
  REPORT: { label: "Request a Report", team: "reporting", features: ["FUND_REPORTING", "CUSTOM_REPORTING"], irreversible: false,
    fields: [{ key: "report", label: "Report type", kind: "text", required: true }, { key: "period", label: "Period", kind: "text" }, { key: "date", label: "Desired date", kind: "date" }, notes], stages: ["Submitted", "Harmonious Review", "Preparation", "Your Review", "Complete"] },
  TAX: { label: "Tax Request", team: "tax", features: ["TAX_COORDINATION", "TAX_DOCUMENT_DELIVERY"], irreversible: false,
    fields: [{ key: "year", label: "Tax year", kind: "text", required: true }, { key: "kind", label: "Request type", kind: "text", required: true }, { key: "jurisdiction", label: "Jurisdiction if applicable", kind: "text" }, { key: "description", label: "Description", kind: "textarea" }], stages: BASIC },
  REGULATORY: { label: "Regulatory Filing", team: "compliance", features: ["REGULATORY_CALENDAR"], irreversible: true,
    fields: [{ key: "filing", label: "Filing type", kind: "text", required: true }, { key: "jurisdiction", label: "Jurisdiction", kind: "text" }, { key: "due", label: "Due date", kind: "date" }, { key: "description", label: "Description", kind: "textarea" }], stages: ["Submitted", "Harmonious Review", "Preparation", "Your Approval", "Filed manually", "Complete"] },
  ENTITY: { label: "Entity Request", team: "entity_operations", features: ["ENTITY_COMPLIANCE_CALENDAR"], irreversible: false,
    fields: [{ key: "entity", label: "Entity", kind: "text", required: true }, { key: "kind", label: "Request type", kind: "text", required: true }, { key: "jurisdiction", label: "Jurisdiction", kind: "text" }, { key: "description", label: "Description", kind: "textarea" }], stages: BASIC },
  DOCUMENT: { label: "Document Request", team: "operations", features: ["DOCUMENT_STORAGE"], irreversible: false, fields: [{ key: "document", label: "Document needed", kind: "text", required: true }, notes], stages: BASIC },
  INVESTOR_COMMUNICATION: { label: "Investor Communication", team: "investor_operations", features: ["INVESTOR_INQUIRY_MANAGEMENT"], irreversible: true, fields: [{ key: "subject", label: "Subject", kind: "text", required: true }, { key: "audience", label: "Audience", kind: "text" }, { key: "message", label: "What should we communicate?", kind: "textarea", required: true }], stages: ["Submitted", "Harmonious Review", "Draft", "Your Approval", "Sent", "Complete"] },
  SERVICE_CHANGE: { label: "Change My Service", team: "account_management", features: [], irreversible: false, fields: [{ key: "change", label: "What would you like to change?", kind: "textarea", required: true }], stages: ["Submitted", "Harmonious Review", "Proposal", "Complete"] },
  OTHER: { label: "Other", team: "operations", features: [], irreversible: false, fields: [{ key: "subject", label: "Subject", kind: "text", required: true }, { key: "description", label: "Description", kind: "textarea", required: true }], stages: BASIC },
};
export const REQUEST_TYPE_KEYS = Object.keys(REQUEST_TYPES);
export const requestType = (k: string) => REQUEST_TYPES[k] ?? REQUEST_TYPES["OTHER"]!;

/** Configurable team routing → existing staff_tasks team keys. */
export const TEAM_ROUTING: Record<string, { label: string; taskTeam: string }> = {
  capital_operations: { label: "Fund Administration / Capital Operations", taskTeam: "operations" },
  fund_accounting: { label: "Fund Accounting", taskTeam: "finance" },
  investor_operations: { label: "Investor Operations", taskTeam: "operations" },
  treasury: { label: "Treasury / Banking", taskTeam: "finance" },
  tax: { label: "Tax Team", taskTeam: "finance" },
  compliance: { label: "Compliance / Regulatory", taskTeam: "compliance" },
  entity_operations: { label: "Entity Operations", taskTeam: "operations" },
  reporting: { label: "Reporting", taskTeam: "operations" },
  account_management: { label: "Account Management", taskTeam: "sales" },
  operations: { label: "Operations", taskTeam: "operations" },
};

export const REQUEST_STATUSES = ["DRAFT", "SUBMITTED", "IN_REVIEW", "IN_PROGRESS", "WAITING_ON_CLIENT", "WAITING_ON_INVESTOR", "WAITING_ON_THIRD_PARTY", "READY_FOR_APPROVAL", "COMPLETED", "CANCELLED", "CANCELLATION_REVIEW"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  DRAFT: "Draft", SUBMITTED: "Submitted", IN_REVIEW: "Harmonious Review", IN_PROGRESS: "In Progress", WAITING_ON_CLIENT: "Information Required",
  WAITING_ON_INVESTOR: "Waiting on Investor", WAITING_ON_THIRD_PARTY: "Waiting on Third Party", READY_FOR_APPROVAL: "Your Approval Required",
  COMPLETED: "Completed", CANCELLED: "Cancelled", CANCELLATION_REVIEW: "Cancellation under review",
};

export function requestResponsibility(s: string): ResponsibilityStatus {
  switch (s) {
    case "WAITING_ON_CLIENT": return "CLIENT_INFORMATION_REQUIRED";
    case "READY_FOR_APPROVAL": return "CLIENT_APPROVAL_REQUIRED";
    case "WAITING_ON_INVESTOR": return "WAITING_ON_INVESTOR";
    case "WAITING_ON_THIRD_PARTY": return "WAITING_ON_THIRD_PARTY";
    case "COMPLETED": case "CANCELLED": return "COMPLETED";
    default: return "HARMONIOUS_HANDLING";
  }
}
/** SLA clock pauses while someone other than Harmonious is blocking. */
export const SLA_PAUSED = new Set(["WAITING_ON_CLIENT", "WAITING_ON_INVESTOR", "WAITING_ON_THIRD_PARTY", "READY_FOR_APPROVAL"]);

/** Response SLA (hours) by service level; Institutional reads the contract's response_sla when it states hours. */
export function slaHours(level: string | null | undefined, contractSla?: string | null): number {
  const m = contractSla?.match(/(\d+)\s*(h|hour|business hour)/i);
  if (m) return Number(m[1]);
  return ({ CORE: 72, FUND_ADMINISTRATION: 48, WHITE_GLOVE: 24, INSTITUTIONAL: 24 } as Record<string, number>)[level ?? ""] ?? 72;
}

/** Entitlement status from the fund's entitled feature keys. Never blocks a request. */
export function entitlementFor(type: string, entitled: Set<string>): "INCLUDED" | "REVIEW_REQUIRED" {
  const f = requestType(type).features;
  if (!f.length) return type === "SERVICE_CHANGE" || type === "OTHER" ? "INCLUDED" : "REVIEW_REQUIRED";
  return f.some((k) => entitled.has(k)) ? "INCLUDED" : "REVIEW_REQUIRED";
}

/** Required-field check against the dynamic form definition. Returns missing labels. */
export function missingFields(type: string, details: Record<string, unknown>): string[] {
  return requestType(type).fields.filter((f) => f.required && !String(details[f.key] ?? "").trim()).map((f) => f.label);
}

export const isOpenRequest = (s: string) => !["COMPLETED", "CANCELLED"].includes(s);
