/** Who may confirm a paid service level after payment is received. */
export const UPGRADE_ROLES = ["finance", "executive", "cro", "super_admin"];
export const canUpgradeServiceLevel = (roles: string[]) => roles.some((r) => UPGRADE_ROLES.includes(r));
