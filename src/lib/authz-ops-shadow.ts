/**
 * Stage 3A.1 canonical decisions for exactly two read functions:
 * operations.functions.ts :: getOperationsAccess and :: listOperationsTeam.
 * Pure; never enforced. Inputs are role/assignment facts only - never email
 * domain, sign-in provider, client/investor/professional membership, or
 * account classification.
 */
import { OPS_STAFF_ROLES } from "@/lib/ops-capabilities";
import { isLive, ROLE_TEMPLATES, type Assignment } from "@/lib/authorize";

export type OpsFacts = { authenticated: boolean; suspended: boolean; platformRoles: string[]; assignments: Assignment[] };
export type CanonicalDecision = { allowed: boolean; key: string; reason: string };

const STAFF = OPS_STAFF_ROLES as readonly string[];
const HARMONIOUS_TEMPLATE_ROLE = new Map(
  ROLE_TEMPLATES.filter((t) => t.category === "harmonious" && t.platformRole).map((t) => [t.key, t.platformRole!]),
);

/** Staff roles held right now, from platform roles plus live global Harmonious assignments. */
export function activeStaffRoles(f: OpsFacts, now = Date.now()): string[] {
  const out = new Set(f.platformRoles.filter((r) => STAFF.includes(r)));
  for (const a of f.assignments) {
    const role = HARMONIOUS_TEMPLATE_ROLE.get(a.role_key);
    if (role && STAFF.includes(role) && a.scope_type === "global" && isLive(a, now)) out.add(role);
  }
  return [...out].sort();
}

export const OPS_ENTRY_KEY = "operations.entry";
/** Gap: no canonical "view staff roster" permission exists; entry is used as the nearest concept. */
export const OPS_TEAM_KEY = "operations.team_roster.view(gap:entry)";

export function canonicalOperationsEntry(f: OpsFacts, now = Date.now()): CanonicalDecision {
  if (!f.authenticated) return { allowed: false, key: OPS_ENTRY_KEY, reason: "not_authenticated" };
  if (f.suspended) return { allowed: false, key: OPS_ENTRY_KEY, reason: "suspended" };
  return activeStaffRoles(f, now).length
    ? { allowed: true, key: OPS_ENTRY_KEY, reason: "active_staff_role" }
    : { allowed: false, key: OPS_ENTRY_KEY, reason: "no_staff_role" };
}

export function canonicalOperationsTeam(f: OpsFacts, now = Date.now()): CanonicalDecision {
  return { ...canonicalOperationsEntry(f, now), key: OPS_TEAM_KEY };
}

/** The legacy rule both functions use today (admin or operations platform role). */
export function legacyOperations(roles: string[]): boolean {
  return roles.includes("admin") || roles.includes("operations");
}
