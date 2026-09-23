/**
 * The shared Harmonious address service (server only).
 *
 * One code path records every authoritative address on the platform:
 * it validates, compares against what is already on file, versions rather than
 * overwrites, keeps provenance, and leaves the compliance decision to
 * Harmonious. Nothing here can be driven from the browser.
 */

import { compareAddressComponents, comparisonNeedsReview } from "@/lib/address-compare";
import {
  applyProofRequirement,
  changeRequirements,
  isResidenceEvidenced,
  isVerbatimSource,
  planAddressVersion,
  stateForVerdict,
  type AddressKind,
  type AddressOwnerType,
  type AddressRecordState,
  type AddressRecordStatus,
  type AddressSource,
  type AddressUsageContext,
} from "@/lib/address-model";
import { cleanAddress, type StructuredAddress } from "@/lib/address-validation";
import type { ValidationOutcome } from "@/lib/address-lookup.server";

export interface RecordAddressInput {
  ownerType: AddressOwnerType;
  ownerId: string;
  /** Set for person-owned addresses so the existing KYC joins keep working. */
  personId?: string | null;
  kind: AddressKind;
  address: Partial<StructuredAddress>;
  entryMethod: "autocomplete" | "manual";
  source: AddressSource;
  actorUserId?: string | null;
  placeId?: string | null;
  proofRequired?: boolean;
  /** Skips the provider call (used when replaying provider-supplied data). */
  validation?: ValidationOutcome | null;
  verificationId?: string | null;
}

export interface RecordAddressResult {
  id: string;
  version: number;
  state: AddressRecordState;
  status: AddressRecordStatus;
  comparison: ReturnType<typeof compareAddressComponents>["result"];
  differences: string[];
  reason: string;
  reviewRequired: boolean;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function currentAddress(
  ownerType: AddressOwnerType,
  ownerId: string,
  kind: AddressKind = "residential",
) {
  const db = await admin();
  const { data } = await db
    .from("person_addresses")
    .select("*")
    .eq("owner_type", ownerType)
    .eq("owner_id", ownerId)
    .eq("address_kind", kind)
    .eq("record_status", "effective")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

export async function pendingAddress(
  ownerType: AddressOwnerType,
  ownerId: string,
  kind: AddressKind = "residential",
) {
  const db = await admin();
  const { data } = await db
    .from("person_addresses")
    .select("*")
    .eq("owner_type", ownerType)
    .eq("owner_id", ownerId)
    .eq("address_kind", kind)
    .eq("record_status", "pending")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

export async function addressHistory(
  ownerType: AddressOwnerType,
  ownerId: string,
  kind?: AddressKind,
) {
  const db = await admin();
  let query = db
    .from("person_addresses")
    .select("*")
    .eq("owner_type", ownerType)
    .eq("owner_id", ownerId)
    .order("version", { ascending: false });
  if (kind) query = query.eq("address_kind", kind);
  const { data } = await query;
  return data ?? [];
}

function rowParts(row: Record<string, any> | null) {
  if (!row) return null;
  return {
    line1: row["line1"] ?? null,
    line2: row["line2"] ?? null,
    city: row["city"] ?? null,
    region: row["region"] ?? null,
    postalCode: row["postal_code"] ?? null,
    country: row["country"] ?? null,
  };
}

/**
 * Records an address version. A verified address is never overwritten: a
 * different address arrives as a pending version and the verified one stays
 * effective until policy is satisfied.
 */
export async function recordAddress(input: RecordAddressInput): Promise<RecordAddressResult> {
  const db = await admin();
  const clean = cleanAddress(input.address);
  if (!clean.line1 || !clean.country) throw new Error("Enter a street address and country.");

  let validation = input.validation ?? null;
  if (validation === null) {
    const { validateAddress } = await import("@/lib/address-lookup.server");
    validation = await validateAddress(clean);
  }

  const existing = await currentAddress(input.ownerType, input.ownerId, input.kind);
  const comparison = compareAddressComponents(rowParts(existing), clean);

  const entry = stateForVerdict(validation?.verdict ?? null, input.entryMethod);
  let state = applyProofRequirement(entry.state, input.proofRequired === true);
  let reason = entry.reason;

  const existingState = (existing?.["state"] ?? "entered") as AddressRecordState;
  const existingSource = (existing?.["source"] ?? "user_entered") as AddressSource;

  if (existing) {
    const policy = changeRequirements({
      previousState: existingState,
      comparison: comparison.result,
      proofRequiredByPolicy: input.proofRequired === true,
    });
    if (policy.requiresProof && state !== "review_required") state = "proof_required";
    if (policy.requiresComplianceReview) {
      state = "review_required";
      reason = policy.reason;
    }
  }
  if (comparisonNeedsReview(comparison.result) && existing && isResidenceEvidenced(existingState)) {
    state = "review_required";
    reason = "The new address differs materially from the verified address on file.";
  }

  const plan = existing
    ? planAddressVersion({
        currentState: existingState,
        currentStatus: (existing["record_status"] ?? "effective") as AddressRecordStatus,
        incomingSource: input.source,
        existingSource,
      })
    : { status: "effective" as AddressRecordStatus, keepExistingEffective: false, reason };

  // A verbatim source keeps the exact wording it was supplied with; the
  // provider result is kept alongside it for comparison only.
  const verbatim = isVerbatimSource(input.source);
  const formatted = verbatim ? (clean.formatted ?? null) : (validation?.formatted ?? clean.formatted ?? null);

  const version = (existing?.["version"] ?? 0) + 1;
  const nowIso = new Date().toISOString();

  const { data: inserted, error } = await db
    .from("person_addresses")
    .insert({
      person_id: input.personId ?? (input.ownerType === "person" ? input.ownerId : null),
      owner_type: input.ownerType,
      owner_id: input.ownerId,
      address_kind: input.kind,
      line1: clean.line1,
      line2: clean.line2,
      city: clean.city,
      region: clean.region,
      postal_code: clean.postalCode,
      country: clean.country,
      formatted,
      entry_method: input.entryMethod,
      source: input.source,
      place_id: input.placeId ?? validation?.placeId ?? null,
      validation_provider: validation && validation.verdict !== "unavailable" ? validation.provider : null,
      provider_verdict: validation?.verdict ?? null,
      validated_at: validation?.validatedAt ?? null,
      validation_result: {
        verdict: validation?.verdict ?? "unavailable",
        warnings: validation?.warnings ?? [],
        normalized: validation?.formatted ?? null,
        components: validation?.components ?? {},
        ...(validation?.raw ?? {}),
      },
      comparison: {
        result: comparison.result,
        differences: comparison.differences,
        against_version: existing?.["version"] ?? null,
      },
      state,
      state_reason: reason,
      review_reason: state === "review_required" ? reason : null,
      version,
      supersedes_id: existing?.["id"] ?? null,
      record_status: plan.status,
      is_current: plan.status === "effective",
      verification_id: input.verificationId ?? null,
      created_by: input.actorUserId ?? null,
    })
    .select("id, version, state, record_status")
    .single();
  if (error) throw new Error(error.message);

  if (plan.status === "effective" && existing) {
    await db
      .from("person_addresses")
      .update({ record_status: "superseded", is_current: false, updated_at: nowIso })
      .eq("id", existing["id"]);
  }

  await db.from("address_verification_events").insert({
    address_id: inserted.id,
    person_id: input.personId ?? (input.ownerType === "person" ? input.ownerId : null),
    from_state: existing ? existingState : null,
    to_state: state,
    source: input.source,
    actor_user_id: input.actorUserId ?? null,
    detail: {
      reason,
      version,
      status: plan.status,
      provider_verdict: validation?.verdict ?? "unavailable",
      comparison: comparison.result,
      differences: comparison.differences,
    },
  });

  return {
    id: inserted.id,
    version,
    state,
    status: plan.status,
    comparison: comparison.result,
    differences: comparison.differences,
    reason: plan.status === "pending" ? plan.reason : reason,
    reviewRequired: state === "review_required",
  };
}

/**
 * Pins the exact address version a historical event was made with. The pin is
 * immutable: later address changes never rewrite it.
 */
export async function pinAddressUsage(input: {
  addressId: string;
  context: AddressUsageContext;
  contextId?: string | null;
  ownerType: AddressOwnerType;
  ownerId: string;
  recordedBy?: string | null;
  detail?: Record<string, unknown>;
}) {
  const db = await admin();
  const { data: existing } = await db
    .from("address_usages")
    .select("id, address_id")
    .eq("context", input.context)
    .eq("context_id", input.contextId ?? "")
    .maybeSingle();
  if (existing) return existing;
  const { data } = await db
    .from("address_usages")
    .insert({
      address_id: input.addressId,
      context: input.context,
      context_id: input.contextId ?? null,
      owner_type: input.ownerType,
      owner_id: input.ownerId,
      recorded_by: input.recordedBy ?? null,
      detail: input.detail ?? {},
    })
    .select("id, address_id")
    .single();
  return data;
}

export async function addressForUsage(context: AddressUsageContext, contextId: string) {
  const db = await admin();
  const { data } = await db
    .from("address_usages")
    .select("address_id, created_at, person_addresses:address_id (*)")
    .eq("context", context)
    .eq("context_id", contextId)
    .maybeSingle();
  return data ?? null;
}
