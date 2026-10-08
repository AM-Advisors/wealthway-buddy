import { describe, expect, it } from "vitest";
import { compare, engagement, idempotencyKey, rate, sumMetric, weeklyRecommendations, withUtm } from "./marketing-perf-model";

describe("publishing + performance rules", () => {
  it("tags only Harmonious links and keeps existing utm values", () => {
    const t = withUtm("Read https://harmonious.co/post/a. And https://example.com/x https://harmonious.co/?utm_source=keep", { platform: "facebook", series: "market_monday", campaign: null, article: "a" });
    expect(t).toContain("https://harmonious.co/post/a?utm_source=facebook&utm_medium=social&utm_campaign=market_monday&utm_content=a&utm_term=market_monday.");
    expect(t).toContain("https://example.com/x ");
    expect(t).toContain("utm_source=keep");
  });
  it("unavailable is null, not zero", () => {
    expect(sumMetric([{ metrics: {}, unavailable: ["saves"] }], "saves")).toBeNull();
    expect(sumMetric([{ metrics: { saves: 0 }, unavailable: [] }], "saves")).toBe(0);
    expect(rate(5, null)).toBeNull(); expect(rate(5, 0)).toBeNull(); expect(rate(1, 4)).toBe(25);
    expect(engagement([{ metrics: {}, unavailable: [] }])).toBeNull();
  });
  it("idempotency key is per post, channel and mode", () => { expect(idempotencyKey("p", "facebook", "live")).not.toBe(idempotencyKey("p", "facebook", "test")); });
  it("recommendations say when data is insufficient", () => {
    const r = weeklyRecommendations([], [], new Date().toISOString());
    expect(r).toHaveLength(7);
    for (const x of r) expect(x.answers[0]).toMatch(/Not enough data/);
  });
  it("compares groups without inventing values", () => {
    const rows = compare([{ id: "1", title: "a", series: "s", topic: "t", format: "image", channel: "instagram", day: "Monday", ageDays: 1, rows: [{ metrics: { reach: 100, reactions: 5 }, unavailable: ["link_clicks"] }] }], "series");
    expect(rows[0]!.clicks).toBeNull(); expect(rows[0]!.engagementRate).toBe(5);
  });
});
