/**
 * Personal LinkedIn profile connection + delegated publishing. Server-only.
 * Tokens are AES-GCM encrypted at rest (LINKEDIN_TOKEN_KEY) and never returned to the browser.
 * Ownership is the explicit owner_user_id row; roles (incl. Super Admin) grant nothing here.
 * Separate from the company-page connection in linkedin-direct.server.ts (different table, scopes, author URN).
 */
import { createHmac, timingSafeEqual } from "crypto";
import { LI_PERMS, afterEdit, allowed, canManageDelegates, publishCheck, type LiGrant, type LiPerm } from "@/lib/linkedin-personal-model";
import { LINKEDIN_REDIRECT_URI, liHeaders } from "@/lib/linkedin-direct.server";

const SCOPES = "openid profile w_member_social";
const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;

function creds() {
  const id = process.env["LINKEDIN_CLIENT_ID"], secret = process.env["LINKEDIN_CLIENT_SECRET"];
  if (!id || !secret) throw new Error("The LinkedIn app credentials aren't saved yet.");
  return { id, secret };
}
const sign = (p: string) => createHmac("sha256", creds().secret).update(`personal|${p}`).digest("hex");

/* ---------- encryption ---------- */
async function aesKey() {
  const raw = process.env["LINKEDIN_TOKEN_KEY"];
  if (!raw) throw new Error("Token encryption key missing.");
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return crypto.subtle.importKey("raw", h, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function enc(s: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(), new TextEncoder().encode(s)));
  return Buffer.concat([Buffer.from(iv), Buffer.from(ct)]).toString("base64");
}
async function dec(s: string) {
  const b = Buffer.from(s, "base64");
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: b.subarray(0, 12) }, await aesKey(), b.subarray(12)));
}

/* ---------- helpers ---------- */
async function event(db: any, row: { owner_user_id: string; action: string; actor_id: string | null; post_id?: string; delegate_user_id?: string; version?: number; detail?: any }) {
  await db.from("linkedin_personal_events").insert({ detail: {}, ...row });
}
async function account(db: any) {
  const { data } = await db.from("linkedin_personal_accounts").select("*").limit(1).maybeSingle();
  if (!data) throw new Error("No personal LinkedIn owner is configured.");
  return data;
}
async function grantOf(db: any, ownerId: string, userId: string): Promise<LiGrant | null> {
  const { data } = await db.from("linkedin_delegates").select("*").eq("owner_user_id", ownerId).eq("delegate_user_id", userId).maybeSingle();
  return data;
}
async function postsToday(db: any, ownerId: string, actorId: string) {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count } = await db.from("linkedin_personal_posts").select("id", { count: "exact", head: true }).eq("owner_user_id", ownerId).eq("publish_initiated_by", actorId).eq("status", "published").gte("published_at", since);
  return count ?? 0;
}
async function must(db: any, userId: string, perm: LiPerm, series?: string | null) {
  const a = await account(db);
  const v = allowed({ actorId: userId, ownerId: a.owner_user_id, grant: a.owner_user_id === userId ? null : await grantOf(db, a.owner_user_id, userId), now: new Date(), series }, perm);
  if (!v.ok) throw new Error(v.reason);
  return a;
}
const safeAcct = (a: any) => ({ name: a.name, picture_url: a.picture_url, profile_url: a.profile_url, status: a.status, expires_at: a.expires_at, scopes: a.scopes, connected_at: a.connected_at, last_authorized_at: a.last_authorized_at, last_error: a.last_error, has_token: !!a.token_ciphertext });

/* ---------- connection ---------- */
export async function connectUrl(userId: string) {
  const db = await admin();
  const a = await account(db);
  if (a.owner_user_id !== userId) throw new Error("Only the account owner can connect this LinkedIn profile.");
  const payload = `personal.${userId}.${Date.now()}`;
  const state = Buffer.from(`${payload}.${sign(payload)}`).toString("base64url");
  const p = new URLSearchParams({ response_type: "code", client_id: creds().id, redirect_uri: LINKEDIN_REDIRECT_URI, state, scope: SCOPES });
  await event(db, { owner_user_id: a.owner_user_id, action: "authorization_started", actor_id: userId });
  return `https://www.linkedin.com/oauth/v2/authorization?${p}`;
}
export function isPersonalState(state: string) { return Buffer.from(state, "base64url").toString().startsWith("personal."); }

export async function completeConnect(code: string, state: string) {
  const raw = Buffer.from(state, "base64url").toString();
  const [, userId, ts, sig] = raw.split(".");
  const exp = sign(`personal.${userId}.${ts}`);
  if (!sig || sig.length !== exp.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(exp))) throw new Error("Bad state");
  if (Date.now() - Number(ts) > 15 * 60_000) throw new Error("This sign-in link expired. Start again.");
  const db = await admin();
  const a = await account(db);
  if (a.owner_user_id !== userId) throw new Error("Only the account owner can connect this LinkedIn profile.");
  const { id, secret } = creds();
  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: LINKEDIN_REDIRECT_URI, client_id: id, client_secret: secret }) });
  const text = await res.text();
  if (!res.ok) {
    await db.from("linkedin_personal_accounts").update({ last_error: `Token exchange failed [${res.status}]`, updated_at: new Date().toISOString() }).eq("owner_user_id", userId);
    await event(db, { owner_user_id: userId, action: "authorization_failed", actor_id: userId, detail: { status: res.status } });
    throw new Error(`LinkedIn sign-in failed [${res.status}]: ${text.slice(0, 200)}`);
  }
  const t = JSON.parse(text);
  const scopes = String(t.scope ?? "");
  if (!scopes.includes("w_member_social")) throw new Error("LinkedIn didn't grant posting permission (w_member_social). Enable the “Share on LinkedIn” product on the developer app.");
  const ui = await fetch("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${t.access_token}` } });
  if (!ui.ok) throw new Error(`LinkedIn profile lookup failed [${ui.status}]. Enable “Sign In with LinkedIn using OpenID Connect” on the developer app.`);
  const me = await ui.json();
  const now = new Date().toISOString();
  await db.from("linkedin_personal_accounts").update({
    member_sub: me.sub, name: me.name ?? null, picture_url: me.picture ?? null, profile_url: null,
    token_ciphertext: await enc(t.access_token), expires_at: t.expires_in ? new Date(Date.now() + t.expires_in * 1000).toISOString() : null,
    scopes, status: "connected", connected_at: a.connected_at ?? now, last_authorized_at: now, last_error: null, updated_at: now,
  }).eq("owner_user_id", userId);
  await event(db, { owner_user_id: userId, action: "connected", actor_id: userId, detail: { scopes } });
}

export async function disconnect(userId: string) {
  const db = await admin();
  const a = await account(db);
  if (a.owner_user_id !== userId) throw new Error("Only the account owner can disconnect this LinkedIn profile.");
  await db.from("linkedin_personal_accounts").update({ token_ciphertext: null, expires_at: null, status: "disconnected", updated_at: new Date().toISOString() }).eq("owner_user_id", userId);
  await db.from("linkedin_personal_posts").update({ status: "approved", scheduled_at: null, error: "Unscheduled: account disconnected" }).eq("owner_user_id", userId).eq("status", "scheduled");
  await event(db, { owner_user_id: userId, action: "disconnected", actor_id: userId });
}

/* ---------- overview ---------- */
export async function overview(userId: string) {
  const db = await admin();
  const a = await account(db);
  const isOwner = a.owner_user_id === userId;
  const grant = isOwner ? null : await grantOf(db, a.owner_user_id, userId);
  const v = allowed({ actorId: userId, ownerId: a.owner_user_id, grant, now: new Date() }, "view");
  const { data: ownerP } = await db.from("profiles").select("legal_name").eq("user_id", a.owner_user_id).maybeSingle();
  const base = { isOwner, ownerName: ownerP?.legal_name ?? "Account owner", account: safeAcct(a), perms: LI_PERMS, myGrant: grant ? { ...grant } : null, appConfigured: !!process.env["LINKEDIN_CLIENT_ID"] && !!process.env["LINKEDIN_CLIENT_SECRET"] };
  if (!v.ok) return { ...base, access: false, reason: v.reason, posts: [], delegates: [], events: [], staff: [], names: {} };
  const { data: posts } = await db.from("linkedin_personal_posts").select("*").eq("owner_user_id", a.owner_user_id).order("updated_at", { ascending: false }).limit(200);
  let delegates: any[] = [], staff: any[] = [];
  let evq = db.from("linkedin_personal_events").select("*").eq("owner_user_id", a.owner_user_id).order("created_at", { ascending: false }).limit(150);
  if (isOwner) {
    delegates = (await db.from("linkedin_delegates").select("*").eq("owner_user_id", a.owner_user_id)).data ?? [];
    const { STAFF_EXEMPT_ROLES } = await import("@/lib/account-kyc-model");
    const { data: r } = await db.from("user_roles").select("user_id").in("role", STAFF_EXEMPT_ROLES);
    const ids = [...new Set(((r ?? []) as any[]).map((x) => x.user_id))].filter((x) => x !== userId);
    staff = ids.length ? ((await db.from("profiles").select("user_id, legal_name, email").in("user_id", ids)).data ?? []) : [];
  } else evq = evq.or(`actor_id.eq.${userId},delegate_user_id.eq.${userId}`);
  const events = (await evq).data ?? [];
  const ids = new Set<string>([a.owner_user_id]);
  for (const p of posts ?? []) for (const k of ["author_id", "approved_by", "scheduled_by", "publish_initiated_by", "submitted_by"]) if (p[k]) ids.add(p[k]);
  for (const e of events) { if (e.actor_id) ids.add(e.actor_id); if (e.delegate_user_id) ids.add(e.delegate_user_id); }
  for (const d of delegates) ids.add(d.delegate_user_id);
  const { data: ps } = await db.from("profiles").select("user_id, legal_name, email").in("user_id", [...ids]);
  const names = Object.fromEntries(((ps ?? []) as any[]).map((p) => [p.user_id, p.legal_name || p.email || "Team member"]));
  return { ...base, access: true, posts: posts ?? [], delegates, events, staff, names };
}

/* ---------- delegation (owner only) ---------- */
export async function setDelegate(userId: string, input: { delegateId: string; perms: Partial<Record<LiPerm, boolean>>; authorizeDirect?: boolean; expires_at?: string | null; max_posts_per_day?: number | null; series?: string[] | null; hours_start?: number | null; hours_end?: number | null; suspended?: boolean }) {
  const db = await admin();
  const a = await account(db);
  const m = canManageDelegates(userId, a.owner_user_id);
  if (!m.ok) throw new Error(m.reason);
  if (input.delegateId === userId) throw new Error("You already own this account.");
  const { data: r } = await db.from("user_roles").select("role").eq("user_id", input.delegateId);
  const { STAFF_EXEMPT_ROLES } = await import("@/lib/account-kyc-model");
  if (!((r ?? []) as any[]).some((x) => STAFF_EXEMPT_ROLES.includes(x.role))) throw new Error("Only Harmonious employees can be delegates.");
  const prev = await grantOf(db, a.owner_user_id, input.delegateId);
  const perms = Object.fromEntries(LI_PERMS.map((p) => [p.key, !!input.perms[p.key]]));
  let direct = prev?.direct_publish_authorized_at ?? null;
  if (!perms.publish_direct) direct = null;
  else if (!direct) {
    if (!input.authorizeDirect) throw new Error("Publishing without approval needs your separate explicit authorization.");
    direct = new Date().toISOString();
  }
  const row = { owner_user_id: a.owner_user_id, delegate_user_id: input.delegateId, perms, direct_publish_authorized_at: direct, expires_at: input.expires_at ?? null, max_posts_per_day: input.max_posts_per_day ?? null, series: input.series?.length ? input.series : null, hours_start: input.hours_start ?? null, hours_end: input.hours_end ?? null, suspended: !!input.suspended, revoked_at: null, updated_by: userId, updated_at: new Date().toISOString() };
  const { error } = await db.from("linkedin_delegates").upsert(row, { onConflict: "owner_user_id,delegate_user_id" });
  if (error) throw error;
  await event(db, { owner_user_id: a.owner_user_id, action: prev ? (input.suspended && !prev.suspended ? "access_suspended" : "permissions_changed") : "access_granted", actor_id: userId, delegate_user_id: input.delegateId, detail: { before: prev?.perms ?? null, after: perms, direct_authorized: !!direct, limits: { expires_at: row.expires_at, max_posts_per_day: row.max_posts_per_day, series: row.series, hours: [row.hours_start, row.hours_end] } } });
  if (row.suspended || !perms.publish_approved) await unscheduleBy(db, a.owner_user_id, input.delegateId, userId, "Delegate access changed");
}
export async function revokeDelegate(userId: string, delegateId: string) {
  const db = await admin();
  const a = await account(db);
  const m = canManageDelegates(userId, a.owner_user_id);
  if (!m.ok) throw new Error(m.reason);
  await db.from("linkedin_delegates").update({ perms: {}, direct_publish_authorized_at: null, revoked_at: new Date().toISOString(), updated_by: userId, updated_at: new Date().toISOString() }).eq("owner_user_id", a.owner_user_id).eq("delegate_user_id", delegateId);
  await event(db, { owner_user_id: a.owner_user_id, action: "access_revoked", actor_id: userId, delegate_user_id: delegateId });
  await unscheduleBy(db, a.owner_user_id, delegateId, userId, "Delegate access revoked");
}
async function unscheduleBy(db: any, ownerId: string, delegateId: string, actor: string, why: string) {
  const { data } = await db.from("linkedin_personal_posts").update({ status: "approved", scheduled_at: null, scheduled_by: null, error: `Unscheduled: ${why}` }).eq("owner_user_id", ownerId).eq("scheduled_by", delegateId).eq("status", "scheduled").select("id");
  for (const p of data ?? []) await event(db, { owner_user_id: ownerId, action: "schedule_cancelled", actor_id: actor, post_id: p.id, delegate_user_id: delegateId, detail: { why } });
}

/* ---------- posts ---------- */
async function loadPost(db: any, id: string) {
  const { data } = await db.from("linkedin_personal_posts").select("*").eq("id", id).single();
  if (!data) throw new Error("Post not found.");
  return data;
}
export async function createPost(userId: string, body: string, series: string | null) {
  const db = await admin();
  const a = await must(db, userId, "create");
  const { data, error } = await db.from("linkedin_personal_posts").insert({ owner_user_id: a.owner_user_id, author_id: userId, body, series_key: series }).select("id").single();
  if (error) throw error;
  await event(db, { owner_user_id: a.owner_user_id, action: "created", actor_id: userId, post_id: data.id, version: 1 });
  return data.id as string;
}
export async function editPost(userId: string, id: string, body: string) {
  const db = await admin();
  const p = await loadPost(db, id);
  if (["published", "publishing"].includes(p.status)) throw new Error("Published posts are locked.");
  await must(db, userId, "edit", p.series_key);
  const e = afterEdit(p, body);
  if (!e.changed) return;
  await db.from("linkedin_personal_posts").update({ body, version: e.version, ...(e.invalidates ? { status: "draft", approved_version: null, approved_by: null, approved_at: null, scheduled_at: null } : {}), updated_at: new Date().toISOString() }).eq("id", id);
  await event(db, { owner_user_id: p.owner_user_id, action: "edited", actor_id: userId, post_id: id, version: e.version });
  if (e.invalidates) await event(db, { owner_user_id: p.owner_user_id, action: "approval_invalidated", actor_id: userId, post_id: id, version: e.version, detail: { previous_approved_version: p.approved_version } });
}
export async function postAction(userId: string, id: string, action: "submit" | "approve" | "reject" | "request_changes" | "schedule" | "propose_schedule" | "cancel_schedule" | "cancel" | "publish_now", at?: string | null, note?: string | null) {
  const db = await admin();
  const p = await loadPost(db, id);
  const a = await account(db);
  const isOwner = a.owner_user_id === userId;
  const upd = async (patch: any, act = action) => {
    await db.from("linkedin_personal_posts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    await event(db, { owner_user_id: p.owner_user_id, action: act, actor_id: userId, post_id: id, version: p.version, detail: note || at ? { note, at } : {} });
  };
  switch (action) {
    case "submit":
      await must(db, userId, "submit", p.series_key);
      if (!["draft", "changes_requested"].includes(p.status)) throw new Error("Only drafts can be submitted.");
      return upd({ status: "in_review", submitted_by: userId });
    case "approve": case "reject": case "request_changes":
      if (!isOwner) throw new Error("Only the account owner can approve posts for her profile.");
      if (action === "approve") return upd({ status: "approved", approved_version: p.version, approved_by: userId, approved_at: new Date().toISOString(), error: null });
      return upd({ status: action === "reject" ? "rejected" : "changes_requested" });
    case "propose_schedule":
      await must(db, userId, "propose_schedule", p.series_key);
      if (!at) throw new Error("Pick a time.");
      return upd({}, "schedule_proposed");
    case "schedule": {
      await must(db, userId, "schedule", p.series_key);
      if (!at || new Date(at) <= new Date()) throw new Error("Pick a future time.");
      if (!(p.status === "approved" && p.approved_version === p.version) && !isOwner) throw new Error("Only approved posts can be scheduled.");
      if (isOwner && p.approved_version !== p.version) await upd({ approved_version: p.version, approved_by: userId, approved_at: new Date().toISOString() }, "approve");
      return upd({ status: "scheduled", scheduled_at: at, scheduled_by: userId });
    }
    case "cancel_schedule":
      if (!isOwner && p.scheduled_by !== userId) throw new Error("Only the owner or the person who scheduled it can cancel.");
      if (p.status !== "scheduled") throw new Error("Not scheduled.");
      return upd({ status: "approved", scheduled_at: null, scheduled_by: null });
    case "cancel":
      if (!isOwner) throw new Error("Only the account owner can cancel posts.");
      if (["published", "publishing"].includes(p.status)) throw new Error("Already published.");
      return upd({ status: "cancelled", scheduled_at: null });
    case "publish_now":
      return publish(db, p, userId, "manual");
  }
}

/** Trusted publishing path — manual and scheduler both go through here and recheck everything. */
async function publish(db: any, p: any, actorId: string, trigger: "manual" | "scheduler") {
  const a = await account(db);
  const isOwner = actorId === a.owner_user_id;
  const grant = isOwner ? null : await grantOf(db, a.owner_user_id, actorId);
  const v = publishCheck({ owner_user_id: a.owner_user_id, status: a.status, member_sub: a.member_sub, expires_at: a.expires_at, has_token: !!a.token_ciphertext }, p, { actorId, ownerId: a.owner_user_id, grant, now: new Date(), postsToday: isOwner ? 0 : await postsToday(db, a.owner_user_id, actorId) });
  if (!v.ok) {
    await event(db, { owner_user_id: a.owner_user_id, action: "publish_blocked", actor_id: actorId, post_id: p.id, version: p.version, detail: { trigger, reason: v.reason } });
    if (trigger === "scheduler") await db.from("linkedin_personal_posts").update({ status: p.approved_version === p.version ? "approved" : "draft", scheduled_at: null, error: v.reason }).eq("id", p.id);
    throw new Error(v.reason);
  }
  const idem = `${p.id}:v${p.version}`;
  const { data: claimed } = await db.from("linkedin_personal_posts").update({ status: "publishing", idempotency_key: idem, publish_initiated_by: actorId }).eq("id", p.id).eq("version", p.version).is("linkedin_post_id", null).in("status", ["draft", "in_review", "changes_requested", "approved", "scheduled", "failed"]).select("id");
  if (!claimed?.length) throw new Error("This post is already being published or has changed.");
  const { data: mode } = await db.from("marketing_publishing_mode").select("mode").eq("id", 1).single();
  if (mode?.mode !== "live") {
    await db.from("linkedin_personal_posts").update({ status: p.status, idempotency_key: null, error: "Test mode: all checks passed; nothing was posted to LinkedIn." }).eq("id", p.id);
    await event(db, { owner_user_id: a.owner_user_id, action: "test_validated", actor_id: actorId, post_id: p.id, version: p.version, detail: { trigger } });
    return { test: true };
  }
  try {
    const token = await dec(a.token_ciphertext);
    const res = await fetch("https://api.linkedin.com/rest/posts", { method: "POST", headers: liHeaders(token, { "Content-Type": "application/json" }), body: JSON.stringify({ author: `urn:li:person:${a.member_sub}`, commentary: p.body, visibility: "PUBLIC", distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false }) });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      if (res.status === 401) await db.from("linkedin_personal_accounts").update({ status: "reauthorization_required", last_error: "LinkedIn rejected the saved authorization" }).eq("owner_user_id", a.owner_user_id);
      throw new Error(`LinkedIn [${res.status}]: ${body}`);
    }
    const postId = res.headers.get("x-restli-id") ?? res.headers.get("x-linkedin-id");
    await db.from("linkedin_personal_posts").update({ status: "published", linkedin_post_id: postId, published_at: new Date().toISOString(), error: null }).eq("id", p.id);
    await event(db, { owner_user_id: a.owner_user_id, action: "published", actor_id: actorId, post_id: p.id, version: p.version, detail: { trigger, linkedin_post_id: postId, approved_version: p.approved_version } });
    return { test: false, postId };
  } catch (e) {
    const msg = (e as Error).message.replace(/Bearer\s+\S+/g, "Bearer [hidden]");
    // Keep the idempotency key: a failed attempt may have reached LinkedIn; the owner retries explicitly.
    await db.from("linkedin_personal_posts").update({ status: "failed", error: msg }).eq("id", p.id);
    await event(db, { owner_user_id: a.owner_user_id, action: "publish_failed", actor_id: actorId, post_id: p.id, version: p.version, detail: { trigger, error: msg } });
    throw new Error(msg);
  }
}

export async function runDuePersonal() {
  const db = await admin();
  const { data } = await db.from("linkedin_personal_posts").select("*").eq("status", "scheduled").lte("scheduled_at", new Date().toISOString()).limit(10);
  let ok = 0, blocked = 0;
  for (const p of data ?? []) { try { await publish(db, p, p.scheduled_by, "scheduler"); ok++; } catch { blocked++; } }
  return { ok, blocked };
}
