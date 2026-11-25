/**
 * Pure helpers for the Operations sidebar: one home per screen (no duplicates)
 * and the catalog of individual items a Super Admin may grant someone.
 * Display only - every page and action keeps its own server-side check.
 */
import { OPS_WORK_AREAS, type OpsArea, type OpsCapability } from "@/lib/ops-capabilities";

export type NavSub = { title: string; url: string };
export type NavEntry = { id: string; title: string; url: string; icon: string; badge?: number; sub?: NavSub[] };
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

const key = (url: string) => url.split("#")[0] ?? url;

/** Regroup already-entitled links only; this must never manufacture access. */
export function consolidateOpsMenus(groups: NavGroup[]): NavGroup[] {
  const result = groups.map((g) => ({ ...g, items: g.items.map((i) => ({ ...i, ...(i.sub ? { sub: [...i.sub] } : {}) })) }));
  const operations = result.find((g) => g.id === "operations");
  const team = result.find((g) => g.id === "team");
  const combine = (group: NavGroup | undefined, ids: string[], id: string, title: string) => {
    if (!group) return;
    const selected = group.items.filter((i) => ids.includes(i.id));
    const first = selected[0];
    if (!first) return;
    const position = group.items.indexOf(first);
    group.items = group.items.filter((i) => !ids.includes(i.id));
    group.items.splice(position, 0, {
      ...first, id, title,
      badge: selected.reduce((total, i) => total + (i.badge ?? 0), 0),
      sub: selected.flatMap((i) => [{ title: i.title, url: i.url }, ...(i.sub ?? []).filter((s) => s.url !== i.url)]),
    });
  };
  // Place existing client-review work beside the staff work queue, not in a second section.
  const clientReviews = team?.items.find((i) => i.id === "client-approvals");
  if (operations && clientReviews) {
    operations.items.push(clientReviews);
    if (team) team.items = team.items.filter((i) => i.id !== "client-approvals");
  }
  combine(operations, ["approvals", "queue", "stalled", "client-approvals"], "work-approvals", "Work & approvals");
  const investors = operations?.items.find((i) => i.id === "investors");
  if (operations && investors) {
    const related = operations.items.filter((i) => ["investor-progress", "verifications"].includes(i.id));
    investors.sub = [...(investors.sub ?? []), ...related.map((i) => ({ title: i.title, url: i.url }))];
    operations.items = operations.items.filter((i) => !related.includes(i));
  } else {
    combine(operations, ["investor-progress", "verifications"], "investor-checks", "Investor progress & checks");
  }
  combine(operations, ["ops-command", "dash-ops"], "operations-overview", "Operations overview");
  combine(team, ["tech", "software-issues"], "software-work", "Software & ideas");
  return result;
}

/** Query-specific shortcuts select only their own view, not every tab of a page. */
export function navUrlIsActive(url: string, pathname: string, search = ""): boolean {
  const [base = url, query] = url.split("?");
  if (query !== undefined) {
    if (pathname !== base) return false;
    const current = new URLSearchParams(search);
    return [...new URLSearchParams(query)].every(([k, v]) => current.get(k) === v);
  }
  return pathname === base || pathname.startsWith(`${base}/`);
}

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
        if (s.url === item.url) return ownNew; // keep a group's own overview only once
        if (seen.has(key(s.url))) return false;
        seen.add(key(s.url));
        return true;
      });
      if (!ownNew && !sub.some((s) => s.url !== item.url)) return [];
      const url = ownNew ? item.url : sub[0]?.url;
      if (!url) return [];
      seen.add(key(url));
      return [item.sub ? { ...item, url, sub } : { ...item, url }];
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
