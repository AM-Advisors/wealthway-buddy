/**
 * Who passes the portal "you were invited" hold screen. Display gate only:
 * every page still checks access on the server. Exact relationship rows only,
 * never email guesses.
 */
export type PortalAccessFacts = {
  roles: readonly string[];
  fundAccessRows: number;
  applications: number;
  /** Active client memberships (e.g. view-only access from a listed contact). */
  clientMemberships: number;
  /** Login-linked, not-removed entries on a fund's Team page. */
  fundTeamEntries: number;
  /** Active Fund Team Access grants to this login. */
  sharedFundGrants: number;
  /** Exact-email, live paperwork helper/contact assignments, never fund-wide authority. */
  participantAssignments?: number;
};

export function portalAllowed(f: PortalAccessFacts): boolean {
  return f.roles.length > 0 || f.fundAccessRows > 0 || f.applications > 0
    || f.clientMemberships > 0 || f.fundTeamEntries > 0 || f.sharedFundGrants > 0 || (f.participantAssignments ?? 0) > 0;
}
