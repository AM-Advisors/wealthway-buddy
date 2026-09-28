/**
 * RBAC Stage 2.5 — legacy client role compatibility (pure, dry-run only).
 *
 * The effective behaviour of client_gp / client_readonly today comes from the
 * per-client client_users.client_role value, read by these code paths:
 *  - cap-certificates / founder-cap-table: canEdit (≠ readonly), canApprove/canSign (client_gp ∈ approvers)
 *  - captable.functions setup: non-readonly members may set up their company's cap table
 *  - self-service + client_fund_intakes RLS: non-readonly members may submit requests/intakes
 *  - cap_* RLS: non-readonly members may write; every member may read
 *  - client-intake / client-notify / invoice-delivery: client_gp is a main contact / notice recipient (not authority)
 * No code path lets client_gp manage client users, RBAC, money or sensitive tax/identity data.
 */
import { templateFor, type PermissionKey } from "@/lib/authorize";

export const LEGACY_CLIENT_ACTIONS: Record<"client_gp" | "client_readonly", PermissionKey[]> = {
  client_gp: ["clients.view", "clients.prepare", "companies.view", "companies.edit", "companies.approve", "documents.view"],
  client_readonly: ["clients.view", "companies.view", "documents.view"],
};
export const PROPOSED_TEMPLATE: Record<keyof typeof LEGACY_CLIENT_ACTIONS, string> = {
  client_gp: "client_principal",
  client_readonly: "client_viewer",
};

export const ORPHAN_READONLY = "Legacy client_readonly role has no resolvable client scope.";
export const MANUAL_REVIEW = "MANUAL REVIEW — DO NOT MIGRATE";
export const SAFE_WHEN_APPROVED = "Equivalent — eligible (not migrated in this stage)";

export type DryRunRow = {
  userId: string;
  person: string;
  legacyRole: string;
  currentClient: string | null;
  currentActions: string[];
  proposedRole: string;
  proposedScope: string | null;
  added: string[];
  lost: string[];
  result: string;
  note: string | null;
};

export function dryRun(input: { userId: string; person: string; legacyRole: "client_gp" | "client_readonly"; clients: { id: string; name: string; role: string }[] }): DryRunRow[] {
  const current = LEGACY_CLIENT_ACTIONS[input.legacyRole];
  const tpl = templateFor(PROPOSED_TEMPLATE[input.legacyRole])!;
  // Only clients where the per-client role actually matches the legacy role count as scope.
  const scopes = input.clients.filter((c) => c.role === input.legacyRole);
  const base = { userId: input.userId, person: input.person, legacyRole: input.legacyRole, currentActions: current, proposedRole: tpl.label };
  if (!scopes.length) {
    // No scope → the proposed role would grant nothing: every current action would be lost. Never guess a client.
    return [{ ...base, currentClient: null, proposedScope: null, added: [], lost: [...current], result: MANUAL_REVIEW, note: input.legacyRole === "client_readonly" ? ORPHAN_READONLY : "Legacy role has no resolvable client scope." }];
  }
  return scopes.map((c) => {
    const added = tpl.permissions.filter((x) => !current.includes(x));
    const lost = current.filter((x) => !tpl.permissions.includes(x));
    return { ...base, currentClient: c.name, proposedScope: `client: ${c.name}`, added, lost, result: added.length || lost.length ? MANUAL_REVIEW : SAFE_WHEN_APPROVED, note: null };
  });
}
