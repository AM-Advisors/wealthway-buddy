/**
 * Fund launch flow for migrated funds (server-only).
 * - Prior subscriptions: investors who signed and funded before Harmonious. Append-only versions,
 *   confirmed by a different staff member (DB trigger re-checks). A confirmed one satisfies the
 *   Sign and Fund readiness steps as "Funded (prior, off-platform)"; it is never reconciled money,
 *   never moves money and never creates bank or ledger entries. KYC is never skipped.
 * - Invites are sent only by staff, only after launch, through the canonical inviteInvestor.
 */
import { requireManager } from "@/lib/drive-migration.server";
import { DRIVE_REQUIREMENTS } from "@/lib/drive-requirements";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
const VIEW = ["super_admin", "admin", "operations", "executive", "leadership", "fund_administration"];

async function requireViewer(userId: string) {
  const db = await admin();
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId);
  const roles = ((data ?? []) as any[]).map((r) => String(r.role));
  if (!roles.some((r) => VIEW.includes(r))) throw new Error("Only Harmonious Operations can view this.");
  return roles.some((r) => ["super_admin", "admin", "operations", "executive"].includes(r));
}

/** Latest version per onboarding, with its decision. */
async function latestPriors(onboardingIds: string[]) {
  if (!onboardingIds.length) return new Map<string, any>();
  const db = await admin();
  const { data } = await db.from("prior_subscriptions").select("*, prior_subscription_decisions(decision, decided_by, note, created_at)")
    .in("onboarding_id", onboardingIds).order("version", { ascending: false });
  const m = new Map<string, any>();
  for (const p of (data ?? []) as any[]) if (!m.has(p.onboarding_id)) {
    const d = (p.prior_subscription_decisions ?? [])[0] ?? null;
    m.set(p.onboarding_id, { ...p, decision: d });
  }
  return m;
}

export async function confirmedPriorSubscription(onboardingId: string) {
  const p = (await latestPriors([onboardingId])).get(onboardingId);
  return p?.decision?.decision === "confirmed" ? p : null;
}

export async function launchFlow(userId: string, offeringId: string) {
  const canManage = await requireViewer(userId);
  const db = await admin();
  const [{ data: setup }, { data: reqs }, { data: banks }, { data: obs }] = await Promise.all([
    db.from("fund_setups").select("launch_state, launched_at, launch_approved_at, stage").eq("offering_id", offeringId).maybeSingle(),
    db.from("drive_document_requirement_assignments").select("requirement_key, created_at").eq("offering_id", offeringId).order("created_at", { ascending: false }),
    db.from("bank_accounts").select("id").eq("offering_id", offeringId).limit(1),
    db.from("investor_onboardings").select("id, stage, invitation_id, investor_user_id, person_id, commitment_amount_cents, requested_amount_cents, persons(legal_first_name, legal_last_name, email, kyc_status, user_id), investment_profiles(legal_name, display_label)")
      .eq("offering_id", offeringId).is("removed_at", null),
  ]);
  const assigned = new Set(((reqs ?? []) as any[]).map((r) => r.requirement_key));
  const required = DRIVE_REQUIREMENTS.filter((r) => r.required);
  const launched = Boolean(setup?.launched_at || setup?.launch_state === "ready");
  const ids = ((obs ?? []) as any[]).map((o) => o.id);
  const priors = await latestPriors(ids);
  const { data: invs } = ids.length ? await db.from("fund_invitations").select("id, email, status, accepted_at, created_at").eq("offering_id", offeringId).eq("invite_role", "investor") : { data: [] };
  const invByEmail = new Map<string, any>();
  for (const i of (invs ?? []) as any[]) { const k = String(i.email).toLowerCase(); if (!invByEmail.has(k) || i.created_at > invByEmail.get(k).created_at) invByEmail.set(k, i); }
  const investors = ((obs ?? []) as any[]).map((o) => {
    const p = o.persons ?? {};
    const email = String(p.email ?? "").toLowerCase();
    const inv = invByEmail.get(email) ?? null;
    const prior = priors.get(o.id) ?? null;
    const joined = Boolean(p.user_id || o.investor_user_id);
    const kyc = ["verified", "approved", "passed"].includes(String(p.kyc_status ?? ""));
    const progress = o.stage === "closed" || (prior?.decision?.decision === "confirmed" && kyc) ? "Subscribed"
      : kyc ? "KYC done" : joined ? "Joined" : inv && !["revoked", "cancelled", "expired"].includes(inv.status) ? "Invited"
      : prior?.decision?.decision === "confirmed" ? "Prior subscription confirmed" : "Record created";
    return {
      onboardingId: o.id, name: o.investment_profiles?.legal_name ?? o.investment_profiles?.display_label ?? `${p.legal_first_name ?? ""} ${p.legal_last_name ?? ""}`.trim(),
      email: p.email ?? null, commitmentCents: o.commitment_amount_cents ?? o.requested_amount_cents ?? null, progress, joined, invited: Boolean(inv), kyc,
      prior: prior ? { id: prior.id, version: prior.version, commitmentCents: prior.commitment_cents, fundedCents: prior.funded_cents, signedOn: prior.signed_on,
        evidence: prior.evidence_item_ids, status: prior.decision?.decision ?? "awaiting", recordedByMe: prior.recorded_by === userId, note: prior.decision?.note ?? null } : null,
    };
  });
  return {
    canManage, launched,
    checklist: [
      { label: "Fund Setup approved for launch", done: Boolean(setup?.launch_approved_at || launched) },
      { label: `Required documents (${required.filter((r) => assigned.has(r.key)).length}/${required.length})`, done: required.every((r) => assigned.has(r.key)) },
      { label: "Fund bank account linked", done: Boolean((banks ?? []).length) },
      { label: "Fund launched", done: launched },
    ],
    investors,
  };
}

async function onboardingIn(offeringId: string, onboardingId: string) {
  const db = await admin();
  const { data } = await db.from("investor_onboardings").select("id, offering_id").eq("id", onboardingId).maybeSingle();
  if (!data || data.offering_id !== offeringId) throw new Error("That investor isn't in this fund.");
}

export async function recordPrior(userId: string, input: { offeringId: string; onboardingId: string; commitmentCents: number; fundedCents: number; signedOn: string; evidenceItemIds: string[]; reason?: string | null }) {
  await requireManager(userId);
  await onboardingIn(input.offeringId, input.onboardingId);
  if (input.fundedCents > input.commitmentCents) throw new Error("Funded amount can't be more than the commitment.");
  if (new Date(input.signedOn) > new Date()) throw new Error("The signed date can't be in the future.");
  const db = await admin();
  const prev = (await latestPriors([input.onboardingId])).get(input.onboardingId);
  if (prev && !(input.reason ?? "").trim()) throw new Error("Give a reason for the correction.");
  if (input.evidenceItemIds.length) {
    const { data: its } = await db.from("drive_migration_items").select("id, drive_migrations!inner(offering_id)").in("id", input.evidenceItemIds);
    if ((its ?? []).length !== input.evidenceItemIds.length || (its as any[]).some((i) => i.drive_migrations.offering_id !== input.offeringId)) throw new Error("Pick evidence files from this fund's migration.");
  }
  const { error } = await db.from("prior_subscriptions").insert({
    onboarding_id: input.onboardingId, offering_id: input.offeringId, version: (prev?.version ?? 0) + 1,
    commitment_cents: input.commitmentCents, funded_cents: input.fundedCents, signed_on: input.signedOn,
    evidence_item_ids: input.evidenceItemIds, reason: input.reason ?? null, recorded_by: userId,
  });
  if (error) throw new Error(error.message);
  await reconcile(input.onboardingId, userId);
  return { ok: true };
}

export async function decidePrior(userId: string, input: { offeringId: string; priorId: string; confirm: boolean; note?: string | null }) {
  await requireManager(userId);
  const db = await admin();
  const { data: p } = await db.from("prior_subscriptions").select("id, onboarding_id, offering_id, recorded_by").eq("id", input.priorId).maybeSingle();
  if (!p || p.offering_id !== input.offeringId) throw new Error("That record wasn't found.");
  const latest = (await latestPriors([p.onboarding_id])).get(p.onboarding_id);
  if (latest?.id !== p.id) throw new Error("A newer version exists. Review that one.");
  if (input.confirm && p.recorded_by === userId) throw new Error("Someone other than the person who recorded it must confirm.");
  const { error } = await db.from("prior_subscription_decisions").insert({ prior_subscription_id: p.id, decision: input.confirm ? "confirmed" : "rejected", decided_by: userId, note: input.note ?? null });
  if (error) throw new Error(error.code === "23505" ? "Already decided." : error.message);
  await reconcile(p.onboarding_id, userId);
  return { ok: true };
}

async function reconcile(onboardingId: string, userId: string) {
  try {
    const { reconcileInvestmentReadiness } = await import("@/lib/investor-onboarding.server");
    await reconcileInvestmentReadiness(onboardingId, { actorUserId: userId, trigger: "prior_subscription" });
  } catch (e) { console.error("prior subscription reconcile", e); }
}

export async function sendInvites(userId: string, input: { offeringId: string; onboardingIds: string[] }) {
  await requireManager(userId);
  const flow = await launchFlow(userId, input.offeringId);
  if (!flow.launched) throw new Error("Launch the fund before sending invites.");
  const { inviteInvestor } = await import("@/lib/investor-onboarding.server");
  const results: { onboardingId: string; ok: boolean; message?: string }[] = [];
  for (const id of input.onboardingIds) {
    const inv = flow.investors.find((i) => i.onboardingId === id);
    if (!inv?.email) { results.push({ onboardingId: id, ok: false, message: "No email" }); continue; }
    if (inv.joined || inv.invited) { results.push({ onboardingId: id, ok: false, message: "Already invited" }); continue; }
    try {
      await inviteInvestor(userId, { offeringId: input.offeringId, email: inv.email, name: inv.name, intendedAmountCents: inv.commitmentCents, source: "harmonious" });
      results.push({ onboardingId: id, ok: true });
    } catch (e) { results.push({ onboardingId: id, ok: false, message: (e as Error).message }); }
  }
  return { sent: results.filter((r) => r.ok).length, results };
}
