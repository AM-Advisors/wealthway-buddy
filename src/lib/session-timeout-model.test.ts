import { describe, expect, it } from "vitest";
import {
  SESSION_COUNTDOWN_SECONDS,
  SESSION_IDLE_LIMIT_MS,
  formatCountdown,
  shouldWarn,
  tickCountdown,
  latestSessionActivity,
  remainingSessionSeconds,
} from "./session-timeout-model";

describe("session timeout notice", () => {
  it("uses another tab's newer activity rather than warning at 15 idle minutes", () => {
    const now = 1_000_000;
    const latest = latestSessionActivity(now - 16 * 60_000, now - 1000, now);
    expect(shouldWarn(now - latest, false)).toBe(false);
  });
  it("ignores older, malformed and future activity", () => {
    expect(latestSessionActivity(100, 99, 200)).toBe(100);
    expect(latestSessionActivity(100, "not a time", 200)).toBe(100);
    expect(latestSessionActivity(100, 201, 200)).toBe(100);
  });
  it("uses a 120-second wall-clock warning even after a background timer is delayed", () => {
    const start = 10_000;
    const deadline = start + SESSION_COUNTDOWN_SECONDS * 1000;
    expect(remainingSessionSeconds(deadline, start)).toBe(120);
    expect(remainingSessionSeconds(deadline, start + 119_000)).toBe(1);
    expect(remainingSessionSeconds(deadline, start + 180_000)).toBe(0);
  });
  it("warns only after 15 minutes of inactivity", () => {
    expect(shouldWarn(SESSION_IDLE_LIMIT_MS - 1, false)).toBe(false);
    expect(shouldWarn(SESSION_IDLE_LIMIT_MS, false)).toBe(true);
    expect(shouldWarn(SESSION_IDLE_LIMIT_MS + 5_000, false)).toBe(true);
  });

  it("never re-warns while the warning is already open", () => {
    expect(shouldWarn(SESSION_IDLE_LIMIT_MS + 60_000, true)).toBe(false);
  });

  it("counts down one second at a time and stops at zero", () => {
    expect(tickCountdown(SESSION_COUNTDOWN_SECONDS)).toBe(SESSION_COUNTDOWN_SECONDS - 1);
    expect(tickCountdown(1)).toBe(0);
    expect(tickCountdown(0)).toBe(0);
  });

  it("formats the countdown as M:SS", () => {
    expect(formatCountdown(SESSION_COUNTDOWN_SECONDS)).toBe("2:00");
    expect(formatCountdown(65)).toBe("1:05");
    expect(formatCountdown(9)).toBe("0:09");
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(-3)).toBe("0:00");
  });
});

describe("staff idle limit", () => {
  it("lets Harmonious staff stay idle about 2 hours before warning", async () => {
    const { idleLimitFor } = await import("./session-timeout-model");
    expect(idleLimitFor(true)).toBe(2 * 60 * 60 * 1000);
    expect(shouldWarn(119 * 60_000, false, idleLimitFor(true))).toBe(false);
    expect(shouldWarn(120 * 60_000, false, idleLimitFor(true))).toBe(true);
    expect(idleLimitFor(false)).toBe(15 * 60_000);
  });
});
