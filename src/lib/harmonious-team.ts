/**
 * Harmonious Team ownership (Phase 3.10A) - pure model.
 * Client holds three assignments; Funds inherit unless they carry an explicit
 * override. Assignment is ownership/routing only and never grants access.
 */
import { staffProfile } from "@/lib/harmonious-staff";

export const TEAM_ROLES = ["sales", "account_manager", "operations"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export const TEAM_ROLE_LABEL: Record<TeamRole, string> = {
  sales: "Sales",
  account_manager: "Account Manager",
  operations: "Operations",
};

export type TeamSource = "fund_override" | "client" | "none" | "no_client";
export const TEAM_SOURCE_LABEL: Record<TeamSource, string> = {
  fund_override: "Fund Override",
  client: "Inherited from Client",
  none: "Team Assignment Needed",
  no_client: "No Client Team Available",
};

export type Assignment = { team_role: TeamRole; user_id: string };
export type EffectiveMember = { role: TeamRole; userId: string | null; source: TeamSource };

/** Fund override wins; otherwise the Client assignment; otherwise a follow-up. */
export function resolveTeam(args: {
  hasClient: boolean;
  client: readonly Assignment[];
  overrides?: readonly Assignment[];
}): EffectiveMember[] {
  return TEAM_ROLES.map((role) => {
    const o = args.overrides?.find((a) => a.team_role === role);
    if (o) return { role, userId: o.user_id, source: "fund_override" as const };
    if (!args.hasClient) return { role, userId: null, source: "no_client" as const };
    const c = args.client.find((a) => a.team_role === role);
    return c ? { role, userId: c.user_id, source: "client" as const } : { role, userId: null, source: "none" as const };
  });
}

/** Internal follow-up label only. Never a readiness condition or a gate. */
export function teamFollowUp(team: readonly EffectiveMember[]): string | null {
  if (team.every((m) => m.source === "no_client")) return "No Client Team Available";
  return team.some((m) => !m.userId) ? "Team Assignment Needed" : null;
}
export const isTeamBlocking = (_t: readonly EffectiveMember[]) => false;

/** Who can be selected for each assignment (by their existing staff roles). */
export function eligibleFor(role: TeamRole, roles: readonly string[]): boolean {
  const p = staffProfile(roles);
  if (!p.isHarmoniousStaff) return false;
  if (role === "sales") return p.teams.includes("sales");
  if (role === "operations") return p.operationsAccess && p.teams.includes("operations");
  return true;
}

/** Who may change each assignment. Super Users manage all three. */
export function canManageRole(role: TeamRole, actorRoles: readonly string[]): boolean {
  if (actorRoles.includes("super_admin")) return true;
  const salesMgmt = actorRoles.some((r) => ["sales_management", "cro", "executive"].includes(r));
  const opsLead = actorRoles.some((r) => ["admin", "executive"].includes(r));
  if (role === "sales") return salesMgmt;
  if (role === "account_manager") return salesMgmt || opsLead;
  return opsLead;
}

/** When a Sales user creates a Client, they default to its Sales Team Member. */
export function defaultSalesOwner(actorId: string, actorRoles: readonly string[], chosen?: string | null): string | null {
  if (chosen) return chosen;
  return staffProfile(actorRoles).teams.includes("sales") ? actorId : null;
}

/** Client-facing contacts: Account Manager and Operations only; no controls. */
export function clientFacingContacts(team: readonly EffectiveMember[]) {
  return team.filter((m) => m.role !== "sales" && m.userId).map((m) => ({ role: m.role === "operations" ? "Operations Contact" : "Account Manager", userId: m.userId! }));
}

/**
 * Default Operations owner for an existing queue item: fund override, else
 * client assignment. Routing only - the readiness condition never changes.
 */
export const defaultOperationsOwner = (team: readonly EffectiveMember[]) => team.find((m) => m.role === "operations")?.userId ?? null;
