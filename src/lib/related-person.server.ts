/**
 * Server-only related-person creation with safe candidate matching and
 * Harmonious resolution. Never merges or deletes People; never returns
 * candidate details to fund managers or investors.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { classifyRelatedMatch, resolutionError, type RelatedResolution } from "@/lib/related-person-model";
import { resolvePersonServer, withPersonCreationLock } from "@/lib/person-resolution.server";

const db = () => supabaseAdmin as any;

export type RelatedPersonInput = {
  profileId: string; offeringId?: string | null; firstName: string; lastName: string; email?: string | null;
  role: string; ownershipPercent?: number | null; isSigner?: boolean | undefined; actorUserId: string; entrySource?: string | null;
  verificationStatus?: string;
};

/**
 * Candidate discovery goes through the canonical Person Resolution Service.
 * For related persons every non-"no match" outcome — even an exact one — opens
 * review: matching a Person never grants authority or reuses them silently.
 */
async function findCandidates(input: { email?: string | null; firstName: string; lastName: string }) {
  const r = await resolvePersonServer({ email: input.email ?? null, firstName: input.firstName, lastName: input.lastName });
  return r.candidateIds;
}

/**
 * Creates the relationship on a new unclaimed Person. When any existing Person
 * could be the same individual, a Harmonious review item is opened instead of
 * reusing or merging. Returns only a neutral flag to the caller.
 */
export async function addRelatedPerson(input: RelatedPersonInput): Promise<{ relationshipId: string; underReview: boolean }> {
  return withPersonCreationLock({ email: input.email ?? null, firstName: input.firstName, lastName: input.lastName }, () => addRelatedPersonLocked(input));
}

async function addRelatedPersonLocked(input: RelatedPersonInput): Promise<{ relationshipId: string; underReview: boolean }> {
  const candidates = await findCandidates(input);
  const kind = classifyRelatedMatch(candidates);
  const email = input.email ? String(input.email).trim().toLowerCase() : null;
  const { data: person, error: pErr } = await db().from("persons").insert({
    user_id: null, legal_first_name: input.firstName.trim(), legal_last_name: input.lastName.trim(), email,
    entry_source: input.entrySource ?? null, created_by: input.actorUserId, onboarding_state: "account_created",
  }).select("id").single();
  if (pErr || !person) throw new Error(pErr?.message ?? "Could not save that person.");
  const { data: rel, error: rErr } = await db().from("investment_profile_relationships").insert({
    profile_id: input.profileId, person_id: person.id, role: input.role, ownership_percent: input.ownershipPercent ?? null,
    is_authorized_signer: Boolean(input.isSigner) || input.role === "authorized_signer", status: "active",
    verification_status: input.verificationStatus ?? "unverified", added_by: input.actorUserId,
  }).select("id").single();
  if (rErr || !rel) throw new Error(rErr?.message ?? "Could not save that relationship.");
  if (kind !== "none") {
    await db().from("related_person_reviews").insert({
      profile_id: input.profileId, relationship_id: rel.id, provisional_person_id: person.id, offering_id: input.offeringId ?? null,
      match_kind: kind, candidate_person_ids: candidates,
      supplied: { firstName: input.firstName, lastName: input.lastName, email, role: input.role, ownershipPercent: input.ownershipPercent ?? null, isSigner: Boolean(input.isSigner) || input.role === "authorized_signer" },
      created_by: input.actorUserId,
    });
  }
  return { relationshipId: rel.id as string, underReview: kind !== "none" };
}

/** Relationship ids with an open Harmonious review (neutral flag only). */
export async function relationshipsUnderReview(relationshipIds: string[]): Promise<Set<string>> {
  if (!relationshipIds.length) return new Set();
  const { data } = await db().from("related_person_reviews").select("relationship_id").in("relationship_id", relationshipIds).in("status", ["open", "review_later"]);
  return new Set(((data ?? []) as any[]).map((r) => r.relationship_id));
}

/** Staff-only queue with candidate summaries. Callers must verify staff first. */
export async function listRelatedPersonReviews() {
  const { data } = await db().from("related_person_reviews").select("*").in("status", ["open", "review_later"]).order("created_at").limit(200);
  const rows = (data ?? []) as any[];
  const ids = [...new Set(rows.flatMap((r) => r.candidate_person_ids ?? []))];
  const { data: people } = ids.length ? await db().from("persons").select("id, email, legal_first_name, legal_last_name, user_id").in("id", ids) : { data: [] };
  const byId = new Map(((people ?? []) as any[]).map((p) => [p.id, p]));
  return rows.map((r) => ({
    id: r.id, matchKind: r.match_kind, status: r.status, supplied: r.supplied, createdAt: r.created_at, offeringId: r.offering_id,
    candidates: (r.candidate_person_ids ?? []).map((id: string) => {
      const p = byId.get(id);
      return { id, name: p ? `${p.legal_first_name ?? ""} ${p.legal_last_name ?? ""}`.trim() : "Unknown", email: p?.email ?? null, claimed: Boolean(p?.user_id) };
    }),
  }));
}

/**
 * Explicit Harmonious resolution. "Use existing" re-points the same relationship
 * row to the chosen Person, so role, ownership and signer status are untouched.
 * The provisional Person is kept (never deleted); supplied details stay as provenance.
 */
export async function resolveRelatedPersonReview(input: { reviewId: string; resolution: RelatedResolution; personId?: string | null | undefined; note?: string | null | undefined; actorUserId: string }) {
  const { data: r } = await db().from("related_person_reviews").select("*").eq("id", input.reviewId).maybeSingle();
  if (!r) throw new Error("That review item was not found.");
  if (!["open", "review_later"].includes(r.status)) throw new Error("That review item is already resolved.");
  const err = resolutionError(input.resolution, input.personId, r.candidate_person_ids ?? []);
  if (err) throw new Error(err);
  const now = new Date().toISOString();
  if (input.resolution === "review_later") {
    await db().from("related_person_reviews").update({ status: "review_later", resolution_note: input.note ?? null }).eq("id", r.id);
    return { status: "review_later" };
  }
  if (input.resolution === "use_existing") {
    const { error } = await db().from("investment_profile_relationships").update({ person_id: input.personId }).eq("id", r.relationship_id);
    if (error) throw new Error(error.message);
  }
  const status = input.resolution === "use_existing" ? "used_existing" : "kept_new";
  await db().from("related_person_reviews").update({
    status, resolved_person_id: input.resolution === "use_existing" ? input.personId : r.provisional_person_id,
    resolved_by: input.actorUserId, resolved_at: now, resolution_note: input.note ?? null,
  }).eq("id", r.id);
  return { status };
}
