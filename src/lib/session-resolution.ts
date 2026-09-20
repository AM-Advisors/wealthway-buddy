/**
 * Pure rules for deciding, after someone signs in, which parts of Harmonious
 * they may enter and where they should land.
 *
 * This file contains no database or network access on purpose: the server
 * gathers the authoritative facts, these rules interpret them, and the browser
 * never decides anything. Signing in establishes identity only — never
 * privilege.
 */

export type StaffAuthorization = {
  /** Explicitly recorded, currently active Harmonious staff authority. */
  active: boolean;
  roles: string[];
};

export type RelationshipFacts = {
  staff: StaffAuthorization;
  /** Funds this person manages, from the fund-manager relationship records. */
  managedFundIds: string[];
  /** Investment profiles (individual, LLC, trust, IRA…) owned by this person. */
  investmentProfileIds: string[];
  /** Positions held across funds. */
  investmentCount: number;
  /** Client organisations this person belongs to as a staff member of the client. */
  clientIds: string[];
  /** Companies whose cap table this person administers. */
  companyIds: string[];
  /** Active, accepted professional delegations naming this person. */
  activeDelegationIds: string[];
  /** Invitations addressed to this person that have not been accepted. */
  pendingInvitationCount: number;
  /** Outstanding onboarding requirements, in the order they must be met. */
  outstandingRequirements: string[];
};

export type WorkspaceKind = "investor" | "fund_manager" | "company" | "professional" | "operations";

export type Workspace = {
  kind: WorkspaceKind;
  /** Stable identifier used by the workspace switcher. */
  id: string;
  label: string;
  /** Where entering this workspace takes you. */
  path: string;
  /** Which application the workspace belongs to. */
  surface: "client" | "ops";
};

/** Harmonious staff authority is never inferred — only explicit active records count. */
export function hasOperationsAccess(facts: RelationshipFacts): boolean {
  return facts.staff.active && facts.staff.roles.length > 0;
}

/**
 * An email address never grants anything. Kept as an explicit, testable rule so
 * nobody reintroduces domain-based promotion.
 */
export function operationsAccessFromEmail(_email: string): false {
  return false;
}

/** Everything this person may legitimately enter, in presentation order. */
export function availableWorkspaces(facts: RelationshipFacts): Workspace[] {
  const list: Workspace[] = [];

  if (facts.investmentProfileIds.length > 0 || facts.investmentCount > 0) {
    list.push({
      kind: "investor",
      id: "investor",
      label: "My investments",
      path: "/dashboard",
      surface: "client",
    });
  }

  if (facts.managedFundIds.length > 0) {
    list.push({
      kind: "fund_manager",
      id: "fund-manager",
      label: "Fund management",
      path: "/manager",
      surface: "client",
    });
  }

  if (facts.clientIds.length > 0 || facts.companyIds.length > 0) {
    list.push({
      kind: "company",
      id: "company",
      label: "My company",
      path: "/client",
      surface: "client",
    });
  }

  if (facts.activeDelegationIds.length > 0) {
    list.push({
      kind: "professional",
      id: "professional",
      label: "Acting for clients",
      path: "/professional",
      surface: "client",
    });
  }

  if (hasOperationsAccess(facts)) {
    list.push({
      kind: "operations",
      id: "operations",
      label: "Harmonious Operations",
      path: "/ops",
      surface: "ops",
    });
  }

  return list;
}

/** The first thing a person should be shown when they arrive with nothing pending. */
export function defaultWorkspace(facts: RelationshipFacts): Workspace | null {
  const list = availableWorkspaces(facts);
  if (list.length === 0) return null;
  // Client work comes first even for staff: Operations is entered deliberately.
  const clientFirst = list.find((w) => w.surface === "client");
  return clientFirst ?? list[0] ?? null;
}

/** Path for the next unmet onboarding requirement, if there is one. */
export function nextRequirementPath(requirements: string[]): string | null {
  const first = requirements[0];
  if (!first) return null;
  const map: Record<string, string> = {
    ACCOUNT: "/auth/register",
    PERSON_PROFILE: "/profile",
    IDENTITY: "/onboarding/kyc",
    KYC: "/onboarding/compliance",
    INVESTMENT_PROFILE: "/profile",
    ENTITY_PROFILE: "/profile",
    KYB: "/onboarding/compliance",
    BENEFICIAL_OWNERS: "/profile",
    CONTROL_PERSONS: "/profile",
    TAX: "/onboarding/documents",
    ACCREDITATION: "/onboarding/accreditation",
    QUESTIONNAIRE: "/subscription",
    SUBSCRIPTION: "/subscription",
    SIGNATURE: "/subscription",
    FUNDING: "/onboarding/funding",
  };
  return map[first] ?? "/dashboard";
}

/**
 * The single answer to "where does this person go now?".
 *
 * Order: an intended destination they were sent to, then an outstanding
 * requirement, then their default workspace, then onboarding.
 */
export function resolveDestination(
  facts: RelationshipFacts,
  intended?: string | null,
): { path: string; reason: "intended" | "requirement" | "workspace" | "onboarding" } {
  if (intended && intended.startsWith("/") && !intended.startsWith("//")) {
    return { path: intended, reason: "intended" };
  }
  const requirement = nextRequirementPath(facts.outstandingRequirements);
  if (requirement) return { path: requirement, reason: "requirement" };
  const workspace = defaultWorkspace(facts);
  if (workspace) return { path: workspace.path, reason: "workspace" };
  return { path: "/onboarding/kyc", reason: "onboarding" };
}

/** Whether a requested workspace may be entered. Used on every workspace switch. */
export function canEnterWorkspace(facts: RelationshipFacts, workspaceId: string): boolean {
  return availableWorkspaces(facts).some((w) => w.id === workspaceId);
}

/** Progress for the "Complete your setup" card on the client home page. */
export function setupProgress(
  completed: string[],
  outstanding: string[],
): { completed: string[]; outstanding: string[]; percent: number; next: string | null } {
  const total = completed.length + outstanding.length;
  const percent = total === 0 ? 100 : Math.round((completed.length / total) * 100);
  return { completed, outstanding, percent, next: outstanding[0] ?? null };
}

/** An empty fact set — the safe default when nothing is known about a person. */
export function emptyFacts(): RelationshipFacts {
  return {
    staff: { active: false, roles: [] },
    managedFundIds: [],
    investmentProfileIds: [],
    investmentCount: 0,
    clientIds: [],
    companyIds: [],
    activeDelegationIds: [],
    pendingInvitationCount: 0,
    outstandingRequirements: [],
  };
}
