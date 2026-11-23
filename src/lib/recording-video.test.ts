import { describe, expect, it } from "vitest";
import { changesPage, frameTimes, mp4Name, replayFrames } from "./recording-video";
describe("recording video", () => {
  it("captures 4 frames per second including the end", () => { expect(frameTimes(1000)).toEqual([0, 250, 500, 750, 1000]); });
  it("caps very long replays", () => { expect(frameTimes(10_000_000).length).toBe(7200); });
  it("downloads use .mp4", () => { expect(mp4Name("harmonious-page-replay-x.html")).toBe("harmonious-page-replay-x.mp4"); expect(mp4Name("a.webm")).toBe("a.mp4"); });
  it("holds still stretches as one frame instead of capturing every quarter second", () => {
    // 10 s replay, page changed only at 2.1 s: frames at 0 and 2.25 s, each held until the next.
    expect(replayFrames([2100], 10_000)).toEqual([
      { atMs: 0, startSec: 0, durSec: 2.25 },
      { atMs: 2250, startSec: 2.25, durSec: 8 },
    ]);
  });
  it("captures every frame when the page keeps changing", () => {
    expect(replayFrames([100, 300, 600, 900], 1000).map((f) => f.atMs)).toEqual([0, 250, 500, 750, 1000]);
  });
  it("keeps the full video length", () => {
    const total = replayFrames([5000], 60_000).reduce((a, f) => a + f.durSec, 0);
    expect(total).toBeCloseTo(frameTimes(60_000).length / 4);
  });
  it("pointer moves alone do not trigger a new picture", () => {
    expect(changesPage({ type: 3, data: { source: 1 } })).toBe(false);
    expect(changesPage({ type: 3, data: { source: 6 } })).toBe(false);
    expect(changesPage({ type: 3, data: { source: 0 } })).toBe(true);
    expect(changesPage({ type: 2 })).toBe(true);
  });
});
