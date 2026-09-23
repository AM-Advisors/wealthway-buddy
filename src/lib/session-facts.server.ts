/**
 * The single place that reads who a signed-in person is and which
 * relationships they hold. Every workspace, Operations and professional
 * answer in the application is a projection of these facts.
 *
 * Rules:
 *  - facts come only from records someone deliberately created;
 *  - nothing is inferred from the email address, hostname or browser;
 *  - nothing is cached — each request re-reads, so revocation, deactivation
 *    and expiry take effect on the very next request.
 */
import { emptyFacts, type RelationshipFacts } from "@/lib/session-resolution";
import { capabilitiesFor, hasOperationsEntry, OPS_STAFF_ROLES, type OpsCapability } from "@/lib/ops-capabilities";

export type ProfessionalMembershipFact = {
  id: string;
  organizationId: string;
  organizationName: string | null;
  organizationType: string | null;
  seatRole: string;
  status: string;
};

export type DelegationFact = {
  id: string;
  principalUserId: string;
  organizationId: string | null;
  status: string;
  acceptanceState: string | null;
  scopeType: string | null;
  scopeId: string | null;
  authorityLevel: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  /** status active, not revoked and not past its expiry. */
  current: boolean;
  /** current AND accepted (or acceptance not required) — usable authority. */
  usable: boolean;
};

export type StaffFacts = {
  /** Every role record the person holds (including non-staff roles). */
  roles: string[];
  /** Harmonious internal roles only. */
  staffRoles: string[];
  operationsEntry: boolean;
  /** Granular Operations capabilities — never collapsed into a boolean. */
  capabilities: OpsCapability[];
};

export type CanonicalFacts = RelationshipFacts & {
  userId: string;
  email: string;
  name: string;
  roles: string[];
  operations: StaffFacts;
  investorPositionIds: string[];
  professionalMemberships: ProfessionalMembershipFact[];
  /** Every delegation naming this person as delegate, with full detail. */
  delegations: DelegationFact[];
};

const ok = (d: string | null | undefined) => d === "accepted" || d === "not_required";

export function delegationFact(row: any, now = Date.now()): DelegationFact {
  const expired = row.expires_at ? new Date(row.expires_at).getTime() <= now : false;
  // Same rule canAct applies: a delegation that has not yet taken effect is not current.
  const notYetEffective = row.effective_at ? new Date(row.effective_at).getTime() > now : false;
  const current = row.status === "active" && !row.revoked_at && !expired && !notYetEffective;
  return {
    id: String(row.id),
    principalUserId: String(row.principal_user_id ?? ""),
    organizationId: row.organization_id ?? null,
    status: String(row.status),
    acceptanceState: row.acceptance_state ?? null,
    scopeType: row.scope_type ?? null,
    scopeId: row.scope_id ?? null,
    authorityLevel: row.authority_level ?? null,
    expiresAt: row.expires_at ?? null,
    revokedAt: row.revoked_at ?? null,
    current,
    usable: current && ok(row.acceptance_state),
  };
}

export function staffFactsFromRoles(roles: string[]): StaffFacts {
  const entry = hasOperationsEntry(roles);
  return {
    roles,
    staffRoles: roles.filter((r) => (OPS_STAFF_ROLES as readonly string[]).includes(r)),
    operationsEntry: entry,
    capabilities: entry ? capabilitiesFor(roles) : [],
  };
}

/** Staff facts alone (one query) — for per-request Operations guards. */
export async function gatherStaffFacts(context: any): Promise<StaffFacts> {
  const { data } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  return staffFactsFromRoles(((data ?? []) as any[]).map((r) => String(r.role)));
}

/** Identity alone (one query) — for callers that only need name/email. */
export async function gatherPersonFacts(context: any) {
  const { data } = await context.supabase
    .from("profiles")
    .select("legal_name, email")
    .eq("user_id", context.userId)
    .maybeSingle();
  return data as { legal_name: string | null; email: string | null } | null;
}

const rows = (r: any) => ((r?.data ?? []) as any[]);

/** The full canonical fact set. Independent reads run concurrently. */
export async function gatherFacts(context: any): Promise<CanonicalFacts> {
  const { supabase, userId } = context;
  const facts = emptyFacts();

  const [roles, profile, managed, profiles, positions, clientMemberships, capAccess, delegations, memberships, onboarding] =
    await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("profiles").select("legal_name, email").eq("user_id", userId).maybeSingle(),
      supabase.from("fund_managers").select("offering_id").eq("user_id", userId),
      supabase.from("investment_profiles").select("id").eq("owner_user_id", userId),
      supabase.from("investor_positions").select("id").eq("investor_user_id", userId),
      supabase.from("client_users").select("client_id").eq("user_id", userId),
      supabase.from("cap_holder_access").select("client_id, revoked_at").eq("user_id", userId),
      supabase
        .from("delegations")
        .select(
          "id, principal_user_id, organization_id, status, acceptance_state, scope_type, scope_id, authority_level, effective_at, expires_at, revoked_at",
        )
        .eq("delegate_user_id", userId),
      supabase
        .from("professional_memberships")
        .select("id, organization_id, seat_role, status, professional_organizations(name, org_type)")
        .eq("user_id", userId),
      supabase
        .from("investor_onboardings")
        .select("id, stage, closed_at")
        .eq("investor_user_id", userId)
        .is("closed_at", null)
        .limit(1),
    ]);

  const roleList = rows(roles).map((r) => String(r.role));
  const operations = staffFactsFromRoles(roleList);
  facts.staff = { active: operations.operationsEntry, roles: operations.staffRoles };
  facts.managedFundIds = rows(managed).map((r) => String(r.offering_id));
  facts.investmentProfileIds = rows(profiles).map((r) => String(r.id));
  const investorPositionIds = rows(positions).map((r) => String(r.id));
  facts.investmentCount = investorPositionIds.length;
  facts.clientIds = rows(clientMemberships).map((r) => String(r.client_id));
  facts.companyIds = rows(capAccess)
    .filter((r) => !r.revoked_at)
    .map((r) => String(r.client_id));
  const delegationFacts = rows(delegations).map((d) => delegationFact(d));
  facts.activeDelegationIds = delegationFacts.filter((d) => d.usable).map((d) => d.id);

  const professionalMemberships: ProfessionalMembershipFact[] = rows(memberships).map((m) => ({
    id: String(m.id),
    organizationId: String(m.organization_id),
    organizationName: m.professional_organizations?.name ?? null,
    organizationType: m.professional_organizations?.org_type ?? null,
    seatRole: String(m.seat_role),
    status: String(m.status),
  }));

  const email =
    ((profile?.data as any)?.email as string | undefined) ??
    ((context.claims as any)?.email as string | undefined) ??
    "";

  // Dependent reads: invitations need the email; the application fallback is
  // only consulted when no open onboarding record exists.
  const needApplication = rows(onboarding).length === 0;
  const [invites, application] = await Promise.all([
    email
      ? supabase
          .from("fund_invitations")
          .select("id, accepted_at, status")
          .eq("email", email.toLowerCase())
          .is("accepted_at", null)
      : Promise.resolve({ data: [] }),
    needApplication
      ? supabase
          .from("investor_applications")
          .select("id, kyc_status, accreditation_status")
          .eq("user_id", userId)
          .limit(1)
      : Promise.resolve({ data: [] }),
  ]);
  facts.pendingInvitationCount = rows(invites).filter(
    (i) => i.status !== "revoked" && i.status !== "expired",
  ).length;
  const first = rows(application)[0];
  if (first) {
    if (first.kyc_status !== "approved") facts.outstandingRequirements.push("KYC");
    if (first.accreditation_status !== "approved") facts.outstandingRequirements.push("ACCREDITATION");
  }

  return {
    ...facts,
    userId,
    email,
    name: ((profile?.data as any)?.legal_name as string | undefined) || email,
    roles: roleList,
    operations,
    investorPositionIds,
    professionalMemberships,
    delegations: delegationFacts,
  };
}

/* ---------------- Projections for compatibility callers ---------------- */

export type AttentionKind = "investor" | "fund_manager" | "company" | "professional" | "operations";

/** Action Center workspace kinds, in the same order the old probe returned. */
export function attentionWorkspaces(f: CanonicalFacts): AttentionKind[] {
  const list: AttentionKind[] = [];
  if (f.investmentProfileIds.length > 0 || f.investmentCount > 0) list.push("investor");
  if (f.managedFundIds.length > 0) list.push("fund_manager");
  if (f.clientIds.length > 0 || f.companyIds.length > 0) list.push("company");
  // Pending acceptances still open the professional Action Center (to show the
  // acceptance request); expired or revoked delegations do not.
  if (f.delegations.some((d) => d.current)) list.push("professional");
  if (f.operations.operationsEntry) list.push("operations");
  return list;
}

export function adminAccessProjection(f: CanonicalFacts) {
  const isAdmin = f.roles.includes("admin");
  const isFundManager = f.roles.includes("fund_manager");
  const offeringIds = isFundManager && !isAdmin ? f.managedFundIds : [];
  return { isAdmin, isFundManager, isReviewer: isAdmin || isFundManager, offeringIds };
}

export function operationsAccessProjection(s: StaffFacts) {
  const isAdmin = s.roles.includes("admin");
  const isOperations = s.roles.includes("operations");
  return { isAdmin, isOperations, allowed: isAdmin || isOperations };
}

/**
 * Professional STANDING (may this person open the professional workspace?) is
 * deliberately separate from AUTHORITY to act for a client (canAct, per
 * resource). Standing = an active firm seat, or a current delegation — current
 * includes one still awaiting acceptance, because the delegate must be able to
 * open the workspace to accept it. Such a delegation authorizes nothing: it is
 * not counted in `usableDelegations` and canAct refuses it.
 *
 * Stage 3 change: expired, revoked and not-yet-effective delegations whose
 * status column still reads "active" no longer confer standing.
 */
export function professionalStandingProjection(f: CanonicalFacts) {
  const current = f.delegations.filter((d) => d.current);
  return {
    isProfessional: f.professionalMemberships.some((m) => m.status === "active") || current.length > 0,
    memberships: f.professionalMemberships,
    activeDelegations: current.length,
    usableDelegations: current.filter((d) => d.usable).length,
    awaitingAcceptance: current.filter((d) => !d.usable).length,
  };
}
