import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { onboardingActor, forbid } from "@/lib/investor-onboarding.server";
import { allowsMultipleContacts, canAssignParticipant, participantCanPrepare, participantRoleLabel, type ParticipantRole } from "@/lib/onboarding-participants-model";
import { eligibleParticipantInvitation, visibleParticipantAssignment } from "@/lib/participant-home-model";

// Server-only. People who help complete an investment for the investor:
// a preparer (fills details, uploads, owners/signers) and the named signer.
// A preparer never verifies identity, signs, approves or moves money.
const db = () => supabaseAdmin as any;
function fail(m: string): never { throw new Error(m); }
const nowIso = () => new Date().toISOString();

async function onboarding(onboardingId: string) {
  const { data } = await db().from("investor_onboardings").select("id, offering_id, investor_user_id, investment_profile_id, removed_at, persons(email, legal_first_name, legal_last_name), offerings(name)").eq("id", onboardingId).maybeSingle();
  if (!data || data.removed_at) fail("That investor record was not found.");
  return data as any;
}

async function access(userId: string, row: any) {
  const actor = await onboardingActor(userId);
  const role = actor.isStaff ? "harmonious" : actor.managedOfferingIds.includes(row.offering_id) ? "manager" : row.investor_user_id === userId ? "investor" : null;
  if (!role) forbid("you do not have access to that investor.");
  return { actor, role: role as "harmonious" | "manager" | "investor" };
}

async function userEmail(userId: string) {
  const { data } = await (supabaseAdmin as any).auth.admin.getUserById(userId);
  return String(data?.user?.email ?? "").trim().toLowerCase();
}

/** Read-only discovery of existing helper/contact entry points, scoped to the authenticated email. */
export async function liveParticipantInvitations(email: string) {
  if (!email) return [];
  const { data, error } = await db().from("onboarding_participants")
    .select("id, onboarding_id, role, email, status, removed_at, user_id, token")
    .eq("email", email).in("role", ["preparer", "contact"]).in("status", ["invited", "active"]).is("removed_at", null).limit(50);
  if (error) fail("Your assigned investments could not be loaded. Please try again.");
  if (!data?.length) return [];
  // The legacy participant table has no FK: resolve its recorded IDs explicitly instead of a failing embedded join.
  const { data: investments, error: investmentError } = await db().from("investor_onboardings")
    .select("id, stage, removed_at, merged_into_onboarding_id, offerings(name), investment_profiles(legal_name, display_label)")
    .in("id", [...new Set((data as any[]).map((p) => p.onboarding_id))]);
  if (investmentError) fail("Your assigned investments could not be loaded. Please try again.");
  const byId = new Map(((investments ?? []) as any[]).map((row) => [row.id, row]));
  return (data as any[]).map((p) => ({ ...p, investor_onboardings: byId.get(p.onboarding_id) ?? null }))
    .filter((p) => eligibleParticipantInvitation(p, email));
}

/** Is this login a trustee/owner/signer listed on the investment's trust or entity? */
async function listedOnInvestment(userId: string, email: string, onboardingId: string) {
  const { data: row } = await db().from("investor_onboardings").select("investment_profile_id, investment_profiles(profile_type)").eq("id", onboardingId).maybeSingle();
  const profileType = (row as any)?.investment_profiles?.profile_type ?? null;
  if (!row?.investment_profile_id) return { profileType, listed: false };
  const { data: rel } = await db().from("investment_profile_relationships").select("status, persons(user_id, email)").eq("profile_id", row.investment_profile_id).neq("status", "removed");
  const listed = ((rel ?? []) as any[]).some((r) => r.persons?.user_id === userId || (!!email && String(r.persons?.email ?? "").trim().toLowerCase() === email));
  return { profileType, listed };
}

async function canPrepare(userId: string, email: string, p: any) {
  if (p.role === "preparer") return true;
  if (p.role !== "contact") return false;
  const { profileType, listed } = await listedOnInvestment(userId, email, p.onboarding_id);
  return participantCanPrepare({ role: p.role, profileType, listedOnInvestment: listed });
}

export async function myParticipantAssignments(userId: string) {
  const email = await userEmail(userId);
  const rows = (await liveParticipantInvitations(email)).filter(p => !p.user_id || p.user_id === userId);
  const prepares = await Promise.all(rows.map((p) => canPrepare(userId, email, p)));
  return rows.map((p, i) => ({
      id: String(p.id), onboardingId: String(p.onboarding_id),
      fundName: String(p.investor_onboardings.offerings?.name ?? "Fund"),
      investingAs: String(p.investor_onboardings.investment_profiles?.legal_name || p.investor_onboardings.investment_profiles?.display_label || "Investor"),
      role: (prepares[i] ? "preparer" : p.role) as "preparer" | "contact", roleLabel: prepares[i] && p.role !== "preparer" ? "Trustee or owner · completes paperwork" : participantRoleLabel(p.role),
      href: `/onboard/${prepares[i] ? "prepare" : "contact"}/${p.token}`,
    }));
}

async function event(row: any, ev: string, userId: string, actorRole: string, detail: Record<string, unknown>) {
  await db().from("investor_onboarding_events").insert({ onboarding_id: row.id, offering_id: row.offering_id, event: ev, detail, actor_user_id: userId, actor_role: actorRole });
}

export async function participantDisplay(p: any) {
  const email = String(p.email ?? '').trim().toLowerCase();
  const prepares = visibleParticipantAssignment(p, email) && await canPrepare(String(p.user_id ?? ''), email, p);
  return { canPrepare: prepares, roleLabel: prepares ? 'Prepares details' : participantRoleLabel(p.role) };
}

export async function listParticipants(userId: string, onboardingId: string) {
  const row = await onboarding(onboardingId);
  await access(userId, row);
  const { data } = await db().from("onboarding_participants").select("id, onboarding_id, role, full_name, email, user_id, title, status, assigned_by_role, created_at, removed_at").eq("onboarding_id", onboardingId).order("created_at");
  const { data: pr } = row.investment_profile_id ? await db().from("investment_profiles").select("profile_type").eq("id", row.investment_profile_id).maybeSingle() : { data: null };
  return { profileType: (pr?.profile_type ?? null) as string | null, multipleContacts: allowsMultipleContacts(pr?.profile_type), participants: await Promise.all(((data ?? []) as any[]).map(async p => ({ id: p.id, role: p.role as ParticipantRole, ...await participantDisplay(p), name: p.full_name, email: p.email, title: p.title, status: p.status, assignedBy: p.assigned_by_role, createdAt: p.created_at, removedAt: p.removed_at }))) };
}

export async function assignParticipant(userId: string, input: { onboardingId: string; role: ParticipantRole; fullName: string; email: string; title?: string | null | undefined }) {
  const row = await onboarding(input.onboardingId);
  const { role } = await access(userId, row);
  if (!canAssignParticipant(role)) forbid("you cannot assign people to this investment.");
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail("Enter a valid email.");
  const { data: existing } = await db().from("onboarding_participants").select("id, email").eq("onboarding_id", row.id).eq("role", input.role).neq("status", "removed");
  if (input.role === "signer" && (existing ?? []).length) fail("Remove the current signer before naming a new one.");
  if (input.role === "contact") {
    const { data: pr } = row.investment_profile_id ? await db().from("investment_profiles").select("profile_type").eq("id", row.investment_profile_id).maybeSingle() : { data: null };
    if (!allowsMultipleContacts(pr?.profile_type)) fail("Extra points of contact are for joint accounts, entities and trusts. Change how they're investing first.");
    if (((existing ?? []) as any[]).some((e) => String(e.email).toLowerCase() === email)) fail("That person is already a point of contact.");
    if (((existing ?? []) as any[]).length >= 10) fail("Up to 10 points of contact per investment.");
  }
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const { data: p, error } = await db().from("onboarding_participants").insert({ onboarding_id: row.id, offering_id: row.offering_id, role: input.role, full_name: input.fullName.trim(), email, title: input.title?.trim() || null, token, assigned_by: userId, assigned_by_role: role }).select("id").single();
  if (error) fail(error.message);
  await event(row, "participant_assigned", userId, role, { participantId: p.id, role: input.role, email });

  // Email the assignment. Preparers get their own page; signers are told what they will sign; contacts get a view link.
  const fund = String(row.offerings?.name ?? "the fund");
  const investor = `${row.persons?.legal_first_name ?? ""} ${row.persons?.legal_last_name ?? ""}`.trim() || "an investor";
  const prepares = await canPrepare('', email, { role: input.role, onboarding_id: row.id });
  const { ONBOARD_ORIGIN } = await import("@/lib/onboard-portal-model");
  const subject = prepares ? `You've been asked to help complete an investment in ${fund}`
    : input.role === "contact" ? `You've been added as a point of contact for an investment in ${fund}`
    : `You've been named signer for an investment in ${fund}`;
  const body = prepares
    ? `${investor} has asked you to fill in their investor details for ${fund}. Sign in with this email address to start:\n\n${ONBOARD_ORIGIN}/onboard/prepare/${token}\n\nYou can enter details, owners and signers, and upload documents. Identity checks, signing and funding stay with the investor and their signer.`
    : input.role === "contact"
    ? `You've been added as a point of contact for ${investor}'s investment in ${fund}. Sign in with this email address to see the investment and its progress:\n\n${ONBOARD_ORIGIN}/onboard/contact/${token}\n\nThis access is view only.`
    : `You've been named the signer for ${investor}'s investment in ${fund}. Once the details are complete, you'll review them and sign the subscription documents.`;
  let messageId: string | null = null; let note: string | null = null;
  try {
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    const r = await sendTemplateEmail("investor-message", email, { templateData: { investorName: input.fullName, offeringName: fund, subject, body } });
    messageId = (r as any)?.messageId ?? null;
  } catch (e) { note = (e as Error).message.slice(0, 300); }
  const { logInvestorEmail } = await import("@/lib/investor-emails.server");
  await logInvestorEmail({ onboardingId: row.id, offeringId: row.offering_id, kind: `${input.role}_invite`, subject, recipient: email, messageId, sentBy: userId, outcome: note ? "failed" : "sent", note });
  return { id: p.id, emailSent: !note, canPrepare: prepares };
}

export async function removeParticipant(userId: string, participantId: string) {
  const { data: p } = await db().from("onboarding_participants").select("*").eq("id", participantId).maybeSingle();
  if (!p) fail("That person was not found.");
  const row = await onboarding(p.onboarding_id);
  const { role } = await access(userId, row);
  if (!canAssignParticipant(role)) forbid("you cannot change people on this investment.");
  if (p.status === "removed") return { ok: true };
  const { error } = await db().from("onboarding_participants").update({ status: "removed", removed_at: nowIso(), removed_by: userId }).eq("id", p.id);
  if (error) fail(error.message);
  await event(row, "participant_removed", userId, role, { participantId: p.id, role: p.role, email: p.email });
  return { ok: true };
}

/** The signed-in user must be this exact, still-active preparer (matched by email). */
export async function activePreparer(userId: string, participantId: string, onboardingId?: string) {
  const { data: p } = await db().from("onboarding_participants").select("*").eq("id", participantId).maybeSingle();
  if (!p || (p.role !== "preparer" && p.role !== "contact")) forbid("this preparer access has ended.");
  if (onboardingId && p.onboarding_id !== onboardingId) forbid("that is not the investment you were assigned.");
  const email = await userEmail(userId);
  if (!email || email !== String(p.email).trim().toLowerCase() || (p.user_id && p.user_id !== userId)) forbid("sign in with the account this invitation belongs to.");
  const { data: investment, error } = await db().from("investor_onboardings").select("id, stage, removed_at, merged_into_onboarding_id").eq("id", p.onboarding_id).maybeSingle();
  if (error) fail("Your assigned investment could not be loaded. Please try again.");
  if (!eligibleParticipantInvitation({ ...p, investor_onboardings: investment }, email)) forbid("this preparer access has ended.");
  if (!(await canPrepare(userId, email, p))) forbid("this preparer access has ended.");
  if (p.status === "invited" || !p.user_id) await db().from("onboarding_participants").update({ status: "active", user_id: userId }).eq("id", p.id);
  return { userId, participant: p };
}

export async function preparerWorkspace(userId: string, token: string) {
  const { data: p } = await db().from("onboarding_participants").select("id, onboarding_id").eq("token", token).maybeSingle();
  if (!p) fail("This link isn't valid.");
  const { participant } = await activePreparer(userId, p.id);
  const { data: row } = await db().from("investor_onboardings").select("id, offering_id, investment_profile_id, persons(legal_first_name, legal_middle_name, legal_last_name, email, user_id, phone, address_line1, address_line2, city, region, postal_code, country, citizenship_country), offerings(name)").eq("id", participant.onboarding_id).maybeSingle();
  const { data: profile } = row?.investment_profile_id ? await db().from("investment_profiles").select("profile_type, legal_name, details, tax_id_last4").eq("id", row.investment_profile_id).maybeSingle() : { data: null };
  const { data: rel } = row?.investment_profile_id ? await db().from("investment_profile_relationships").select("id, role, ownership_percent, is_authorized_signer, status, persons(legal_first_name, legal_last_name)").eq("profile_id", row.investment_profile_id).neq("status", "removed") : { data: [] };
  const { investorEditWindow } = await import("@/lib/manager-edit-window.server");
  const { data: full } = await db().from("investor_onboardings").select("*").eq("id", participant.onboarding_id).maybeSingle();
  return {
    participantId: participant.id, onboardingId: participant.onboarding_id, fundName: String((row as any)?.offerings?.name ?? "Fund"),
    editable: Boolean(full && await investorEditWindow(full, { allowAfterFunding: true })),
    // Helpers learn only whether the investor's email still needs adding; the address and account link stay private.
    person: (({ user_id: _u, email: _e, ...rest }: any) => rest)((row as any)?.persons ?? {}),
    investorEmailNeeded: !String((row as any)?.persons?.email ?? "").trim() && !(row as any)?.persons?.user_id && !full?.investor_user_id,
    profile: profile ? { type: profile.profile_type, legalName: profile.legal_name, details: profile.details ?? {}, taxIdLast4: profile.tax_id_last4 } : null,
    related: ((rel ?? []) as any[]).map((r) => ({ id: r.id, role: r.role, ownershipPercent: r.ownership_percent, isSigner: r.is_authorized_signer, status: r.status, name: `${r.persons?.legal_first_name ?? ""} ${r.persons?.legal_last_name ?? ""}`.trim() })),
  };
}

/** Signed-in point of contact (matched by email) sees a read-only summary of the investment. */
export async function contactWorkspace(userId: string, token: string) {
  const { data: p } = await db().from("onboarding_participants").select("*").eq("token", token).maybeSingle();
  if (!p || (p.role !== "contact" && p.role !== "preparer")) forbid("this access has ended.");
  const email = await userEmail(userId);
  if (!email || email !== String(p.email).trim().toLowerCase() || (p.user_id && p.user_id !== userId)) forbid("sign in with the account this invitation belongs to.");
  const { data: investment, error: investmentError } = await db().from("investor_onboardings").select("id, stage, removed_at, merged_into_onboarding_id").eq("id", p.onboarding_id).maybeSingle();
  if (investmentError) fail("Your assigned investment could not be loaded. Please try again.");
  // An old link is only a locator. A separate, current same-person/same-investment
  // assignment must authorize preparation; a revoked invitation never grants it.
  const { data: current, error: assignmentError } = await db().from("onboarding_participants")
    .select("id, onboarding_id, role, email, status, removed_at, user_id, token")
    .eq("onboarding_id", p.onboarding_id).eq("email", email).in("role", ["preparer", "contact"])
    .in("status", ["invited", "active"]).is("removed_at", null);
  if (assignmentError) fail("Your assigned investment could not be loaded. Please try again.");
  const candidates = ((current ?? []) as any[]).filter(c => (!c.user_id || c.user_id === userId)
    && eligibleParticipantInvitation({ ...c, investor_onboardings: investment }, email));
  const prepares = await Promise.all(candidates.map(c => canPrepare(userId, email, c)));
  const destinations = candidates.filter((_c, i) => prepares[i]);
  if (destinations.length === 1) return { kind: 'preparer' as const, prepareToken: String(destinations[0].token) };
  if (destinations.length > 1) fail("More than one paperwork invitation is active. Ask the fund manager to confirm the correct one.");
  if (!visibleParticipantAssignment(p, email) || !eligibleParticipantInvitation({ ...p, investor_onboardings: investment }, email)) forbid("this access has ended.");
  if (p.role !== "contact") forbid("this access has ended.");
  if (p.status === "invited" || !p.user_id) await db().from("onboarding_participants").update({ status: "active", user_id: userId }).eq("id", p.id);
  const { data: row } = await db().from("investor_onboardings").select("id, stage, funding_status, commitment_amount_cents, requested_amount_cents, funded_amount_cents, investment_profile_id, removed_at, persons(legal_first_name, legal_last_name, kyc_status, aml_status), offerings(name)").eq("id", p.onboarding_id).maybeSingle();
  if (!row || row.removed_at) fail("That investment is no longer available.");
  const { data: profile } = row.investment_profile_id ? await db().from("investment_profiles").select("profile_type, legal_name, display_label").eq("id", row.investment_profile_id).maybeSingle() : { data: null };
  const { data: rel } = row.investment_profile_id ? await db().from("investment_profile_relationships").select("role, is_authorized_signer, status, persons(legal_first_name, legal_last_name, kyc_status)").eq("profile_id", row.investment_profile_id).neq("status", "removed") : { data: [] };
  const { data: contacts } = await db().from("onboarding_participants").select("full_name, role, status").eq("onboarding_id", row.id).neq("status", "removed");
  const per: any = row.persons ?? {};
  return {
    kind: 'contact' as const,
    prepareToken: null,
    fundName: String((row as any).offerings?.name ?? "Fund"),
    investingAs: profile?.legal_name || profile?.display_label || `${per.legal_first_name ?? ""} ${per.legal_last_name ?? ""}`.trim(),
    profileType: profile?.profile_type ?? null,
    stage: row.stage, fundingStatus: row.funding_status,
    commitmentCents: row.commitment_amount_cents ?? row.requested_amount_cents ?? null, fundedCents: row.funded_amount_cents ?? null,
    primary: { name: `${per.legal_first_name ?? ""} ${per.legal_last_name ?? ""}`.trim(), kyc: per.kyc_status ?? "not_started", aml: per.aml_status ?? "not_started" },
    people: ((rel ?? []) as any[]).map((r) => ({ name: `${r.persons?.legal_first_name ?? ""} ${r.persons?.legal_last_name ?? ""}`.trim(), role: r.role, signer: !!r.is_authorized_signer, kyc: r.persons?.kyc_status ?? "not_started" })),
    contacts: ((contacts ?? []) as any[]).map((c) => ({ name: c.full_name, role: participantRoleLabel(c.role), status: c.status })),
  };
}

const ENTITY_SUBTYPES = new Set(["llc", "corporation", "partnership", "other_entity"]);
/** Harmonious or the fund's managers change an individual investment to joint / entity / trust before signing. */
export async function changeInvestingAs(userId: string, input: { onboardingId: string; type: "joint" | "entity" | "trust"; subType?: string | null; legalName?: string | null }) {
  const row = await onboarding(input.onboardingId);
  const { actor, role } = await access(userId, row);
  if (role === "investor") forbid("ask Harmonious or the fund manager to change how you're investing.");
  if (!row.investment_profile_id) fail("Choose how they are investing first.");
  const { data: full } = await db().from("investor_onboardings").select("*").eq("id", row.id).maybeSingle();
  const { investorEditWindow, exclusiveRecord } = await import("@/lib/manager-edit-window.server");
  if (!actor.isStaff && !(await investorEditWindow(full, { allowAfterFunding: true }) && await exclusiveRecord(full, "investment_profile_id"))) forbid("signing has started, or this profile is used elsewhere; ask Harmonious.");
  if (actor.isStaff && !(await investorEditWindow(full, { allowAfterFunding: true }))) forbid("signing has started; this can't be changed now.");
  const { data: pr } = await db().from("investment_profiles").select("id, profile_type, legal_name, display_label, status").eq("id", row.investment_profile_id).maybeSingle();
  if (!pr) fail("Profile not found.");
  if (pr.status === "locked") fail("This investing profile is locked.");
  const next = input.type === "entity" ? (ENTITY_SUBTYPES.has(String(input.subType)) ? String(input.subType) : "other_entity") : input.type;
  if (input.type !== "joint" && !input.legalName?.trim()) fail("Enter the entity or trust legal name.");
  const patch: Record<string, unknown> = { profile_type: next, ...(input.legalName?.trim() ? { legal_name: input.legalName.trim(), display_label: input.legalName.trim() } : {}) };
  const { error } = await db().from("investment_profiles").update(patch).eq("id", pr.id);
  if (error) fail(error.message);
  await db().from("investor_record_changes").insert(Object.entries(patch).map(([f, v]) => ({ offering_id: row.offering_id, onboarding_id: row.id, subject_table: "investment_profiles", subject_id: pr.id, field: f, old_value: (pr as any)[f] ?? null, new_value: v, source: actor.isStaff ? "harmonious" : "fund_manager", actor_user_id: userId, manager_visible: true })));
  await event(row, "investing_as_changed", userId, role, { from: pr.profile_type, to: next });
  const { reconcileAfter } = await import("@/lib/investor-onboarding.server");
  await reconcileAfter([row.id], { actorUserId: userId, trigger: "investing_as_changed" });
  return { ok: true, profileType: next };
}

/** Add another person to the investment: run their identity check and optionally name them signer. */
export async function addPersonForKyc(userId: string, input: { onboardingId: string; firstName: string; lastName: string; email?: string | null; role: string; title?: string | null; ownershipPercent?: number | null; sendKyc: boolean; sendSignature: boolean }) {
  const row = await onboarding(input.onboardingId);
  const { role } = await access(userId, row);
  if (role === "investor") forbid("ask Harmonious or the fund manager to add people.");
  const email = (input.email ?? "").trim().toLowerCase() || null;
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail("Enter a valid email.");
  const { editRelatedParty } = await import("@/lib/investor-record.server");
  const r: any = await editRelatedParty(userId, { onboardingId: row.id, add: { firstName: input.firstName, lastName: input.lastName, email, role: input.role, ownershipPercent: input.ownershipPercent ?? null, isSigner: input.sendSignature } as any });
  const out: { added: boolean; underReview: boolean; kyc?: "emailed" | "created"; signer?: boolean; warnings: string[] } = { added: true, underReview: !!r?.underReview, warnings: [] };
  if (input.sendKyc && r?.relationshipId) {
    const { data: rel } = await db().from("investment_profile_relationships").select("person_id").eq("id", r.relationshipId).maybeSingle();
    const { data: person } = rel?.person_id ? await db().from("persons").select("*").eq("id", rel.person_id).maybeSingle() : { data: null };
    if (!email) out.warnings.push("No email was given, so the identity check wasn't sent. Add an email to send it.");
    else if (!person) out.warnings.push("The person is waiting on Harmonious review, so the identity check wasn't sent yet.");
    else if (person.kyc_status === "approved") out.warnings.push("This person's identity is already verified, so no new check was sent.");
    else {
      const p2 = person.email ? person : { ...person, email };
      const { sendPersonKycLink } = await import("@/lib/person-kyc-link.server");
      const k = await sendPersonKycLink(p2, userId);
      out.kyc = k.emailed ? "emailed" : "created";
    }
  }
  if (input.sendSignature) {
    if (!email) out.warnings.push("No email was given, so no signature request was sent. Add an email to send it.");
    else try { await assignParticipant(userId, { onboardingId: row.id, role: "signer", fullName: `${input.firstName} ${input.lastName}`.trim(), email, title: input.title ?? null }); out.signer = true; }
    catch (e) { out.warnings.push(`Not named signer: ${(e as Error).message}`); }
  }
  await event(row, "person_added_for_kyc", userId, role, { role: input.role, email, sendKyc: input.sendKyc, sendSignature: input.sendSignature });
  return out;
}
