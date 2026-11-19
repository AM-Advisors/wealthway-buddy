import { describe, expect, it } from "vitest";
import { recordingOverview } from "@/lib/recording-overview";
const now = Date.parse("2026-11-19T12:00:00Z");
const r = (u: string, kind: "replay" | "screen", start: string, end: string, p = "/home") => ({ user_id: u, name: u, kind, first_path: p, last_path: p, started_at: start, last_activity_at: end });
describe("recording overview", () => {
  it("counts kinds, people, recent and minutes", () => {
    const o = recordingOverview([r("a", "replay", "2026-11-19T10:00:00Z", "2026-11-19T10:30:00Z"), r("a", "screen", "2026-11-10T10:00:00Z", "2026-11-10T10:10:00Z", "/x"), r("b", "replay", "2026-11-18T13:00:00Z", "2026-11-18T13:05:00Z")], now);
    expect(o).toMatchObject({ total: 3, replays: 2, screens: 1, people: 2, last24h: 2, last7d: 2, totalMinutes: 45 });
    expect(o.topPages[0]).toEqual({ path: "/home", count: 2 });
    expect(o.topPeople[0]).toMatchObject({ name: "a", count: 2, minutes: 40 });
  });
});
