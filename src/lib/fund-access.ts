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

export type FundAccessLevel = "manage" | "view";

export type FundAccess = FundAccessFacts & { sources: string[]; canManage: boolean; canView: boolean };

export function summarizeFundAccess(f: FundAccessFacts): FundAccess {
  const sources = [
    f.staff ? "staff" : null,
    f.manager ? "fund_manager" : null,
    f.clientMember ? "client_member" : null,
    f.teamRole ? (f.teamSource ?? "team") : null,
  ].filter((s): s is string => !!s);
  const canManage = f.staff || f.manager || f.clientMember;
  return { ...f, sources, canManage, canView: canManage || !!f.teamRole };
}

export function allowsFundLevel(a: FundAccess, level: FundAccessLevel): boolean {
  return level === "manage" ? a.canManage : a.canView;
}
