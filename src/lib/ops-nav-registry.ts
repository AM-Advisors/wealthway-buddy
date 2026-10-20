/**
 * Pure helpers for the Operations sidebar: one home per screen (no duplicates)
 * and the catalog of individual items a Super Admin may grant someone.
 * Display only - every page and action keeps its own server-side check.
 */
import { OPS_WORK_AREAS, type OpsArea, type OpsCapability } from "@/lib/ops-capabilities";

export type NavSub = { title: string; url: string };
export type NavEntry = { id: string; title: string; url: string; icon: string; sub?: NavSub[] };
export type NavGroup = { id: string; label: string; items: NavEntry[] };

/** Money, tax-filing and administration screens are never grantable here - they keep their own approvers. */
export const NON_GRANTABLE_AREAS: OpsArea[] = ["capital", "tax", "administration"];

export type GrantableItem = { url: string; title: string; areaTitle: string; cap: OpsArea };

export function grantableItems(): GrantableItem[] {
  const seen = new Set<string>();
  const out: GrantableItem[] = [];
  for (const area of OPS_WORK_AREAS) {
    for (const s of area.screens) {
      const cap = (s.cap ?? area.id) as OpsArea;
      if (NON_GRANTABLE_AREAS.includes(cap) || seen.has(s.url)) continue;
      seen.add(s.url);
      out.push({ url: s.url, title: s.title, areaTitle: area.title, cap });
    }
  }
  return out;
}

export function grantableItem(url: string): GrantableItem | null {
  return grantableItems().find((i) => i.url === url) ?? null;
}

/** View capabilities added by individual sidebar grants (refuses money/tax/admin). */
export function grantCapabilities(urls: readonly string[]): OpsCapability[] {
  const caps = new Set<OpsCapability>();
  for (const u of urls) {
    const item = grantableItem(u);
    if (item) caps.add(`${item.cap}:see` as OpsCapability);
  }
  return [...caps];
}

const key = (url: string) => url.split("#")[0]!;

/**
 * Removes duplicates across the whole sidebar: the first group that lists a
 * screen keeps it (as an item or a sub-item); later copies are dropped.
 * Items left with no link of their own are dropped too.
 */
export function dedupeNav(groups: NavGroup[]): NavGroup[] {
  const seen = new Set<string>();
  return groups.map((g) => ({
    ...g,
    items: g.items.flatMap((item) => {
      const ownNew = !seen.has(key(item.url));
      const sub = (item.sub ?? []).filter((s) => {
        if (s.url === item.url) return true; // an "Overview" sub-link pointing at its own parent
        if (seen.has(key(s.url))) return false;
        seen.add(key(s.url));
        return true;
      });
      if (!ownNew && !sub.some((s) => s.url !== item.url)) return [];
      seen.add(key(item.url));
      return [item.sub ? { ...item, sub } : { ...item }];
    }),
  })).filter((g) => g.items.length > 0);
}

/** Extra items from individual grants, minus anything the person already sees. */
export function extraGrantItems(groups: NavGroup[], grants: readonly { url: string; title: string }[]): NavEntry[] {
  const present = new Set(groups.flatMap((g) => g.items.flatMap((i) => [key(i.url), ...(i.sub ?? []).map((s) => key(s.url))])));
  const out: NavEntry[] = [];
  for (const g of grants) {
    if (present.has(key(g.url)) || !grantableItem(g.url)) continue;
    present.add(key(g.url));
    out.push({ id: `grant-${g.url}`, title: g.title, url: g.url, icon: "check" });
  }
  return out;
}
