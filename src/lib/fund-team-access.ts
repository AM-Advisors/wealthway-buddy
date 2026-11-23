/**
 * Fund Team Access - roles a Fund Manager can grant on their own Fund.
 * Pure: role → permissions map and grant-eligibility checks.
 * Sensitive data (bank/wire, tax IDs, KYC evidence) and authority actions
 * (sign, approve, launch, fund, move money, grant access) are never included.
 */
export const FUND_TEAM_ROLES = ["fund_viewer", "fund_assistant", "fund_reviewer"] as const;
export type FundTeamRole = (typeof FUND_TEAM_ROLES)[number];

/** Grant breadth. Scope grants resolve against current funds at read time, so new funds are auto-included. */
export const FUND_TEAM_SCOPES = ["fund", "all_managed", "all_funds"] as const;
export type FundTeamScope = (typeof FUND_TEAM_SCOPES)[number];

export function isFundTeamScope(v: unknown): v is FundTeamScope {
  return typeof v === "string" && (FUND_TEAM_SCOPES as readonly string[]).includes(v);
}

export function fundTeamScopeLabel(s: FundTeamScope): string {
  return s === "all_funds" ? "All funds" : s === "all_managed" ? "All funds they manage" : "This fund";
}

export const FUND_TEAM_PERMISSIONS = {
  fund_reviewer: ["fund.overview.view", "fund.roster.view", "fund.documents.view_approved", "fund.routine.prepare", "fund.routine.approve"],
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
  return r === "fund_reviewer" ? "Routine reviewer" : r === "fund_assistant" ? "Assistant" : "Viewer";
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
  granterIsStaff?: boolean;
  granterUserId: string;
  granterEmail: string | null;
  granteeEmail: string;
  granteeUserId: string | null;
  granteeIsInvestorInFund: boolean;
  role: unknown;
  scope?: unknown;
};

/** Scope-specific refusal: all_funds is staff-only; all_managed needs a fund manager. */
export function scopeRefusal(scope: unknown, granterIsFundManager: boolean, granterIsStaff: boolean): string | null {
  const s = scope ?? "fund";
  if (!isFundTeamScope(s)) return "Unknown access scope.";
  if (s === "all_funds" && !granterIsStaff) return "Only Harmonious staff can grant access to all funds.";
  if (s === "all_managed" && !granterIsFundManager) return "Only a Fund Manager can grant access to all funds they manage.";
  return null;
}

/** Returns null when allowed, otherwise a plain-language refusal. */
export function grantRefusal(i: GrantCheckInput): string | null {
  if (!i.granterIsFundManager && !i.granterIsStaff) return "Only a Fund Manager of this Fund can grant access.";
  const sr = scopeRefusal(i.scope, i.granterIsFundManager, !!i.granterIsStaff);
  if (sr) return sr;
  if (!isFundTeamRole(i.role)) return "Only Viewer or Assistant or Routine reviewer access can be granted.";
  if (i.role === "fund_reviewer" && (i.scope ?? "fund") !== "fund") return "Routine reviewer access must be designated for this fund only.";
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

/**
 * A person listed on a fund's Team page, whose entry is linked to their own
 * confirmed login, sees that exact fund as a Viewer (overview, roster, approved
 * documents). Never banking, tax IDs, identity evidence or any authority.
 */
/**
 * A company contact created from one fund's screen (initial contact, signer, fund invite)
 * sees only that fund, as a Viewer. Company-wide contacts give nothing here.
 */
export function fundScopedContactFund(
  row: { user_id?: string | null; status?: string | null; deactivated_at?: string | null; added_for_offering_id?: string | null },
  userId: string,
): string | null {
  if (!userId || row.user_id !== userId || row.deactivated_at || row.status !== "active") return null;
  return row.added_for_offering_id ?? null;
}

export function listedTeamViewerRole(
  row: { user_id?: string | null; removed_at?: string | null; permissions?: readonly string[] | null },
  userId: string,
): FundTeamRole | null {
  if (!userId || row.user_id !== userId || row.removed_at) return null;
  return (row.permissions ?? []).includes("view") ? "fund_viewer" : null;
}

/**
 * View-only company members (client_readonly, not revoked) see each of that company's funds as a Viewer.
 * Pure: memberships of this login and the funds with their owning company.
 */
export function companyViewerFunds(
  memberships: readonly { client_id?: string | null; client_role?: string | null; revoked_at?: string | null }[],
  funds: readonly { id: string; client_id?: string | null }[],
): string[] {
  const viewerClients = new Set(
    memberships.filter((m) => m.client_id && !m.revoked_at && m.client_role === "client_readonly").map((m) => m.client_id as string),
  );
  return funds.filter((f) => f.client_id && viewerClients.has(f.client_id)).map((f) => f.id);
}

export type FundOpenMode = "workspace" | "viewer";

/**
 * Which page opens a fund. Managers, staff and anyone with a broader company role keep the full fund page;
 * someone whose only access to this fund is view-only opens the simple viewer page.
 * Assistants and routine reviewers keep their existing paths.
 */
export function fundOpenMode(f: {
  isManager: boolean;
  isStaff: boolean;
  companyRolesForFund: readonly string[];
  sharedRole: FundTeamRole | null;
}): FundOpenMode {
  if (f.isManager || f.isStaff) return "workspace";
  if (f.companyRolesForFund.some((r) => r !== "client_readonly")) return "workspace";
  return f.sharedRole === "fund_viewer" ? "viewer" : "workspace";
}

/**
 * A listed fund team member whose own login-linked entry has "Manage investors"
 * may add investors, copy the fund's onboarding link and send investor invitations
 * on that exact fund. Never edits, removals, approvals, signing, banking or money.
 */
export function listedTeamManagesInvestors(
  row: { user_id?: string | null; removed_at?: string | null; permissions?: readonly string[] | null },
  userId: string,
): boolean {
  if (!userId || row.user_id !== userId || row.removed_at) return false;
  return (row.permissions ?? []).includes("investors");
}
