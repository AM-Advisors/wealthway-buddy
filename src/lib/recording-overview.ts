/** Pure overview of the loaded recordings list: totals, people, time and busiest pages. */
export type RecRow = { user_id: string; name: string; kind: "replay" | "screen"; first_path: string | null; last_path: string | null; started_at: string; last_activity_at: string };

export function recordingOverview(rows: RecRow[], now = Date.now()) {
  const mins = (r: RecRow) => Math.max(0, (Date.parse(r.last_activity_at) - Date.parse(r.started_at)) / 60000);
  const pages = new Map<string, number>();
  const people = new Map<string, { name: string; count: number; minutes: number; last: string }>();
  for (const r of rows) {
    for (const p of new Set([r.first_path, r.last_path].filter(Boolean) as string[])) pages.set(p, (pages.get(p) ?? 0) + 1);
    const e = people.get(r.user_id) ?? { name: r.name, count: 0, minutes: 0, last: r.last_activity_at };
    e.count++; e.minutes += mins(r); if (r.last_activity_at > e.last) e.last = r.last_activity_at;
    people.set(r.user_id, e);
  }
  const day = 86_400_000;
  return {
    total: rows.length,
    replays: rows.filter((r) => r.kind === "replay").length,
    screens: rows.filter((r) => r.kind === "screen").length,
    people: people.size,
    last24h: rows.filter((r) => now - Date.parse(r.started_at) <= day).length,
    last7d: rows.filter((r) => now - Date.parse(r.started_at) <= 7 * day).length,
    totalMinutes: Math.round(rows.reduce((s, r) => s + mins(r), 0)),
    topPages: [...pages.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([path, count]) => ({ path, count })),
    topPeople: [...people.values()].sort((a, b) => b.count - a.count).slice(0, 5).map((p) => ({ ...p, minutes: Math.round(p.minutes) })),
  };
}
