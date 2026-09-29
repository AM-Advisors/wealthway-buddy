/**
 * Fund Investor Onboarding Link — server. Tokens are opaque, validated here,
 * and map to exactly one Offering. Starting onboarding reuses startOnboarding
 * (same Person → Investment Profile → Investment model, idempotent).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { onboardingActor, assertStaff, forbid, launchedOffering, startOnboarding } from "@/lib/investor-onboarding.server";
import { recordAccessEvent } from "@/lib/access-control.server";
import { appUrl } from "@/lib/app-origins";
import { generateLinkToken, linkCanStart, linkStatus, publicLinkView, rateLimited, tokenLooksValid, LINK_UNAVAILABLE, RATE_WINDOW_MINUTES } from "@/lib/fund-onboarding-link";

const db = () => supabaseAdmin as any;
const unavailable = (): never => { throw new Error(LINK_UNAVAILABLE); };
const urlFor = (token: string) => appUrl("client", `/join/${token}`);

async function currentLink(offeringId: string) {
  const { data } = await db().from("fund_onboarding_links").select("*").eq("offering_id", offeringId).in("status", ["active", "disabled"]).maybeSingle();
  return data as any;
}

/** Staff, or a Fund Manager of this exact fund. Nobody else. */
async function assertLinkViewer(userId: string, offeringId: string) {
  const actor = await onboardingActor(userId);
  if (!actor.isStaff && !actor.managedOfferingIds.includes(offeringId)) forbid("you do not have access to this fund's onboarding link.");
  return actor;
}

export async function getFundLink(userId: string, offeringId: string) {
  const actor = await assertLinkViewer(userId, offeringId);
  const [row, { data: off }, history] = await Promise.all([
    currentLink(offeringId),
    db().from("offerings").select("name").eq("id", offeringId).maybeSingle(),
    db().from("fund_onboarding_links").select("created_at").eq("offering_id", offeringId).order("created_at", { ascending: true }).limit(1),
  ]);
  const { count } = row ? await db().from("fund_onboarding_link_starts").select("id", { count: "exact", head: true }).eq("offering_id", offeringId) : { count: 0 };
  const first = ((history.data ?? []) as any[])[0];
  return {
    fundName: (off?.name as string) ?? "Fund",
    status: linkStatus(row),
    url: row?.status === "active" ? urlFor(row.token) : null,
    createdAt: (first?.created_at ?? null) as string | null,
    regeneratedAt: row && first && row.created_at !== first.created_at ? (row.created_at as string) : null,
    lastUsedAt: (row?.last_used_at ?? null) as string | null,
    starts: count ?? 0,
    canManage: actor.isStaff,
  };
}

/** Create or regenerate. Old link stops working; investors it already started are untouched. Staff only. */
export async function regenerateFundLink(userId: string, offeringId: string) {
  await assertStaff(userId);
  await launchedOffering(offeringId);
  const prev = await currentLink(offeringId);
  if (prev) await db().from("fund_onboarding_links").update({ status: "superseded", superseded_at: new Date().toISOString() }).eq("id", prev.id);
  const { data, error } = await db().from("fund_onboarding_links").insert({ offering_id: offeringId, token: generateLinkToken(), created_by: userId }).select("id").single();
  if (error) throw new Error("Could not create the onboarding link.");
  await recordAccessEvent({ actorUserId: userId, actorIdentity: null, targetUserId: null, action: prev ? "fund_link.regenerate" : "fund_link.create", scopeType: "offering", scopeId: offeringId, correlationId: data.id });
  return getFundLink(userId, offeringId);
}

export async function setFundLinkEnabled(userId: string, offeringId: string, enabled: boolean) {
  await assertStaff(userId);
  const row = await currentLink(offeringId);
  if (!row) throw new Error("No onboarding link is configured for this fund.");
  await db().from("fund_onboarding_links").update(enabled ? { status: "active", disabled_at: null } : { status: "disabled", disabled_at: new Date().toISOString() }).eq("id", row.id);
  await recordAccessEvent({ actorUserId: userId, actorIdentity: null, targetUserId: null, action: enabled ? "fund_link.enable" : "fund_link.disable", scopeType: "offering", scopeId: offeringId, correlationId: row.id });
  return getFundLink(userId, offeringId);
}

async function throttle(callerHash: string) {
  const since = new Date(Date.now() - RATE_WINDOW_MINUTES * 60000).toISOString();
  const { data } = await db().from("fund_onboarding_link_attempts").select("ok").eq("caller_hash", callerHash).gte("created_at", since).limit(100);
  if (rateLimited((data ?? []) as any[])) throw new Error("Too many attempts. Please wait a few minutes and try again.");
}
const note = (callerHash: string, ok: boolean) => db().from("fund_onboarding_link_attempts").insert({ caller_hash: callerHash, ok });

async function resolveActive(token: unknown) {
  if (!tokenLooksValid(token)) return null;
  const { data: row } = await db().from("fund_onboarding_links").select("*").eq("token", token).maybeSingle();
  if (!row) return null;
  let open = false;
  let offering: any = null;
  try { offering = (await launchedOffering(row.offering_id)).offering; open = true; } catch { open = false; }
  if (!linkCanStart(row, open)) return null;
  return { row, offering };
}

/** Public, pre-sign-in: fund display name and manager organization only. */
export async function resolvePublicLink(token: string, callerHash: string) {
  await throttle(callerHash);
  const hit = await resolveActive(token);
  await note(callerHash, !!hit);
  if (!hit) unavailable();
  const { data: setup } = await db().from("fund_setups").select("display_name").eq("offering_id", hit!.offering.id).maybeSingle();
  const { data: client } = hit!.offering.client_id ? await db().from("clients").select("name").eq("id", hit!.offering.client_id).maybeSingle() : { data: null };
  return publicLinkView({ fundName: (setup?.display_name ?? hit!.offering.name) as string, managedBy: ((client as any)?.name ?? null) as string | null });
}

/** Signed-in: continue into the existing onboarding flow. Retry-safe. */
export async function startFromLink(userId: string, token: string, callerHash: string) {
  await throttle(callerHash);
  const hit = await resolveActive(token);
  await note(callerHash, !!hit);
  if (!hit) unavailable();
  const r = await startOnboarding(userId, { slugOrId: hit!.offering.id });
  await db().from("fund_onboarding_links").update({ last_used_at: new Date().toISOString() }).eq("id", hit!.row.id);
  if (!r.onboardingId) return { onboardingId: null, resumed: false, pendingReview: true };
  await db().from("fund_onboarding_link_starts").upsert({ link_id: hit!.row.id, offering_id: hit!.offering.id, onboarding_id: r.onboardingId }, { onConflict: "onboarding_id", ignoreDuplicates: true });
  return { onboardingId: r.onboardingId, resumed: r.resumed, pendingReview: false };
}
