/**
 * Unified access read model (Stage 1).
 *
 * This module does NOT authorize anything. It projects the authorization facts
 * that already exist — platform roles (user_roles → ops-capabilities), staff
 * capability roles/grants (contract-coverage), fund-scoped fund_managers,
 * investor_fund_access, investment_profiles, client_users, professional
 * memberships and delegations — into one explainable view. Every enforcement
 * path keeps using its own server-side check.
 */
import { capabilitiesFor, hasOperationsEntry, OPS_AREAS, type OpsArea } from "@/lib/ops-capabilities";
import {
  NEVER_GRANTABLE,
  PREDEFINED_STAFF_ROLES,
  STAFF_CAPABILITY_GROUPS,
  staffCapabilitiesFor,
} from "@/lib/contract-coverage";

export const ACCESS_AREAS: { id: OpsArea; label: string }[] = [
  { id: "clients", label: "Clients" },
  { id: "funds", label: "Funds & SPVs" },
  { id: "companies", label: "Companies" },
  { id: "investors", label: "Investors" },
  { id: "onboarding", label: "Onboarding & Compliance" },
  { id: "capital", label: "Capital & Banking" },
  { id: "accounting", label: "Accounting" },
  { id: "tax", label: "Tax" },
  { id: "regulatory", label: "Regulatory" },
  { id: "documents", label: "Documents" },
  { id: "tasks", label: "Tasks" },
  { id: "reports", label: "Reports" },
  { id: "administration", label: "Administration" },
];

/** Canonical permission vocabulary shown in the matrix. */
export const ACCESS_ACTIONS = [
  { id: "view", label: "View" },
  { id: "edit", label: "Create/Edit" },
  { id: "prepare", label: "Prepare" },
  { id: "review", label: "Review" },
  { id: "approve", label: "Approve" },
  { id: "execute", label: "Execute" },
  { id: "manage_access", label: "Manage Access" },
  { id: "export", label: "Export" },
] as const;
export type AccessAction = (typeof ACCESS_ACTIONS)[number]["id"];

export type ScopeType = "global" | "client" | "fund" | "company" | "investment_profile" | "investment";
export type Scope = { type: ScopeType; id: string | null; label: string };
export type SourceKind = "role" | "relationship" | "direct_grant" | "deny" | "delegated";

export type Permission = {
  area: OpsArea;
  action: AccessAction;
  scope: Scope;
  source: SourceKind;
  /** Plain explanation: which record produced this permission. */
  via: string;
};

export type Facts = {
  userId: string;
  roles: string[];
  staffGrants: { capability: string | null; role_key: string | null; revoked_at: string | null }[];
  customRoles: Record<string, string[]>;
  managedFunds: { id: string; name: string }[];
  investorFunds: { id: string; name: string }[];
  investmentProfiles: { id: string; label: string; status: string | null }[];
  clientMemberships: { id: string; name: string; role: string | null; canApprove: boolean }[];
  companies: { id: string; name: string }[];
  professionalMemberships: { orgId: string; orgName: string; status: string; seatRole: string | null }[];
  delegations: {
    id: string;
    direction: "acting_for" | "granted_to";
    counterpart: string;
    scope_type: string;
    scope_id: string | null;
    authority_level: string;
    status: string;
    acceptance_state: string | null;
    expires_at: string | null;
    revoked_at: string | null;
    capabilities: string[];
  }[];
};

const GLOBAL: Scope = { type: "global", id: null, label: "All resources" };

/** ops "see/prepare/…" → canonical vocabulary. prepare also implies create/edit. */
const OPS_ACTION_MAP: Record<string, AccessAction[]> = {
  see: ["view"],
  prepare: ["prepare", "edit"],
  review: ["review"],
  approve: ["approve"],
  execute: ["execute"],
};

/** Granular staff capability groups → the matrix area they sit under. */
export const STAFF_GROUP_AREA: Record<string, OpsArea> = {
  Clients: "clients",
  People: "clients",
  Funds: "funds",
  Companies: "companies",
  Services: "clients",
  Pricing: "clients",
  Contracts: "documents",
  SOWs: "documents",
  Approvals: "documents",
  "Banking/Capital": "capital",
  Administration: "administration",
};

export function staffGroupArea(group: string): OpsArea {
  return STAFF_GROUP_AREA[group] ?? "administration";
}

const MANAGE_ACCESS_CAPS = ["manage_staff", "manage_roles", "manage_permissions"];

/**
 * Things a Super Administrator does NOT bypass. Displayed on the profile and
 * enforced by their own dedicated mechanisms, not by this module.
 */
export const SUPER_ADMIN_LIMITS = [
  "Immutable audit records",
  "Executed-document immutability",
  "Posted-ledger correction rules (reversals only)",
  "Maker/checker — no self-approval",
  "Dual-control money movement",
  "Dedicated sensitive-tax access (full TIN requires the Tax role)",
  "Provider-verification integrity (KYC/AML/Box results cannot be overridden)",
];

export function activeDelegation(d: Facts["delegations"][number], now = Date.now()): boolean {
  if (d.status !== "active" || d.revoked_at) return false;
  if (d.expires_at && Date.parse(d.expires_at) <= now) return false;
  if (d.acceptance_state && !["accepted", "not_required"].includes(d.acceptance_state)) return false;
  return true;
}

function delegationScope(d: Facts["delegations"][number]): Scope {
  const map: Record<string, ScopeType> = {
    fund: "fund",
    investment_profile: "investment_profile",
    investment: "investment",
  };
  const type = map[d.scope_type] ?? "investment_profile";
  return { type, id: d.scope_id, label: `${d.scope_type.replace(/_/g, " ")} of ${d.counterpart}` };
}

const DELEGATED_CAP_AREA: Record<string, [OpsArea, AccessAction]> = {
  view_profile: ["investors", "view"],
  edit_profile_info: ["investors", "edit"],
  view_investments: ["investors", "view"],
  prepare_investment: ["investors", "prepare"],
  view_documents: ["documents", "view"],
  upload_documents: ["documents", "edit"],
  view_tax_documents: ["tax", "view"],
  view_tax_returns: ["tax", "view"],
  prepare_entity_return: ["tax", "prepare"],
  prepare_individual_return: ["tax", "prepare"],
  review_entity_return: ["tax", "review"],
  review_individual_return: ["tax", "review"],
  view_financial_statements: ["reports", "view"],
  view_compliance_status: ["onboarding", "view"],
  assist_kyc: ["onboarding", "prepare"],
  assist_kyb: ["onboarding", "prepare"],
  assist_accreditation: ["onboarding", "prepare"],
  view_capital_calls: ["capital", "view"],
  view_distributions: ["capital", "view"],
  view_banking_info: ["capital", "view"],
  view_wire_instructions: ["capital", "view"],
  sign_specified_documents: ["documents", "execute"],
};

/** Every effective permission with its source. Pure; used by UI and tests. */
export function effectivePermissions(f: Facts, now = Date.now()): Permission[] {
  const out: Permission[] = [];
  const push = (p: Permission) => out.push(p);

  // 1. Platform roles → Operations capabilities (global scope, staff only).
  if (hasOperationsEntry(f.roles)) {
    for (const cap of capabilitiesFor(f.roles)) {
      const [area, act] = cap.split(":") as [OpsArea, string];
      for (const action of OPS_ACTION_MAP[act] ?? []) {
        push({ area, action, scope: GLOBAL, source: "role", via: `Role: ${roleLabel(f.roles, cap)}` });
      }
    }
  }

  // 2. Staff capability roles and direct grants (revoked grants never count).
  const live = f.staffGrants.filter((g) => !g.revoked_at);
  const roleKeys = live.map((g) => g.role_key).filter(Boolean) as string[];
  const direct = new Set(live.map((g) => g.capability).filter(Boolean) as string[]);
  if (hasOperationsEntry(f.roles)) {
    const fromRoles = staffCapabilitiesFor({ roles: f.roles, assignedRoleKeys: roleKeys, customRoles: f.customRoles });
    const all = staffCapabilitiesFor({ roles: f.roles, assignedRoleKeys: roleKeys, customRoles: f.customRoles, grants: [...direct] });
    for (const cap of all) {
      const area = staffGroupArea(groupOf(cap));
      const action: AccessAction = MANAGE_ACCESS_CAPS.includes(cap) ? "manage_access" : actionOfStaffCap(cap);
      const isDirect = direct.has(cap) && !fromRoles.includes(cap);
      push({ area, action, scope: GLOBAL, source: isDirect ? "direct_grant" : "role", via: `${isDirect ? "Direct grant" : "Staff role"}: ${cap}` });
    }
  }

  // 3. Relationships — always resource-scoped, never global.
  for (const fund of f.managedFunds) {
    const scope: Scope = { type: "fund", id: fund.id, label: fund.name };
    for (const [area, action] of [["funds", "view"], ["funds", "prepare"], ["investors", "view"], ["investors", "prepare"], ["documents", "view"], ["capital", "view"], ["reports", "view"]] as const) {
      push({ area, action, scope, source: "relationship", via: "Fund Manager of this fund" });
    }
  }
  for (const fund of f.investorFunds) {
    push({ area: "funds", action: "view", scope: { type: "fund", id: fund.id, label: fund.name }, source: "relationship", via: "Investor access to this fund (summary only)" });
  }
  for (const p of f.investmentProfiles) {
    const scope: Scope = { type: "investment_profile", id: p.id, label: p.label };
    for (const [area, action] of [["investors", "view"], ["investors", "edit"], ["documents", "view"], ["tax", "view"], ["capital", "view"]] as const) {
      push({ area, action, scope, source: "relationship", via: "Owner of this investment profile" });
    }
  }
  for (const c of f.clientMemberships) {
    const scope: Scope = { type: "client", id: c.id, label: c.name };
    push({ area: "clients", action: "view", scope, source: "relationship", via: `Client user (${c.role ?? "member"})` });
    push({ area: "documents", action: "view", scope, source: "relationship", via: "Client user" });
    if (c.canApprove) push({ area: "clients", action: "approve", scope, source: "relationship", via: "Client approver flag" });
  }
  for (const co of f.companies) {
    push({ area: "companies", action: "view", scope: { type: "company", id: co.id, label: co.name }, source: "relationship", via: "Company relationship" });
  }

  // 4. Delegations — only live, accepted, unexpired, unrevoked authority.
  for (const d of f.delegations) {
    if (d.direction !== "acting_for" || !activeDelegation(d, now)) continue;
    const scope = delegationScope(d);
    for (const cap of d.capabilities) {
      const hit = DELEGATED_CAP_AREA[cap];
      if (hit) push({ area: hit[0], action: hit[1], scope, source: "delegated", via: `Delegation (${d.authority_level}): ${cap}` });
    }
  }

  return dedupe(out);
}

function dedupe(list: Permission[]): Permission[] {
  const seen = new Map<string, Permission>();
  const rank: Record<SourceKind, number> = { deny: 0, direct_grant: 1, role: 2, relationship: 3, delegated: 4 };
  for (const p of list) {
    const k = `${p.area}|${p.action}|${p.scope.type}|${p.scope.id ?? ""}`;
    const prev = seen.get(k);
    if (!prev || rank[p.source] < rank[prev.source]) seen.set(k, p);
  }
  return [...seen.values()];
}

/**
 * Explicit DENY overrides any grant for the same area/action and an equal or
 * narrower scope. No deny records exist yet (Stage 2 introduces storage), so
 * the current enforcement never sees one; the rule is modelled and tested now.
 */
export function applyDenies(perms: Permission[], denies: { area: OpsArea; action: AccessAction; scope: Scope }[]): Permission[] {
  return perms.filter(
    (p) => !denies.some((d) => d.area === p.area && d.action === p.action && (d.scope.type === "global" || (d.scope.type === p.scope.type && d.scope.id === p.scope.id))),
  );
}

function groupOf(cap: string): string {
  return STAFF_CAPABILITY_GROUPS.find((g) => g.caps.some((c) => c[0] === cap))?.group ?? "Administration";
}

function actionOfStaffCap(cap: string): AccessAction {
  if (cap.startsWith("view_")) return "view";
  if (cap.startsWith("approve_")) return "approve";
  if (cap.startsWith("generate_") || cap.startsWith("map_") || cap.startsWith("record_")) return "prepare";
  return "edit";
}

function roleLabel(roles: string[], cap: string): string {
  const hits = roles.filter((r) => capabilitiesFor([r]).includes(cap as never));
  return hits.join(", ") || roles.join(", ");
}

export type UserType = "harmonious" | "client" | "fund_manager" | "investor" | "professional" | "none";

export function userTypes(f: Facts): UserType[] {
  const t: UserType[] = [];
  if (hasOperationsEntry(f.roles)) t.push("harmonious");
  if (f.clientMemberships.length || f.companies.length) t.push("client");
  if (f.managedFunds.length) t.push("fund_manager");
  if (f.investmentProfiles.length || f.investorFunds.length) t.push("investor");
  if (f.professionalMemberships.some((m) => m.status === "active") || f.delegations.some((d) => d.direction === "acting_for" && activeDelegation(d)))
    t.push("professional");
  return t.length ? t : ["none"];
}

export const USER_TYPE_LABEL: Record<UserType, string> = {
  harmonious: "Harmonious Team",
  client: "Client",
  fund_manager: "Fund Manager",
  investor: "Investor",
  professional: "Professional",
  none: "No relationships",
};

/** Sensitive categories this person can reach, derived from their effective permissions. */
export function sensitiveAccess(f: Facts, perms = effectivePermissions(f)): string[] {
  const out = new Set<string>();
  const has = (area: OpsArea, action: AccessAction, global = true) =>
    perms.some((p) => p.area === area && p.action === action && (!global || p.scope.type === "global"));
  if (f.roles.includes("tax")) out.add("Full tax IDs (Tax role)");
  if (has("tax", "review")) out.add("Tax review (masked)");
  if (has("onboarding", "review")) out.add("KYC/AML review");
  if (has("capital", "execute")) out.add("Banking execution");
  if (has("administration", "manage_access")) out.add("Access administration");
  return [...out];
}

export function effectiveRoles(f: Facts): string[] {
  const out = new Set<string>(f.roles);
  for (const g of f.staffGrants) if (!g.revoked_at && g.role_key) out.add(PREDEFINED_STAFF_ROLES[g.role_key]?.label ?? g.role_key);
  if (f.managedFunds.length) out.add("fund_manager (scoped)");
  return [...out];
}

export function scopesSummary(perms: Permission[]): string[] {
  const s = new Set<string>();
  for (const p of perms) s.add(p.scope.type === "global" ? "Global" : `${p.scope.type.replace(/_/g, " ")}: ${p.scope.label}`);
  return [...s];
}

/** Matrix cells: area × action → the strongest source present (or null). */
export function matrix(perms: Permission[]): Record<OpsArea, Record<AccessAction, SourceKind | null>> {
  const m = {} as Record<OpsArea, Record<AccessAction, SourceKind | null>>;
  for (const a of OPS_AREAS) {
    m[a] = {} as Record<AccessAction, SourceKind | null>;
    for (const act of ACCESS_ACTIONS) m[a][act.id] = null;
  }
  const rank: Record<SourceKind, number> = { deny: 0, direct_grant: 1, role: 2, relationship: 3, delegated: 4 };
  for (const p of perms) {
    const cur = m[p.area][p.action];
    if (!cur || rank[p.source] < rank[cur]) m[p.area][p.action] = p.source;
  }
  return m;
}

export const SOURCE_LABEL: Record<SourceKind, string> = {
  role: "From role",
  relationship: "From relationship",
  direct_grant: "Direct grant",
  deny: "Explicitly denied",
  delegated: "Delegated",
};

export { NEVER_GRANTABLE };
