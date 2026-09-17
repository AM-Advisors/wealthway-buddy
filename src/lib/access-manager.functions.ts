/**
 * Client Access Manager — the principal's (or staff's) control over who may
 * see their information.
 *
 * Grants are deny-by-default and, in Phase 3A, read-only: only viewing
 * capabilities at "view" authority can be granted here. Suspension and
 * revocation take effect on the next server call, and nothing is ever hard
 * deleted — the delegation row and its audit history stay for the record.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  SCOPE_TYPES,
  capabilityAllowedAtAuthority,
  requiresSignedAuthority,
} from "@/lib/delegation-model";
import { ACTIVATED_CAPABILITIES, PHASE_3B_CAPABILITIES } from "@/lib/professional-model";

const ACTIVATED = ACTIVATED_CAPABILITIES;


async function isStaff(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return ((data ?? []) as { role: string }[]).some((r) =>
    ["admin", "super_admin", "operations", "compliance", "legal"].includes(r.role),
  );
}

/** The firms and seated professionals a client can choose from. */
export const listProfessionalDirectory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [{ data: orgs }, { data: seats }] = await Promise.all([
      supabase
        .from("professional_organizations")
        .select("id, name, org_type, status")
        .eq("status", "active"),
      supabase
        .from("professional_memberships")
        .select("id, organization_id, user_id, email, seat_role, status")
        .eq("status", "active"),
    ]);
    return {
      organizations: orgs ?? [],
      professionals: ((seats ?? []) as any[]).map((s) => ({
        membershipId: s.id,
        organizationId: s.organization_id,
        userId: s.user_id,
        email: s.email,
        seatRole: s.seat_role,
      })),
    };
  });

/** Every access grant over the signed-in person's own information. */
export const listAccessGrants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const { data: rows } = await db
      .from("delegations")
      .select(
        "id, delegate_user_id, organization_id, scope_type, scope_id, authority_level, status, effective_at, expires_at, revoked_at, revoke_reason, last_used_at, authority_document_name, professional_organizations(name, org_type)",
      )
      .eq("principal_user_id", userId)
      .order("created_at", { ascending: false });

    const grants: any[] = [];
    for (const row of (rows ?? []) as any[]) {
      const [{ data: perms }, { data: person }] = await Promise.all([
        db.from("delegation_permissions").select("capability").eq("delegation_id", row.id),
        db
          .from("persons")
          .select("legal_first_name, legal_last_name, email")
          .eq("user_id", row.delegate_user_id)
          .maybeSingle(),
      ]);
      grants.push({
        id: row.id,
        professionalName:
          [person?.legal_first_name, person?.legal_last_name].filter(Boolean).join(" ") ||
          person?.email ||
          "Professional",
        firm: row.professional_organizations?.name ?? null,
        scopeType: row.scope_type,
        scopeId: row.scope_id,
        capabilities: ((perms ?? []) as any[]).map((p) => p.capability),
        authorityLevel: row.authority_level,
        status: row.status,
        effectiveAt: row.effective_at,
        expiresAt: row.expires_at,
        revokedAt: row.revoked_at,
        revokeReason: row.revoke_reason,
        lastActivityAt: row.last_used_at,
        authorityDocument: row.authority_document_name,
      });
    }
    return { grants };
  });

const grantSchema = z.object({
  delegate_user_id: z.string().uuid(),
  organization_id: z.string().uuid().nullable().optional(),
  scope_type: z.enum(SCOPE_TYPES),
  scope_id: z.string().uuid().nullable().optional(),
  capabilities: z.array(z.string()).min(1),
  authority_level: z.enum(["view", "assist"]).optional(),
  effective_at: z.string().optional(),
  expires_at: z.string().nullable().optional(),
});

/**
 * Grant access. Only viewing (Phase 3A) and preparing/assisting (Phase 3B) can
 * be granted: signing, money movement, banking and wire details all need the
 * signed-authority workflow that does not exist yet and are refused here.
 */
export const grantReadOnlyAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => grantSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const needsAssist = data.capabilities.some((c) => PHASE_3B_CAPABILITIES.includes(c as any));
    const authority = needsAssist ? "assist" : (data.authority_level ?? "view");

    for (const cap of data.capabilities) {
      if (requiresSignedAuthority(cap as any)) {
        throw new Error(
          "signed_authority_required: banking, wire, signing and payment permissions need a signed authorisation and cannot be granted yet.",
        );
      }
      if (!ACTIVATED.includes(cap as any)) {
        throw new Error("That permission is not available yet.");
      }
      if (!capabilityAllowedAtAuthority(cap as any, authority)) {
        throw new Error("That permission needs a higher authority than is available yet.");
      }
    }
    if (data.scope_type === "data_category") {
      throw new Error("Choose a client, profile, fund or investment for this access.");
    }
    if (data.delegate_user_id === userId) {
      throw new Error("You cannot grant access to yourself.");
    }


    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { recordDelegationAudit } = await import("@/lib/delegated-access.server");
    const db = supabaseAdmin as any;

    if (data.organization_id) {
      const { data: seat } = await db
        .from("professional_memberships")
        .select("status")
        .eq("organization_id", data.organization_id)
        .eq("user_id", data.delegate_user_id)
        .maybeSingle();
      if (!seat || seat.status !== "active") {
        throw new Error("That professional does not hold an active seat at that firm.");
      }
    }

    // Scope ids are validated against the principal's own records.
    if (data.scope_type === "investment_profile" && data.scope_id) {
      const { data: profile } = await db
        .from("investment_profiles")
        .select("owner_user_id")
        .eq("id", data.scope_id)
        .maybeSingle();
      if (!profile || profile.owner_user_id !== userId) throw new Error("That profile is not yours.");
    }
    if (data.scope_type === "investment" && data.scope_id) {
      const { data: app } = await db
        .from("investor_applications")
        .select("user_id")
        .eq("id", data.scope_id)
        .maybeSingle();
      if (!app || app.user_id !== userId) throw new Error("That investment is not yours.");
    }
    if (data.scope_type === "fund" && data.scope_id) {
      const { data: app } = await db
        .from("investor_applications")
        .select("id")
        .eq("offering_id", data.scope_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (!app) throw new Error("You have no investment in that fund.");
    }
    if (data.scope_type === "person") {
      data.scope_id = userId;
    }

    const { data: delegation, error } = await db
      .from("delegations")
      .insert({
        principal_user_id: userId,
        delegate_user_id: data.delegate_user_id,
        organization_id: data.organization_id ?? null,
        scope_type: data.scope_type,
        scope_id: data.scope_id ?? null,
        authority_level: authority,
        status: "active",
        effective_at: data.effective_at ?? new Date().toISOString(),
        expires_at: data.expires_at || null,
        granted_by: userId,
      })
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);

    const { error: permError } = await db.from("delegation_permissions").insert(
      data.capabilities.map((capability) => ({
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
      principalUserId: userId,
      delegateUserId: data.delegate_user_id,
      scopeType: data.scope_type,
      scopeId: data.scope_id ?? null,
      authorityLevel: authority,
      capabilities: data.capabilities,
      after: { ...data, authority_level: authority },

    });

    return { id: delegation.id as string };
  });

const changeSchema = z.object({
  delegation_id: z.string().uuid(),
  action: z.enum(["suspend", "resume", "expiry"]),
  expires_at: z.string().nullable().optional(),
  reason: z.string().trim().max(500).optional(),
});

/** Suspend, resume, or move the expiry date of an existing grant. */
export const changeAccessGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => changeSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { recordDelegationAudit } = await import("@/lib/delegated-access.server");
    const db = supabaseAdmin as any;

    const { data: before } = await db
      .from("delegations")
      .select(
        "id, principal_user_id, delegate_user_id, organization_id, scope_type, scope_id, authority_level, status, expires_at",
      )
      .eq("id", data.delegation_id)
      .maybeSingle();
    if (!before) throw new Error("Access grant not found.");

    if (before.principal_user_id !== userId && !(await isStaff(supabase, userId))) {
      throw new Error("Forbidden: only the client or staff can change this access.");
    }

    const patch: Record<string, unknown> = {};
    if (data.action === "suspend") patch["status"] = "suspended";
    if (data.action === "resume") patch["status"] = "active";
    if (data.action === "expiry") patch["expires_at"] = data.expires_at || null;

    const { error } = await db.from("delegations").update(patch).eq("id", data.delegation_id);
    if (error) throw new Error(error.message);

    await recordDelegationAudit({
      actorUserId: userId,
      action: `delegation_${data.action}`,
      organizationId: before.organization_id,
      delegationId: before.id,
      principalUserId: before.principal_user_id,
      delegateUserId: before.delegate_user_id,
      scopeType: before.scope_type,
      scopeId: before.scope_id,
      authorityLevel: before.authority_level,
      before,
      after: { ...before, ...patch },
      detail: data.reason ?? null,
    });

    return { ok: true };
  });
