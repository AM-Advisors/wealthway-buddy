/**
 * Server-only authorization for reviewer (admin + fund manager) writes.
 *
 * Fund managers are read-only at the database level. Every legitimate mutation
 * therefore runs with the privileged client, but only after this module has
 * independently resolved the target record server-side and confirmed the caller
 * is allowed to act on the fund that record actually belongs to. Nothing here
 * trusts an offering, application, payment or invitation id sent by the browser.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ReviewerScope = { isAdmin: boolean; offeringIds: string[] };

/** Roles that may be handed out through the fund invitation workflow. */
export const INVITABLE_ROLES = ["investor", "fund_manager"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export function assertInvitableRole(role: unknown): InvitableRole {
  if (typeof role !== "string" || !INVITABLE_ROLES.includes(role as InvitableRole)) {
    throw new Error("Only investors and fund managers can be invited to a fund.");
  }
  return role as InvitableRole;
}

/** The caller's authoritative reviewer scope, read server-side from user_roles. */
export async function reviewerScope(userId: string): Promise<ReviewerScope> {
  const { data: roles, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const list = ((roles ?? []) as { role: string }[]).map((r) => r.role);
  const isAdmin = list.includes("admin");
  const isManager = list.includes("fund_manager");
  if (!isAdmin && !isManager) throw new Error("Forbidden: reviewer access required.");

  if (isAdmin) return { isAdmin: true, offeringIds: [] };

  const { data: assignments } = await supabaseAdmin
    .from("fund_managers")
    .select("offering_id")
    .eq("user_id", userId);
  const offeringIds = [
    ...new Set(((assignments ?? []) as { offering_id: string }[]).map((a) => a.offering_id)),
  ];
  if (offeringIds.length === 0) throw new Error("Forbidden: you do not manage any funds.");
  return { isAdmin: false, offeringIds };
}

export function assertScopeAllows(scope: ReviewerScope, offeringId: string | null | undefined) {
  if (scope.isAdmin) return;
  if (!offeringId || !scope.offeringIds.includes(offeringId)) {
    throw new Error("Forbidden: you do not manage that fund.");
  }
}

/** Authorize an action against one fund. Returns the privileged client to write with. */
export async function authorizeOffering(userId: string, offeringId: string) {
  const scope = await reviewerScope(userId);
  assertScopeAllows(scope, offeringId);
  return { scope, db: supabaseAdmin, offeringId };
}

/** Resolve an application server-side and authorize the caller against its real fund. */
export async function authorizeApplication(userId: string, applicationId: string) {
  const scope = await reviewerScope(userId);
  const { data: application, error } = await supabaseAdmin
    .from("investor_applications")
    .select("id, user_id, offering_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!application) throw new Error("Application not found.");
  assertScopeAllows(scope, (application as { offering_id: string }).offering_id);
  return {
    scope,
    db: supabaseAdmin,
    application: application as { id: string; user_id: string; offering_id: string },
    offeringId: (application as { offering_id: string }).offering_id,
  };
}

/** Resolve a payment through its application and authorize against that fund. */
export async function authorizePayment(userId: string, paymentId: string) {
  const { data: payment, error } = await supabaseAdmin
    .from("payments")
    .select("id, application_id, status, amount_cents")
    .eq("id", paymentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!payment) throw new Error("Payment not found.");
  const authz = await authorizeApplication(
    userId,
    (payment as { application_id: string }).application_id,
  );
  return { ...authz, payment: payment as Record<string, unknown> };
}

/** Resolve an invitation server-side and authorize against the fund it belongs to. */
export async function authorizeInvitation(userId: string, invitationId: string) {
  const { data: invitation, error } = await supabaseAdmin
    .from("fund_invitations")
    .select("id, offering_id, email, invited_name, role, status, accepted_by")
    .eq("id", invitationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!invitation) throw new Error("Invitation not found.");
  const scope = await reviewerScope(userId);
  assertScopeAllows(scope, (invitation as { offering_id: string }).offering_id);
  return { scope, db: supabaseAdmin, invitation: invitation as Record<string, any> };
}

/** Audit trail entry for every fund access grant or removal. */
export async function logAccessChange(input: {
  actorId: string;
  offeringId: string;
  targetUserId: string | null;
  role: InvitableRole;
  action: "granted" | "removed";
  detail?: string | null;
}) {
  await supabaseAdmin.from("reviewer_activity").insert({
    actor_id: input.actorId,
    offering_id: input.offeringId,
    action: input.action === "granted" ? "fund_access_granted" : "fund_access_removed",
    area: "access",
    outcome: input.action === "granted" ? "approved" : "declined",
    summary:
      input.action === "granted"
        ? `Fund access granted as ${input.role === "fund_manager" ? "fund manager" : "investor"}`
        : `Fund access removed (${input.role === "fund_manager" ? "fund manager" : "investor"})`,
    note: input.detail ?? null,
    metadata: { target_user_id: input.targetUserId, role: input.role },
  });
}
