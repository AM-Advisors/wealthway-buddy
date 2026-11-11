/**
 * After a new version is published, a tab opened earlier can ask for page files that no longer
 * exist. Instead of showing "This page didn't load", reload once to pick up the new version.
 * Guarded so a genuinely broken page never reload-loops.
 */
const KEY = "hm-stale-build-reload";
const WINDOW_MS = 60_000;

export function isStaleBuildError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error ?? "");
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(msg);
}

export function shouldReloadForStaleBuild(lastReloadAt: number | null, now: number): boolean {
  return lastReloadAt === null || now - lastReloadAt > WINDOW_MS;
}

/** Returns true when a reload was started. */
export function reloadOnceForStaleBuild(error: unknown): boolean {
  if (typeof window === "undefined" || !isStaleBuildError(error)) return false;
  let last: number | null = null;
  try { const v = sessionStorage.getItem(KEY); last = v ? Number(v) : null; } catch { /* storage unavailable */ }
  const now = Date.now();
  if (!shouldReloadForStaleBuild(last, now)) return false;
  try { sessionStorage.setItem(KEY, String(now)); } catch { /* storage unavailable */ }
  window.location.reload();
  return true;
}
