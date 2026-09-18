/**
 * Server-only authorization for every tax operation.
 *
 * One rule governs this file: authority is resolved from authoritative
 * records, never from anything the browser said about itself.
 *
 *   Harmonious tax staff  — admin role in user_roles
 *   fund manager          — fund_managers assignment, fund-level tax only
 *   investor / taxpayer   — own positions, own profiles, own household
 *   tax professional      — live delegation + explicit tax capability + scope
 *   provider process      — records an exchange; never an actor
 *
 * A fund manager has no path to an investor's personal 1040, personal tax
 * documents, spouse data, unrelated K-1s or any other investment. Entity
 * return authority never opens an individual return, and individual return
 * authority never opens entity work.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { canAct } from "@/lib/delegated-access.server";
import {
  TAX_RESOURCE_CAPABILITY,
  memberMayAccessReturn,
  type TaxResource,
} from "@/lib/tax-model";

const db = () => supabaseAdmin as any;

export function forbid(message: string): never {
  throw new Error(`Forbidden: ${message}`);
}

export type TaxActor = {
  userId: string;
  /** Harmonious tax/admin staff. */
  isStaff: boolean;
  isManager: boolean;
  /** Funds this actor manages. Empty for staff (they are not scope limited). */
  offeringIds: string[];
};

/** Authoritative actor resolution. Roles come from user_roles, funds from fund_managers. */
export async function taxActor(userId: string | null | undefined): Promise<TaxActor> {
  if (!userId) forbid("not signed in.");
  const { data: roles } = await db().from("user_roles").select("role").eq("user_id", userId);
  const list = ((roles ?? []) as { role: string }[]).map((r) => r.role);
  const isStaff = list.includes("admin");
  const isManager = list.includes("fund_manager");
  let offeringIds: string[] = [];
  if (isManager) {
    const { data: assignments } = await db()
      .from("fund_managers")
      .select("offering_id")
      .eq("user_id", userId);
    offeringIds = [
      ...new Set(((assignments ?? []) as { offering_id: string }[]).map((a) => a.offering_id)),
    ];
  }
  return { userId: userId as string, isStaff, isManager, offeringIds };
}

export async function assertTaxStaff(userId: string): Promise<TaxActor> {
  const actor = await taxActor(userId);
  if (!actor.isStaff) forbid("Harmonious tax operations authority is required.");
  return actor;
}

/** Fund-level tax access: staff, or a manager of that exact fund. */
export async function assertFundTaxAccess(
  userId: string,
  offeringId: string | null | undefined,
): Promise<TaxActor> {
  const actor = await taxActor(userId);
  if (actor.isStaff) return actor;
  if (!offeringId || !actor.offeringIds.includes(offeringId)) {
    forbid("you do not manage that fund.");
  }
  return actor;
}

/** Managers may read fund tax data but never write authoritative tax records. */
export function assertFundTaxWrite(actor: TaxActor): void {
  if (!actor.isStaff) forbid("fund managers cannot change authoritative tax records.");
}

// ------------------------------------------------------------- delegation

export type ViewerContext = {
  onBehalfOfUserId?: string | undefined;
  delegationId?: string | undefined;
  organizationId?: string | undefined;
};

export type TaxViewer = {
  /** Whose tax data is being read. */
  subjectUserId: string;
  actorUserId: string;
  onBehalf: boolean;
  delegationId: string | null;
  capability: string | null;
};

/**
 * Resolve the subject of a taxpayer-facing read. Acting for someone else
 * requires a live delegation carrying the exact tax capability for that
 * surface — a general financial or document permission never suffices.
 */
export async function resolveTaxViewer(
  actorUserId: string,
  resource: TaxResource,
  viewer: ViewerContext = {},
): Promise<TaxViewer> {
  const capability = TAX_RESOURCE_CAPABILITY[resource];
  if (!viewer.onBehalfOfUserId || viewer.onBehalfOfUserId === actorUserId) {
    return {
      subjectUserId: actorUserId,
      actorUserId,
      onBehalf: false,
      delegationId: null,
      capability: null,
    };
  }
  const decision = await canAct(actorUserId, capability, {
    type: "person",
    id: viewer.onBehalfOfUserId,
  }, {
    ...(viewer.delegationId ? { delegationId: viewer.delegationId } : {}),
    ...(viewer.organizationId ? { organizationId: viewer.organizationId } : {}),
  } as any);
  if (!decision.allowed) {
    await recordTaxAccess({
      actorUserId,
      onBehalfOf: viewer.onBehalfOfUserId,
      delegationId: viewer.delegationId ?? null,
      capability,
      resourceTable: resource,
      action: "read",
      allowed: false,
      reason: decision.reason ?? "Not authorized.",
    });
    forbid(decision.reason ?? `the ${capability} permission is required.`);
  }
  return {
    subjectUserId: viewer.onBehalfOfUserId,
    actorUserId,
    onBehalf: true,
    delegationId: decision.delegationId ?? viewer.delegationId ?? null,
    capability,
  };
}

// ------------------------------------------------- investor-owned records

/** The investment profiles the subject may see tax records for. */
export async function subjectProfileIds(subjectUserId: string): Promise<string[]> {
  const { data } = await db()
    .from("investment_profiles")
    .select("id")
    .eq("owner_user_id", subjectUserId);
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

/** A tax form belongs to the subject only when the stored row says so. */
export function assertOwnedForm(
  row: { investor_user_id?: string | null; recipient_user_id?: string | null } | null,
  subjectUserId: string,
): void {
  if (!row) forbid("tax form not found.");
  const owner = row.investor_user_id ?? row.recipient_user_id ?? null;
  if (owner !== subjectUserId) forbid("that tax form belongs to another taxpayer.");
}

// ------------------------------------------------------- 1040 / household

/**
 * Personal tax access. Fund managers get nothing here: managing a fund is not
 * a reason to see anyone's personal return. Spouse access requires the
 * recorded per-year authorization, not the marriage.
 */
export async function assertHouseholdAccess(
  userId: string,
  householdId: string,
  taxYear: number,
  options: { requireStaff?: boolean; viewer?: ViewerContext; resource?: TaxResource } = {},
): Promise<{ actor: TaxActor; subjectUserId: string; onBehalf: boolean; delegationId: string | null }> {
  const actor = await taxActor(userId);
  const { data: household } = await db()
    .from("taxpayer_households")
    .select("*")
    .eq("id", householdId)
    .maybeSingle();
  if (!household) forbid("that taxpayer household was not found.");

  if (actor.isStaff) {
    return { actor, subjectUserId: household.primary_user_id, onBehalf: false, delegationId: null };
  }
  if (options.requireStaff) forbid("Harmonious tax operations authority is required.");

  if (household.primary_user_id === userId) {
    return { actor, subjectUserId: userId, onBehalf: false, delegationId: null };
  }

  const { data: members } = await db()
    .from("taxpayer_household_members")
    .select("*")
    .eq("household_id", householdId)
    .eq("member_user_id", userId);
  const member = ((members ?? []) as any[]).find((m) => m.tax_year === taxYear) ?? null;
  if (memberMayAccessReturn(member, taxYear)) {
    return { actor, subjectUserId: household.primary_user_id, onBehalf: false, delegationId: null };
  }

  // A delegated tax professional, with the explicit individual capability.
  const resource: TaxResource = options.resource ?? "individual_return_view";
  const capability = TAX_RESOURCE_CAPABILITY[resource];
  const decision = await canAct(userId, capability, {
    type: "person",
    id: household.primary_user_id,
  }, {
    ...(options.viewer?.delegationId ? { delegationId: options.viewer.delegationId } : {}),
    ...(options.viewer?.organizationId ? { organizationId: options.viewer.organizationId } : {}),
  } as any);
  if (!decision.allowed) {
    await recordTaxAccess({
      actorUserId: userId,
      onBehalfOf: household.primary_user_id,
      delegationId: options.viewer?.delegationId ?? null,
      capability,
      resourceTable: "individual_tax_returns",
      resourceId: householdId,
      action: "read",
      allowed: false,
      reason: decision.reason ?? "Not authorized.",
    });
    forbid(decision.reason ?? `the ${capability} permission is required for this return.`);
  }
  return {
    actor,
    subjectUserId: household.primary_user_id,
    onBehalf: true,
    delegationId: decision.delegationId ?? null,
  };
}

// ------------------------------------------------------------- audit trail

export async function recordTaxAccess(input: {
  actorUserId: string;
  onBehalfOf?: string | null;
  delegationId?: string | null;
  capability?: string | null;
  resourceTable: string;
  resourceId?: string | null;
  action: string;
  allowed?: boolean;
  reason?: string | null;
}) {
  await db().from("tax_access_events").insert({
    actor_user_id: input.actorUserId,
    on_behalf_of: input.onBehalfOf ?? null,
    delegation_id: input.delegationId ?? null,
    capability: input.capability ?? null,
    resource_table: input.resourceTable,
    resource_id: input.resourceId ?? null,
    action: input.action,
    allowed: input.allowed ?? true,
    reason: input.reason ?? null,
  });
}

export async function recordTaxEvent(input: {
  subjectTable: string;
  subjectId: string;
  taxYear?: number | null;
  offeringId?: string | null;
  householdId?: string | null;
  event: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  detail?: Record<string, unknown>;
  actorUserId: string;
  onBehalfOf?: string | null;
  delegationId?: string | null;
}) {
  await db().from("tax_events").insert({
    subject_table: input.subjectTable,
    subject_id: input.subjectId,
    tax_year: input.taxYear ?? null,
    offering_id: input.offeringId ?? null,
    household_id: input.householdId ?? null,
    event: input.event,
    from_status: input.fromStatus ?? null,
    to_status: input.toStatus ?? null,
    detail: input.detail ?? {},
    actor_user_id: input.actorUserId,
    on_behalf_of: input.onBehalfOf ?? null,
    delegation_id: input.delegationId ?? null,
  });
}
