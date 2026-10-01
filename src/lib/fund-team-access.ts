/**
 * Fund Team Access — roles a Fund Manager can grant on their own Fund.
 * Pure: role → permissions map and grant-eligibility checks.
 * Sensitive data (bank/wire, tax IDs, KYC evidence) and authority actions
 * (sign, approve, launch, fund, move money, grant access) are never included.
 */
export const FUND_TEAM_ROLES = ["fund_viewer", "fund_assistant"] as const;
export type FundTeamRole = (typeof FUND_TEAM_ROLES)[number];

export const FUND_TEAM_PERMISSIONS = {
  fund_viewer: ["fund.overview.view", "fund.roster.view", "fund.documents.view_approved"],
  fund_assistant: [
    "fund.overview.view",
    "fund.roster.view",
    "fund.documents.view_approved",
    "fund.invitations.prepare",
    "fund.messages.prepare",
  ],
} as const satisfies Record<FundTeamRole, readonly string[]>;

export const NEVER_GRANTABLE = [
  "fund.banking.view",
  "fund.tax_ids.view",
  "fund.kyc.view",
  "fund.sign",
  "fund.approve",
  "fund.launch",
  "fund.money.move",
  "fund.access.grant",
] as const;

export function isFundTeamRole(v: unknown): v is FundTeamRole {
  return typeof v === "string" && (FUND_TEAM_ROLES as readonly string[]).includes(v);
}

export function fundTeamRoleLabel(r: FundTeamRole): string {
  return r === "fund_assistant" ? "Assistant" : "Viewer";
}

export function permissionsFor(role: FundTeamRole): readonly string[] {
  return FUND_TEAM_PERMISSIONS[role];
}

export function hasFundTeamPermission(role: FundTeamRole | null, perm: string): boolean {
  if (!role) return false;
  return (FUND_TEAM_PERMISSIONS[role] as readonly string[]).includes(perm);
}

export type GrantCheckInput = {
  granterIsFundManager: boolean;
  granterUserId: string;
  granterEmail: string | null;
  granteeEmail: string;
  granteeUserId: string | null;
  granteeIsInvestorInFund: boolean;
  role: unknown;
};

/** Returns null when allowed, otherwise a plain-language refusal. */
export function grantRefusal(i: GrantCheckInput): string | null {
  if (!i.granterIsFundManager) return "Only a Fund Manager of this Fund can grant access.";
  if (!isFundTeamRole(i.role)) return "Only Viewer or Assistant access can be granted.";
  const email = i.granteeEmail.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "Enter a valid email address.";
  if (
    (i.granteeUserId && i.granteeUserId === i.granterUserId) ||
    (i.granterEmail && i.granterEmail.toLowerCase() === email)
  )
    return "You can't grant access to yourself.";
  if (i.granteeIsInvestorInFund) return "Investors in this Fund can't be added as team members.";
  return null;
}

export function isGrantLive(g: { status: string; expires_at: string | null }, now = new Date()): boolean {
  if (g.status !== "active") return false;
  if (g.expires_at && new Date(g.expires_at) <= now) return false;
  return true;
}
