import { describe, expect, it } from "vitest";
import { prefersNewTab, windowNeverLoaded, RESCUE_AFTER_MS } from "./signing-window";

const SAFARI_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15";
const CHROME_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const CHROME_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1";
const FIREFOX = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0";

describe("prefersNewTab", () => {
  it("sends Safari on a Mac straight to a new tab", () => expect(prefersNewTab(SAFARI_MAC)).toBe(true));
  it("sends every iPhone browser to a new tab", () => expect(prefersNewTab(CHROME_IPHONE)).toBe(true));
  it("keeps Chrome and Firefox on a computer in the window", () => {
    expect(prefersNewTab(CHROME_MAC)).toBe(false);
    expect(prefersNewTab(FIREFOX)).toBe(false);
  });
});

describe("blank-window rescue timing", () => {
  it("waits about 10 seconds", () => expect(RESCUE_AFTER_MS).toBe(10_000));
});

describe("windowNeverLoaded", () => {
  const now = new Date("2026-11-23T20:00:00Z");
  it("flags a window opened 15+ minutes ago that never loaded", () => {
    expect(windowNeverLoaded({ status: "sent", viewedAt: null, windowOpenedAt: "2026-11-23T19:44:00Z" }, now)).toBe(true);
  });
  it("waits before flagging a window opened a few minutes ago", () => {
    expect(windowNeverLoaded({ status: "sent", viewedAt: null, windowOpenedAt: "2026-11-23T19:50:00Z" }, now)).toBe(false);
  });
  it("never flags a document that loaded or was signed", () => {
    expect(windowNeverLoaded({ status: "sent", viewedAt: "2026-11-23T19:30:00Z", windowOpenedAt: "2026-11-23T19:00:00Z" }, now)).toBe(false);
    expect(windowNeverLoaded({ status: "signed", viewedAt: null, windowOpenedAt: "2026-11-23T19:00:00Z" }, now)).toBe(false);
  });
  it("never flags someone who has not opened the window", () => {
    expect(windowNeverLoaded({ status: "sent", viewedAt: null, windowOpenedAt: null }, now)).toBe(false);
  });
});
