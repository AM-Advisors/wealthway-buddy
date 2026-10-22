import { describe, expect, it } from "vitest";
import {
  SESSION_COUNTDOWN_SECONDS,
  SESSION_IDLE_LIMIT_MS,
  formatCountdown,
  shouldWarn,
  tickCountdown,
} from "./session-timeout-model";

describe("session timeout notice", () => {
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
