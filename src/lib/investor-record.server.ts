/**
 * Canonical investor record entry & sync (server-only).
 * Writes only the canonical Person / Investment Profile / Investment records,
 * logs field-level provenance, routes non-authoritative values to reviewer
 * suggestions, and reconciles readiness after every canonical change.
 * Never touches KYC/KYB, tax, accreditation evidence, Drive, email or money.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  onboardingActor, assertOnboardingAccess, forbid, launchedOffering, reconcileAfter, computeReadinessFor,
  type OnboardingActor,
} from "@/lib/investor-onboarding.server";
import {
  type EntrySource, type ProfileType, type BulkPreviewRow, type PersonCandidate,
  canManageFundRecords, sanitizePatch, sourceFor, rankMatches, createNewBlocker, validateQuickAdd, isProfileType,
  dbProfileType, formProfileType, profileLabelFor, recordStatus, RECORD_STATUS_LABELS, sameValue, isMaterial,
  parseCsv, classifyBulk, bulkSummary, committable, parseAmountCents, activityFor, removalBlocker, normEmail,
  planIncoming, PROFILE_TYPE_LABELS,
} from "@/lib/investor-record-model";

const db = () => supabaseAdmin as any;
const nowIso = () => new Date().toISOString();
function fail(m: string): never { throw new Error(m); }
const TERMINAL = "(closed,declined,cancelled)";

async function fundActor(userId: string, offeringId: string) {
  const actor = await onboardingActor(userId);
  if (!canManageFundRecords(actor, offeringId)) forbid("you do not manage that fund.");
  return actor;
}

type Change = { offeringId: string | null; onboardingId: string | null; table: string; id: string; field: string; from: unknown; to: unknown; source: EntrySource; actor: string | null; managerVisible?: boolean };
async function logChanges(rows: Change[]) {
  if (!rows.length) return;
  await db().from("investor_record_changes").insert(rows.map((c) => ({
    offering_id: c.offeringId, onboarding_id: c.onboardingId, subject_table: c.table, subject_id: c.id, field: c.field,
    old_value: c.from ?? null, new_value: c.to ?? null, source: c.source, actor_user_id: c.actor,
    manager_visible: c.managerVisible ?? !["internal_notes", "date_of_birth"].includes(c.field),
  })));
}
async function onbEvent(onboardingId: string | null, offeringId: string, event: string, actor: OnboardingActor, detail: Record<string, unknown> = {}) {
  await db().from("investor_onboarding_events").insert({
    onboarding_id: onboardingId, offering_id: offeringId, event, detail, actor_user_id: actor.userId,
    actor_role: actor.isStaff ? "harmonious" : "manager",
  });
}

/* ---------------------------------------------------------------- search */

async function candidates(offeringId: string, q: { email?: string | null; name?: string | null; entityName?: string | null }): Promise<(PersonCandidate & { address?: string | null })[]> {
  const ids = new Set<string>();
  const email = normEmail(q.email);
  if (email) {
    const { data } = await db().from("persons").select("id").ilike("email", email).limit(10);
    (data ?? []).forEach((p: any) => ids.add(p.id));
  }
  const name = String(q.name ?? "").trim();
  if (name.includes(" ")) {
    const first = name.split(/\s+/)[0]!, last = name.slice(name.indexOf(" ") + 1);
    const { data } = await db().from("persons").select("id").ilike("legal_first_name", first).ilike("legal_last_name", last).limit(10);
    (data ?? []).forEach((p: any) => ids.add(p.id));
  }
  const entity = String(q.entityName ?? "").trim();
  if (entity) {
    const { data } = await db().from("investment_profiles").select("person_id").ilike("legal_name", entity).not("person_id", "is", null).limit(10);
    (data ?? []).forEach((p: any) => ids.add(p.person_id));
  }
  return loadCandidates([...ids], offeringId);
}

async function loadCandidates(personIds: string[], offeringId: string) {
  if (!personIds.length) return [];
  const [{ data: people }, { data: profiles }, { data: inFund }] = await Promise.all([
    db().from("persons").select("id, user_id, email, legal_first_name, legal_last_name, address_line1, city").in("id", personIds),
    db().from("investment_profiles").select("id, person_id, owner_user_id, profile_type, legal_name").in("person_id", personIds),
    db().from("investor_onboardings").select("person_id").eq("offering_id", offeringId).in("person_id", personIds).is("removed_at", null).not("stage", "in", TERMINAL),
  ]);
  const inSet = new Set((inFund ?? []).map((r: any) => r.person_id));
  return ((people ?? []) as any[]).map((p) => ({
    personId: p.id, email: p.email, firstName: p.legal_first_name, lastName: p.legal_last_name,
    address: [p.address_line1, p.city].filter(Boolean).join(", ") || null,
    profiles: ((profiles ?? []) as any[]).filter((pr) => pr.person_id === p.id).map((pr) => ({ id: pr.id, type: pr.profile_type, legalName: pr.legal_name })),
    inFund: inSet.has(p.id),
  }));
}

export async function searchInvestors(userId: string, input: { offeringId: string; email?: string | null; name?: string | null; entityName?: string | null }) {
  await fundActor(userId, input.offeringId);
  return { matches: rankMatches(input, await candidates(input.offeringId, input)) };
}

/* ---------------------------------------------------------------- create */

export type PersonInput = {
  firstName?: string; middleName?: string | null; lastName?: string; preferredName?: string | null; email?: string;
  phone?: string | null; dateOfBirth?: string | null; citizenship?: string | null;
  addressLine1?: string | null; addressLine2?: string | null; city?: string | null; region?: string | null; postalCode?: string | null; country?: string | null;
  mailingAddress?: Record<string, string> | null;
};
export type ProfileInput = { type: string; subType?: string | null; legalName?: string | null; details?: Record<string, unknown> };
export type InvestmentInput = {
  amountCents?: number | null; commitmentCents?: number | null; acceptedCents?: number | null; investmentDate?: string | null;
  unitCount?: number | null; sourceReferral?: string | null; managerNotes?: string | null; internalNotes?: string | null;
};
export type RelatedInput = { firstName: string; lastName: string; email?: string | null; role: string; ownershipPercent?: number | null; isSigner?: boolean };
const RELATED_ROLES = new Set(["beneficial_owner", "control_person", "authorized_signer", "joint_owner", "trustee", "owner", "officer", "manager", "member"]);

function personRow(p: PersonInput, actor: OnboardingActor) {
  const raw = sanitizePatch({
    legal_first_name: p.firstName?.trim(), legal_middle_name: p.middleName ?? undefined, legal_last_name: p.lastName?.trim(),
    preferred_name: p.preferredName ?? undefined, email: p.email ? normEmail(p.email) : undefined, phone: p.phone ?? undefined,
    citizenship_country: p.citizenship ?? undefined, address_line1: p.addressLine1 ?? undefined, address_line2: p.addressLine2 ?? undefined,
    city: p.city ?? undefined, region: p.region ?? undefined, postal_code: p.postalCode ?? undefined, country: p.country ?? undefined,
    mailing_address: p.mailingAddress ?? undefined,
    // Date of birth is Harmonious-only: fund managers never enter or see it.
    ...(actor.isStaff && p.dateOfBirth ? { date_of_birth: p.dateOfBirth } : {}),
  } as Record<string, unknown>, actor);
  return raw;
}

function investmentRow(i: InvestmentInput, actor: OnboardingActor) {
  return sanitizePatch({
    requested_amount_cents: i.amountCents ?? undefined, commitment_amount_cents: i.commitmentCents ?? undefined,
    accepted_amount_cents: i.acceptedCents ?? undefined, investment_date: i.investmentDate ?? undefined,
    unit_count: i.unitCount ?? undefined, source_referral: i.sourceReferral ?? undefined,
    manager_notes: i.managerNotes ?? undefined, internal_notes: i.internalNotes ?? undefined,
  } as Record<string, unknown>, actor);
}

export async function createInvestor(userId: string, input: {
  offeringId: string; personId?: string | null; profileId?: string | null; confirmedNew?: boolean;
  person: PersonInput; profile: ProfileInput; investment: InvestmentInput; related?: RelatedInput[]; source?: EntrySource;
}) {
  const actor = await fundActor(userId, input.offeringId);
  await launchedOffering(input.offeringId);
  const source: EntrySource = input.source ?? sourceFor(actor);
  const changes: Change[] = [];

  // 1. Person — reuse when chosen; otherwise search first and never silently merge.
  let person: any;
  if (input.personId) {
    const { data } = await db().from("persons").select("*").eq("id", input.personId).maybeSingle();
    if (!data) fail("That investor record was not found.");
    person = data;
  } else {
    const errs = validateQuickAdd({ firstName: input.person.firstName, lastName: input.person.lastName, email: input.person.email, profileType: input.profile.type, amountCents: input.investment.amountCents ?? 0 });
    if (errs.length) fail(errs[0]!);
    const matches = rankMatches({ email: input.person.email }, await candidates(input.offeringId, { email: input.person.email }));
    const blocker = createNewBlocker(matches, Boolean(input.confirmedNew));
    if (blocker) fail(blocker);
    const row = personRow(input.person, actor);
    const { data, error } = await db().from("persons").insert({ ...row, user_id: null, entry_source: source, created_by: actor.userId, onboarding_state: "account_created" }).select("*").single();
    if (error) fail(error.message);
    person = data;
    changes.push(...Object.entries(row).map(([f, v]) => ({ offeringId: input.offeringId, onboardingId: null, table: "persons", id: person.id, field: f, from: null, to: v, source, actor: actor.userId })));
  }

  // 2. Investment Profile — a Person may hold many; reuse only one that is theirs.
  if (!isProfileType(input.profile.type) && !input.profileId) fail("Choose how they are investing.");
  let profileId = input.profileId ?? null;
  if (profileId) {
    const { data: pr } = await db().from("investment_profiles").select("id, person_id, owner_user_id").eq("id", profileId).maybeSingle();
    if (!pr || !(pr.person_id === person.id || (person.user_id && pr.owner_user_id === person.user_id))) forbid("that investment profile does not belong to this investor.");
  } else {
    const type = input.profile.type as ProfileType;
    const personName = `${person.legal_first_name ?? ""} ${person.legal_last_name ?? ""}`.trim() || "Investor";
    const details = sanitizePatch((input.profile.details ?? {}) as Record<string, unknown>, actor);
    const { data: pr, error } = await db().from("investment_profiles").insert({
      owner_user_id: person.user_id ?? null, person_id: person.id, profile_type: dbProfileType(type, input.profile.subType),
      display_label: profileLabelFor(type, input.profile.legalName ?? null, personName), legal_name: input.profile.legalName ?? (type === "individual" ? personName : null),
      details, status: "active", entry_source: source, created_by: actor.userId,
    }).select("id").single();
    if (error) fail(error.message);
    profileId = pr.id;
    changes.push({ offeringId: input.offeringId, onboardingId: null, table: "investment_profiles", id: pr.id, field: "profile_type", from: null, to: type, source, actor: actor.userId });
  }

  // 3. Investment — converge onto any open record instead of duplicating.
  const { data: dupe } = await db().from("investor_onboardings").select("id").eq("offering_id", input.offeringId).eq("investment_profile_id", profileId)
    .is("removed_at", null).not("stage", "in", TERMINAL).limit(1);
  if ((dupe ?? []).length) fail("This investing profile is already in this Fund.");

  const inv = investmentRow(input.investment, actor);
  let onboardingId: string | null = null;
  if (person.user_id) {
    // The investor already started this Fund without choosing a profile: attach, don't duplicate.
    const { data: open } = await db().from("investor_onboardings").select("id").eq("offering_id", input.offeringId).eq("investor_user_id", person.user_id)
      .is("investment_profile_id", null).is("removed_at", null).not("stage", "in", TERMINAL).limit(1);
    if ((open ?? [])[0]) {
      onboardingId = open[0].id;
      const { error } = await db().from("investor_onboardings").update({ investment_profile_id: profileId, ...inv, last_activity_at: nowIso() }).eq("id", onboardingId);
      if (error) fail(error.message);
    }
  }
  const { data: invitation } = await db().from("fund_invitations").select("id").eq("offering_id", input.offeringId).ilike("email", normEmail(person.email))
    .eq("invite_role", "investor").not("status", "in", "(revoked,cancelled,expired)").order("created_at", { ascending: false }).limit(1);
  if (!onboardingId) {
    const { data: created, error } = await db().from("investor_onboardings").insert({
      offering_id: input.offeringId, investor_user_id: person.user_id ?? null, person_id: person.id, investment_profile_id: profileId,
      invitation_id: (invitation ?? [])[0]?.id ?? null, stage: "profile_selected", entry_source: source, created_by: actor.userId, ...inv,
    }).select("id").single();
    if (error) {
      if ((error as any).code === "23505") fail("This investing profile is already in this Fund.");
      fail(error.message);
    }
    onboardingId = created.id;
  }
  changes.push({ offeringId: input.offeringId, onboardingId, table: "investor_onboardings", id: onboardingId!, field: "added_to_fund", from: null, to: { profileId }, source, actor: actor.userId });
  changes.push(...Object.entries(inv).map(([f, v]) => ({ offeringId: input.offeringId, onboardingId, table: "investor_onboardings", id: onboardingId!, field: f, from: null, to: v, source, actor: actor.userId })));
  for (const c of changes) if (!c.onboardingId) c.onboardingId = onboardingId;

  // 4. Related parties become their own (unclaimed) People on the profile.
  for (const r of input.related ?? []) {
    if (!RELATED_ROLES.has(r.role) || !r.firstName?.trim() || !r.lastName?.trim()) continue;
    const { data: rp } = await db().from("persons").insert({ user_id: null, legal_first_name: r.firstName.trim(), legal_last_name: r.lastName.trim(), email: r.email ? normEmail(r.email) : null, entry_source: source, created_by: actor.userId, onboarding_state: "account_created" }).select("id").single();
    if (!rp) continue;
    await db().from("investment_profile_relationships").insert({ profile_id: profileId, person_id: rp.id, role: r.role, ownership_percent: r.ownershipPercent ?? null, is_authorized_signer: Boolean(r.isSigner) || r.role === "authorized_signer", status: "active", verification_status: "unverified", added_by: actor.userId });
    changes.push({ offeringId: input.offeringId, onboardingId, table: "investment_profile_relationships", id: profileId!, field: `related:${r.role}`, from: null, to: `${r.firstName} ${r.lastName}`, source, actor: actor.userId });
  }

  await logChanges(changes);
  await onbEvent(onboardingId, input.offeringId, "investor_record_created", actor, { source });
  await reconcileAfter([onboardingId], { actorUserId: actor.userId, trigger: "manual_investor_entry" });
  return { onboardingId: onboardingId!, personId: person.id as string, profileId: profileId! };
}

/* ---------------------------------------------------------------- update */

const PERSON_FIELDS = ["legal_first_name", "legal_middle_name", "legal_last_name", "preferred_name", "email", "phone", "date_of_birth", "citizenship_country", "address_line1", "address_line2", "city", "region", "postal_code", "country", "mailing_address"];
const ADDRESS_FIELDS = new Set(["address_line1", "address_line2", "city", "region", "postal_code", "country"]);

/**
 * Apply edits. Harmonious edits apply directly. A Fund Manager's edits apply
 * directly only to records not supplied by the investor; material changes to
 * an investor-owned (claimed) Person become a reviewer suggestion instead.
 */
export async function updateInvestorRecord(userId: string, input: {
  onboardingId: string; person?: PersonInput; profile?: { legalName?: string | null; details?: Record<string, unknown> }; investment?: InvestmentInput;
}) {
  const { actor, row, role } = await assertOnboardingAccess(userId, input.onboardingId);
  if (role === "investor") forbid("use Confirm Your Information to update your own details.");
  if (row.removed_at) fail("This investor has been removed from the Fund.");
  const source = sourceFor(actor);
  const changes: Change[] = []; let suggested = 0;

  if (input.person && row.person_id) {
    const { data: cur } = await db().from("persons").select("*").eq("id", row.person_id).maybeSingle();
    const patch = personRow(input.person, actor);
    const apply: Record<string, unknown> = {};
    for (const [f, v] of Object.entries(patch)) {
      if (!PERSON_FIELDS.includes(f) || sameValue(cur?.[f], v)) continue;
      const investorOwned = Boolean(cur?.user_id) && (cur?.entry_source === "investor" || Boolean(row.investor_confirmed_at));
      const materialField = isMaterial(f) || ADDRESS_FIELDS.has(f) || f === "email";
      if (!actor.isStaff && investorOwned && materialField) {
        await db().from("investor_record_suggestions").insert({ offering_id: row.offering_id, onboarding_id: row.id, subject_table: "persons", subject_id: row.person_id, field: f, current_value: cur?.[f] ?? null, proposed_value: v, source, proposed_by: actor.userId });
        suggested++; continue;
      }
      apply[f] = v;
      changes.push({ offeringId: row.offering_id, onboardingId: row.id, table: "persons", id: row.person_id, field: f, from: cur?.[f] ?? null, to: v, source, actor: actor.userId });
    }
    if (Object.keys(apply).length) {
      const { error } = await db().from("persons").update({ ...apply, updated_at: nowIso() }).eq("id", row.person_id);
      if (error) fail(error.message);
    }
  }

  if (input.profile && row.investment_profile_id) {
    const { data: cur } = await db().from("investment_profiles").select("legal_name, details, status").eq("id", row.investment_profile_id).maybeSingle();
    if (cur?.status === "locked") fail("This investing profile is locked.");
    const apply: Record<string, unknown> = {};
    if (input.profile.legalName !== undefined && !sameValue(cur?.legal_name, input.profile.legalName)) {
      apply['legal_name'] = input.profile.legalName;
      changes.push({ offeringId: row.offering_id, onboardingId: row.id, table: "investment_profiles", id: row.investment_profile_id, field: "legal_name", from: cur?.legal_name ?? null, to: input.profile.legalName, source, actor: actor.userId });
    }
    if (input.profile.details) {
      const next = { ...(cur?.details ?? {}), ...sanitizePatch(input.profile.details, actor) };
      if (!sameValue(cur?.details ?? {}, next)) {
        apply['details'] = next;
        changes.push({ offeringId: row.offering_id, onboardingId: row.id, table: "investment_profiles", id: row.investment_profile_id, field: "details", from: cur?.details ?? {}, to: next, source, actor: actor.userId });
      }
    }
    if (Object.keys(apply).length) {
      const { error } = await db().from("investment_profiles").update({ ...apply, updated_at: nowIso() }).eq("id", row.investment_profile_id);
      if (error) fail(error.message);
    }
  }

  if (input.investment) {
    if (["closed", "declined", "cancelled"].includes(String(row.stage))) fail("This investment can no longer be changed.");
    const patch = investmentRow(input.investment, actor);
    // Accepted amount follows the existing acceptance workflow once accepted.
    if (row.accepted_at) delete (patch as any).accepted_amount_cents;
    const apply: Record<string, unknown> = {};
    for (const [f, v] of Object.entries(patch)) {
      if (sameValue(row[f], v)) continue;
      apply[f] = v;
      changes.push({ offeringId: row.offering_id, onboardingId: row.id, table: "investor_onboardings", id: row.id, field: f, from: row[f] ?? null, to: v, source, actor: actor.userId });
    }
    if (Object.keys(apply).length) {
      const { error } = await db().from("investor_onboardings").update({ ...apply, last_activity_at: nowIso() }).eq("id", row.id);
      if (error) fail(error.message);
    }
  }

  await logChanges(changes);
  if (changes.length) await reconcileAfter([row.id], { actorUserId: actor.userId, trigger: "investor_record_updated" });
  return { changed: changes.length, suggested };
}

/* ---------------------------------------------------------------- remove */

export async function removeFromFund(userId: string, input: { onboardingId: string; reason?: string | null }) {
  const { actor, row, role } = await assertOnboardingAccess(userId, input.onboardingId);
  if (role === "investor") forbid("only the Fund team can remove an investor.");
  if (row.removed_at) return { removed: true };
  const blocker = removalBlocker(String(row.stage), Number(row.funded_amount_cents ?? 0));
  if (blocker) fail(blocker);
  // Only the Fund relationship is disabled. Person, profiles, other Funds and history remain.
  const { error } = await db().from("investor_onboardings").update({ removed_at: nowIso(), removed_by: actor.userId, removal_reason: input.reason ?? null, stage: "cancelled", last_activity_at: nowIso() }).eq("id", row.id);
  if (error) fail(error.message);
  await logChanges([{ offeringId: row.offering_id, onboardingId: row.id, table: "investor_onboardings", id: row.id, field: "removed_from_fund", from: row.stage, to: "removed", source: sourceFor(actor), actor: actor.userId }]);
  await onbEvent(row.id, row.offering_id, "investor_removed_from_fund", actor, { reason: input.reason ?? null });
  await reconcileAfter([row.id], { actorUserId: actor.userId, trigger: "removed_from_fund" });
  return { removed: true };
}

/* ---------------------------------------------------------------- views */

function personName(p: any) { return (p?.preferred_name || `${p?.legal_first_name ?? ""} ${p?.legal_last_name ?? ""}`.trim()) || null; }

export async function fundInvestorRecords(userId: string, offeringId: string) {
  const actor = await fundActor(userId, offeringId);
  const { data: rows } = await db().from("investor_onboardings")
    .select("id, person_id, investor_user_id, investment_profile_id, stage, requested_amount_cents, commitment_amount_cents, accepted_amount_cents, entry_source, investor_confirmed_at, invitation_id, created_at")
    .eq("offering_id", offeringId).is("removed_at", null).not("stage", "in", "(declined,cancelled)").order("created_at", { ascending: false });
  const list = (rows ?? []) as any[];
  const personIds = [...new Set(list.map((r) => r.person_id).filter(Boolean))];
  const userIds = [...new Set(list.filter((r) => !r.person_id).map((r) => r.investor_user_id).filter(Boolean))];
  const profileIds = [...new Set(list.map((r) => r.investment_profile_id).filter(Boolean))];
  const ids = list.map((r) => r.id);
  const [{ data: people }, { data: byUser }, { data: profiles }, { data: sugg }] = await Promise.all([
    personIds.length ? db().from("persons").select("id, legal_first_name, legal_last_name, preferred_name, email, address_line1, user_id").in("id", personIds) : { data: [] },
    userIds.length ? db().from("persons").select("id, legal_first_name, legal_last_name, preferred_name, email, address_line1, user_id").in("user_id", userIds) : { data: [] },
    profileIds.length ? db().from("investment_profiles").select("id, display_label, profile_type").in("id", profileIds) : { data: [] },
    ids.length ? db().from("investor_record_suggestions").select("onboarding_id, source").in("onboarding_id", ids).eq("status", "open") : { data: [] },
  ]);
  const pMap = new Map(((people ?? []) as any[]).map((p) => [p.id, p]));
  const uMap = new Map(((byUser ?? []) as any[]).map((p) => [p.user_id, p]));
  const prMap = new Map(((profiles ?? []) as any[]).map((p) => [p.id, p]));
  return {
    isStaff: actor.isStaff,
    items: list.map((r) => {
      const p = r.person_id ? pMap.get(r.person_id) : uMap.get(r.investor_user_id);
      const pr = prMap.get(r.investment_profile_id);
      const open = ((sugg ?? []) as any[]).filter((s) => s.onboarding_id === r.id);
      const status = recordStatus({
        hasEmail: Boolean(p?.email), hasName: Boolean(personName(p)), hasProfile: Boolean(pr), hasAmount: Number(r.requested_amount_cents ?? 0) > 0,
        hasAddress: Boolean(p?.address_line1), entrySource: r.entry_source, investorConfirmed: Boolean(r.investor_confirmed_at),
        openConflicts: open.filter((s) => s.source !== "fund_manager").length, openReviews: open.filter((s) => s.source === "fund_manager").length,
      });
      return {
        onboardingId: r.id, name: personName(p) ?? "Investor", email: p?.email ?? null,
        profileLabel: pr?.display_label ?? null, profileType: pr ? PROFILE_TYPE_LABELS[formProfileType(pr.profile_type)] : null,
        amountCents: r.requested_amount_cents, commitmentCents: r.commitment_amount_cents,
        ...(actor.isStaff ? { acceptedCents: r.accepted_amount_cents } : {}),
        stage: r.stage, hasAccount: Boolean(r.investor_user_id), invited: Boolean(r.invitation_id),
        recordStatus: status, recordStatusLabel: RECORD_STATUS_LABELS[status],
        enteredBy: r.entry_source,
      };
    }),
  };
}

export async function investorRecordDetail(userId: string, onboardingId: string) {
  const { actor, row, role } = await assertOnboardingAccess(userId, onboardingId);
  if (role === "investor") forbid("this view is for the Fund team.");
  const staff = role === "staff";
  const [{ data: person }, { data: profile }, { data: rel }, { data: changes }, { data: sugg }, { data: offering }] = await Promise.all([
    row.person_id ? db().from("persons").select("*").eq("id", row.person_id).maybeSingle() : db().from("persons").select("*").eq("user_id", row.investor_user_id).maybeSingle(),
    row.investment_profile_id ? db().from("investment_profiles").select("id, profile_type, display_label, legal_name, details, entry_source").eq("id", row.investment_profile_id).maybeSingle() : { data: null },
    row.investment_profile_id ? db().from("investment_profile_relationships").select("id, person_id, role, ownership_percent, is_authorized_signer, status, persons:person_id(legal_first_name, legal_last_name)").eq("profile_id", row.investment_profile_id) : { data: [] },
    db().from("investor_record_changes").select("field, source, subject_table, created_at, manager_visible, old_value, new_value").eq("onboarding_id", row.id).order("created_at", { ascending: false }).limit(100),
    db().from("investor_record_suggestions").select("*").eq("onboarding_id", row.id).in("status", ["open", "review_later"]).order("created_at", { ascending: false }),
    db().from("offerings").select("id, name").eq("id", row.offering_id).maybeSingle(),
  ]);
  const { result } = await computeReadinessFor(row);
  const readiness = {
    ready: Boolean((result as any).closeReady), label: (result as any).closeReady ? "Ready to Close" : "Not Ready to Close",
    nextAction: (result as any).nextAction?.label ?? null,
    stages: ((result as any).stages ?? []).map((s: any) => ({ key: s.stage, label: s.title, status: s.status })),
  };
  // Sensitive boundary: tax IDs, KYC/AML status fields, ID images and DOB never leave for managers.
  const safePerson = person ? {
    firstName: person.legal_first_name, middleName: person.legal_middle_name, lastName: person.legal_last_name, preferredName: person.preferred_name,
    email: person.email, phone: person.phone, citizenship: person.citizenship_country,
    addressLine1: person.address_line1, addressLine2: person.address_line2, city: person.city, region: person.region, postalCode: person.postal_code, country: person.country,
    mailingAddress: person.mailing_address ?? null, hasAccount: Boolean(person.user_id), enteredBy: person.entry_source,
    ...(staff ? { dateOfBirth: person.date_of_birth, taxIdOnFile: Boolean(person.tax_id_last4 || person.tax_id_reference) } : {}),
    verificationLabel: person.identity_verified_at ? "Identity verification complete" : person.kyc_status === "pending" ? "Verification pending" : "Verification not started",
  } : null;
  return {
    viewer: role, fund: offering,
    overview: { name: personName(person) ?? "Investor", stage: row.stage, enteredBy: row.entry_source, investorConfirmedAt: row.investor_confirmed_at, removed: Boolean(row.removed_at) },
    person: safePerson,
    profile: profile ? { id: profile.id, type: formProfileType(profile.profile_type), typeLabel: PROFILE_TYPE_LABELS[formProfileType(profile.profile_type)], label: profile.display_label, legalName: profile.legal_name, details: profile.details ?? {} } : null,
    related: ((rel ?? []) as any[]).map((r) => ({ id: r.id, name: `${r.persons?.legal_first_name ?? ""} ${r.persons?.legal_last_name ?? ""}`.trim(), role: r.role, ownershipPercent: r.ownership_percent, signer: r.is_authorized_signer, status: r.status })),
    investment: {
      amountCents: row.requested_amount_cents, commitmentCents: row.commitment_amount_cents, investmentDate: row.investment_date, unitCount: row.unit_count,
      sourceReferral: row.source_referral, managerNotes: row.manager_notes, fundedCents: row.funded_amount_cents,
      ...(staff ? { acceptedCents: row.accepted_amount_cents, internalNotes: row.internal_notes } : {}),
    },
    readiness,
    activity: activityFor((changes ?? []) as any[], staff ? "staff" : "manager"),
    suggestions: staff ? ((sugg ?? []) as any[]).map((s) => ({ id: s.id, field: s.field, current: s.current_value, proposed: s.proposed_value, source: s.source, status: s.status, at: s.created_at })) : [],
    pendingReviewCount: (sugg ?? []).length,
    actor: { isStaff: actor.isStaff },
  };
}

/* ------------------------------------------------------- suggestions */

const APPLY_TABLES: Record<string, string> = { persons: "persons", investment_profiles: "investment_profiles", investor_onboardings: "investor_onboardings" };

/** Non-authoritative source (document / provider / bulk) proposes a value. Never applied automatically. */
export async function proposeUpdate(userId: string, input: { onboardingId: string; subjectTable: string; field: string; proposed: unknown; source: EntrySource; sourceRef?: string | null }) {
  const { actor, row, role } = await assertOnboardingAccess(userId, input.onboardingId);
  if (role !== "staff") forbid("Harmonious authority is required.");
  if (!APPLY_TABLES[input.subjectTable]) fail("Unsupported field.");
  const subjectId = input.subjectTable === "persons" ? row.person_id : input.subjectTable === "investment_profiles" ? row.investment_profile_id : row.id;
  const { data: cur } = await db().from(input.subjectTable).select(input.field).eq("id", subjectId).maybeSingle();
  const current = (cur as any)?.[input.field] ?? null;
  if (sameValue(current, input.proposed)) return { created: false };
  await db().from("investor_record_suggestions").insert({ offering_id: row.offering_id, onboarding_id: row.id, subject_table: input.subjectTable, subject_id: subjectId, field: input.field, current_value: current, proposed_value: input.proposed, source: input.source, source_ref: input.sourceRef ?? null, proposed_by: actor.userId });
  return { created: true };
}

export async function resolveSuggestion(userId: string, input: { id: string; action: "accept" | "reject" | "review_later" }) {
  const { data: s } = await db().from("investor_record_suggestions").select("*").eq("id", input.id).maybeSingle();
  if (!s) fail("That suggestion was not found.");
  const { actor, role } = await assertOnboardingAccess(userId, s.onboarding_id);
  if (role !== "staff") forbid("only Harmonious reviewers can resolve information conflicts.");
  if (s.status === "accepted" || s.status === "rejected") return { status: s.status };
  if (input.action === "accept") {
    const table = APPLY_TABLES[s.subject_table]; if (!table) fail("Unsupported field.");
    const { data: cur } = await db().from(table).select(s.field).eq("id", s.subject_id).maybeSingle();
    const { error } = await db().from(table).update({ [s.field]: s.proposed_value }).eq("id", s.subject_id);
    if (error) fail(error.message);
    await logChanges([{ offeringId: s.offering_id, onboardingId: s.onboarding_id, table, id: s.subject_id, field: s.field, from: (cur as any)?.[s.field] ?? null, to: s.proposed_value, source: "harmonious", actor: actor.userId }]);
    await reconcileAfter([s.onboarding_id], { actorUserId: actor.userId, trigger: "conflict_resolved" });
  }
  const status = input.action === "accept" ? "accepted" : input.action === "reject" ? "rejected" : "review_later";
  await db().from("investor_record_suggestions").update({ status, resolved_by: actor.userId, resolved_at: nowIso() }).eq("id", s.id);
  return { status };
}

/* ---------------------------------------------------------------- bulk */

export async function bulkPreview(userId: string, input: { offeringId: string; csv: string }) {
  const actor = await fundActor(userId, input.offeringId);
  const rows = parseCsv(input.csv).slice(0, 500);
  if (!rows.length) fail("The file has no investor rows.");
  const emails = [...new Set(rows.map((r) => normEmail(r.email)).filter(Boolean))];
  const { data: ps } = emails.length ? await db().from("persons").select("id").in("email", emails) : { data: [] };
  const people = await loadCandidates(((ps ?? []) as any[]).map((p) => p.id), input.offeringId);
  const preview = classifyBulk(rows, people);
  // Staff see matches as masked emails only; managers additionally never see existing names.
  const { data: staged, error } = await db().from("investor_bulk_imports").insert({ offering_id: input.offeringId, created_by: actor.userId, rows: preview, summary: bulkSummary(preview) }).select("id").single();
  if (error) fail(error.message);
  return {
    importId: staged.id as string, summary: bulkSummary(preview),
    rows: preview.map((r) => ({ index: r.index, cls: r.cls, errors: r.errors, name: `${r.input.first_name ?? ""} ${r.input.last_name ?? ""}`.trim(), email: r.input.email ?? "", amount: r.input.amount ?? "",
      conflicts: r.conflicts.map((c) => ({ field: c.field, current: actor.isStaff ? c.current : "(existing value)", proposed: c.proposed })) })),
  };
}

export async function bulkCommit(userId: string, input: { importId: string; decisions?: Record<string, "keep" | "use_imported" | "later"> }) {
  const { data: imp } = await db().from("investor_bulk_imports").select("*").eq("id", input.importId).maybeSingle();
  if (!imp) fail("That import was not found.");
  const actor = await fundActor(userId, imp.offering_id);
  if (imp.created_by !== actor.userId && !actor.isStaff) forbid("only the person who prepared this import can commit it.");
  if (imp.status !== "previewed") fail("This import has already been handled.");
  const rows = imp.rows as BulkPreviewRow[];
  const results: { index: number; ok: boolean; message?: string; onboardingId?: string }[] = [];
  const reviewRows = rows.filter((r) => r.cls === "needs_review" && r.personId);
  for (const r of [...committable(rows), ...reviewRows]) {
    try {
      const type = (r.input.profile_type || "individual").toLowerCase();
      const created = await createInvestor(userId, {
        offeringId: imp.offering_id, personId: r.personId, source: "bulk",
        person: { firstName: r.input.first_name, lastName: r.input.last_name, email: r.input.email, phone: r.input.phone ?? null, addressLine1: r.input.address ?? null },
        profile: { type, legalName: r.input.entity_name || null },
        investment: { amountCents: parseAmountCents(r.input.amount), commitmentCents: parseAmountCents(r.input.commitment) },
      });
      // Conflicting values are never overwritten silently.
      for (const c of r.conflicts) {
        const d = input.decisions?.[`${r.index}:${c.field}`] ?? "later";
        if (d === "keep") continue;
        const table = c.field === "address" ? "persons" : "persons"; const field = c.field === "address" ? "address_line1" : c.field;
        if (d === "use_imported" && actor.isStaff) {
          await db().from(table).update({ [field]: c.proposed }).eq("id", r.personId);
          await logChanges([{ offeringId: imp.offering_id, onboardingId: created.onboardingId, table, id: r.personId!, field, from: c.current, to: c.proposed, source: "harmonious", actor: actor.userId }]);
        } else {
          await db().from("investor_record_suggestions").insert({ offering_id: imp.offering_id, onboarding_id: created.onboardingId, subject_table: table, subject_id: r.personId, field, current_value: c.current, proposed_value: c.proposed, source: "bulk", source_ref: imp.id, proposed_by: actor.userId });
        }
      }
      results.push({ index: r.index, ok: true, onboardingId: created.onboardingId });
    } catch (e) { results.push({ index: r.index, ok: false, message: (e as Error).message }); }
  }
  await db().from("investor_bulk_imports").update({ status: "committed", committed_at: nowIso(), summary: { ...imp.summary, results } }).eq("id", imp.id);
  return { results };
}

export async function bulkCancel(userId: string, importId: string) {
  const { data: imp } = await db().from("investor_bulk_imports").select("offering_id, status").eq("id", importId).maybeSingle();
  if (!imp) fail("That import was not found.");
  await fundActor(userId, imp.offering_id);
  if (imp.status === "previewed") await db().from("investor_bulk_imports").update({ status: "cancelled" }).eq("id", importId);
  return { cancelled: true };
}

/* ------------------------------------------------ claim & confirmation */

/**
 * On verified sign-in, continue records Harmonious or a Fund Manager prepared.
 * Links only when exactly one unclaimed Person has this verified email and the
 * user has no Person yet; anything ambiguous goes to Harmonious review.
 */
export async function claimPreparedRecords(userId: string): Promise<{ claimed: boolean; review?: boolean }> {
  const { data: me } = await db().auth.admin.getUserById(userId);
  const email = normEmail(me?.user?.email);
  if (!email || !me?.user?.email_confirmed_at) return { claimed: false };
  const { data: unclaimed } = await db().from("persons").select("id").is("user_id", null).ilike("email", email).limit(3);
  const list = (unclaimed ?? []) as any[];
  if (!list.length) return { claimed: false };
  const { data: own } = await db().from("persons").select("id").eq("user_id", userId).maybeSingle();
  if (own || list.length > 1) {
    const { data: onb } = await db().from("investor_onboardings").select("id, offering_id").in("person_id", list.map((p) => p.id)).is("investor_user_id", null).limit(10);
    for (const o of (onb ?? []) as any[]) {
      const { data: exists } = await db().from("investor_record_suggestions").select("id").eq("onboarding_id", o.id).eq("field", "account_link").in("status", ["open", "review_later"]).limit(1);
      if (!(exists ?? []).length) await db().from("investor_record_suggestions").insert({ offering_id: o.offering_id, onboarding_id: o.id, subject_table: "persons", subject_id: own?.id ?? null, field: "account_link", current_value: null, proposed_value: { userId }, source: "provider", proposed_by: null });
    }
    return { claimed: false, review: true };
  }
  const personId = list[0].id as string;
  const { error } = await db().from("persons").update({ user_id: userId, updated_at: nowIso() }).eq("id", personId).is("user_id", null);
  if (error) return { claimed: false };
  await db().from("investment_profiles").update({ owner_user_id: userId }).eq("person_id", personId).is("owner_user_id", null);
  const { data: onbs } = await db().from("investor_onboardings").update({ investor_user_id: userId }).eq("person_id", personId).is("investor_user_id", null).select("id, offering_id");
  await logChanges(((onbs ?? []) as any[]).map((o) => ({ offeringId: o.offering_id, onboardingId: o.id, table: "persons", id: personId, field: "claimed", from: null, to: "account_linked", source: "investor" as EntrySource, actor: userId })));
  return { claimed: true };
}

const INVESTOR_EDITABLE = ["preferred_name", "phone", "address_line1", "address_line2", "city", "region", "postal_code", "country", "mailing_address"];
const FIELD_NAMES: Record<string, string> = {
  legal_first_name: "First name", legal_last_name: "Last name", preferred_name: "Preferred name", email: "Email", phone: "Phone",
  address_line1: "Address", address_line2: "Address line 2", city: "City", region: "State / region", postal_code: "Postal code", country: "Country",
  requested_amount_cents: "Investment amount", commitment_amount_cents: "Commitment amount",
};

export async function prefillForInvestor(userId: string, onboardingId: string) {
  const { row, role } = await assertOnboardingAccess(userId, onboardingId);
  if (role !== "investor") forbid("only the investor can confirm their information.");
  if (row.entry_source === "investor") return { needed: false, fields: [] };
  const [{ data: person }, { data: changes }] = await Promise.all([
    row.person_id ? db().from("persons").select("*").eq("id", row.person_id).maybeSingle() : { data: null },
    db().from("investor_record_changes").select("field, source").eq("onboarding_id", row.id).order("created_at", { ascending: true }),
  ]);
  const supplier = new Map<string, string>(); for (const c of (changes ?? []) as any[]) supplier.set(c.field, c.source);
  const fields = Object.keys(FIELD_NAMES).map((f) => ({
    key: f, label: FIELD_NAMES[f]!, value: f in (row as any) ? row[f] : person?.[f] ?? null,
    suppliedBy: supplier.get(f) ?? null, editable: INVESTOR_EDITABLE.includes(f),
  }));
  return { needed: !row.investor_confirmed_at, confirmedAt: row.investor_confirmed_at, fields };
}

export async function confirmInvestorInformation(userId: string, input: { onboardingId: string; corrections?: Record<string, string> }) {
  const { row, role } = await assertOnboardingAccess(userId, input.onboardingId);
  if (role !== "investor") forbid("only the investor can confirm their information.");
  const changes: Change[] = [];
  if (row.person_id && input.corrections) {
    const { data: cur } = await db().from("persons").select("*").eq("id", row.person_id).maybeSingle();
    const apply: Record<string, unknown> = {};
    for (const [f, v] of Object.entries(input.corrections)) {
      if (!INVESTOR_EDITABLE.includes(f) || sameValue(cur?.[f], v)) continue;
      apply[f] = v;
      changes.push({ offeringId: row.offering_id, onboardingId: row.id, table: "persons", id: row.person_id, field: f, from: cur?.[f] ?? null, to: v, source: "investor", actor: userId });
    }
    if (Object.keys(apply).length) await db().from("persons").update({ ...apply, updated_at: nowIso() }).eq("id", row.person_id);
  }
  await db().from("investor_onboardings").update({ investor_confirmed_at: nowIso(), last_activity_at: nowIso() }).eq("id", row.id);
  changes.push({ offeringId: row.offering_id, onboardingId: row.id, table: "investor_onboardings", id: row.id, field: "investor_confirmed", from: null, to: true, source: "investor", actor: userId });
  await logChanges(changes);
  await reconcileAfter([row.id], { actorUserId: userId, trigger: "investor_confirmed_information" });
  return { confirmed: true, corrected: changes.length - 1 };
}

export { planIncoming };
