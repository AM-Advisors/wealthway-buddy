export type InviteState = "not_invited" | "invited" | "active";

export type DirectoryRow = {
  key: string;
  email: string;
  name: string;
  companies: string[];
  clientIds: string[];
  assignments: { id: string; name: string; role: string }[];
  invite: InviteState;
  verified: boolean;
  contactId?: string;
};

export const DEFAULT_TEAM_PERMISSIONS = ["view", "edit", "documents", "investors"];

export const INVITE_LABEL: Record<InviteState, string> = { not_invited: "Not invited", invited: "Invited", active: "Active" };

export function filterDirectory(rows: DirectoryRow[], q: string, clientId: string, status: string): DirectoryRow[] {
  const needle = q.trim().toLowerCase();
  return rows.filter((r) =>
    (!needle || r.name.toLowerCase().includes(needle) || r.email.includes(needle) || r.companies.some((c) => c.toLowerCase().includes(needle))
      || r.assignments.some((a) => a.name.toLowerCase().includes(needle)))
    && (clientId === "all" || r.clientIds.includes(clientId))
    && (status === "all" || r.invite === status));
}
