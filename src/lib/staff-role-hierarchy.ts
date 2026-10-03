/**
 * Harmonious leadership & commercial role hierarchy (pure).
 * Decides who may assign which managed role. Server re-checks every change.
 */
export const MANAGED_ROLES = ["super_admin", "executive", "cro", "sales_management", "sales", "account_manager"] as const;
export type ManagedRole = (typeof MANAGED_ROLES)[number];

export const MANAGED_ROLE_LABEL: Record<ManagedRole, string> = {
  super_admin: "Super admin",
  executive: "CEO",
  cro: "CRO",
  sales_management: "Sales management",
  sales: "Sales",
  account_manager: "Account Manager",
};

export const MANAGED_ROLE_SEES: Record<ManagedRole, string> = {
  super_admin: "Everything, including assigning any role",
  executive: "Everything except Super admin; pricing approvals",
  cro: "Sales, Account management and pricing approvals",
  sales_management: "Sales pipeline, the whole Sales team and pricing approvals",
  sales: "Their own pipeline and contacts (commercial data only)",
  account_manager: "Their assigned clients: funds, tasks and health",
};

/** Higher number = more authority. */
export const ROLE_RANK: Record<ManagedRole, number> = {
  super_admin: 100, executive: 90, cro: 80, sales_management: 70, sales: 10, account_manager: 10,
};

/** Roles that need an Individual account classification. */
export const PRIVILEGED_MANAGED: readonly ManagedRole[] = ["super_admin", "executive", "cro", "sales_management"];

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
