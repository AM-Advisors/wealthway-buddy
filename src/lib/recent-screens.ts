import { OPS_WORK_AREAS } from "@/lib/ops-capabilities";

/** Last few Operations screens this browser opened. Convenience only; no data, just addresses. */
const KEY = "harmonious.recentScreens";
const MAX = 5;

export type RecentScreen = { title: string; url: string };

const TITLES = new Map<string, string>(OPS_WORK_AREAS.flatMap((a) => [[a.url, a.title] as const, ...a.screens.map((s) => [s.url, s.title] as const)]));

export function screenTitle(pathname: string): string | null {
  return TITLES.get(pathname) ?? null;
}

export function readRecent(): RecentScreen[] {
  if (typeof window === "undefined") return [];
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x?.url === "string" && typeof x?.title === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function pushRecent(list: RecentScreen[], next: RecentScreen): RecentScreen[] {
  return [next, ...list.filter((x) => x.url !== next.url)].slice(0, MAX);
}

export function recordVisit(pathname: string) {
  const title = screenTitle(pathname);
  if (!title || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(pushRecent(readRecent(), { title, url: pathname })));
  } catch {
    /* storage unavailable */
  }
}
