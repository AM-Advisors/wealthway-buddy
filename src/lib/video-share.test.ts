import { describe, expect, it } from "vitest";
import { canShareRecording, checkViewer, isRepeatView, isShareToken, shareExpiry, shareState, shareUrl } from "@/lib/video-share";

describe("video share links", () => {
  it("only screen videos can be shared, never background page replays", () => {
    expect(canShareRecording("screen")).toBe(true);
    expect(canShareRecording("replay")).toBe(false);
  });
  it("links last 30 days", () => {
    const now = new Date("2026-11-23T00:00:00Z");
    expect(shareExpiry(now)).toBe("2026-12-23T00:00:00.000Z");
  });
  it("turned-off and expired links cannot be watched", () => {
    const now = new Date("2026-11-23T00:00:00Z");
    expect(shareState({ expires_at: "2026-12-01T00:00:00Z", revoked_at: null }, now)).toBe("active");
    expect(shareState({ expires_at: "2026-12-01T00:00:00Z", revoked_at: "2026-11-22T00:00:00Z" }, now)).toBe("revoked");
    expect(shareState({ expires_at: "2026-11-22T00:00:00Z", revoked_at: null }, now)).toBe("expired");
  });
  it("name and email are required to watch", () => {
    expect(checkViewer({ name: "", email: "a@b.co" }).ok).toBe(false);
    expect(checkViewer({ name: "Ryan M", email: "not-an-email" }).ok).toBe(false);
    expect(checkViewer({ name: "  Ryan   M ", email: " Ryan@Example.COM " })).toEqual({ ok: true, name: "Ryan M", email: "ryan@example.com" });
  });
  it("counts repeat presses within 10 minutes once", () => {
    const now = new Date("2026-11-23T00:10:00Z");
    const prev = { viewer_email: "a@b.co", ip_address: "1.2.3.4", viewed_at: "2026-11-23T00:05:00Z" };
    expect(isRepeatView(prev, "a@b.co", "1.2.3.4", now)).toBe(true);
    expect(isRepeatView(prev, "c@d.co", "1.2.3.4", now)).toBe(false);
    expect(isRepeatView({ ...prev, viewed_at: "2026-11-22T23:55:00Z" }, "a@b.co", "1.2.3.4", now)).toBe(false);
  });
  it("tokens and urls", () => {
    expect(isShareToken("a".repeat(43))).toBe(true);
    expect(isShareToken("a".repeat(10))).toBe(false);
    expect(shareUrl("https://app.harmonious.co/", "x")).toBe("https://app.harmonious.co/api/public/watch/x");
  });
});
