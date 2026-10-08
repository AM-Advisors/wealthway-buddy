/** Performance dashboard data. Server-only, read-only. Unavailable metrics are reported as unavailable, never zero. */
import { MARKETING_ACCESS } from "@/lib/marketing-model";
import { weeklyRecommendations, type PostPerf, type SearchRow } from "@/lib/marketing-perf-model";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;

export async function dashboard(userId: string, days: number) {
  const db = await admin();
  const { data: r } = await db.from("user_roles").select("role").eq("user_id", userId);
  if (!((r ?? []) as any[]).some((x) => MARKETING_ACCESS.includes(x.role))) throw new Error("Marketing access required.");
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const { data: org } = await db.from("marketing_org_settings").select("timezone").eq("id", 1).maybeSingle();
  const orgTz: string = org?.timezone ?? "America/Chicago";
  const [{ data: targets }, { data: settings }, { data: attempts }, { data: leads }, queue] = await Promise.all([
    db.from("marketing_post_targets").select("id, post_id, channel, status, permalink, published_at, confirmed_at, error, attempts").gte("created_at", new Date(Date.now() - Math.max(days, 30) * 864e5).toISOString()).limit(1000),
    db.from("marketing_search_settings").select("*").eq("id", 1).single(),
    db.from("marketing_publish_attempts").select("*").order("created_at", { ascending: false }).limit(50),
    db.from("marketing_leads").select("created_at, utm_source, utm_campaign, utm_content, utm_term").gte("created_at", since).limit(5000),
    db.from("marketing_posts").select("id, title, status, channels, scheduled_at, image_paths, body").in("status", ["approved", "scheduled", "publishing", "failed"]).order("scheduled_at", { ascending: true }).limit(50),
  ]);
  const postIds = [...new Set(((targets ?? []) as any[]).map((t) => t.post_id))];
  const [{ data: posts }, { data: metrics }, { data: items }] = await Promise.all([
    postIds.length ? db.from("marketing_posts").select("id, title, image_paths, body").in("id", postIds) : { data: [] },
    ((targets ?? []) as any[]).length ? db.from("marketing_post_metrics").select("target_id, captured_on, metrics, unavailable").in("target_id", (targets as any[]).map((t) => t.id)).order("captured_on", { ascending: false }) : { data: [] },
    postIds.length ? db.from("marketing_content_items").select("series_key, topic, post_ids, article_title") .overlaps("post_ids", postIds) : { data: [] },
  ]);
  const postMap = new Map(((posts ?? []) as any[]).map((p) => [p.id, p]));
  const latest = new Map<string, any>();
  for (const m of (metrics ?? []) as any[]) if (!latest.has(m.target_id)) latest.set(m.target_id, m);
  const itemFor = (pid: string) => ((items ?? []) as any[]).find((i) => (i.post_ids ?? []).includes(pid));
  const perf: PostPerf[] = ((targets ?? []) as any[]).filter((t) => t.status === "published" && t.published_at >= since).map((t) => {
    const p = postMap.get(t.post_id) ?? {}; const it = itemFor(t.post_id); const m = latest.get(t.id);
    const n = (p.image_paths ?? []).length;
    return { id: t.id, title: p.title ?? "Post", series: it?.series_key ?? null, topic: it?.topic ?? it?.article_title ?? null,
      format: n > 1 ? "carousel" : n === 1 ? "image" : "text", channel: t.channel, day: new Date(t.published_at).toLocaleDateString("en-US", { weekday: "long", timeZone: orgTz }),
      ageDays: Math.floor((Date.now() - new Date(t.published_at).getTime()) / 864e5), rows: m ? [{ metrics: m.metrics, unavailable: m.unavailable }] : [] };
  });
  const { data: srows } = settings?.site_url ? await db.from("marketing_search_rows").select("page, query, day, clicks, impressions, position").eq("site_url", settings.site_url).gte("day", since.slice(0, 10)).limit(20000) : { data: [] };
  const search = (srows ?? []) as SearchRow[];
  let properties: string[] = []; let propError: string | null = null;
  try { properties = await (await import("@/lib/marketing-queue.server")).searchProperties(); } catch (e) { propError = (e as Error).message; }
  const ga4 = !!process.env["GOOGLE_ANALYTICS_API_KEY"];
  return {
    perf, search, settings, properties, propError, ga4,
    leads: { total: (leads ?? []).length, attributed: ((leads ?? []) as any[]).filter((l) => l.utm_source).length, rows: leads ?? [] },
    attempts: attempts ?? [], queue: queue.data ?? [], targets: targets ?? [],
    recommendations: weeklyRecommendations(perf, search, new Date().toISOString()),
  };
}
