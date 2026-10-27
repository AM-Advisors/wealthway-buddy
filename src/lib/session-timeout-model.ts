/**
 * Pure helpers for the session-timeout notice. Kept out of the component so the
 * thresholds and countdown behavior stay testable without a browser.
 */

/** How long a signed-in user can stay inactive before the warning appears. */
export const SESSION_IDLE_LIMIT_MS = 15 * 60 * 1000;

/** Harmonious staff working in Operations may stay inactive for about 2 hours. */
export const STAFF_SESSION_IDLE_LIMIT_MS = 2 * 60 * 60 * 1000;

/** Idle limit for the application the user is working in; staff surface gets the longer limit. */
export function idleLimitFor(isStaffSurface: boolean): number {
  return isStaffSurface ? STAFF_SESSION_IDLE_LIMIT_MS : SESSION_IDLE_LIMIT_MS;
}

/** How long the user has, after the warning appears, to choose Continue. */
export const SESSION_COUNTDOWN_SECONDS = 120;

/** True once the user has been idle long enough to warn. Never re-warns while the warning is open. */
export function shouldWarn(idleMs: number, alreadyWarned: boolean, limitMs: number = SESSION_IDLE_LIMIT_MS): boolean {
  return !alreadyWarned && idleMs >= limitMs;
}

/** Next countdown value; callers must guard the automatic sign-out separately. */
export function tickCountdown(secondsLeft: number): number {
  return Math.max(0, secondsLeft - 1);
}

/** Ignore malformed, future or older activity; never extend another account's session. */
export function latestSessionActivity(current: number, incoming: unknown, now: number): number {
  const value = typeof incoming === "number" ? incoming : Number(incoming);
  return Number.isFinite(value) && value > current && value <= now ? value : current;
}

export function remainingSessionSeconds(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

/** Formats the remaining time as M:SS, e.g. 2:00 or 0:45. */
export function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
