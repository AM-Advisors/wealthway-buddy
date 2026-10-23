/** Marketing publishing + performance: pure rules (client + server). No I/O. Unavailable is null, never 0. */
export const PUBLISH_MODES = ["test", "live"] as const;

/** Add UTM tags to Harmonious links only; existing utm_* values are kept. */
export function withUtm(text: string, t: { platform: string; series: string | null; campaign: string | null; article: string | null }): string {
  return text.replace(/https?:\/\/(?:[a-z0-9-]+\.)*harmonious\.(?:co|technology)[^\s)<>"']*/gi, (raw) => {
    const trail = raw.match(/[.,!?;:]+$/)?.[0] ?? ""; const url = trail ? raw.slice(0, -trail.length) : raw;
    try {
      const u = new URL(url);
      const set = (k: string, v: string | null) => { if (v && !u.searchParams.has(k)) u.searchParams.set(k, v); };
      set("utm_source", t.platform); set("utm_medium", "social"); set("utm_campaign", t.campaign || t.series || "organic");
      set("utm_content", t.article); set("utm_term", t.series);
      return u.toString() + trail;
    } catch { return raw; }
  });
}
/** Stable key so a post/channel pair is only ever published once. */
export const idempotencyKey = (postId: string, channel: string, mode: string) => `${mode}:${postId}:${channel}`;

export const POST_METRICS = ["impressions", "reach", "reactions", "comments", "shares", "saves", "link_clicks"] as const;
export type Metric = (typeof POST_METRICS)[number];
export type MetricRow = { metrics: Record<string, number>; unavailable: string[] };

/** Sum a metric across rows; null when no row reported it (unavailable, not zero). */
export function sumMetric(rows: MetricRow[], k: string): number | null {
  const have = rows.filter((r) => typeof r.metrics[k] === "number");
  return have.length ? have.reduce((a, r) => a + r.metrics[k]!, 0) : null;
}
export function rate(num: number | null, den: number | null): number | null {
  if (num === null || den === null || den === 0) return null;
  return Math.round((num / den) * 10000) / 100;
}
export function engagement(rows: MetricRow[]): number | null {
  const parts = ["reactions", "comments", "shares", "saves"].map((k) => sumMetric(rows, k));
  return parts.every((p) => p === null) ? null : parts.reduce<number>((a, p) => a + (p ?? 0), 0);
}
export const fmt = (v: number | null, pct = false) => (v === null ? "Not available" : pct ? `${v}%` : v.toLocaleString());

export type PostPerf = { id: string; title: string; series: string | null; topic: string | null; format: string; channel: string; day: string; ageDays: number; rows: MetricRow[] };
export type SearchRow = { page: string; query: string; day: string; clicks: number; impressions: number; position: number };

export type Rec = { question: string; answers: string[]; basis: string };
/** Weekly recommendations computed only from stored data; each answer says when data is insufficient. */
export function weeklyRecommendations(posts: PostPerf[], search: SearchRow[], weekEnd: string): Rec[] {
  const MIN = 3;
  const er = (p: PostPerf) => rate(engagement(p.rows), sumMetric(p.rows, "reach") ?? sumMetric(p.rows, "impressions"));
  const ctr = (p: PostPerf) => rate(sumMetric(p.rows, "link_clicks"), sumMetric(p.rows, "impressions"));
  const scored = posts.map((p) => ({ p, er: er(p), ctr: ctr(p) }));
  const byTopic = new Map<string, number[]>();
  for (const s of scored) if (s.er !== null && s.p.topic) byTopic.set(s.p.topic, [...(byTopic.get(s.p.topic) ?? []), s.er]);
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const topics = [...byTopic].map(([t, v]) => ({ t, n: v.length, a: avg(v) })).sort((a, b) => b.a - a.a);
  const none = (what: string) => [`Not enough data yet (${what}).`];
  const end = new Date(weekEnd).getTime(), wk = 7 * 864e5;
  const inWin = (r: SearchRow, from: number, to: number) => { const t = new Date(r.day).getTime(); return t > from && t <= to; };
  const qAgg = (from: number, to: number) => { const m = new Map<string, number>(); for (const r of search) if (inWin(r, from, to)) m.set(r.query, (m.get(r.query) ?? 0) + r.impressions); return m; };
  const thisW = qAgg(end - wk, end), lastW = qAgg(end - 2 * wk, end - wk);
  const pages = new Map<string, { c: number; i: number; pos: number[] }>();
  for (const r of search) { const x = pages.get(r.page) ?? { c: 0, i: 0, pos: [] }; x.c += r.clicks; x.i += r.impressions; x.pos.push(r.position); pages.set(r.page, x); }
  const pageList = [...pages].map(([page, x]) => ({ page, ...x, avgPos: avg(x.pos) }));
  const engagedTopics = topics.filter((t) => t.n >= 1).slice(0, 3);
  const headlines = scored.filter((s) => s.ctr !== null).sort((a, b) => b.ctr! - a.ctr!).slice(0, 3);
  const emerging = [...thisW].filter(([q, i]) => i >= 10 && i >= 2 * (lastW.get(q) ?? 0)).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const refresh = pageList.filter((p) => p.i >= 50 && p.avgPos >= 8 && p.avgPos <= 20).sort((a, b) => b.i - a.i).slice(0, 5);
  const repurpose = scored.filter((s) => s.er !== null && s.p.ageDays >= 14).sort((a, b) => b.er! - a.er!).slice(0, 3);
  const stop = topics.filter((t) => t.n >= MIN).slice(-2).filter((t) => topics.length > 2);
  return [
    { question: "Which topics generated meaningful engagement?", basis: "Engagement ÷ reach (or impressions) on platform-confirmed posts.",
      answers: engagedTopics.length ? engagedTopics.map((t) => `${t.t}: ${t.a.toFixed(2)}% average over ${t.n} post(s)`) : none("no posts with engagement and reach") },
    { question: "Which headlines produced clicks?", basis: "Link clicks ÷ impressions; Instagram doesn't report link clicks.",
      answers: headlines.length ? headlines.map((h) => `"${h.p.title}" (${h.p.channel}): ${h.ctr}% CTR`) : none("no posts report both clicks and impressions") },
    { question: "Which articles earned organic traffic?", basis: "Search Console clicks for the selected property.",
      answers: pageList.filter((p) => p.c > 0).sort((a, b) => b.c - a.c).slice(0, 5).map((p) => `${p.page}: ${p.c} clicks, ${p.i} impressions`).concat().slice(0, 5).length
        ? pageList.filter((p) => p.c > 0).sort((a, b) => b.c - a.c).slice(0, 5).map((p) => `${p.page}: ${p.c} clicks, ${p.i} impressions`) : none("no Search Console clicks stored") },
    { question: "Which search queries are emerging?", basis: "Impressions this week at least double last week (minimum 10).",
      answers: emerging.length ? emerging.map(([q, i]) => `"${q}": ${i} impressions (was ${lastW.get(q) ?? 0})`) : none("no qualifying query growth") },
    { question: "Which articles should be refreshed?", basis: "Pages averaging positions 8–20 with at least 50 impressions.",
      answers: refresh.length ? refresh.map((p) => `${p.page}: average position ${p.avgPos.toFixed(1)}, ${p.i} impressions`) : none("no pages near page one") },
    { question: "Which posts should be repurposed?", basis: "Highest engagement rate among posts at least 14 days old.",
      answers: repurpose.length ? repurpose.map((s) => `"${s.p.title}" (${s.p.channel}): ${s.er}%`) : none("no older posts with engagement data") },
    { question: "Which topics should we stop publishing?", basis: `Lowest average engagement among topics with at least ${MIN} posts; a judgment call for the team.`,
      answers: stop.length ? stop.map((t) => `Consider pausing "${t.t}": ${t.a.toFixed(2)}% over ${t.n} posts`) : none(`fewer than ${MIN} posts per topic`) },
  ];
}

/** Group posts by a dimension and compute totals with unavailable preserved. */
export function compare(posts: PostPerf[], dim: "day" | "series" | "topic" | "format" | "channel") {
  const g = new Map<string, PostPerf[]>();
  for (const p of posts) { const k = (p[dim] as string | null) || "—"; g.set(k, [...(g.get(k) ?? []), p]); }
  return [...g].map(([key, ps]) => {
    const rows = ps.flatMap((p) => p.rows);
    const imp = sumMetric(rows, "impressions"), reach = sumMetric(rows, "reach"), clicks = sumMetric(rows, "link_clicks"), eng = engagement(rows);
    return { key, posts: ps.length, impressions: imp, reach, engagement: eng, engagementRate: rate(eng, reach ?? imp), clicks, ctr: rate(clicks, imp),
      comments: sumMetric(rows, "comments"), shares: sumMetric(rows, "shares"), saves: sumMetric(rows, "saves") };
  }).sort((a, b) => (b.impressions ?? -1) - (a.impressions ?? -1));
}
