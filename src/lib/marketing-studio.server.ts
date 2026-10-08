/**
 * Marketing Studio (editorial planning). Server-only; every call re-checks roles.
 * Workflow rules come from marketing-studio-model.ts. Nothing here publishes anything:
 * public publishing still goes through the linked post/article's own approval.
 */
import { STUDIO_ACCESS, STUDIO_MANAGERS, isLocked, moveProblem, weekStart } from "@/lib/marketing-studio-model";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;

async function ctx(userId: string) {
  const db = await admin();
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId);
  const roles = ((data ?? []) as any[]).map((r) => String(r.role));
  if (!roles.some((r) => STUDIO_ACCESS.includes(r))) throw new Error("Only the Marketing team can use the Studio.");
  return { db, roles };
}
async function logEvent(db: any, item_id: string, action: string, actor_id: string, from_status?: string | null, to_status?: string | null, note?: string | null) {
  const { error } = await db.from("marketing_content_item_events").insert({ item_id, action, actor_id, from_status: from_status ?? null, to_status: to_status ?? null, note: note ?? null });
  if (error) throw new Error(error.message);
}
async function snapshot(db: any, item: any, actor_id: string) {
  const { error } = await db.from("marketing_content_item_versions").insert({ item_id: item.id, version: item.version, snapshot: item, actor_id });
  if (error) throw new Error(error.message);
}
async function names(db: any, ids: string[]) {
  const u = [...new Set(ids.filter(Boolean))];
  if (!u.length) return {} as Record<string, string>;
  const { data } = await db.from("profiles").select("user_id, legal_name, email").in("user_id", u);
  return Object.fromEntries(((data ?? []) as any[]).map((p) => [p.user_id, p.legal_name || p.email || "Team member"]));
}

export async function overview(userId: string, from: string, to: string) {
  const { db, roles } = await ctx(userId);
  const [{ data: series }, { data: items }, { data: team }] = await Promise.all([
    db.from("marketing_series").select("*").eq("active", true).order("weekday"),
    db.from("marketing_content_items").select("*").or(`and(publish_at.gte.${from},publish_at.lt.${to}),publish_at.is.null`).order("publish_at", { ascending: true }).limit(500),
    db.from("user_roles").select("user_id, role").in("role", STUDIO_ACCESS),
  ]);
  const teamIds = [...new Set(((team ?? []) as any[]).map((t) => t.user_id))];
  const people = await names(db, teamIds);
  return { series: series ?? [], items: items ?? [], people, roles, me: userId };
}

export async function getItem(userId: string, id: string) {
  const { db } = await ctx(userId);
  const [{ data: item }, { data: events }, { data: comments }, { data: versions }] = await Promise.all([
    db.from("marketing_content_items").select("*").eq("id", id).single(),
    db.from("marketing_content_item_events").select("*").eq("item_id", id).order("created_at", { ascending: false }),
    db.from("marketing_content_comments").select("*").eq("item_id", id).order("created_at"),
    db.from("marketing_content_item_versions").select("id, version, actor_id, created_at").eq("item_id", id).order("version", { ascending: false }),
  ]);
  if (!item) throw new Error("Not found.");
  const people = await names(db, [...(events ?? []), ...(comments ?? []), ...(versions ?? [])].map((e: any) => e.actor_id ?? e.author_id));
  return { item, events: events ?? [], comments: comments ?? [], versions: versions ?? [], people };
}

const FIELDS = ["series_key", "publish_at", "article_title", "social_headline", "topic", "audience", "keywords", "source_urls",
  "author_id", "reviewer_id", "platforms", "graphic_requirements", "article_url", "cta", "campaign_id", "post_id", "article_id", "email_id", "metrics"] as const;

export async function saveItem(userId: string, input: any) {
  const { db } = await ctx(userId);
  const patch: any = {};
  for (const k of FIELDS) if (k in input) patch[k] = input[k] === "" && k.endsWith("_id") ? null : input[k];
  if (patch.publish_at) patch.week_start = weekStart(new Date(patch.publish_at));
  if (!input.id) {
    if (!patch.series_key) throw new Error("Pick a series.");
    const { data, error } = await db.from("marketing_content_items").insert({ ...patch, author_id: patch.author_id ?? userId, created_by: userId }).select().single();
    if (error) throw new Error(error.message);
    await snapshot(db, data, userId);
    await logEvent(db, data.id, "created", userId, null, data.status);
    return data;
  }
  const { data: cur } = await db.from("marketing_content_items").select("*").eq("id", input.id).single();
  if (!cur) throw new Error("Not found.");
  const onlyDate = Object.keys(patch).every((k) => k === "publish_at" || k === "week_start" || k === "metrics");
  if (isLocked(cur.status) && !(onlyDate && cur.status !== "published")) throw new Error("Approved content is locked. Send it back to edit.");
  const { data, error } = await db.from("marketing_content_items")
    .update({ ...patch, version: cur.version + 1, updated_at: new Date().toISOString(), proposed_slot: false })
    .eq("id", cur.id).eq("version", cur.version).select().single();
  if (error || !data) throw new Error("Someone else changed this item. Reload and try again.");
  await snapshot(db, data, userId);
  await logEvent(db, data.id, onlyDate ? "rescheduled" : "edited", userId);
  return data;
}

export async function moveItem(userId: string, id: string, to: string, note?: string | null) {
  const { db, roles } = await ctx(userId);
  const { data: cur } = await db.from("marketing_content_items").select("*").eq("id", id).single();
  if (!cur) throw new Error("Not found.");
  const problem = moveProblem({ from: cur.status, to, roles, actorId: userId, authorId: cur.author_id, publishAt: cur.publish_at, note, unverifiedClaims: cur.unverified_claims ?? 0 });
  if (problem) throw new Error(problem);
  if (to === "approved") {
    const { approvalGaps } = await import("@/lib/marketing-content-model");
    const { data: reviews } = await db.from("marketing_content_reviews").select("kind, result, package_version, created_at").eq("item_id", id);
    const gaps = approvalGaps(cur.series_key, cur.package_version ?? 0, reviews ?? []);
    if (gaps.length) throw new Error(gaps.join(" "));
  }
  const now = new Date().toISOString();
  const patch: any = { status: to, version: cur.version + 1, updated_at: now };
  if (to === "ceo_approval") patch.reviewer_id = cur.reviewer_id ?? userId;
  if (to === "approved") Object.assign(patch, { approved_by: userId, approved_at: now, ceo_approved_by: userId, ceo_approved_at: now });
  const { data, error } = await db.from("marketing_content_items").update(patch).eq("id", id).eq("version", cur.version).select().single();
  if (error || !data) throw new Error("Someone else changed this item. Reload and try again.");
  await snapshot(db, data, userId);
  await logEvent(db, id, "moved", userId, cur.status, to, note);
  return data;
}

export async function duplicateItem(userId: string, id: string) {
  const { db } = await ctx(userId);
  const { data: cur } = await db.from("marketing_content_items").select("*").eq("id", id).single();
  if (!cur) throw new Error("Not found.");
  const copy: any = {};
  for (const k of FIELDS) copy[k] = cur[k];
  Object.assign(copy, { post_id: null, article_id: null, email_id: null, metrics: {}, article_title: `${cur.article_title} (copy)`, is_sample: cur.is_sample });
  return saveItem(userId, copy);
}

export async function comment(userId: string, id: string, body: string) {
  const { db } = await ctx(userId);
  const { error } = await db.from("marketing_content_comments").insert({ item_id: id, author_id: userId, body });
  if (error) throw new Error(error.message);
  await logEvent(db, id, "commented", userId);
  return { ok: true };
}

/** Creates the five proposed slots for a week. Manual only; never duplicates a series slot for that week. */
export async function planWeek(userId: string, week: string) {
  const { db, roles } = await ctx(userId);
  if (!roles.some((r) => STUDIO_MANAGERS.includes(r))) throw new Error("Only a marketing manager can plan the week.");
  const monday = weekStart(new Date(`${week}T12:00:00Z`));
  const { data: series } = await db.from("marketing_series").select("*").eq("active", true);
  const { data: existing } = await db.from("marketing_content_items").select("series_key").eq("week_start", monday);
  const have = new Set(((existing ?? []) as any[]).map((e) => e.series_key));
  let created = 0;
  const { data: org } = await db.from("marketing_org_settings").select("timezone").eq("id", 1).maybeSingle();
  const { zonedToUtc } = await import("@/lib/org-timezone");
  const tz = org?.timezone ?? "America/Chicago";
  for (const s of (series ?? []) as any[]) {
    if (have.has(s.key)) continue;
    const [yy, mm, dd] = monday.split("-").map(Number) as [number, number, number];
    const day = new Date(Date.UTC(yy, mm - 1, dd + (s.weekday - 1)));
    const d = zonedToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), 9, 0, tz); // 9am organization time
    const { data, error } = await db.from("marketing_content_items").insert({
      series_key: s.key, week_start: monday, publish_at: d.toISOString(), proposed_slot: true,
      topic: `Proposed ${s.name} topic — replace me`, platforms: ["linkedin"], created_by: userId, author_id: null,
    }).select().single();
    if (error) { if (String(error.code) === "23505") continue; throw new Error(error.message); }
    await snapshot(db, data, userId);
    await logEvent(db, data.id, "proposed_slot", userId, null, "idea");
    created++;
  }
  return { created, week: monday };
}
