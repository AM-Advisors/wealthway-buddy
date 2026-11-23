import { describe, expect, it } from "vitest";
import { frameTimes, mp4Name } from "./recording-video";
describe("recording video", () => {
  it("captures 4 frames per second including the end", () => { expect(frameTimes(1000)).toEqual([0, 250, 500, 750, 1000]); });
  it("caps very long replays", () => { expect(frameTimes(10_000_000).length).toBe(7200); });
  it("downloads use .mp4", () => { expect(mp4Name("harmonious-page-replay-x.html")).toBe("harmonious-page-replay-x.mp4"); expect(mp4Name("a.webm")).toBe("a.mp4"); });
});
