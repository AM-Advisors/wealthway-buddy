/**
 * Controlled publishing queue + performance refresh. Server-only.
 * - Test mode (default): Facebook gets a nonpublic post, Instagram is validated only; nothing is public.
 * - Live mode needs a request and a second person's approval (Super Admin self-approval needs a reason).
 * - A target is "published" only after the platform returns the object with a permalink; a submitted
 *   but unconfirmed target is re-checked, never re-posted (idempotency).
 * Every attempt is logged append-only. Never invents metrics: missing values stay unavailable.
 */
import { MARKETING_ACCESS, MARKETING_APPROVERS } from "@/lib/marketing-model";
import { withUtm } from "@/lib/marketing-perf-model";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
const LIVE_APPROVERS = ["executive", "executive_approver", "super_admin", "admin"];
const GSC = "https://connector-gateway.lovable.dev/google_search_console";

async function roles(db: any, userId: string) {
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId);
  return ((data ?? []) as any[]).map((r) => String(r.role));
}
async function log(db: any, row: any) { await db.from("marketing_publish_attempts").insert(row); }

/* ---------- Mode ---------- */
export async function modeState(userId: string) {
  const db = await admin();
  const r = await roles(db, userId);
  if (!r.some((x) => MARKETING_ACCESS.includes(x as any))) throw new Error("Marketing access required.");
  const { data } = await db.from("marketing_publishing_mode").select("*").eq("id", 1).single();
  return { ...data, canRequest: r.some((x) => MARKETING_APPROVERS.includes(x as any)), canApprove: r.some((x) => LIVE_APPROVERS.includes(x)), me: userId };
}
export async function requestLive(userId: string, reason: string) {
  const db = await admin();
  if (!(await roles(db, userId)).some((x) => MARKETING_APPROVERS.includes(x as any))) throw new Error("Only a marketing approver can request live publishing.");
  if (!reason.trim()) throw new Error("Give a reason.");
  await db.from("marketing_publishing_mode").update({ requested_by: userId, requested_at: new Date().toISOString(), request_reason: reason, approved_by: null, approved_at: null, approval_reason: null, updated_at: new Date().toISOString() }).eq("id", 1);
  return { ok: true };
}
export async function approveLive(userId: string, reason: string) {
  const db = await admin();
  const r = await roles(db, userId);
  if (!r.some((x) => LIVE_APPROVERS.includes(x))) throw new Error("Only an executive approver can turn on live publishing.");
  const { data: m } = await db.from("marketing_publishing_mode").select("*").eq("id", 1).single();
  if (!m.requested_by) throw new Error("Someone must request live publishing first.");
  const self = m.requested_by === userId;
  if (self && !r.includes("super_admin")) throw new Error("Someone other than the requester must approve.");
  if (!reason.trim()) throw new Error("Give a reason for the approval.");
  await db.from("marketing_publishing_mode").update({ mode: "live", approved_by: userId, approved_at: new Date().toISOString(), approval_reason: (self ? "[Super Admin self-approval] " : "") + reason, updated_at: new Date().toISOString() }).eq("id", 1);
  return { ok: true };
}
export async function backToTest(userId: string) {
  const db = await admin();
  if (!(await roles(db, userId)).some((x) => MARKETING_APPROVERS.includes(x as any))) throw new Error("Only a marketing approver can do this.");
  await db.from("marketing_publishing_mode").update({ mode: "test", requested_by: null, requested_at: null, request_reason: null, approved_by: null, approved_at: null, approval_reason: `Returned to test by ${userId}`, updated_at: new Date().toISOString() }).eq("id", 1);
  return { ok: true };
}

/* ---------- Queue ---------- */
async function utmContext(db: any, postId: string) {
  const { data } = await db.from("marketing_content_items").select("series_key, campaign_id, article_url").contains("post_ids", [postId]).limit(1);
  const i = (data ?? [])[0];
  const slug = i?.article_url?.match(/\/post\/([a-z0-9-]+)/)?.[1] ?? null;
  return { series: i?.series_key ?? null, campaign: i?.campaign_id ?? null, article: slug };
}

async function notifyFailure(db: any, p: any, errors: string[]) {
  try {
    const ids = [p.author_id, p.approved_by].filter(Boolean);
    const { data } = await db.from("profiles").select("email").in("user_id", ids);
    const pub = await import("@/lib/marketing-publish.server");
    const list = errors.map((e) => `<li>${e.replace(/</g, "&lt;")}</li>`).join("");
    for (const r of (data ?? []) as any[]) if (r.email) await pub.sendMarketingEmail(r.email, `Post failed to publish: ${p.title}`,
      `<p>"${p.title.replace(/</g, "&lt;")}" didn't publish on every channel.</p><ul>${list}</ul><p>Open Marketing → Social posts and use Retry publishing. The original approval still stands.</p>`,
      `"${p.title}" didn't publish: ${errors.join("; ")}. Open Marketing → Social posts and retry.`, "https://app.harmonious.co/marketing", `fail:${p.id}:${Date.now()}`);
  } catch (e) { console.error("failure notification", e); }
}

/** Publish (or test) one claimed post. Returns the post's resulting status. */
export async function processPost(db: any, p: any, imgs: string[], channels: Map<string, any>) {
  const pub = await import("@/lib/marketing-publish.server");
  const { data: m } = await db.from("marketing_publishing_mode").select("mode").eq("id", 1).single();
  const mode = m?.mode === "live" ? "live" : "test";
  const utm = await utmContext(db, p.id);
  const { data: targets } = await db.from("marketing_post_targets").select("*").eq("post_id", p.id);
  const errors: string[] = [];
  for (const t of (targets ?? []) as any[]) {
    if (t.status === "published") continue;
    if (mode === "test" && t.status === "test_passed") continue;
    const ref = channels.get(t.channel)?.account_ref || null;
    const text = withUtm(p.body, { platform: t.channel, ...utm });
    const base = { post_id: p.id, target_id: t.id, channel: t.channel, mode };
    try {
      if (!ref) throw new Error("Channel not connected.");
      if (t.channel === "linkedin") throw new Error("LinkedIn company posting isn't available yet.");
      if (mode === "test") {
        const ext = t.channel === "facebook" ? await pub.testFacebook(ref, text, imgs) : await pub.validateInstagram(ref, text, imgs);
        await db.from("marketing_post_targets").update({ status: "test_passed", external_id: null, error: null, mode, attempts: t.attempts + 1 }).eq("id", t.id);
        await log(db, { ...base, action: t.channel === "facebook" ? "test_post_nonpublic" : "validate_only", result: "test_passed", external_id: ext === "validated" ? null : ext });
        continue;
      }
      let ext = t.status === "submitted" && t.external_id ? t.external_id : null;
      if (!ext) {
        ext = t.channel === "facebook" ? await pub.publishFacebook(ref, text, imgs) : await pub.publishInstagram(ref, text, imgs);
        // Record the submission before confirming so a crash can never cause a second post.
        await db.from("marketing_post_targets").update({ status: "submitted", external_id: ext, mode, attempts: t.attempts + 1 }).eq("id", t.id);
        await log(db, { ...base, action: "submit", result: "submitted", external_id: ext });
      }
      const c = await pub.confirmMeta(t.channel, ref, ext);
      if (c.confirmed) {
        await db.from("marketing_post_targets").update({ status: "published", permalink: c.permalink, confirmed_at: new Date().toISOString(), published_at: new Date().toISOString(), error: null }).eq("id", t.id);
        await log(db, { ...base, action: "confirm", result: "published", external_id: ext, permalink: c.permalink });
      } else {
        await db.from("marketing_post_targets").update({ status: "submitted", error: `Awaiting platform confirmation: ${c.error ?? ""}`.slice(0, 500) }).eq("id", t.id);
        await log(db, { ...base, action: "confirm", result: "unconfirmed", external_id: ext, error: c.error ?? null });
      }
    } catch (e) {
      const msg = String((e as Error).message).slice(0, 500);
      errors.push(`${t.channel}: ${msg}`);
      await db.from("marketing_post_targets").update({ status: "failed", error: msg, attempts: t.attempts + 1 }).eq("id", t.id);
      await log(db, { ...base, action: "submit", result: "failed", error: msg });
    }
  }
  const { data: after } = await db.from("marketing_post_targets").select("status").eq("post_id", p.id);
  const st = ((after ?? []) as any[]).map((x) => x.status);
  let status: string;
  if (st.includes("failed")) status = "failed";
  else if (mode === "test") status = "approved";
  else if (st.every((s) => s === "published")) status = "published";
  else status = "publishing";
  await db.from("marketing_posts").update({
    status, published_at: status === "published" ? new Date().toISOString() : null,
    ...(mode === "test" ? { scheduled_at: null } : {}),
  }).eq("id", p.id);
  if (errors.length) await notifyFailure(db, p, errors);
  return status;
}

/** Re-check submitted-but-unconfirmed targets (never re-posts). */
export async function reconfirm(db: any, signed: (paths: string[]) => Promise<string[]>, channels: Map<string, any>) {
  const { data: posts } = await db.from("marketing_posts").select("*").eq("status", "publishing").limit(20);
  for (const p of (posts ?? []) as any[]) await processPost(db, p, await signed(p.image_paths ?? []), channels);
}

/* ---------- Metrics ---------- */
export async function refreshMetrics() {
  const db = await admin();
  const pub = await import("@/lib/marketing-publish.server");
  const { data: ch } = await db.from("marketing_channels").select("*");
  const refs = new Map(((ch ?? []) as any[]).map((c) => [c.channel, c.account_ref]));
  const since = new Date(Date.now() - 90 * 864e5).toISOString();
  const { data: targets } = await db.from("marketing_post_targets").select("id, channel, external_id").eq("status", "published").gte("published_at", since).limit(200);
  const today = new Date().toISOString().slice(0, 10);
  let n = 0;
  for (const t of (targets ?? []) as any[]) {
    if (!t.external_id || t.channel === "linkedin" || !refs.get(t.channel)) continue;
    try {
      const r = await pub.metaInsights(t.channel, refs.get(t.channel), t.external_id);
      await db.from("marketing_post_metrics").upsert({ target_id: t.id, captured_on: today, metrics: r.metrics, unavailable: r.unavailable, source: `meta_${t.channel}` }, { onConflict: "target_id,captured_on" });
      n++;
    } catch (e) { console.error("metrics", t.id, e); }
  }
  return { posts: n };
}

/* ---------- Search Console ---------- */
async function gscFetch(path: string, init?: RequestInit) {
  const k = process.env["LOVABLE_API_KEY"], c = process.env["GOOGLE_SEARCH_CONSOLE_API_KEY"];
  if (!k || !c) throw new Error("Search Console isn't connected.");
  const r = await fetch(`${GSC}${path}`, { ...init, headers: { Authorization: `Bearer ${k}`, "X-Connection-Api-Key": c, "Content-Type": "application/json" } });
  if (!r.ok) throw new Error(`Search Console [${r.status}]: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}
export async function searchProperties() {
  const j: any = await gscFetch("/webmasters/v3/sites");
  return ((j.siteEntry ?? []) as any[]).filter((s) => s.permissionLevel !== "siteUnverifiedUser").map((s) => s.siteUrl as string);
}
export async function chooseProperty(userId: string, siteUrl: string) {
  const db = await admin();
  if (!(await roles(db, userId)).some((x) => MARKETING_APPROVERS.includes(x as any))) throw new Error("Only a marketing approver can choose this.");
  if (!(await searchProperties()).includes(siteUrl)) throw new Error("That property isn't verified for this account.");
  await db.from("marketing_search_settings").update({ site_url: siteUrl, chosen_by: userId, chosen_at: new Date().toISOString() }).eq("id", 1);
  return refreshSearch();
}
export async function refreshSearch() {
  const db = await admin();
  const { data: s } = await db.from("marketing_search_settings").select("*").eq("id", 1).single();
  if (!s?.site_url) return { skipped: "no property chosen" };
  try {
    if (!(await searchProperties()).includes(s.site_url)) throw new Error("The chosen property is no longer verified.");
    const end = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10), start = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const j: any = await gscFetch(`/webmasters/v3/sites/${encodeURIComponent(s.site_url)}/searchAnalytics/query`, { method: "POST", body: JSON.stringify({ startDate: start, endDate: end, dimensions: ["date", "page", "query"], rowLimit: 5000 }) });
    const rows = ((j.rows ?? []) as any[]).map((r) => ({ site_url: s.site_url, day: r.keys[0], page: r.keys[1], query: r.keys[2], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }));
    for (let i = 0; i < rows.length; i += 500) await db.from("marketing_search_rows").upsert(rows.slice(i, i + 500), { onConflict: "site_url,day,page,query" });
    await db.from("marketing_search_settings").update({ last_refresh_at: new Date().toISOString(), last_error: null }).eq("id", 1);
    return { rows: rows.length };
  } catch (e) {
    await db.from("marketing_search_settings").update({ last_error: String((e as Error).message).slice(0, 500) }).eq("id", 1);
    return { error: (e as Error).message };
  }
}
