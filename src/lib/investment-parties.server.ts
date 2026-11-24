import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ACCESS_LABELS, partyAccess, partyNextAction } from "@/lib/investment-parties";

const db = () => supabaseAdmin as any;
const fail = (m: string): never => { throw new Error(m); };

async function scope(userId: string, onboardingId: string) {
  const { onboardingActor } = await import("@/lib/investor-onboarding.server");
  const actor = await onboardingActor(userId);
  const { data: ob } = await db().from("investor_onboardings").select("id, offering_id, application_id, investor_user_id, investment_profile_id").eq("id", onboardingId).maybeSingle();
  if (!ob) fail("That investment couldn't be found.");
  if (!actor.isStaff && !actor.managedOfferingIds.includes(ob.offering_id)) {
    const { fundAccessFor, fundAccessDb } = await import("@/lib/fund-access.server");
    const a = await fundAccessFor(await fundAccessDb(), userId, ob.offering_id).catch(() => null);
    if (!a?.canView) fail("You don't have access to this investment.");
  }
  return { actor, ob };
}

/** Every person on the investment with email, login, access, checks, signatures and recorded activity. */
export async function investmentParties(userId: string, onboardingId: string) {
  const { ob } = await scope(userId, onboardingId);
  const { data: ip } = await db().from("investment_profiles").select("id, person_id, profile_type").eq("id", ob.investment_profile_id).maybeSingle();
  const { data: rels } = ip ? await db().from("investment_profile_relationships").select("id, person_id, role, ownership_percent, is_authorized_signer, is_tax_form_signer, status").eq("profile_id", ip.id).neq("status", "removed") : { data: [] };
  const entries = new Map<string, { roles: string[]; pct: number | null; signer: boolean; w9: boolean }>();
  if (ip?.person_id) entries.set(ip.person_id, { roles: [ip.profile_type === "individual" ? "investor" : "account holder"], pct: null, signer: ip.profile_type === "individual", w9: false });
  for (const r of (rels ?? []) as any[]) {
    const e = entries.get(r.person_id) ?? { roles: [], pct: null, signer: false, w9: false };
    e.roles.push(String(r.role).replace(/_/g, " ")); e.pct = r.ownership_percent ?? e.pct; e.signer ||= !!r.is_authorized_signer; e.w9 ||= !!r.is_tax_form_signer;
    entries.set(r.person_id, e);
  }
  const ids = [...entries.keys()];
  const [{ data: persons }, { data: parts }, { data: sigs }, { data: cards }, { data: emails }] = await Promise.all([
    ids.length ? db().from("persons").select("id, legal_first_name, legal_last_name, email, user_id, kyc_status, aml_status, tax_id_last4").in("id", ids) : { data: [] },
    db().from("onboarding_participants").select("role, email, status, user_id, created_at").eq("onboarding_id", ob.id).neq("status", "removed"),
    ob.application_id ? db().from("document_signature_signers").select("signer_email, role_key, status, sent_at, signed_at, offering_documents(title)").eq("application_id", ob.application_id) : { data: [] },
    ids.length ? db().from("person_id_documents").select("person_id").in("person_id", ids).eq("status", "active") : { data: [] },
    db().from("investor_email_sends").select("recipient_email, kind, subject, outcome, created_at").eq("onboarding_id", ob.id).order("created_at", { ascending: false }).limit(60),
  ]);
  const out = [];
  for (const p of (persons ?? []) as any[]) {
    const e = entries.get(p.id)!;
    const email = String(p.email ?? "").toLowerCase() || null;
    const myParts = ((parts ?? []) as any[]).filter((x) => email && String(x.email).toLowerCase() === email);
    const access = partyAccess({ isInvestorLogin: Boolean(p.user_id && p.user_id === ob.investor_user_id), participantRoles: myParts.map((x) => String(x.role)) });
    let lastSignIn: string | null = null;
    if (p.user_id) { const { data: u } = await db().auth.admin.getUserById(p.user_id).catch(() => ({ data: null })); lastSignIn = (u as any)?.user?.last_sign_in_at ?? null; }
    const mySigs = ((sigs ?? []) as any[]).filter((s) => email && String(s.signer_email).toLowerCase() === email && s.role_key !== "fund_manager");
    const activity = [
      ...((emails ?? []) as any[]).filter((m) => email && String(m.recipient_email).toLowerCase() === email).map((m) => ({ at: m.created_at, text: `${m.outcome === "failed" ? "Email failed" : "Emailed"}: ${m.subject}` })),
      ...mySigs.filter((s) => s.sent_at).map((s) => ({ at: s.sent_at, text: `Sent to sign: ${s.offering_documents?.title ?? "document"}` })),
      ...mySigs.filter((s) => s.signed_at && s.status === "signed").map((s) => ({ at: s.signed_at, text: `Signed: ${s.offering_documents?.title ?? "document"}` })),
      ...(lastSignIn ? [{ at: lastSignIn, text: "Last signed in" }] : []),
    ].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 8);
    const kycApproved = p.kyc_status === "approved";
    const unsigned = mySigs.filter((s) => s.status !== "signed").length;
    out.push({
      personId: p.id, name: `${p.legal_first_name ?? ""} ${p.legal_last_name ?? ""}`.trim() || email || "Person",
      roles: e.roles, ownershipPercent: e.pct, signer: e.signer, w9Signer: e.w9, email,
      login: p.user_id ? "Signed up" : myParts.length ? "Invited" : "No login",
      access, accessLabel: ACCESS_LABELS[access], kyc: String(p.kyc_status ?? "not_started"), aml: String(p.aml_status ?? "not_started"),
      ssnOnFile: Boolean(p.tax_id_last4), idCards: ((cards ?? []) as any[]).filter((c) => c.person_id === p.id).length,
      documents: mySigs.map((s) => ({ title: String(s.offering_documents?.title ?? "Document"), status: s.status === "signed" ? "Signed" : s.status === "waiting" ? "Waiting" : "Needs to sign" })),
      activity, nextAction: partyNextAction({ email, hasLogin: Boolean(p.user_id), access, kycApproved, unsignedCount: unsigned }),
    });
  }
  return { parties: out.sort((a, b) => Number(b.access === "investor") - Number(a.access === "investor")) };
}

/** Exact-person view-only invite for a co-owner/signer (no investor authority, no money actions). */
export async function inviteCoOwner(userId: string, input: { onboardingId: string; personId: string }) {
  await scope(userId, input.onboardingId);
  const { data: p } = await db().from("persons").select("legal_first_name, legal_last_name, email").eq("id", input.personId).maybeSingle();
  if (!p?.email) fail("Add this person's email first.");
  const { assignParticipant } = await import("@/lib/onboarding-participants.server");
  return assignParticipant(userId, { onboardingId: input.onboardingId, role: "contact", fullName: `${p.legal_first_name ?? ""} ${p.legal_last_name ?? ""}`.trim(), email: p.email });
}
