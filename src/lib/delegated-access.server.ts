/**
 * Centralized delegated-access authorization.
 *
 * One entry point — `canAct(actor, capability, resource)` — resolves the whole
 * chain server-side:
 *
 *   authenticated person
 *     → organization membership (when acting through a firm)
 *     → live delegation (effective, not expired, not revoked)
 *     → scope covering the resource
 *     → explicitly granted capability
 *     → authority ceiling for that capability
 *     → the resource's real owner, re-read from the database
 *
 * Nothing trusts an id sent by the browser: every resource is looked up and its
 * true principal/fund is derived from the stored row.
 *
 * Phase 1 note: this layer is additive. It does not replace, widen or weaken
 * the existing admin / fund-manager / investor / staff authorization anywhere
 * in the product, and no production screen grants access through it yet.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  SIGNED_AUTHORITY_REQUIRED,
  capabilityAllowedAtAuthority,
  isDelegationCapability,
  isMutatingCapability,
  requiresSignedAuthority,
  type AuthorityLevel,
  type DelegationCapability,
  type DelegationScopeType,
} from "@/lib/delegation-model";


export type ResourceType = "person" | "investment_profile" | "fund" | "investment";

export interface ResourceRef {
  type: ResourceType;
  id: string;
}

/** The resource as the database actually holds it. */
interface ResolvedResource {
  type: ResourceType;
  id: string;
  /** The human whose data this is. Null for a fund. */
  principalUserId: string | null;
  /** The offering this resource belongs to, when it belongs to one. */
  fundId: string | null;
  /** The investment profile this resource belongs to, when known. */
  profileId: string | null;
}

export interface CanActResult {
  allowed: boolean;
  reason: string;
  delegationId?: string;
  organizationId?: string | null;
  authorityLevel?: AuthorityLevel;
  principalUserId?: string | null;
}

const DENY = (reason: string): CanActResult => ({ allowed: false, reason });

/** Re-read the target resource and derive its true ownership. */
async function resolveResource(resource: ResourceRef): Promise<ResolvedResource | null> {
  const db = supabaseAdmin as any;

  if (resource.type === "person") {
    const { data } = await db
      .from("profiles")
      .select("id, user_id")
      .eq("user_id", resource.id)
      .maybeSingle();
    if (!data) return null;
    return {
      type: "person",
      id: resource.id,
      principalUserId: data.user_id,
      fundId: null,
      profileId: data.id,
    };
  }

  if (resource.type === "investment_profile") {
    // Investment profiles are the canonical Phase 2 record; the legacy profiles
    // table is only a fallback. Ownership always comes from the stored row.
    const { data: investmentProfile } = await db
      .from("investment_profiles")
      .select("id, owner_user_id")
      .eq("id", resource.id)
      .maybeSingle();
    if (investmentProfile) {
      return {
        type: "investment_profile",
        id: investmentProfile.id,
        principalUserId: investmentProfile.owner_user_id,
        fundId: null,
        profileId: investmentProfile.id,
      };
    }
    const { data } = await db
      .from("profiles")
      .select("id, user_id")
      .eq("id", resource.id)
      .maybeSingle();
    if (!data) return null;
    return {
      type: "investment_profile",
      id: data.id,
      principalUserId: data.user_id,
      fundId: null,
      profileId: data.id,
    };
  }


  if (resource.type === "fund") {
    const { data } = await db.from("offerings").select("id").eq("id", resource.id).maybeSingle();
    if (!data) return null;
    return { type: "fund", id: data.id, principalUserId: null, fundId: data.id, profileId: null };
  }

  // investment
  const { data } = await db
    .from("investor_applications")
    .select("id, user_id, offering_id")
    .eq("id", resource.id)
    .maybeSingle();
  if (!data) return null;
  return {
    type: "investment",
    id: data.id,
    principalUserId: data.user_id,
    fundId: data.offering_id,
    profileId: null,
  };
}

/**
 * Does this delegation's scope cover this resource?
 *
 * Inheritance is deliberately narrow and explicit:
 *  - person scope covers that person's own profile and their investments;
 *  - investment_profile scope covers only that profile;
 *  - fund scope covers that fund, and the principal's investments in it;
 *  - investment scope covers only that investment;
 *  - data_category scope grants no resource access in Phase 1.
 */
function scopeCovers(
  scopeType: DelegationScopeType,
  scopeId: string | null,
  principalUserId: string,
  target: ResolvedResource,
): boolean {
  switch (scopeType) {
    case "person":
      if (scopeId !== principalUserId) return false;
      if (target.type === "fund") return false;
      return target.principalUserId === principalUserId;
    case "investment_profile":
      return (
        (target.type === "investment_profile" || target.type === "person") &&
        !!scopeId &&
        scopeId === target.profileId &&
        target.principalUserId === principalUserId
      );
    case "fund":
      if (!scopeId || scopeId !== target.fundId) return false;
      if (target.type === "fund") return true;
      return target.principalUserId === principalUserId;
    case "investment":
      return target.type === "investment" && !!scopeId && scopeId === target.id;
    case "data_category":
      return false;
    default:
      return false;
  }
}

function liveDelegation(row: any, now: Date): boolean {
  if (row.status !== "active") return false;
  if (row.revoked_at) return false;
  if (row.effective_at && new Date(row.effective_at) > now) return false;
  if (row.expires_at && new Date(row.expires_at) <= now) return false;
  return true;
}

export interface CanActOptions {
  /** Treat this as a write. Read-only capabilities can never satisfy it. */
  mutation?: boolean;
  /** The firm the professional says they are acting through. */
  organizationId?: string | null;
  /**
   * Decide using only this one delegation. Used when a professional is acting
   * in an explicit delegated context, so one grant can never be satisfied by
   * an unrelated grant the same person happens to hold.
   */
  delegationId?: string | null;
  now?: Date;
}

/**
 * The single authorization decision for delegated access.
 * Returns a deny for anything it cannot positively prove.
 */
export async function canAct(
  actorUserId: string | null | undefined,
  capability: unknown,
  resource: ResourceRef,
  options: CanActOptions = {},
): Promise<CanActResult> {
  const now = options.now ?? new Date();

  if (!actorUserId) return DENY("Not signed in.");
  if (!isDelegationCapability(capability)) return DENY("Unknown permission.");
  const cap = capability as DelegationCapability;

  // Banking, wire, signing and money movement need the signed-authority
  // workflow, which is not built. A delegation carrying one of these — however
  // it was created — still gets nothing here.
  if (requiresSignedAuthority(cap)) return DENY(SIGNED_AUTHORITY_REQUIRED);

  if (options.mutation && !isMutatingCapability(cap)) {
    return DENY("This permission is read-only.");
  }
  if (!resource?.id || !resource?.type) return DENY("Unknown resource.");


  const target = await resolveResource(resource);
  if (!target) return DENY("Resource not found.");

  const db = supabaseAdmin as any;
  const { data: rows, error } = await db
    .from("delegations")
    .select(
      "id, principal_user_id, delegate_user_id, organization_id, scope_type, scope_id, authority_level, status, effective_at, expires_at, revoked_at",
    )
    .eq("delegate_user_id", actorUserId);
  if (error) return DENY("Could not check authorization.");

  const candidates = (rows ?? []).filter((row: any) => {
    if (!liveDelegation(row, now)) return false;
    if (options.delegationId && row.id !== options.delegationId) return false;
    if (options.organizationId && row.organization_id !== options.organizationId) return false;
    return scopeCovers(row.scope_type, row.scope_id, row.principal_user_id, target);
  });

  if (candidates.length === 0) return DENY("No live delegation covers this.");

  for (const row of candidates) {
    // Acting through a firm requires a live seat at that firm.
    if (row.organization_id) {
      const { data: membership } = await db
        .from("professional_memberships")
        .select("id, status")
        .eq("organization_id", row.organization_id)
        .eq("user_id", actorUserId)
        .maybeSingle();
      if (!membership || membership.status !== "active") continue;
    } else if (options.organizationId) {
      continue;
    }

    const authority = row.authority_level as AuthorityLevel;
    if (!capabilityAllowedAtAuthority(cap, authority)) continue;

    const { data: permission } = await db
      .from("delegation_permissions")
      .select("id")
      .eq("delegation_id", row.id)
      .eq("capability", cap)
      .maybeSingle();
    if (!permission) continue;

    return {
      allowed: true,
      reason: "Authorized by delegation.",
      delegationId: row.id,
      organizationId: row.organization_id,
      authorityLevel: authority,
      principalUserId: row.principal_user_id,
    };
  }

  return DENY("This delegation does not carry that permission.");
}

/** Throwing wrapper for server functions. */
export async function assertCanAct(
  actorUserId: string | null | undefined,
  capability: unknown,
  resource: ResourceRef,
  options: CanActOptions = {},
): Promise<CanActResult> {
  const result = await canAct(actorUserId, capability, resource, options);
  if (!result.allowed) throw new Error(`Forbidden: ${result.reason}`);
  return result;
}

export interface DelegationAuditInput {
  actorUserId: string | null;
  action: string;
  organizationId?: string | null;
  delegationId?: string | null;
  membershipId?: string | null;
  principalUserId?: string | null;
  delegateUserId?: string | null;
  scopeType?: DelegationScopeType | null;
  scopeId?: string | null;
  authorityLevel?: AuthorityLevel | null;
  capabilities?: string[];
  outcome?: string;
  before?: unknown;
  after?: unknown;
  detail?: string | null;
}

/** Append-only history for every membership and delegation change. */
export async function recordDelegationAudit(input: DelegationAuditInput) {
  const db = supabaseAdmin as any;
  await db.from("delegation_audit_events").insert({
    actor_user_id: input.actorUserId,
    organization_id: input.organizationId ?? null,
    delegation_id: input.delegationId ?? null,
    membership_id: input.membershipId ?? null,
    principal_user_id: input.principalUserId ?? null,
    delegate_user_id: input.delegateUserId ?? null,
    scope_type: input.scopeType ?? null,
    scope_id: input.scopeId ?? null,
    authority_level: input.authorityLevel ?? null,
    capabilities: input.capabilities ?? [],
    action: input.action,
    outcome: input.outcome ?? "recorded",
    before_state: (input.before ?? null) as any,
    after_state: (input.after ?? null) as any,
    detail: input.detail ?? null,
  });
}
