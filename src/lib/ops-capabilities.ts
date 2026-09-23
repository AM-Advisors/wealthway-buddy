/**
 * What a member of the Harmonious team may do inside Operations.
 *
 * Two rules hold everywhere in this file:
 *  - being signed in grants nothing; only an active staff assignment does;
 *  - a menu entry is never permission. The backend checks the same capability
 *    again on every request, and nobody approves their own preparation.
 */

export const OPS_AREAS = [
  "clients",
  "funds",
  "companies",
  "investors",
  "onboarding",
  "capital",
  "accounting",
  "tax",
  "regulatory",
  "documents",
  "tasks",
  "reports",
  "administration",
] as const;

export type OpsArea = (typeof OPS_AREAS)[number];

export const OPS_ACTIONS = ["see", "prepare", "review", "approve", "execute"] as const;
export type OpsAction = (typeof OPS_ACTIONS)[number];

export type OpsCapability = `${OpsArea}:${OpsAction}`;

/** Every Harmonious role that can open Operations at all. */
export const OPS_STAFF_ROLES = [
  "admin",
  "super_admin",
  "operations",
  "legal",
  "compliance",
  "fund_administration",
  "tax",
  "finance",
  "client_success",
  "executive",
] as const;

const caps = (areas: readonly OpsArea[], actions: readonly OpsAction[]): OpsCapability[] =>
  areas.flatMap((area) => actions.map((action) => `${area}:${action}` as OpsCapability));

const ALL_AREAS = OPS_AREAS;
const SEE_ONLY = ["see"] as const;
const THROUGH_APPROVE = ["see", "prepare", "review", "approve"] as const;
const THROUGH_REVIEW = ["see", "prepare", "review"] as const;
const SEE_PREPARE = ["see", "prepare"] as const;

/**
 * Role to capability. Deliberately narrow: money is executed by finance,
 * configuration is changed by administrators, and everyone else stops at the
 * step their job actually covers.
 */
const ROLE_GRANTS: Record<string, OpsCapability[]> = {
  super_admin: caps(ALL_AREAS, OPS_ACTIONS),
  admin: [...caps(ALL_AREAS, THROUGH_APPROVE), "administration:execute"],
  operations: [
    ...caps(
      ["clients", "funds", "companies", "investors", "capital", "documents", "tasks", "reports"],
      SEE_PREPARE,
    ),
    ...caps(["onboarding"], THROUGH_REVIEW),
  ],
  fund_administration: caps(
    ["funds", "investors", "capital", "accounting", "reports"],
    THROUGH_REVIEW,
  ),
  finance: [...caps(["capital", "accounting"], THROUGH_APPROVE), "capital:execute"],
  tax: caps(["tax", "reports"], THROUGH_APPROVE),
  legal: caps(["clients", "regulatory", "documents"], THROUGH_APPROVE),
  compliance: [
    ...caps(["onboarding", "investors", "regulatory"], ["see", "review", "approve"]),
    "documents:see",
  ],
  client_success: [
    ...caps(["clients", "investors", "documents", "tasks"], SEE_ONLY),
    ...caps(["onboarding"], SEE_PREPARE),
  ],
  executive: caps(ALL_AREAS, SEE_ONLY),
};

/** Whether this person may open Operations at all. */
export function hasOperationsEntry(roles: readonly string[]): boolean {
  return roles.some((role) => (OPS_STAFF_ROLES as readonly string[]).includes(role));
}

/** The capabilities these roles add up to. An unknown role contributes nothing. */
export function capabilitiesFor(roles: readonly string[]): OpsCapability[] {
  const out = new Set<OpsCapability>();
  for (const role of roles) for (const cap of ROLE_GRANTS[role] ?? []) out.add(cap);
  return [...out].sort();
}

export function can(
  capabilities: readonly OpsCapability[],
  area: OpsArea,
  action: OpsAction,
): boolean {
  return capabilities.includes(`${area}:${action}` as OpsCapability);
}

/**
 * Approving is refused when the same person prepared the item, whatever their
 * role says. This mirrors the separation already enforced for money movement.
 */
export function canApprove(input: {
  capabilities: readonly OpsCapability[];
  area: OpsArea;
  actorUserId: string;
  preparedByUserId?: string | null;
}): boolean {
  if (!can(input.capabilities, input.area, "approve")) return false;
  return input.preparedByUserId !== input.actorUserId;
}

export type OpsSection = { id: OpsArea; title: string; url: string; icon: string };

/** The Operations menu: destinations, in the order the work happens. */
const SECTIONS: OpsSection[] = [
  { id: "clients", title: "Clients", url: "/ops/clients", icon: "briefcase" },
  { id: "funds", title: "Funds & SPVs", url: "/ops/funds", icon: "building" },
  { id: "companies", title: "Companies", url: "/ops/companies", icon: "table" },
  { id: "investors", title: "Investors", url: "/ops/investors", icon: "people" },
  { id: "onboarding", title: "Onboarding & checks", url: "/admin/investor-onboarding", icon: "check" },
  { id: "capital", title: "Capital & banking", url: "/ops/banking", icon: "money" },
  { id: "accounting", title: "Accounting", url: "/ops/accounting", icon: "ledger" },
  { id: "tax", title: "Tax", url: "/ops/tax-documents", icon: "tax" },
  { id: "regulatory", title: "Regulatory & filings", url: "/ops/ss4", icon: "shield" },
  { id: "documents", title: "Documents", url: "/ops/documents", icon: "document" },
  { id: "tasks", title: "Tasks & activity", url: "/admin/activity", icon: "tasks" },
  { id: "reports", title: "Reports", url: "/ops/reporting", icon: "report" },
  { id: "administration", title: "Administration", url: "/admin/access", icon: "settings" },
];

/** Home is always first for anyone who may enter at all. */
export const OPS_HOME = { id: "home", title: "Home", url: "/ops", icon: "home" } as const;

export function opsNavigation(capabilities: readonly OpsCapability[]): OpsSection[] {
  return SECTIONS.filter((section) => can(capabilities, section.id, "see"));
}

/** Operations pages must never appear in a client menu, and the reverse. */
export const OPS_PATH_PREFIXES = ["/ops", "/admin", "/staff"];
