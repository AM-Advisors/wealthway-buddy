/**
 * Series funds ("X, a series of Y") take their jurisdiction of formation from
 * their master Y. The database applies it on every save (series_master_key);
 * these helpers mirror that matching for screens and tests.
 */
export function seriesMasterLabel(name: string | null | undefined): string | null {
  const m = /\ba series of\s+(.+)$/i.exec(String(name ?? ""));
  const v = m?.[1]?.trim();
  return v ? v : null;
}

export function seriesMasterKey(name: string | null | undefined): string | null {
  const label = seriesMasterLabel(name);
  if (!label) return null;
  const k = label.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/(\s+(l\s?l\s?c|inc|l\s?p|ltd))+\s*$/g, "").trim();
  return k || null;
}

export type SeriesMaster = { name: string; jurisdiction: string | null; seriesCount: number };
