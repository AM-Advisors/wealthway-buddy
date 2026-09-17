/**
 * Phase 3B — assisted professional actions.
 *
 * A professional prepares; the client decides. Nothing written here changes an
 * authoritative record until the principal — signed in as themselves — approves
 * it, and even then only allowlisted fields move.
 *
 * Every entry point resolves the chain server-side:
 *   actor → firm seat → live delegation → scope → explicit capability →
 *   the resource re-read from the database → allowlisted fields only.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { canAct, recordDelegationAudit } from "@/lib/delegated-access.server";
import { loadDelegatedContext, type DelegatedContext } from "@/lib/professional-access.server";
import {
  ASSISTED_DRAFT_TYPES,
  DRAFT_TYPE_CAPABILITY,
  DRAFT_TYPE_LABELS,
  DRAFT_TYPE_TARGET,
  sanitizeAssistedPayload,
  isProtectedField,
  type AssistedDraftType,
} from "@/lib/assisted-fields";

const db = () => supabaseAdmin as any;

export interface PrepareInput {
  delegationId: string;
  draftType: string;
  /** The profile or investment the preparation is about. Ignored for person. */
  targetId?: string | null;
  payload: unknown;
  note?: string | null;
}

function assertDraftType(value: string): AssistedDraftType {
  if (!(ASSISTED_DRAFT_TYPES as readonly string[]).includes(value)) {
    throw new Error("Forbidden: unknown kind of preparation.");
  }
  return value as AssistedDraftType;
}

/** Re-reads the target and proves it really belongs to this principal. */
async function resolveTarget(
  ctx: DelegatedContext,
  draftType: AssistedDraftType,
  targetId: string | null | undefined,
): Promise<{ type: "person" | "investment_profile" | "investment"; id: string }> {
  const kind = DRAFT_TYPE_TARGET[draftType];

  if (kind === "person") return { type: "person", id: ctx.principalUserId };

  if (!targetId) throw new Error("Choose what this preparation is for.");

  if (kind === "investment_profile") {
    const { data } = await db()
      .from("investment_profiles")
      .select("id, owner_user_id")
      .eq("id", targetId)
      .maybeSingle();
    if (!data || data.owner_user_id !== ctx.principalUserId) {
      throw new Error("Forbidden: that profile does not belong to this client.");
    }
    return { type: "investment_profile", id: data.id };
  }

  const { data } = await db()
    .from("investor_applications")
    .select("id, user_id")
    .eq("id", targetId)
    .maybeSingle();
  if (!data || data.user_id !== ctx.principalUserId) {
    throw new Error("Forbidden: that investment does not belong to this client.");
  }
  return { type: "investment", id: data.id };
}

/** The current values of exactly the fields being proposed. */
async function currentState(
  ctx: DelegatedContext,
  draftType: AssistedDraftType,
  target: { type: string; id: string },
  fields: string[],
): Promise<Record<string, unknown>> {
  const table = APPLY_TABLE[draftType];
  if (!table) return {};
  let query = db().from(table.table).select("*");
  if (table.table === "persons") query = query.eq("user_id", ctx.principalUserId);
  else query = query.eq("profile_id", target.id);
  const { data } = await query.maybeSingle();
  const out: Record<string, unknown> = {};
  for (const field of fields) out[field] = data ? (data as any)[field] ?? null : null;
  return out;
}

/**
 * Where an approved draft lands. Kinds that are not listed never write to an
 * authoritative record at all — they stay as prepared material the client
 * carries into their own workflow.
 */
const APPLY_TABLE: Partial<Record<AssistedDraftType, { table: string }>> = {
  profile_contact: { table: "persons" },
  entity_information: { table: "entity_verifications" },
  ownership_information: { table: "entity_verifications" },
};

async function notifyPrincipal(
  ctx: DelegatedContext,
  draftId: string,
  draftType: AssistedDraftType,
) {
  await db()
    .from("assisted_notifications")
    .insert({
      principal_user_id: ctx.principalUserId,
      draft_id: draftId,
      kind: draftType,
      message: `${DRAFT_TYPE_LABELS[draftType]} prepared for you${
        ctx.organizationName ? ` by ${ctx.organizationName}` : ""
      }. Your review is needed.`,
    });
}

async function draftEvent(row: {
  draftId: string;
  principalUserId: string;
  preparedByUserId: string;
  actorUserId: string | null;
  actorKind: string;
  organizationId?: string | null;
  delegationId?: string | null;
  action: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  payload?: unknown;
}) {
  await db().from("assisted_draft_events").insert({
    draft_id: row.draftId,
    principal_user_id: row.principalUserId,
    prepared_by_user_id: row.preparedByUserId,
    actor_user_id: row.actorUserId,
    actor_kind: row.actorKind,
    organization_id: row.organizationId ?? null,
    delegation_id: row.delegationId ?? null,
    action: row.action,
    from_status: row.fromStatus ?? null,
    to_status: row.toStatus ?? null,
    payload: (row.payload ?? {}) as any,
  });
}

/** A professional prepares something for the client to review. */
export async function prepareDraft(actorUserId: string | null | undefined, input: PrepareInput) {
  const draftType = assertDraftType(input.draftType);
  const ctx = await loadDelegatedContext(actorUserId, input.delegationId);
  if (!ctx) throw new Error("Forbidden: that delegated access is not available.");

  const capability = DRAFT_TYPE_CAPABILITY[draftType];
  if (!ctx.capabilities.includes(capability)) {
    throw new Error("Forbidden: this authorisation does not allow that.");
  }

  const target = await resolveTarget(ctx, draftType, input.targetId ?? null);

  const decision = await canAct(ctx.actorUserId, capability, target, {
    mutation: true,
    organizationId: ctx.organizationId ?? null,
    delegationId: ctx.delegationId,
  });
  if (!decision.allowed) throw new Error(`Forbidden: ${decision.reason}`);

  const { values } = sanitizeAssistedPayload(draftType, input.payload);
  const before = await currentState(ctx, draftType, target, Object.keys(values));

  const { data: draft, error } = await db()
    .from("assisted_drafts")
    .insert({
      delegation_id: ctx.delegationId,
      organization_id: ctx.organizationId,
      prepared_by_user_id: ctx.actorUserId,
      principal_user_id: ctx.principalUserId,
      draft_type: draftType,
      target_type: target.type,
      target_id: target.type === "person" ? null : target.id,
      title: DRAFT_TYPE_LABELS[draftType],
      before_state: before,
      proposed_state: values,
      preparer_note: input.note ?? null,
      status: "awaiting_client_review",
    })
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);

  await draftEvent({
    draftId: draft.id,
    principalUserId: ctx.principalUserId,
    preparedByUserId: ctx.actorUserId,
    actorUserId: ctx.actorUserId,
    actorKind: "professional",
    organizationId: ctx.organizationId,
    delegationId: ctx.delegationId,
    action: "prepared",
    toStatus: "awaiting_client_review",
    payload: { before, proposed: values },
  });
  await notifyPrincipal(ctx, draft.id, draftType);
  await recordDelegationAudit({
    actorUserId: ctx.actorUserId,
    action: `assisted_${draftType}_prepared`,
    organizationId: ctx.organizationId,
    delegationId: ctx.delegationId,
    principalUserId: ctx.principalUserId,
    delegateUserId: ctx.actorUserId,
    scopeType: ctx.scopeType as any,
    scopeId: ctx.scopeId,
    authorityLevel: ctx.authorityLevel,
    capabilities: [capability],
    outcome: "awaiting_client_review",
    before,
    after: values,
    detail: input.note ?? null,
  });

  return { id: draft.id as string, status: "awaiting_client_review" };
}

/** Records a professional's upload with the whole agency chain attached. */
export async function recordAssistedUpload(
  actorUserId: string | null | undefined,
  input: {
    delegationId: string;
    targetType: "investment" | "investment_profile" | "person";
    targetId?: string | null;
    storagePath: string;
    originalFilename: string;
    classification: string;
    draftId?: string | null;
  },
) {
  const ctx = await loadDelegatedContext(actorUserId, input.delegationId);
  if (!ctx) throw new Error("Forbidden: that delegated access is not available.");
  if (!ctx.capabilities.includes("upload_documents")) {
    throw new Error("Forbidden: this authorisation does not allow uploads.");
  }

  const targetId =
    input.targetType === "person" ? ctx.principalUserId : (input.targetId ?? "");
  if (!targetId) throw new Error("Choose what this document belongs to.");

  // Scope-specific: an upload permission for one investment can never reach
  // another, even for the same client.
  if (input.targetType === "investment") {
    const { data } = await db()
      .from("investor_applications")
      .select("id, user_id")
      .eq("id", targetId)
      .maybeSingle();
    if (!data || data.user_id !== ctx.principalUserId) {
      throw new Error("Forbidden: that investment does not belong to this client.");
    }
  }
  if (input.targetType === "investment_profile") {
    const { data } = await db()
      .from("investment_profiles")
      .select("id, owner_user_id")
      .eq("id", targetId)
      .maybeSingle();
    if (!data || data.owner_user_id !== ctx.principalUserId) {
      throw new Error("Forbidden: that profile does not belong to this client.");
    }
  }

  const decision = await canAct(
    ctx.actorUserId,
    "upload_documents",
    { type: input.targetType, id: targetId },
    { mutation: true, organizationId: ctx.organizationId ?? null, delegationId: ctx.delegationId },
  );
  if (!decision.allowed) throw new Error(`Forbidden: ${decision.reason}`);

  const { data: row, error } = await db()
    .from("assisted_documents")
    .insert({
      delegation_id: ctx.delegationId,
      organization_id: ctx.organizationId,
      uploaded_by_user_id: ctx.actorUserId,
      principal_user_id: ctx.principalUserId,
      draft_id: input.draftId ?? null,
      resource_type: input.targetType,
      resource_id: targetId,
      original_filename: input.originalFilename,
      storage_path: input.storagePath,
      classification: input.classification,
    })
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);

  await recordDelegationAudit({
    actorUserId: ctx.actorUserId,
    action: "assisted_document_uploaded",
    organizationId: ctx.organizationId,
    delegationId: ctx.delegationId,
    principalUserId: ctx.principalUserId,
    delegateUserId: ctx.actorUserId,
    scopeType: ctx.scopeType as any,
    scopeId: ctx.scopeId,
    authorityLevel: ctx.authorityLevel,
    capabilities: ["upload_documents"],
    outcome: "uploaded",
    after: {
      resource_type: input.targetType,
      resource_id: targetId,
      original_filename: input.originalFilename,
      classification: input.classification,
    },
  });

  await db().from("assisted_notifications").insert({
    principal_user_id: ctx.principalUserId,
    draft_id: input.draftId ?? null,
    kind: "document_upload",
    message: `${input.originalFilename} was uploaded for you${
      ctx.organizationName ? ` by ${ctx.organizationName}` : ""
    }.`,
  });

  return { id: row.id as string };
}

/** Everything prepared for the signed-in client, newest first. */
export async function listPreparedForMe(userId: string | null | undefined) {
  if (!userId) return [];
  const { data } = await db()
    .from("assisted_drafts")
    .select("*")
    .eq("principal_user_id", userId)
    .order("created_at", { ascending: false });
  return decorate((data ?? []) as any[]);
}

/** Everything the signed-in professional has prepared. */
export async function listPreparedByMe(userId: string | null | undefined) {
  if (!userId) return [];
  const { data } = await db()
    .from("assisted_drafts")
    .select("*")
    .eq("prepared_by_user_id", userId)
    .order("created_at", { ascending: false });
  return decorate((data ?? []) as any[]);
}

async function decorate(rows: any[]) {
  const out: any[] = [];
  for (const row of rows) {
    const [{ data: org }, { data: preparer }] = await Promise.all([
      row.organization_id
        ? db().from("professional_organizations").select("name").eq("id", row.organization_id).maybeSingle()
        : Promise.resolve({ data: null }),
      db()
        .from("persons")
        .select("legal_first_name, legal_last_name, email")
        .eq("user_id", row.prepared_by_user_id)
        .maybeSingle(),
    ]);
    out.push({
      id: row.id,
      draftType: row.draft_type,
      title: row.title,
      status: row.status,
      targetType: row.target_type,
      targetId: row.target_id,
      before: row.before_state,
      proposed: row.proposed_state,
      final: row.final_state,
      preparerNote: row.preparer_note,
      clientNote: row.client_note,
      preparedBy:
        [preparer?.legal_first_name, preparer?.legal_last_name].filter(Boolean).join(" ") ||
        preparer?.email ||
        "Professional",
      firm: org?.name ?? null,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at,
      reviewedBy: row.reviewed_by_user_id,
    });
  }
  return out;
}

export type ReviewDecision = "approve" | "reject" | "request_changes";

/**
 * The client's own decision. Only the principal can make it — a professional
 * can never approve what they prepared, and approval records the client as the
 * approver, never the preparer.
 */
export async function reviewDraft(
  actorUserId: string | null | undefined,
  draftId: string,
  decision: ReviewDecision,
  note?: string | null,
) {
  if (!actorUserId) throw new Error("Forbidden: not signed in.");
  const { data: draft } = await db()
    .from("assisted_drafts")
    .select("*")
    .eq("id", draftId)
    .maybeSingle();
  if (!draft) throw new Error("That prepared item is not available.");

  // The legal attestation belongs to the client alone.
  if (draft.principal_user_id !== actorUserId) {
    throw new Error("Forbidden: only the client can decide on an item prepared for them.");
  }
  if (draft.status !== "awaiting_client_review") {
    throw new Error("That prepared item has already been decided.");
  }

  const status =
    decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "changes_requested";

  let applied: Record<string, unknown> | null = null;
  if (decision === "approve") applied = await applyDraft(draft);

  await db()
    .from("assisted_drafts")
    .update({
      status,
      client_note: note ?? null,
      reviewed_by_user_id: actorUserId,
      reviewed_at: new Date().toISOString(),
      final_state: applied,
      applied_at: applied ? new Date().toISOString() : null,
    })
    .eq("id", draftId);

  await draftEvent({
    draftId,
    principalUserId: draft.principal_user_id,
    preparedByUserId: draft.prepared_by_user_id,
    actorUserId,
    actorKind: "client",
    organizationId: draft.organization_id,
    delegationId: draft.delegation_id,
    action: decision,
    fromStatus: "awaiting_client_review",
    toStatus: status,
    payload: { before: draft.before_state, proposed: draft.proposed_state, final: applied, note: note ?? null },
  });

  await recordDelegationAudit({
    actorUserId,
    action: `assisted_draft_${status}`,
    organizationId: draft.organization_id,
    delegationId: draft.delegation_id,
    principalUserId: draft.principal_user_id,
    delegateUserId: draft.prepared_by_user_id,
    outcome: status,
    before: draft.before_state,
    after: applied ?? draft.proposed_state,
    detail: note ?? null,
  });

  return { status };
}

/**
 * Applies an approved draft — allowlisted fields only, re-checked at the moment
 * of writing. Kinds with no authoritative destination (identity/entity support,
 * accreditation, prepared investments, questionnaires) write nothing: they feed
 * the client's own workflow, where the attestation happens.
 */
async function applyDraft(draft: any): Promise<Record<string, unknown>> {
  const draftType = draft.draft_type as AssistedDraftType;
  const proposed = (draft.proposed_state ?? {}) as Record<string, unknown>;
  const { values } = sanitizeAssistedPayload(draftType, proposed);
  for (const key of Object.keys(values)) {
    if (isProtectedField(key)) throw new Error("Forbidden: protected field in prepared item.");
  }

  const destination = APPLY_TABLE[draftType];
  if (!destination) return values;

  if (destination.table === "persons") {
    await db().from("persons").update(values).eq("user_id", draft.principal_user_id);
    return values;
  }

  // entity_verifications is keyed by profile
  const { data: existing } = await db()
    .from("entity_verifications")
    .select("id")
    .eq("profile_id", draft.target_id)
    .maybeSingle();
  if (existing) {
    await db().from("entity_verifications").update(values).eq("id", existing.id);
  } else {
    await db()
      .from("entity_verifications")
      .insert({ profile_id: draft.target_id, ...values });
  }
  return values;
}

/** The lifecycle history of one prepared item, for either party. */
export async function draftHistory(actorUserId: string | null | undefined, draftId: string) {
  if (!actorUserId) return [];
  const { data: draft } = await db()
    .from("assisted_drafts")
    .select("principal_user_id, prepared_by_user_id")
    .eq("id", draftId)
    .maybeSingle();
  if (!draft) return [];
  if (draft.principal_user_id !== actorUserId && draft.prepared_by_user_id !== actorUserId) {
    return [];
  }
  const { data } = await db()
    .from("assisted_draft_events")
    .select("*")
    .eq("draft_id", draftId)
    .order("created_at", { ascending: false });
  return (data ?? []) as any[];
}
