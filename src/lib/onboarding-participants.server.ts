import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { onboardingActor, forbid } from "@/lib/investor-onboarding.server";
import { canAssignParticipant, participantRoleLabel, type ParticipantRole } from "@/lib/onboarding-participants-model";

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

async function event(row: any, ev: string, userId: string, actorRole: string, detail: Record<string, unknown>) {
  await db().from("investor_onboarding_events").insert({ onboarding_id: row.id, offering_id: row.offering_id, event: ev, detail, actor_user_id: userId, actor_role: actorRole });
}

export async function listParticipants(userId: string, onboardingId: string) {
  const row = await onboarding(onboardingId);
  await access(userId, row);
  const { data } = await db().from("onboarding_participants").select("id, role, full_name, email, title, status, assigned_by_role, created_at, removed_at").eq("onboarding_id", onboardingId).order("created_at");
  return { participants: ((data ?? []) as any[]).map((p) => ({ id: p.id, role: p.role as ParticipantRole, roleLabel: participantRoleLabel(p.role), name: p.full_name, email: p.email, title: p.title, status: p.status, assignedBy: p.assigned_by_role, createdAt: p.created_at, removedAt: p.removed_at })) };
}

export async function assignParticipant(userId: string, input: { onboardingId: string; role: ParticipantRole; fullName: string; email: string; title?: string | null | undefined }) {
  const row = await onboarding(input.onboardingId);
  const { role } = await access(userId, row);
  if (!canAssignParticipant(role)) forbid("you cannot assign people to this investment.");
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail("Enter a valid email.");
  const { data: existing } = await db().from("onboarding_participants").select("id").eq("onboarding_id", row.id).eq("role", input.role).neq("status", "removed");
  if (input.role === "signer" && (existing ?? []).length) fail("Remove the current signer before naming a new one.");
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const { data: p, error } = await db().from("onboarding_participants").insert({ onboarding_id: row.id, offering_id: row.offering_id, role: input.role, full_name: input.fullName.trim(), email, title: input.title?.trim() || null, token, assigned_by: userId, assigned_by_role: role }).select("id").single();
  if (error) fail(error.message);
  await event(row, "participant_assigned", userId, role, { participantId: p.id, role: input.role, email });

  // Email the assignment. Preparers get their own page; signers are told what they will sign.
  const fund = String(row.offerings?.name ?? "the fund");
  const investor = `${row.persons?.legal_first_name ?? ""} ${row.persons?.legal_last_name ?? ""}`.trim() || "an investor";
  const { ONBOARD_ORIGIN } = await import("@/lib/onboard-portal-model");
  const subject = input.role === "preparer" ? `You've been asked to help complete an investment in ${fund}` : `You've been named signer for an investment in ${fund}`;
  const body = input.role === "preparer"
    ? `${investor} has asked you to fill in their investor details for ${fund}. Sign in with this email address to start:\n\n${ONBOARD_ORIGIN}/onboard/prepare/${token}\n\nYou can enter details, owners and signers, and upload documents. Identity checks, signing and funding stay with the investor and their signer.`
    : `You've been named the signer for ${investor}'s investment in ${fund}. Once the details are complete, you'll review them and sign the subscription documents.`;
  let messageId: string | null = null; let note: string | null = null;
  try {
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    const r = await sendTemplateEmail("investor-message", email, { templateData: { investorName: input.fullName, offeringName: fund, subject, body } });
    messageId = (r as any)?.messageId ?? null;
  } catch (e) { note = (e as Error).message.slice(0, 300); }
  const { logInvestorEmail } = await import("@/lib/investor-emails.server");
  await logInvestorEmail({ onboardingId: row.id, offeringId: row.offering_id, kind: `${input.role}_invite`, subject, recipient: email, messageId, sentBy: userId, outcome: note ? "failed" : "sent", note });
  return { id: p.id, emailSent: !note };
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
  if (!p || p.role !== "preparer" || p.status === "removed") forbid("this preparer access has ended.");
  if (onboardingId && p.onboarding_id !== onboardingId) forbid("that is not the investment you were assigned.");
  const email = await userEmail(userId);
  if (!email || email !== String(p.email).toLowerCase()) forbid(`sign in as ${p.email} to use this page.`);
  if (p.status === "invited" || !p.user_id) await db().from("onboarding_participants").update({ status: "active", user_id: userId }).eq("id", p.id);
  return { userId, participant: p };
}

export async function preparerWorkspace(userId: string, token: string) {
  const { data: p } = await db().from("onboarding_participants").select("id, onboarding_id").eq("token", token).maybeSingle();
  if (!p) fail("This link isn't valid.");
  const { participant } = await activePreparer(userId, p.id);
  const { data: row } = await db().from("investor_onboardings").select("id, offering_id, investment_profile_id, persons(legal_first_name, legal_middle_name, legal_last_name, phone, address_line1, address_line2, city, region, postal_code, country, citizenship_country), offerings(name)").eq("id", participant.onboarding_id).maybeSingle();
  const { data: profile } = row?.investment_profile_id ? await db().from("investment_profiles").select("profile_type, legal_name, details, tax_id_last4").eq("id", row.investment_profile_id).maybeSingle() : { data: null };
  const { data: rel } = row?.investment_profile_id ? await db().from("investment_profile_relationships").select("id, role, ownership_percent, is_authorized_signer, status, persons(legal_first_name, legal_last_name)").eq("profile_id", row.investment_profile_id).neq("status", "removed") : { data: [] };
  const { investorEditWindow } = await import("@/lib/manager-edit-window.server");
  const { data: full } = await db().from("investor_onboardings").select("*").eq("id", participant.onboarding_id).maybeSingle();
  return {
    participantId: participant.id, onboardingId: participant.onboarding_id, fundName: String((row as any)?.offerings?.name ?? "Fund"),
    editable: Boolean(full && await investorEditWindow(full)),
    person: (row as any)?.persons ?? {}, profile: profile ? { type: profile.profile_type, legalName: profile.legal_name, details: profile.details ?? {}, taxIdLast4: profile.tax_id_last4 } : null,
    related: ((rel ?? []) as any[]).map((r) => ({ id: r.id, role: r.role, ownershipPercent: r.ownership_percent, isSigner: r.is_authorized_signer, status: r.status, name: `${r.persons?.legal_first_name ?? ""} ${r.persons?.legal_last_name ?? ""}`.trim() })),
  };
}
