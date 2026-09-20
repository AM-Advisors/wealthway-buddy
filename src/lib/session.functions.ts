import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { safeInternalPath } from "@/lib/app-origins";
import {
  availableWorkspaces,
  canEnterWorkspace,
  emptyFacts,
  hasOperationsAccess,
  resolveDestination,
  type RelationshipFacts,
} from "@/lib/session-resolution";

/** Harmonious internal roles. Membership here is the only route into Operations. */
const STAFF_ROLES = [
  "admin",
  "super_admin",
  "operations",
  "legal",
  "compliance",
  "fund_administration",
  "tax",
  "finance",
  "client_success",
  "executive",
];

/**
 * Reads the authoritative relationship records for the signed-in person.
 * Every fact comes from a record someone deliberately created — nothing is
 * inferred from the email address, the hostname or anything the browser sent.
 */
async function gatherFacts(context: any): Promise<RelationshipFacts & { email: string; name: string }> {
  const { supabase, userId } = context;
  const facts = emptyFacts();

  const [
    roles,
    profile,
    managed,
    profiles,
    positions,
    clientMemberships,
    capAccess,
    delegations,
  ] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase.from("profiles").select("legal_name, email").eq("user_id", userId).maybeSingle(),
    supabase.from("fund_managers").select("offering_id").eq("user_id", userId),
    supabase.from("investment_profiles").select("id").eq("owner_user_id", userId),
    supabase.from("investor_positions").select("id").eq("investor_user_id", userId),
    supabase.from("client_users").select("client_id").eq("user_id", userId),
    supabase.from("cap_holder_access").select("client_id, revoked_at").eq("user_id", userId),
    supabase
      .from("delegations")
      .select("id, status, acceptance_state")
      .eq("delegate_user_id", userId)
      .eq("status", "active"),
  ]);

  const roleList = ((roles.data ?? []) as any[]).map((r) => String(r.role));
  const staffRoles = roleList.filter((r) => STAFF_ROLES.includes(r));
  facts.staff = { active: staffRoles.length > 0, roles: staffRoles };
  facts.managedFundIds = ((managed.data ?? []) as any[]).map((r) => String(r.offering_id));
  facts.investmentProfileIds = ((profiles.data ?? []) as any[]).map((r) => String(r.id));
  facts.investmentCount = ((positions.data ?? []) as any[]).length;
  facts.clientIds = ((clientMemberships.data ?? []) as any[]).map((r) => String(r.client_id));
  facts.companyIds = ((capAccess.data ?? []) as any[])
    .filter((r) => !r.revoked_at)
    .map((r) => String(r.client_id));
  facts.activeDelegationIds = ((delegations.data ?? []) as any[])
    .filter((d) => d.acceptance_state === "accepted" || d.acceptance_state === "not_required")
    .map((d) => String(d.id));

  const email =
    ((profile.data as any)?.email as string | undefined) ??
    ((context.claims as any)?.email as string | undefined) ??
    "";

  if (email) {
    const { data: invites } = await supabase
      .from("fund_invitations")
      .select("id, accepted_at, status")
      .eq("email", email.toLowerCase())
      .is("accepted_at", null);
    facts.pendingInvitationCount = ((invites ?? []) as any[]).filter(
      (i) => i.status !== "revoked" && i.status !== "expired",
    ).length;
  }

  // Outstanding onboarding requirements come from the authoritative onboarding
  // record, never from anything held in the browser.
  const { data: onboarding } = await supabase
    .from("investor_onboardings")
    .select("id, stage, closed_at")
    .eq("investor_user_id", userId)
    .is("closed_at", null)
    .limit(1);
  if (!onboarding || onboarding.length === 0) {
    const { data: application } = await supabase
      .from("investor_applications")
      .select("id, kyc_status, accreditation_status")
      .eq("user_id", userId)
      .limit(1);
    const first = ((application ?? []) as any[])[0];
    if (first) {
      if (first.kyc_status !== "approved") facts.outstandingRequirements.push("KYC");
      if (first.accreditation_status !== "approved")
        facts.outstandingRequirements.push("ACCREDITATION");
    }
  }

  return {
    ...facts,
    email,
    name: ((profile.data as any)?.legal_name as string | undefined) || email,
  };
}

/**
 * The one answer to "who is this, what may they enter, and where do they go?".
 * Every sign-in page and the workspace switcher call this; none of them decide
 * anything themselves.
 */
export const resolveSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { intended?: string | null } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    const facts = await gatherFacts(context);
    const intended = data.intended ? safeInternalPath(data.intended, "") : "";
    const workspaces = availableWorkspaces(facts);
    const destination = resolveDestination(facts, intended || null);

    return {
      person: { userId: context.userId, name: facts.name, email: facts.email },
      operations: hasOperationsAccess(facts),
      staffRoles: facts.staff.roles,
      workspaces,
      pendingInvitations: facts.pendingInvitationCount,
      outstandingRequirements: facts.outstandingRequirements,
      destination: destination.path,
      destinationReason: destination.reason,
    };
  });

/**
 * Switching workspace re-resolves authority on the server. The identifier the
 * browser sends is checked against the person's real relationships, so changing
 * it by hand cannot grant access to anything.
 */
export const enterWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { workspaceId: string }) => {
    if (!input?.workspaceId) throw new Error("Choose a workspace.");
    return { workspaceId: String(input.workspaceId) };
  })
  .handler(async ({ data, context }) => {
    const facts = await gatherFacts(context);
    if (!canEnterWorkspace(facts, data.workspaceId)) {
      throw new Error("You don't have access to that workspace.");
    }
    const workspace = availableWorkspaces(facts).find((w) => w.id === data.workspaceId)!;
    return { path: workspace.path, surface: workspace.surface, label: workspace.label };
  });
