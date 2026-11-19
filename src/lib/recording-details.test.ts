import { describe, expect, it } from "vitest";
import { parseDevice, recordingBreakdown } from "./recording-details";

describe("recording details", () => {
  it("reads iPhone Safari and Windows Chrome", () => {
    expect(parseDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1")).toEqual({ browser: "Safari 17", os: "iPhone iOS 17", type: "Phone" });
    expect(parseDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")).toEqual({ browser: "Chrome 130", os: "Windows", type: "Computer" });
  });
  it("breaks a replay into pages, clicks, typing and time away", () => {
    const t = 1_000_000;
    const b = recordingBreakdown([
      { type: 4, timestamp: t, data: { href: "https://app.harmonious.co/home?x=1" } },
      { type: 3, timestamp: t + 1000, data: { source: 2, type: 2 } },
      { type: 3, timestamp: t + 2000, data: { source: 5 } },
      { type: 5, timestamp: t + 10_000, data: { tag: "hm", payload: { kind: "page", path: "/tax" } } },
      { type: 5, timestamp: t + 20_000, data: { tag: "hm", payload: { kind: "tab_hidden" } } },
      { type: 5, timestamp: t + 50_000, data: { tag: "hm", payload: { kind: "tab_visible" } } },
      { type: 3, timestamp: t + 60_000, data: { source: 2, type: 2 } },
    ]);
    expect(b.pages).toEqual([{ path: "/home", at: t, seconds: 10 }, { path: "/tax", at: t + 10_000, seconds: 50 }]);
    expect(b.clicks).toBe(2);
    expect(b.typing).toBe(1);
    expect(b.durationSeconds).toBe(60);
    expect(b.awaySeconds).toBe(30);
    expect(b.activeSeconds).toBe(30);
    expect(b.markers.map((m) => m.kind)).toEqual(["tab_hidden", "tab_visible"]);
  });
});
