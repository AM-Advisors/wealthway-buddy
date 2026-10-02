/**
 * Stage 3A shadow pilot registry. Pure and non-enforcing: nothing here changes
 * who can do what. There is deliberately no "cutover" action anywhere.
 */
import type { ShadowCategory } from "@/lib/authz-shadow";

export type MigrationStatus = "Not Started" | "Shadowing" | "Blocked" | "Ready for Cutover" | "Migrated";

export type PilotPath = {
  area: string;
  file: string;
  endpoint: string;
  legacy: string;
  canonical: string | null;
  /** Set when manual review moved the path out of the "safe" batch. */
  reclassified?: string;
};

/** Areas that may never enter a mechanical shadow batch. */
export const EXCLUDED_AREAS = [
  "client", "fund", "company", "investor", "approval", "money", "banking", "accounting", "tax",
  "compliance", "onboarding", "kyc", "identity", "signing", "closing", "offboarding", "delegation", "staff-privilege",
] as const;

/**
 * The two files still marked "safe" in docs/rbac-stage3-inventory.md after
 * Stage 2.5 were re-inspected for Stage 3A. Neither contains a server-side
 * authorization decision that is both global and free of scoped records, so
 * no path is shadowed yet.
 */
export const STAGE3A_CANDIDATES: PilotPath[] = [
  {
    area: "Navigation",
    file: "src/lib/navigation.ts",
    endpoint: "workspaceLabel / route map (client-side)",
    legacy: "None - maps URLs to workspace labels only",
    canonical: null,
    reclassified: "No authorization decision exists here; nothing to shadow. Route access is enforced by the server resolver (protected/specialized).",
  },
  {
    area: "Staff desk",
    file: "src/components/staff-desk.tsx → staff-portal.functions.ts#getMyDesk",
    endpoint: "getMyDesk",
    legacy: "requireStaff(), then client_assignments filter; showAll only for admin",
    canonical: "clients.view (scoped)",
    reclassified: "Returns client records filtered by staff assignment, and admins can list all clients - client-specific authority. Moved to resource-aware.",
  },
];

/** Stage 3A.1 function-level batch (approved individually; the rest of the file is not in scope). */
export const STAGE3A1_PATHS: (PilotPath & { semanticsClear: boolean; note: string })[] = [
  {
    area: "Operations entry",
    file: "src/lib/operations.functions.ts",
    endpoint: "operations.functions.ts::getOperationsAccess",
    legacy: "admin OR operations platform role",
    canonical: "operations.entry - active, not suspended, holds any Harmonious staff role (platform role or live global assignment)",
    semanticsClear: true,
    note: "Canonical admits the other eight staff roles (legal, compliance, fund administration, tax, finance, client success, executive, super_admin alone); legacy refuses them. Mismatch by design until resolved.",
  },
  {
    area: "Operations team roster",
    file: "src/lib/operations.functions.ts",
    endpoint: "operations.functions.ts::listOperationsTeam",
    legacy: "requireOperations(): admin OR operations platform role",
    canonical: "No roster-view permission exists; compared against operations.entry (gap)",
    semanticsClear: false,
    note: "Permission-model gap: canonical vocabulary can't separate view-roster from manage-staff. Can't be Ready for Cutover.",
  },
];

export type Counts = Record<ShadowCategory, number>;
export const emptyCounts = (): Counts => ({ allow_allow: 0, deny_deny: 0, legacy_allow_rbac_deny: 0, legacy_deny_rbac_allow: 0 });

export function mismatches(c: Counts): number {
  return c.legacy_allow_rbac_deny + c.legacy_deny_rbac_allow;
}

/** Any mismatch blocks; readiness also needs real traffic. Never returns "Migrated" in Stage 3A. */
export function migrationStatus(p: PilotPath & { semanticsClear?: boolean }, c: Counts, minSamples = 50): MigrationStatus {
  if (p.reclassified || !p.canonical) return "Not Started";
  if (mismatches(c) > 0) return "Blocked";
  if (p.semanticsClear === false) return "Shadowing";
  const total = c.allow_allow + c.deny_deny + mismatches(c);
  if (mismatches(c) > 0) return "Blocked";
  if (total === 0) return p.semanticsClear === undefined ? "Not Started" : "Shadowing";
  if (total < minSamples || c.allow_allow === 0 || c.deny_deny === 0) return "Shadowing";
  return "Ready for Cutover";
}

export function isExcluded(tags: string[]): boolean {
  return tags.some((t) => (EXCLUDED_AREAS as readonly string[]).includes(t));
}
