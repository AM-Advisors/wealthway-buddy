/**
 * One fund access answer built from every access list: staff roles, fund managers,
 * active client members, and live fund team access (grants, listed team, fund-only contacts, view-only company members).
 * Pure. Callers pick the level they need; nothing here widens what an existing check allowed.
 */
export type FundAccessFacts = {
  staff: boolean;
  manager: boolean;
  clientMember: boolean;
  teamRole: string | null;
  teamSource: string | null;
};

/**
 * - "manager": fund operations staff or a listed manager of this exact fund (no client-wide membership).
 * - "manage": "manager" plus active members of the fund's client.
 * - "view": "manage" plus people with live fund team access.
 */
export type FundAccessLevel = "manager" | "manage" | "view";

export type FundAccess = FundAccessFacts & { sources: string[]; isFundManager: boolean; canManage: boolean; canView: boolean };

export function summarizeFundAccess(f: FundAccessFacts): FundAccess {
  const sources = [
    f.staff ? "staff" : null,
    f.manager ? "fund_manager" : null,
    f.clientMember ? "client_member" : null,
    f.teamRole ? (f.teamSource ?? "team") : null,
  ].filter((s): s is string => !!s);
  const isFundManager = f.staff || f.manager;
  const canManage = isFundManager || f.clientMember;
  return { ...f, sources, isFundManager, canManage, canView: canManage || !!f.teamRole };
}

export function allowsFundLevel(a: FundAccess, level: FundAccessLevel): boolean {
  if (level === "manager") return a.isFundManager;
  return level === "manage" ? a.canManage : a.canView;
}

/**
 * Same answer from the fund's own lists only (manager list, active client members, live team access), ignoring staff roles.
 * For screens whose staff rule is a purpose-specific list (money, tax, admin-only): they keep that list and ask this for everyone else.
 */
export function allowsFundMembership(a: FundAccessFacts, level: FundAccessLevel): boolean {
  return allowsFundLevel(summarizeFundAccess({ ...a, staff: false }), level);
}
