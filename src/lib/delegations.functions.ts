/**
 * Controlled server workflows for professional organizations, memberships and
 * delegations. Ordinary signed-in people can read their own rows through RLS,
 * but every create / change / revoke happens here, after the caller's authority
 * has been re-established server-side, and every change is written to the
 * delegation audit trail.
 *
 * Phase 1: these workflows exist and are tested, but no production screen grants
 * proxy access through them yet.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  AUTHORITY_LEVELS,
  DELEGATION_CAPABILITIES,
  MEMBERSHIP_STATUSES,
  PROFESSIONAL_ORG_TYPES,
  SCOPE_TYPES,
  capabilityAllowedAtAuthority,
  type AuthorityLevel,
  type DelegationCapability,
} from "@/lib/delegation-model";

async function isStaff(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = ((data ?? []) as { role: string }[]).map((r) => r.role);
  return roles.some((r) =>
    ["admin", "super_admin", "operations", "compliance", "legal"].includes(r),
  );
}

async function assertStaff(supabase: any, userId: string) {
  if (!(await isStaff(supabase, userId))) {
    throw new Error("Forbidden: staff access required.");
  }
}

const orgSchema = z.object({
  name: z.string().trim().min(2).max(200),
  legal_name: z.string().trim().max(200).optional().or(z.literal("")),
  org_type: z.enum(PROFESSIONAL_ORG_TYPES),
  website: z.string().trim().max(300).optional().or(z.literal("")),
  jurisdiction: z.string().trim().max(120).optional().or(z.literal("")),
});

/** Create a professional firm. Staff only — a firm is never self-serve. */
export const createProfessionalOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => orgSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { recordDelegationAudit } = await import("@/lib/delegated-access.server");

    const { data: org, error } = await (supabaseAdmin as any)
      .from("professional_organizations")
      .insert({
        name: data.name,
        legal_name: data.legal_name || null,
        org_type: data.org_type,
        website: data.website || null,
        jurisdiction: data.jurisdiction || null,
        created_by: userId,
      })
      .select("id, name, org_type")
      .maybeSingle();
    if (error) throw new Error(error.message);

    await recordDelegationAudit({
      actorUserId: userId,
      action: "organization_created",
      organizationId: org.id,
      after: org,
    });
    return org;
  });

const membershipSchema = z.object({
  organization_id: z.string().uuid(),
  user_id: z.string().uuid(),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  seat_role: z.string().trim().max(60).default("member"),
});

/** Seat someone at a firm. Membership by itself grants no client access. */
export const inviteOrganizationMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => membershipSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { recordDelegationAudit } = await import("@/lib/delegated-access.server");

    const { data: membership, error } = await (supabaseAdmin as any)
      .from("professional_memberships")
      .upsert(
        {
          organization_id: data.organization_id,
          user_id: data.user_id,
          email: data.email || null,
          seat_role: data.seat_role,
          status: "invited",
          invited_by: userId,
        },
        { onConflict: "organization_id,user_id" },
      )
      .select("id, organization_id, user_id, status")
      .maybeSingle();
    if (error) throw new Error(error.message);

    await recordDelegationAudit({
      actorUserId: userId,
      action: "membership_invited",
      organizationId: data.organization_id,
      membershipId: membership?.id ?? null,
      delegateUserId: data.user_id,
      after: membership,
    });
    return membership;
  });

const membershipStatusSchema = z.object({
  membership_id: z.string().uuid(),
  status: z.enum(MEMBERSHIP_STATUSES),
});

/** Activate, suspend or remove a seat. History is kept, never hard-deleted. */
export const setMembershipStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => membershipStatusSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { recordDelegationAudit } = await import("@/lib/delegated-access.server");

    const { data: before } = await (supabaseAdmin as any)
      .from("professional_memberships")
      .select("id, organization_id, user_id, status")
      .eq("id", data.membership_id)
      .maybeSingle();
    if (!before) throw new Error("Membership not found.");

    const stamp = new Date().toISOString();
    const patch: Record<string, unknown> = { status: data.status };
    if (data.status === "active") patch["activated_at"] = stamp;
    if (data.status === "suspended") patch["suspended_at"] = stamp;
    if (data.status === "removed") patch["removed_at"] = stamp;

    const { error } = await (supabaseAdmin as any)
      .from("professional_memberships")
      .update(patch)
      .eq("id", data.membership_id);
    if (error) throw new Error(error.message);

    await recordDelegationAudit({
      actorUserId: userId,
      action: `membership_${data.status}`,
      organizationId: before.organization_id,
      membershipId: before.id,
      delegateUserId: before.user_id,
      before,
      after: { ...before, ...patch },
    });
    return { ok: true };
  });

const grantSchema = z.object({
  principal_user_id: z.string().uuid(),
  delegate_user_id: z.string().uuid(),
  organization_id: z.string().uuid().nullable().optional(),
  scope_type: z.enum(SCOPE_TYPES),
  scope_id: z.string().uuid().nullable().optional(),
  data_category: z.string().trim().max(80).nullable().optional(),
  authority_level: z.enum(AUTHORITY_LEVELS),
  capabilities: z.array(z.enum(DELEGATION_CAPABILITIES)).min(1),
  effective_at: z.string().datetime().optional(),
  expires_at: z.string().datetime().nullable().optional(),
  authority_document_path: z.string().trim().max(500).nullable().optional(),
});

/**
 * Grant a delegation. Only the principal themselves or staff may grant, and a
 * delegate can never grant to themselves. Proxy levels require a stored
 * authorization document.
 */
export const grantDelegation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => grantSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const staff = await isStaff(supabase, userId);
    if (!staff && userId !== data.principal_user_id) {
      throw new Error("Forbidden: only the client or staff can grant access.");
    }
    if (data.delegate_user_id === userId && !staff) {
      throw new Error("Forbidden: you cannot grant access to yourself.");
    }
    if (data.delegate_user_id === data.principal_user_id) {
      throw new Error("A person cannot be their own delegate.");
    }

    const authority = data.authority_level as AuthorityLevel;
    const proxyLevels: AuthorityLevel[] = [
      "limited_proxy",
      "authorized_signatory",
      "transaction_authority",
    ];
    if (proxyLevels.includes(authority) && !data.authority_document_path) {
      throw new Error("A signed authorization document is required for proxy authority.");
    }

    for (const cap of data.capabilities as DelegationCapability[]) {
      if (!capabilityAllowedAtAuthority(cap, authority)) {
        throw new Error(`"${cap}" needs a higher authority level than ${authority}.`);
      }
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { recordDelegationAudit } = await import("@/lib/delegated-access.server");

    if (data.organization_id) {
      const { data: seat } = await (supabaseAdmin as any)
        .from("professional_memberships")
        .select("id, status")
        .eq("organization_id", data.organization_id)
        .eq("user_id", data.delegate_user_id)
        .maybeSingle();
      if (!seat || seat.status !== "active") {
        throw new Error("That professional does not hold an active seat at that firm.");
      }
    }

    const { data: delegation, error } = await (supabaseAdmin as any)
      .from("delegations")
      .insert({
        principal_user_id: data.principal_user_id,
        delegate_user_id: data.delegate_user_id,
        organization_id: data.organization_id ?? null,
        scope_type: data.scope_type,
        scope_id: data.scope_id ?? null,
        data_category: data.data_category ?? null,
        authority_level: authority,
        status: "active",
        effective_at: data.effective_at ?? new Date().toISOString(),
        expires_at: data.expires_at ?? null,
        granted_by: userId,
        authority_document_path: data.authority_document_path ?? null,
      })
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);

    const { error: permError } = await (supabaseAdmin as any)
      .from("delegation_permissions")
      .insert(
        (data.capabilities as DelegationCapability[]).map((capability) => ({
          delegation_id: delegation.id,
          capability,
          granted_by: userId,
        })),
      );
    if (permError) throw new Error(permError.message);

    await recordDelegationAudit({
      actorUserId: userId,
      action: "delegation_granted",
      organizationId: data.organization_id ?? null,
      delegationId: delegation.id,
      principalUserId: data.principal_user_id,
      delegateUserId: data.delegate_user_id,
      scopeType: data.scope_type,
      scopeId: data.scope_id ?? null,
      authorityLevel: authority,
      capabilities: data.capabilities as string[],
      after: { ...data, id: delegation.id },
    });

    return { id: delegation.id as string };
  });

const revokeSchema = z.object({
  delegation_id: z.string().uuid(),
  reason: z.string().trim().max(500).optional().or(z.literal("")),
});

/** Revoke immediately. The row stays for the record; access stops at once. */
export const revokeDelegation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => revokeSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { recordDelegationAudit } = await import("@/lib/delegated-access.server");

    const { data: before } = await (supabaseAdmin as any)
      .from("delegations")
      .select(
        "id, principal_user_id, delegate_user_id, organization_id, scope_type, scope_id, authority_level, status, granted_by",
      )
      .eq("id", data.delegation_id)
      .maybeSingle();
    if (!before) throw new Error("Delegation not found.");

    const staff = await isStaff(supabase, userId);
    if (!staff && userId !== before.principal_user_id && userId !== before.granted_by) {
      throw new Error("Forbidden: only the client or staff can revoke this access.");
    }

    const stamp = new Date().toISOString();
    const { error } = await (supabaseAdmin as any)
      .from("delegations")
      .update({
        status: "revoked",
        revoked_at: stamp,
        revoked_by: userId,
        revoke_reason: data.reason || null,
      })
      .eq("id", data.delegation_id);
    if (error) throw new Error(error.message);

    await recordDelegationAudit({
      actorUserId: userId,
      action: "delegation_revoked",
      organizationId: before.organization_id,
      delegationId: before.id,
      principalUserId: before.principal_user_id,
      delegateUserId: before.delegate_user_id,
      scopeType: before.scope_type,
      scopeId: before.scope_id,
      authorityLevel: before.authority_level,
      before,
      after: { ...before, status: "revoked", revoked_at: stamp },
      outcome: "revoked",
    });

    return { ok: true };
  });

/** What the signed-in person has granted, and what has been granted to them. */
export const listMyDelegations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: granted }, { data: held }] = await Promise.all([
      supabase.from("delegations").select("*").eq("principal_user_id", userId),
      supabase.from("delegations").select("*").eq("delegate_user_id", userId),
    ]);
    return { granted: granted ?? [], held: held ?? [] };
  });
