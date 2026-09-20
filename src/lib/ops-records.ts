/**
 * Records-first Harmonious Operations: the shape of Client 360, Fund/SPV 360,
 * Investor 360 and Company 360.
 *
 * Nothing here holds state. These are the rules for which tabs a staff member
 * may open, which actions their capabilities allow, what a record page is
 * allowed to show from an audit event, and where each summary value comes
 * from. The server re-checks every one of these rules on every request; a
 * visible tab is never permission.
 */

import { can, type OpsAction, type OpsArea, type OpsCapability } from "@/lib/ops-capabilities";

export const OPS_RECORD_TYPES = ["client", "fund", "investor", "company"] as const;
export type OpsRecordType = (typeof OPS_RECORD_TYPES)[number];

export type OpsRecordTab = {
  id: string;
  title: string;
  /** The capability area the backend checks before serving this tab. */
  area: OpsArea;
};

/** The area that owns the record itself (its header and existence check). */
export const RECORD_AREA: Record<OpsRecordType, OpsArea> = {
  client: "clients",
  fund: "funds",
  investor: "investors",
  company: "companies",
};

export const RECORD_TABS: Record<OpsRecordType, OpsRecordTab[]> = {
  client: [
    { id: "overview", title: "Overview", area: "clients" },
    { id: "relationships", title: "Relationships", area: "clients" },
    { id: "funds", title: "Funds", area: "funds" },
    { id: "companies", title: "Companies", area: "companies" },
    { id: "investors", title: "Investors", area: "investors" },
    { id: "documents", title: "Documents", area: "documents" },
    { id: "tasks", title: "Tasks", area: "tasks" },
    { id: "activity", title: "Activity", area: "clients" },
  ],
  fund: [
    { id: "overview", title: "Overview", area: "funds" },
    { id: "investors", title: "Investors", area: "investors" },
    { id: "investments", title: "Investments", area: "funds" },
    { id: "capital", title: "Capital", area: "capital" },
    { id: "banking", title: "Banking", area: "capital" },
    { id: "accounting", title: "Accounting", area: "accounting" },
    { id: "tax", title: "Tax", area: "tax" },
    { id: "regulatory", title: "Regulatory", area: "regulatory" },
    { id: "documents", title: "Documents", area: "documents" },
    { id: "activity", title: "Activity", area: "funds" },
  ],
  investor: [
    { id: "overview", title: "Overview", area: "investors" },
    { id: "profiles", title: "Profiles", area: "investors" },
    { id: "investments", title: "Investments", area: "investors" },
    { id: "capital", title: "Capital", area: "capital" },
    { id: "tax", title: "Tax", area: "tax" },
    { id: "documents", title: "Documents", area: "documents" },
    { id: "identity", title: "Identity checks", area: "onboarding" },
    { id: "activity", title: "Activity", area: "investors" },
  ],
  company: [
    { id: "overview", title: "Overview", area: "companies" },
    { id: "cap-table", title: "Cap table", area: "companies" },
    { id: "stakeholders", title: "Stakeholders", area: "companies" },
    { id: "transactions", title: "Transactions", area: "companies" },
    { id: "documents", title: "Documents", area: "documents" },
    { id: "reports", title: "Reports", area: "reports" },
    { id: "activity", title: "Activity", area: "companies" },
  ],
};

/** Whether the record itself may be opened at all. */
export function canOpenRecord(
  type: OpsRecordType,
  capabilities: readonly OpsCapability[],
): boolean {
  return can(capabilities, RECORD_AREA[type], "see");
}

/** Only the tabs whose area this staff member may see, and only if the record may be opened. */
export function recordTabs(
  type: OpsRecordType,
  capabilities: readonly OpsCapability[],
): OpsRecordTab[] {
  if (!canOpenRecord(type, capabilities)) return [];
  return RECORD_TABS[type].filter((tab) => can(capabilities, tab.area, "see"));
}

export function tabDefinition(type: OpsRecordType, tabId: string): OpsRecordTab | null {
  return RECORD_TABS[type].find((tab) => tab.id === tabId) ?? null;
}

/** Whether this tab may be opened. An unknown tab is never allowed. */
export function canOpenTab(
  type: OpsRecordType,
  tabId: string,
  capabilities: readonly OpsCapability[],
): boolean {
  const tab = tabDefinition(type, tabId);
  return tab ? can(capabilities, tab.area, "see") : false;
}

/** The first tab this person may open, used when a link names one they may not. */
export function defaultTab(type: OpsRecordType, capabilities: readonly OpsCapability[]): string | null {
  return recordTabs(type, capabilities)[0]?.id ?? null;
}

export type ActionPermissions = Record<OpsAction, boolean>;

/** What the buttons on a tab may offer. The backend still decides. */
export function allowedActions(
  area: OpsArea,
  capabilities: readonly OpsCapability[],
): ActionPermissions {
  return {
    see: can(capabilities, area, "see"),
    prepare: can(capabilities, area, "prepare"),
    review: can(capabilities, area, "review"),
    approve: can(capabilities, area, "approve"),
    execute: can(capabilities, area, "execute"),
  };
}

/**
 * Bank detail is not handed over just because someone may open the fund.
 * Seeing the fund shows the institution and the state of the account; the
 * account itself needs the reviewing capability over capital.
 */
export function bankingDetailVisible(capabilities: readonly OpsCapability[]): boolean {
  return can(capabilities, "capital", "review");
}

export function maskAccount(value?: string | null): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return `••••${digits.slice(-4)}`;
}

/**
 * Anything a record page must never repeat out of an audit event or a record,
 * however it was named where it was stored.
 */
const RESTRICTED_KEY_PATTERN =
  /(password|secret|token|api[_-]?key|ssn|tax_id|tin|routing|account_number|iban|payload|raw_|document_body|file_contents|kyc_data|provider_response)/i;

export function isRestrictedField(key: string): boolean {
  return RESTRICTED_KEY_PATTERN.test(key);
}

export type ActivityEntry = {
  at: string;
  actor: string;
  capacity: string;
  action: string;
  resource: string;
  detail?: string | null;
};

/** Strip anything restricted out of a free-form detail object. */
export function redactDetail(detail: unknown): Record<string, unknown> {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail as Record<string, unknown>)) {
    if (isRestrictedField(key)) continue;
    if (value && typeof value === "object") continue; // nested blobs stay out of Operations pages
    out[key] = value;
  }
  return out;
}

export function redactActivity(
  entry: Omit<ActivityEntry, "detail"> & { detail?: unknown },
): ActivityEntry {
  const detail = redactDetail(entry.detail);
  const keys = Object.keys(detail);
  return {
    at: entry.at,
    actor: entry.actor,
    capacity: entry.capacity,
    action: entry.action,
    resource: entry.resource,
    detail: keys.length ? keys.map((k) => `${k}: ${String(detail[k])}`).join(", ") : null,
  };
}

/**
 * Where every summary value on a record page comes from. A record page reads
 * these and only these — it never keeps a second copy of a status or balance.
 */
export const SUMMARY_SOURCES: Record<string, string> = {
  "client.status": "clients.status",
  "client.entityType": "client_entities.entity_type",
  "fund.status": "fund_setups.stage",
  "fund.launchState": "fund_setups.launch_state",
  "fund.commitmentCents": "investor_onboardings.accepted_amount_cents",
  "fund.fundedCents": "investor_onboardings.funded_amount_cents",
  "fund.investorCount": "investor_positions",
  "fund.navCents": "nav_versions.net_asset_value_cents",
  "fund.closeStatus": "accounting_periods.status",
  "fund.reportingStatus": "financial_reports.status",
  "investor.onboardingStage": "investor_onboardings.stage",
  "investor.kycStatus": "kyc_verifications.status",
  "investor.amlStatus": "aml_screenings.status",
  "investor.accreditationStatus": "accreditation_records.status",
  "company.authorizedShares": "ct_companies.authorized_shares",
  "company.outstanding": "ct_securities.quantity",
  "company.stakeholderCount": "ct_stakeholders",
};

/** Names a record page must never introduce: they would be a second truth. */
const FORBIDDEN_SUMMARY_SOURCES = /^(ops_|admin_|fund_360|record_)/;

export function summarySourcesAreAuthoritative(): boolean {
  return Object.values(SUMMARY_SOURCES).every((source) => !FORBIDDEN_SUMMARY_SOURCES.test(source));
}

/** Where a link from one record to another goes. Authorization is re-checked there. */
export function recordPath(type: OpsRecordType, id: string, tab?: string): string {
  const base = {
    client: "/ops/clients",
    fund: "/ops/fund",
    investor: "/ops/investors",
    company: "/ops/companies",
  }[type];
  const path = `${base}/${encodeURIComponent(id)}`;
  return tab ? `${path}?tab=${encodeURIComponent(tab)}` : path;
}
