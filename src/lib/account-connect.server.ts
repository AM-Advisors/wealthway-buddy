/**
 * Single engine that keeps invitations, accounts and investor records connected.
 * Runs on every sign-in, on invitation links, when records are added or their
 * email changes, and from the daily sweep. Connects only on a verified, exactly
 * matching email; a tax ID match alone opens a Harmonious review item.
 */
import { decideTinMatch } from "@/lib/account-connect-model";

async function db() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
}

export type ConnectResult = { invitationsAccepted: number; recordsLinked: boolean; review: boolean; openOnboardingId: string | null };

export async function connectAccount(userId: string): Promise<ConnectResult> {
  const d = await db();
  const out: ConnectResult = { invitationsAccepted: 0, recordsLinked: false, review: false, openOnboardingId: null };
  const { data: me } = await d.auth.admin.getUserById(userId);
  const email = String(me?.user?.email ?? "").trim().toLowerCase();
  if (!email || !me?.user?.email_confirmed_at) return out;

  // 1. Waiting invitations for this verified email.
  const { data: invites } = await d.from("fund_invitations")
    .select("id, invite_role, offering_id, invited_by, status, expires_at, token")
    .ilike("email", email).eq("status", "pending");
  let live = ((invites ?? []) as any[]).filter((i) => !i.expires_at || new Date(i.expires_at) > new Date());
  const investorIds = live.filter((i) => i.invite_role !== "fund_manager").map((i) => i.id);
  if (investorIds.length) {
    const { data: bound } = await d.from("investor_onboardings").select("invitation_id").in("invitation_id", investorIds);
    const boundIds = new Set(((bound ?? []) as any[]).map((b) => b.invitation_id));
    const { claimOnboardInvitation } = await import("@/lib/investor-onboarding.server");
    for (const inv of live.filter((i) => boundIds.has(i.id))) {
      try {
        const r = await claimOnboardInvitation(userId, String(inv.token));
        out.openOnboardingId = out.openOnboardingId ?? r.onboardingId ?? null;
        out.invitationsAccepted++;
      } catch (e) {
        console.error("[account-connect] invitation claim failed", (e as Error).message);
      }
    }
    live = live.filter((i) => !boundIds.has(i.id));
  }
  for (const inv of live) {
    if (inv.invite_role === "fund_manager") {
      await d.from("fund_managers").upsert({ user_id: userId, offering_id: inv.offering_id, granted_by: inv.invited_by }, { onConflict: "user_id,offering_id" });
      await d.from("user_roles").upsert({ user_id: userId, role: "fund_manager" }, { onConflict: "user_id,role" });
    } else {
      await d.from("investor_fund_access").upsert({ user_id: userId, offering_id: inv.offering_id, granted_by: inv.invited_by }, { onConflict: "user_id,offering_id" });
      await d.from("user_roles").upsert({ user_id: userId, role: "investor" }, { onConflict: "user_id,role" });
    }
    await d.from("fund_invitations").update({ status: "accepted", accepted_at: new Date().toISOString(), accepted_by: userId }).eq("id", inv.id).eq("status", "pending");
    out.invitationsAccepted++;
  }

  // 2. Investor records prepared under this email.
  try {
    const { claimPreparedRecords } = await import("@/lib/investor-record.server");
    const r = await claimPreparedRecords(userId);
    out.recordsLinked = r.claimed;
    out.review = Boolean(r.review);
  } catch (e) {
    console.error("[account-connect] record claim failed", (e as Error).message);
  }

  // 3. Investments on this account's own person record that were never linked.
  const { data: own } = await d.from("persons").select("id").eq("user_id", userId).is("merged_into_person_id", null);
  const personIds = ((own ?? []) as any[]).map((p) => p.id);
  if (personIds.length) {
    const { data: onbs } = await d.from("investor_onboardings").update({ investor_user_id: userId })
      .in("person_id", personIds).is("investor_user_id", null).is("removed_at", null).select("id, offering_id");
    for (const o of (onbs ?? []) as any[]) {
      await d.from("investor_fund_access").upsert({ user_id: userId, offering_id: o.offering_id, granted_by: null }, { onConflict: "user_id,offering_id" });
      out.openOnboardingId = out.openOnboardingId ?? o.id;
      out.recordsLinked = true;
    }
    if ((onbs ?? []).length) await d.from("user_roles").upsert({ user_id: userId, role: "investor" }, { onConflict: "user_id,role" });
  }

  // 4. Every live investment on this account must carry fund access and the investor role.
  const { data: mine } = await d.from("investor_onboardings").select("id, offering_id").eq("investor_user_id", userId).is("removed_at", null);
  const offerings = [...new Set(((mine ?? []) as any[]).map((o) => o.offering_id as string))];
  if (offerings.length) {
    const { data: have } = await d.from("investor_fund_access").select("offering_id").eq("user_id", userId).in("offering_id", offerings);
    const got = new Set(((have ?? []) as any[]).map((h) => h.offering_id));
    for (const off of offerings.filter((o) => !got.has(o))) {
      await d.from("investor_fund_access").upsert({ user_id: userId, offering_id: off, granted_by: null }, { onConflict: "user_id,offering_id" });
      out.recordsLinked = true;
      out.openOnboardingId = out.openOnboardingId ?? ((mine ?? []) as any[]).find((o) => o.offering_id === off)?.id ?? null;
    }
    await d.from("user_roles").upsert({ user_id: userId, role: "investor" }, { onConflict: "user_id,role" });
  }
  return out;
}

/** After a record or invitation is created or its email changes: connect to an existing verified account. */
export async function connectEmail(email: string | null | undefined): Promise<ConnectResult | null> {
  const e = String(email ?? "").trim();
  if (!e) return null;
  const d = await db();
  const { data: uid } = await d.rpc("find_verified_user_by_email", { _email: e });
  if (!uid) return null;
  return connectAccount(String(uid)).catch((err) => {
    console.error("[account-connect] connectEmail failed", (err as Error).message);
    return null;
  });
}

/** Store the tax-ID match code and recognize other profiles with the same tax ID. */
export async function recordProfileTin(profileId: string, tin: string, ctx?: { offeringId?: string | null; onboardingId?: string | null }) {
  const d = await db();
  const { tinFingerprint } = await import("@/lib/onboarding-compliance.server");
  const fp = await tinFingerprint(tin);
  await d.from("investment_profiles").update({ tin_fingerprint: fp }).eq("id", profileId);
  return recognizeTin(profileId, fp, ctx);
}

/** Legal name and whether KYC/KYB + AML both passed, for one investment profile. */
async function profileIdentity(d: any, p: any): Promise<{ legalName: string | null; verified: boolean }> {
  const { isEntityProfileType } = await import("@/lib/identity-model");
  if (isEntityProfileType(p.profile_type)) {
    const { data: ev } = await d.from("entity_verifications").select("legal_name, kyb_status, entity_aml_status").eq("profile_id", p.id).maybeSingle();
    return { legalName: ev?.legal_name ?? p.legal_name ?? null, verified: ev?.kyb_status === "approved" && ev?.entity_aml_status === "approved" };
  }
  const per = p.persons ?? {};
  const name = [per.legal_first_name, per.legal_last_name].filter(Boolean).join(" ") || null;
  return { legalName: name, verified: per.kyc_status === "approved" && per.aml_status === "approved" };
}

const PROFILE_COLS = "id, owner_user_id, person_id, profile_type, legal_name, created_at, persons(email, user_id, legal_first_name, legal_last_name, kyc_status, aml_status, created_at)";

async function recognizeTin(profileId: string, fp: string, ctx?: { offeringId?: string | null; onboardingId?: string | null }) {
  const d = await db();
  const { data: self } = await d.from("investment_profiles").select(PROFILE_COLS).eq("id", profileId).maybeSingle();
  const { data: others } = await d.from("investment_profiles").select(PROFILE_COLS).eq("tin_fingerprint", fp).neq("id", profileId).limit(10);
  const rows = (others ?? []) as any[];
  if (!rows.length) return { kind: "none" as const };
  const ownerEmail = async (uid: string | null) => {
    if (!uid) return null;
    const { data } = await d.auth.admin.getUserById(uid);
    return data?.user?.email_confirmed_at ? String(data.user.email ?? "") : null;
  };
  const accountUserId = (self as any)?.owner_user_id ?? (self as any)?.persons?.user_id ?? null;
  const accountEmail = accountUserId ? await ownerEmail(accountUserId) : String((self as any)?.persons?.email ?? "") || null;
  const selfId = self ? await profileIdentity(d, self) : { legalName: null, verified: false };
  const matches = await Promise.all(rows.map(async (r) => {
    const id = await profileIdentity(d, r);
    return { profileId: r.id, ownerUserId: r.owner_user_id ?? r.persons?.user_id ?? null, ownerVerifiedEmail: (await ownerEmail(r.owner_user_id ?? r.persons?.user_id ?? null)) ?? r.persons?.email ?? null, legalName: id.legalName, verified: id.verified };
  }));
  const decision = decideTinMatch({ matches, accountUserId, accountVerifiedEmail: accountEmail, selfLegalName: selfId.legalName, selfVerified: selfId.verified });
  if (decision.kind === "merge") {
    const other = rows.find((r) => r.id === decision.profileId);
    const a = self as any;
    if (a?.person_id && other?.person_id && a.person_id !== other.person_id) {
      // Keep the record with a sign-in account, otherwise the older one.
      const aKeeps = a.persons?.user_id ? true : other.persons?.user_id ? false : String(a.persons?.created_at ?? a.created_at) <= String(other.persons?.created_at ?? other.created_at);
      const keep = aKeeps ? a.person_id : other.person_id;
      const drop = aKeeps ? other.person_id : a.person_id;
      const r = await d.rpc("merge_persons", { _keep: keep, _drop: drop, _actor: null, _rule: "same_tin_name_verified" });
      if (r.error) { console.error("[account-connect] tin merge failed", r.error.message); return { kind: "review" as const, profileIds: [decision.profileId] }; }
    }
    const uid = accountUserId ?? other?.owner_user_id ?? other?.persons?.user_id ?? null;
    if (uid) {
      await d.from("investment_profiles").update({ owner_user_id: uid }).in("id", [profileId, decision.profileId]).is("owner_user_id", null);
      await connectAccount(uid).catch((e) => console.error("[account-connect] connect after tin merge", (e as Error).message));
    }
    return decision;
  }

  if (decision.kind === "review") {
    let onboardingId = ctx?.onboardingId ?? null; let offeringId = ctx?.offeringId ?? null;
    if (!onboardingId) {
      const { data: o } = await d.from("investor_onboardings").select("id, offering_id").eq("investment_profile_id", profileId).is("removed_at", null).limit(1).maybeSingle();
      onboardingId = o?.id ?? null; offeringId = offeringId ?? o?.offering_id ?? null;
    }
    if (onboardingId && offeringId) {
      const { data: exists } = await d.from("investor_record_suggestions").select("id").eq("onboarding_id", onboardingId).eq("field", "account_link").in("status", ["open", "review_later"]).limit(1);
      if (!(exists ?? []).length) {
        await d.from("investor_record_suggestions").insert({ offering_id: offeringId, onboarding_id: onboardingId, subject_table: "investment_profiles", subject_id: profileId, field: "account_link", current_value: null, proposed_value: { reason: "same_tax_id", label: "Same tax ID as an existing investor", candidates: decision.profileIds.length }, source: "provider", proposed_by: null });
      }
    }
  }
  return decision;
}

/** Daily sweep: fill missing tax-ID match codes and connect every safe gap. */
export async function sweepUnconnected() {
  const d = await db();
  let fingerprinted = 0;
  const { data: missing } = await d.rpc("profile_tax_ids_missing_fingerprint", { _limit: 200 });
  if ((missing ?? []).length) {
    const { decryptTin } = await import("@/lib/irs-forms.server");
    const { tinFingerprint } = await import("@/lib/onboarding-compliance.server");
    for (const m of (missing ?? []) as any[]) {
      try {
        const fp = await tinFingerprint(await decryptTin(m.ciphertext, m.iv));
        await d.from("investment_profiles").update({ tin_fingerprint: fp }).eq("id", m.profile_id);
        await recognizeTin(m.profile_id, fp);
        fingerprinted++;
      } catch (e) {
        console.error("[account-connect] fingerprint backfill skipped", (e as Error).message);
      }
    }
  }
  // Re-check shared tax IDs: they connect automatically once name and verification match.
  const { data: fps } = await d.from("investment_profiles").select("id, tin_fingerprint").not("tin_fingerprint", "is", null).limit(5000);
  const seen = new Map<string, string[]>();
  for (const r of (fps ?? []) as any[]) seen.set(r.tin_fingerprint, [...(seen.get(r.tin_fingerprint) ?? []), r.id]);
  let tinConnected = 0;
  for (const [fp, ids] of seen) {
    if (ids.length < 2) continue;
    const res = await recognizeTin(ids[0]!, fp).catch(() => null);
    if (res?.kind === "merge") tinConnected++;
  }
  const { data: ids } = await d.rpc("list_unconnected_account_ids", { _limit: 200 });
  let connected = 0, review = 0;
  for (const r of (ids ?? []) as any[]) {
    const res = await connectAccount(String(r.user_id)).catch(() => null);
    if (res && (res.invitationsAccepted || res.recordsLinked)) connected++;
    if (res?.review) review++;
  }
  const { data: left } = await d.rpc("list_unconnected_account_ids", { _limit: 1000 });
  return { checked: (ids ?? []).length, connected, review, stillUnconnected: (left ?? []).length, fingerprinted, tinConnected };
}

/** Re-run tax-ID recognition for a person's profiles (call after KYC/KYB/AML clears). */
export async function recheckTinsForPerson(personId: string) {
  const d = await db();
  const { data } = await d.from("investment_profiles").select("id, tin_fingerprint").eq("person_id", personId).not("tin_fingerprint", "is", null).limit(20);
  for (const r of (data ?? []) as any[]) await recognizeTin(r.id, r.tin_fingerprint).catch((e) => console.error("[account-connect] tin recheck", (e as Error).message));
}

/** Same, for the profile whose business verification just cleared. */
export async function recheckTinForProfile(profileId: string) {
  const d = await db();
  const { data } = await d.from("investment_profiles").select("tin_fingerprint").eq("id", profileId).maybeSingle();
  if (data?.tin_fingerprint) await recognizeTin(profileId, data.tin_fingerprint).catch((e) => console.error("[account-connect] tin recheck", (e as Error).message));
}
