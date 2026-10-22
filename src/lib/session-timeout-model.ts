/**
 * Pure helpers for the session-timeout notice. Kept out of the component so the
 * thresholds and countdown behavior stay testable without a browser.
 */

/** How long a signed-in user can stay inactive before the warning appears. */
export const SESSION_IDLE_LIMIT_MS = 15 * 60 * 1000;

/** How long the user has, after the warning appears, to choose Continue. */
export const SESSION_COUNTDOWN_SECONDS = 120;

/** True once the user has been idle long enough to warn. Never re-warns while the warning is open. */
export function shouldWarn(idleMs: number, alreadyWarned: boolean): boolean {
  return !alreadyWarned && idleMs >= SESSION_IDLE_LIMIT_MS;
}

/** Next countdown value; clamps at 0 so the automatic sign-out runs exactly once. */
export function tickCountdown(secondsLeft: number): number {
  return Math.max(0, secondsLeft - 1);
}

/** Formats the remaining time as M:SS, e.g. 2:00 or 0:45. */
export function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
