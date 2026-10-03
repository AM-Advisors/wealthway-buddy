/**
 * Harmonious leadership & commercial role hierarchy (pure).
 * Decides who may assign which managed role. Server re-checks every change.
 */
export const MANAGED_ROLES = ["super_admin", "executive", "cro", "sales_management", "account_executive", "bdr", "sales", "account_manager", "marketing_manager", "marketing_specialist", "leadership"] as const;
export type ManagedRole = (typeof MANAGED_ROLES)[number];

export const MANAGED_ROLE_LABEL: Record<ManagedRole, string> = {
  super_admin: "Super admin",
  executive: "CEO",
  cro: "CRO",
  sales_management: "Sales Manager",
  account_executive: "Account Executive",
  bdr: "BDR",
  sales: "Sales",
  account_manager: "Account Manager",
  marketing_manager: "Marketing Manager",
  marketing_specialist: "Marketing Specialist",
  leadership: "Leadership",
};

export const MANAGED_ROLE_SEES: Record<ManagedRole, string> = {
  super_admin: "Everything, including assigning any role",
  executive: "Everything except Super admin; pricing approvals",
  cro: "Sales, Account management and pricing approvals",
  sales_management: "Sales pipeline, the whole Sales team and pricing approvals",
  account_executive: "Their own pipeline end to end, quotes and outreach",
  bdr: "Their own contacts and outreach through Meeting set",
  sales: "Their own pipeline and contacts (commercial data only)",
  account_manager: "Their assigned clients: funds, tasks and health",
  marketing_manager: "Marketing: create, approve and schedule posts and emails; channels",
  marketing_specialist: "Marketing: create posts and emails and submit them for approval",
  leadership: "Read-only view of everything: dashboards, people, activity and audit; changes nothing",
};

/** Higher number = more authority. */
export const ROLE_RANK: Record<ManagedRole, number> = {
  super_admin: 100, executive: 90, cro: 80, sales_management: 70, account_executive: 30, bdr: 20, sales: 10, account_manager: 10, marketing_manager: 40, marketing_specialist: 15, leadership: 50,
};

/** Roles that need an Individual account classification. */
export const PRIVILEGED_MANAGED: readonly ManagedRole[] = ["super_admin", "executive", "cro", "sales_management", "leadership"];

export function actorRank(roles: readonly string[]): number {
  return Math.max(0, ...roles.map((r) => ROLE_RANK[r as ManagedRole] ?? 0));
}

/** Which managed roles this actor may grant or remove. */
export function assignableRoles(actorRoles: readonly string[]): ManagedRole[] {
  const rank = actorRank(actorRoles);
  if (rank >= 100) return [...MANAGED_ROLES];
  if (rank < 70) return [];
  // CEO may assign CEO; others only roles strictly below their own.
  return MANAGED_ROLES.filter((r) => r !== "super_admin" && (ROLE_RANK[r] < rank || (rank === 90 && r === "executive")));
}

export function assignmentProblem(args: {
  actorId: string; actorRoles: readonly string[]; targetId: string; role: string; action: "grant" | "revoke"; superAdminCount: number;
}): string | null {
  if (!(MANAGED_ROLES as readonly string[]).includes(args.role)) return "That role can't be managed here.";
  if (args.actorId === args.targetId) return "You can't change your own roles.";
  if (!assignableRoles(args.actorRoles).includes(args.role as ManagedRole)) return "Your role can't assign this role.";
  if (args.action === "revoke" && args.role === "super_admin" && args.superAdminCount <= 1) return "The last Super admin can't be removed.";
  return null;
}

/** Leadership that sees every Sales rep and every Account Manager's book. */
export function seesWholeTeam(roles: readonly string[]): boolean {
  return actorRank(roles) >= 70 || roles.includes("admin");
}

/** True when the only authority these roles carry is the view-only Leadership role. */
export function isReadOnlyLeader(roles: readonly string[]): boolean {
  return roles.includes("leadership") && actorRank(roles.filter((r) => r !== "leadership")) === 0
    && !roles.some((r) => ["admin", "operations", "finance", "tax", "legal", "compliance", "fund_administration", "client_success"].includes(r));
}
