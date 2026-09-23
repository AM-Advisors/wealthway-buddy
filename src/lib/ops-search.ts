import { OPS_HOME, opsWorkAreas, type OpsCapability } from "@/lib/ops-capabilities";

export type OpsSearchEntry = { title: string; url: string; area: string; keywords: string };

/**
 * Searchable Operations destinations: authorized work areas and the
 * specialist screens beneath them. Pure projection of capabilities; the
 * backend still authorizes every screen when opened.
 */
export function opsSearchIndex(capabilities: readonly OpsCapability[]): OpsSearchEntry[] {
  const out: OpsSearchEntry[] = [{ title: OPS_HOME.title, url: OPS_HOME.url, area: "Operations", keywords: "home work queue" }];
  const seen = new Set<string>([OPS_HOME.url]);
  for (const area of opsWorkAreas(capabilities)) {
    if (!seen.has(area.url)) {
      seen.add(area.url);
      out.push({ title: area.title, url: area.url, area: "Work area", keywords: area.title });
    }
    for (const s of area.screens) {
      if (seen.has(s.url)) continue;
      seen.add(s.url);
      out.push({ title: s.title, url: s.url, area: area.title, keywords: `${s.description} ${area.title}` });
    }
  }
  return out;
}

export function searchOpsIndex(index: OpsSearchEntry[], query: string): OpsSearchEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return index.filter((e) => {
    const hay = `${e.title} ${e.keywords}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}
