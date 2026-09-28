/**
 * Canonical authorization resolver (RBAC Stage 2).
 *
 * authorize(facts, permission, resource) returns a structured decision. It
 * runs ALONGSIDE the existing checks: no production endpoint calls it yet
 * (Stage 3 migrates them). Relationship tables stay the source of truth; this
 * module only consumes them.
 */
import { capabilitiesFor, OPS_AREAS, type OpsArea } from "@/lib/ops-capabilities";
import {
  effectivePermissions,
  type AccessAction,
  type Facts as RelationshipFacts,
  type Permission,
  type ScopeType,
} from "@/lib/access-control-model";

export const PERMISSION_ACTIONS = ["view", "edit", "prepare", "review", "approve", "execute", "manage_access", "export"] as const;
export type PermissionKey = `${OpsArea}.${AccessAction}`;
export const PERMISSIONS: PermissionKey[] = OPS_AREAS.flatMap((a) => PERMISSION_ACTIONS.map((x) => `${a}.${x}` as PermissionKey));
export const isPermission = (k: string): k is PermissionKey => (PERMISSIONS as string[]).includes(k);

/**
 * Sensitive powers that live in dedicated systems. They are never produced by a
 * role, template, grant or checkbox, and removing a deny can't unlock them.
 */
export const PROTECTED_PERMISSIONS = [
  "tax.full_tin",
  "tax.sensitive_evidence",
  "onboarding.raw_government_id",
  "onboarding.raw_provider_evidence",
  "onboarding.approve_compliance_exception",
  "capital.execute_money",
  "documents.legal_signing_authority",
] as const;
export const isProtected = (k: string) => (PROTECTED_PERMISSIONS as readonly string[]).includes(k);

export const SCOPE_TYPES: ScopeType[] = ["global", "client", "fund", "company", "investment_profile", "investment"];

// ---------------------------------------------------------------- templates

export type TemplateCategory = "harmonious" | "client" | "fund" | "company";
export type RoleTemplate = {
  key: string;
  label: string;
  category: TemplateCategory;
  permissions: PermissionKey[];
  /** Harmonious templates backed by a platform role row (legacy enforcement reads it). */
  platformRole?: string;
  scopeTypes: ScopeType[];
  superAdminOnly?: boolean;
};

const OPS_TO_ACTIONS: Record<string, AccessAction[]> = {
  see: ["view"], prepare: ["prepare", "edit"], review: ["review"], approve: ["approve"], execute: ["execute"],
};
function fromPlatformRole(role: string): PermissionKey[] {
  const out = new Set<PermissionKey>();
  for (const cap of capabilitiesFor([role])) {
    const [area, act] = cap.split(":") as [OpsArea, string];
    for (const a of OPS_TO_ACTIONS[act] ?? []) out.add(`${area}.${a}`);
  }
  if (role === "super_admin" || role === "admin") out.add("administration.manage_access");
  if (role === "super_admin") for (const a of OPS_AREAS) out.add(`${a}.manage_access`), out.add(`${a}.export`);
  return [...out].sort();
}
const p = (area: OpsArea, actions: AccessAction[]) => actions.map((a) => `${area}.${a}` as PermissionKey);

const H = (key: string, label: string, platformRole: string, superAdminOnly = false): RoleTemplate => ({
  key, label, category: "harmonious", platformRole, permissions: fromPlatformRole(platformRole), scopeTypes: ["global"], superAdminOnly,
});

export const ROLE_TEMPLATES: RoleTemplate[] = [
  H("super_admin", "Super Administrator", "super_admin", true),
  H("admin", "Operations Administrator", "admin", true),
  H("operations", "Client Operations", "operations"),
  H("fund_administration", "Fund Administration", "fund_administration"),
  H("compliance", "Compliance", "compliance"),
  H("legal", "Legal", "legal"),
  H("tax", "Tax", "tax", true),
  H("finance", "Finance", "finance"),
  H("client_success", "Client Success", "client_success"),
  H("executive", "Executive / Read Only", "executive"),
  // Client (scoped to one client)
  { key: "client_owner", label: "Client Owner", category: "client", scopeTypes: ["client"], permissions: [...p("clients", ["view", "edit", "approve", "manage_access"]), ...p("funds", ["view"]), ...p("companies", ["view"]), ...p("documents", ["view", "edit"]), ...p("tasks", ["view", "edit"]), ...p("reports", ["view"])] },
  { key: "client_administrator", label: "Client Administrator", category: "client", scopeTypes: ["client"], permissions: [...p("clients", ["view", "edit", "manage_access"]), ...p("funds", ["view"]), ...p("companies", ["view"]), ...p("documents", ["view", "edit"]), ...p("tasks", ["view", "edit"])] },
  { key: "client_operator", label: "Client Operator", category: "client", scopeTypes: ["client"], permissions: [...p("clients", ["view", "edit"]), ...p("documents", ["view", "edit"]), ...p("tasks", ["view", "edit"])] },
  { key: "client_approver", label: "Client Approver", category: "client", scopeTypes: ["client"], permissions: [...p("clients", ["view", "approve"]), ...p("documents", ["view"])] },
  { key: "client_viewer", label: "Client Viewer", category: "client", scopeTypes: ["client"], permissions: [...p("clients", ["view"]), ...p("documents", ["view"])] },
  // Fund (scoped to one fund)
  { key: "fund_manager_admin", label: "Fund Manager Administrator", category: "fund", scopeTypes: ["fund"], permissions: [...p("funds", ["view", "edit", "prepare", "manage_access"]), ...p("investors", ["view", "prepare", "manage_access"]), ...p("documents", ["view", "edit"]), ...p("capital", ["view"]), ...p("reports", ["view"])] },
  { key: "fund_operator", label: "Fund Operator", category: "fund", scopeTypes: ["fund"], permissions: [...p("funds", ["view", "edit", "prepare"]), ...p("investors", ["view", "prepare"]), ...p("documents", ["view", "edit"])] },
  { key: "fund_approver", label: "Fund Approver / Signatory", category: "fund", scopeTypes: ["fund"], permissions: [...p("funds", ["view", "approve"]), ...p("investors", ["view"]), ...p("documents", ["view"])] },
  { key: "fund_viewer", label: "Fund Viewer", category: "fund", scopeTypes: ["fund"], permissions: [...p("funds", ["view"]), ...p("documents", ["view"])] },
  // Company (scoped to one company)
  { key: "company_owner", label: "Company Owner", category: "company", scopeTypes: ["company"], permissions: [...p("companies", ["view", "edit", "approve", "manage_access", "export"]), ...p("documents", ["view", "edit"]), ...p("reports", ["view", "export"])] },
  { key: "company_administrator", label: "Company Administrator", category: "company", scopeTypes: ["company"], permissions: [...p("companies", ["view", "edit", "manage_access"]), ...p("documents", ["view", "edit"]), ...p("reports", ["view"])] },
  { key: "cap_table_administrator", label: "Cap Table Administrator", category: "company", scopeTypes: ["company"], permissions: [...p("companies", ["view", "edit", "prepare"]), ...p("documents", ["view", "edit"]), ...p("reports", ["view", "export"])] },
  { key: "company_operator", label: "Company Operator", category: "company", scopeTypes: ["company"], permissions: [...p("companies", ["view", "edit"]), ...p("documents", ["view"])] },
  { key: "company_viewer", label: "Company Viewer", category: "company", scopeTypes: ["company"], permissions: [...p("companies", ["view"]), ...p("documents", ["view"])] },
];
export const templateFor = (key: string) => ROLE_TEMPLATES.find((t) => t.key === key);

/** Investor authority is relationship-based, never a template. */
export const INVESTOR_RELATIONSHIPS = ["Owner", "Joint Owner", "Trustee", "Authorized Signer", "Control Person", "Beneficial Owner"];

// ---------------------------------------------------------------- facts

export type Grant = {
  id: string;
  permission: string;
  effect: "allow" | "deny";
  scope_type: ScopeType;
  scope_id: string | null;
  effective_at: string;
  expires_at: string | null;
  revoked_at: string | null;
};
export type Assignment = {
  id: string;
  role_key: string;
  role_version: number | null;
  scope_type: ScopeType;
  scope_id: string | null;
  effective_at: string;
  expires_at: string | null;
  revoked_at: string | null;
};
export type RoleDefinition = { role_key: string; version: number; label: string; permissions: string[]; status: "active" | "inactive" };

export type AuthzFacts = RelationshipFacts & {
  authenticated: boolean;
  suspended: boolean;
  assignments: Assignment[];
  grants: Grant[];
  roleDefinitions: RoleDefinition[];
};

export type Resource = {
  type: ScopeType;
  id: string | null;
  label?: string;
  /** Owning records, e.g. a fund's client — a client-scoped grant covers them. */
  ancestors?: { type: ScopeType; id: string }[];
};

export type Decision = {
  allowed: boolean;
  permission: string;
  resource: string;
  scope: string | null;
  sources: string[];
  reason: string;
  protectedConditions: string[];
  /** Canonical resolver only — no production endpoint consults it yet. */
  enforcement: "canonical_resolver_only";
};

export function isLive(r: { effective_at: string; expires_at: string | null; revoked_at: string | null }, now = Date.now()) {
  if (r.revoked_at) return false;
  if (Date.parse(r.effective_at) > now) return false;
  if (r.expires_at && Date.parse(r.expires_at) <= now) return false;
  return true;
}

const asScope = (r: { scope_type: ScopeType; scope_id: string | null }) => ({ type: r.scope_type, id: r.scope_id });
function scopeCovers(scope: { type: ScopeType; id: string | null }, res: Resource): boolean {
  if (scope.type === "global") return true;
  if (scope.type === res.type && scope.id === res.id) return true;
  return (res.ancestors ?? []).some((a) => a.type === scope.type && a.id === scope.id);
}

const resLabel = (r: Resource) => (r.type === "global" ? "All resources" : r.label ?? `${r.type} ${r.id}`);

function latestDefinition(defs: RoleDefinition[], key: string, version: number | null) {
  const list = defs.filter((d) => d.role_key === key);
  if (version != null) return list.find((d) => d.version === version) ?? null;
  return list.sort((a, b) => b.version - a.version)[0] ?? null;
}

function permsOfAssignment(f: AuthzFacts, a: Assignment): string[] {
  const t = templateFor(a.role_key);
  if (t) return t.permissions;
  const def = latestDefinition(f.roleDefinitions, a.role_key, a.role_version);
  // A deactivated role stops granting; its history stays readable.
  const current = latestDefinition(f.roleDefinitions, a.role_key, null);
  if (!def || current?.status === "inactive") return [];
  return def.permissions.filter((x) => isPermission(x));
}

/** Stage 1 relationship/role permissions keyed to canonical form. */
function legacyPerms(f: AuthzFacts): Permission[] {
  return effectivePermissions(f);
}

export function authorize(
  f: AuthzFacts,
  permission: string,
  resource: Resource,
  ctx: { preparedBy?: string | null; now?: number } = {},
): Decision {
  const now = ctx.now ?? Date.now();
  const base = { permission, resource: resLabel(resource), enforcement: "canonical_resolver_only" as const };
  const deny = (reason: string, conditions: string[] = []): Decision => ({ ...base, allowed: false, scope: null, sources: [], reason, protectedConditions: conditions });

  if (!f.authenticated) return deny("Not signed in");
  if (f.suspended) return deny("Account is suspended");
  if (isProtected(permission)) return deny("Protected permission — granted only through its dedicated control, never by role or grant", ["dedicated_control"]);
  if (!isPermission(permission)) return deny("Unknown permission");

  // Explicit deny wins over everything ordinary.
  const denied = f.grants.find((g) => g.effect === "deny" && g.permission === permission && isLive(g, now) && scopeCovers(asScope(g), resource));
  if (denied) return { ...deny(`Explicitly denied (${denied.scope_type === "global" ? "global" : `${denied.scope_type} scope`})`), sources: ["Direct deny"] };

  const [area, action] = permission.split(".") as [OpsArea, AccessAction];
  const hits: { source: string; scope: string }[] = [];

  for (const lp of legacyPerms(f)) {
    if (lp.area === area && lp.action === action && scopeCovers(lp.scope, resource)) hits.push({ source: lp.via, scope: lp.scope.label });
  }
  for (const a of f.assignments) {
    if (!isLive(a, now) || !scopeCovers(asScope(a), resource)) continue;
    if (permsOfAssignment(f, a).includes(permission)) {
      hits.push({ source: `Role: ${templateFor(a.role_key)?.label ?? a.role_key}`, scope: a.scope_type === "global" ? "All resources" : `${a.scope_type} ${a.scope_id}` });
    }
  }
  for (const g of f.grants) {
    if (g.effect === "allow" && g.permission === permission && isLive(g, now) && scopeCovers(asScope(g), resource)) {
      hits.push({ source: "Direct grant", scope: g.scope_type === "global" ? "All resources" : `${g.scope_type} ${g.scope_id}` });
    }
  }
  if (!hits.length) {
    return deny(resource.type === "global" ? `No source grants ${permission}` : `${resLabel(resource)} is outside assigned scope`);
  }

  const conditions: string[] = [];
  if (action === "approve") {
    conditions.push("maker_checker");
    if (ctx.preparedBy && ctx.preparedBy === f.userId) return { ...deny("Maker/checker: you prepared this item", conditions), sources: hits.map((h) => h.source) };
  }
  if (area === "capital" && action === "execute") conditions.push("dual_control_money_movement");
  if (action === "manage_access") conditions.push("fresh_authentication");
  if (f.roles.includes("super_admin")) conditions.push("super_admin_does_not_bypass_integrity_controls");

  return {
    ...base,
    allowed: true,
    scope: hits[0]!.scope,
    sources: [...new Set(hits.map((h) => h.source))],
    reason: `Allowed via ${hits[0]!.source}`,
    protectedConditions: conditions,
  };
}

export function formatDecision(d: Decision): string {
  return d.allowed
    ? `ALLOW — ${d.permission} — ${d.resource} — source: ${d.sources.join(", ")} — scope: ${d.scope}`
    : `DENY — ${d.permission} — ${d.reason}`;
}

// ---------------------------------------------------------------- escalation

export type AccessChange =
  | { kind: "assign_role"; targetUserId: string; roleKey: string; scope: { type: ScopeType; id: string | null } }
  | { kind: "revoke_role"; targetUserId: string; roleKey: string; scope: { type: ScopeType; id: string | null } }
  | { kind: "grant"; targetUserId: string; permission: string; effect: "allow" | "deny"; scope: { type: ScopeType; id: string | null } }
  | { kind: "revoke_grant"; targetUserId: string; permission: string; effect: "allow" | "deny"; scope: { type: ScopeType; id: string | null } }
  | { kind: "account_state"; targetUserId: string; suspended: boolean }
  | { kind: "role_definition"; roleKey: string };

/** Only an existing Super Administrator may touch these. */
export const SUPER_ADMIN_ONLY_ROLES = new Set(["super_admin", "admin", "tax", "staff_administrator"]);

/**
 * Whether `actor` may make `change`. Refuses anything beyond the actor's own
 * access-management authority. Returns null when allowed, else the reason.
 */
export function accessChangeProblem(actor: AuthzFacts, change: AccessChange, resourceFor?: (s: { type: ScopeType; id: string | null }) => Resource): string | null {
  if (!actor.authenticated || actor.suspended) return "Your account can't manage access.";
  const isSuper = actor.roles.includes("super_admin");
  const self = "targetUserId" in change && change.targetUserId === actor.userId;

  if (change.kind === "role_definition") return isSuper ? null : "Only a Super Administrator can create or change roles.";
  if (change.kind === "account_state") {
    if (self) return "You can't change your own account state.";
    return globalManage(actor) ? null : "Only Harmonious access administrators can suspend or restore accounts.";
  }

  if (change.kind === "grant" || change.kind === "revoke_grant") {
    if (isProtected(change.permission)) return "Protected permissions can't be granted or revoked here; they have their own dedicated control.";
    if (!isPermission(change.permission)) return "Unknown permission.";
  }
  if ((change.kind === "assign_role" || change.kind === "grant") && self) return "You can't grant access to yourself.";

  const roleKey = "roleKey" in change ? change.roleKey : null;
  if (roleKey && SUPER_ADMIN_ONLY_ROLES.has(roleKey)) {
    if (!isSuper) return "Only a Super Administrator can grant or remove this role.";
    if (roleKey === "super_admin" && self) return "Super Administrator can't be assigned or removed by the same person it affects.";
    return null;
  }
  // Platform-wide access administration is Super Administrator-only.
  if ((change.kind === "grant" || change.kind === "revoke_grant") && change.permission.endsWith(".manage_access") && change.scope.type === "global" && !isSuper) {
    return "Only a Super Administrator can grant platform-wide access administration.";
  }

  if (globalManage(actor)) return null;

  // Scoped administrators: only within a scope they manage, only what they hold there.
  const scope = change.scope;
  if (scope.type === "global") return "You can only manage access within your own client, fund or company.";
  const res = resourceFor ? resourceFor(scope) : { type: scope.type, id: scope.id };
  const area = scope.type === "client" ? "clients" : scope.type === "fund" ? "funds" : scope.type === "company" ? "companies" : "investors";
  if (!authorize(actor, `${area}.manage_access`, res).allowed) return "You don't manage access for that scope.";
  const needed = change.kind === "assign_role" || change.kind === "revoke_role" ? templateFor(change.roleKey)?.permissions ?? null : [change.permission];
  if (!needed) return "Unknown role.";
  if (templateFor(change.kind === "assign_role" || change.kind === "revoke_role" ? change.roleKey : "")?.category === "harmonious") {
    return "Only Harmonious access administrators can assign Harmonious roles.";
  }
  for (const perm of needed) if (!authorize(actor, perm, res).allowed) return `You can't grant ${perm} — it exceeds your own access.`;
  return null;
}

function globalManage(actor: AuthzFacts): boolean {
  return authorize(actor, "administration.manage_access", { type: "global", id: null }).allowed;
}
