/** Who may enter migrated fees, invoices and payments: CEO (executive), CRO and Super Admin. */
export const MIGRATED_BILLING_ROLES = ["executive", "cro", "super_admin"];

export const canEnterMigratedBilling = (roles: string[]) => roles.some((r) => MIGRATED_BILLING_ROLES.includes(r));

/** Second-person rule: whoever recorded the invoice can't also send it to commissions (Super Admins may, with a logged reason). */
export function canPushToCommissions(i: { actorId: string; recordedBy: string | null; isSuperAdmin: boolean }): string | null {
  if (i.recordedBy && i.recordedBy === i.actorId && !i.isSuperAdmin) return "Someone other than the person who entered this invoice must send it to commissions.";
  return null;
}
