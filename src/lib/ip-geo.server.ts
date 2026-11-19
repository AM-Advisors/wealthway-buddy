/** Server-only: resolves IP addresses to approximate places, cached once per IP in ip_geolocations. Callers authorize first. */
import { isPublicIp, type IpPlace } from "@/lib/ip-geo";

const REFRESH_MS = 30 * 864e5;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : null);

async function fetchJson(url: string, ms: number): Promise<any | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { accept: "application/json" } });
    return r.ok ? await r.json() : null;
  } catch { return null; } finally { clearTimeout(t); }
}

/** Looks up one public IP with two keyless HTTPS services; null when neither answers. */
async function lookupOne(ip: string): Promise<(IpPlace & { regionCode: string | null; countryCode: string | null; network: string | null; source: string }) | null> {
  const a = await fetchJson(`https://ipwho.is/${encodeURIComponent(ip)}`, 2500);
  if (a && a.success !== false && (a.city || a.country)) {
    return { ip, city: str(a.city), region: str(a.region), regionCode: str(a.region_code), postal: str(a.postal), country: str(a.country), countryCode: str(a.country_code), timeZone: str(a.timezone?.id), network: str(a.connection?.isp ?? a.connection?.org), source: "ipwho" };
  }
  const b = await fetchJson(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, 2500);
  if (b && !b.error && (b.city || b.country_name)) {
    return { ip, city: str(b.city), region: str(b.region), regionCode: str(b.region_code), postal: str(b.postal), country: str(b.country_name), countryCode: str(b.country_code), timeZone: str(b.timezone), network: str(b.org), source: "ipapi" };
  }
  return null;
}

/** Cached places for the given IPs; looks up at most `maxLookups` unknown or stale ones. Never throws. */
export async function placesForIps(db: any, ips: (string | null | undefined)[], maxLookups = 20): Promise<Map<string, IpPlace>> {
  const out = new Map<string, IpPlace>();
  const unique = [...new Set(ips.filter(isPublicIp).map((i) => i.trim()))];
  if (!unique.length) return out;
  try {
    const { data } = await db.from("ip_geolocations").select("ip, city, region, postal, country, time_zone, looked_up_at").in("ip", unique.slice(0, 500));
    const fresh = new Set<string>();
    for (const r of (data ?? []) as any[]) {
      out.set(r.ip, { ip: r.ip, city: r.city, region: r.region, postal: r.postal, country: r.country, timeZone: r.time_zone });
      if (Date.now() - Date.parse(r.looked_up_at) < REFRESH_MS) fresh.add(r.ip);
    }
    const todo = unique.filter((i) => !fresh.has(i)).slice(0, maxLookups);
    const found = (await Promise.all(todo.map(lookupOne))).filter((x): x is NonNullable<typeof x> => !!x);
    if (found.length) {
      await db.from("ip_geolocations").upsert(found.map((f) => ({ ip: f.ip, city: f.city, region: f.region, region_code: f.regionCode, postal: f.postal, country: f.country, country_code: f.countryCode, time_zone: f.timeZone, network: f.network, source: f.source, looked_up_at: new Date().toISOString() })), { onConflict: "ip" });
      for (const f of found) out.set(f.ip, { ip: f.ip, city: f.city, region: f.region, postal: f.postal, country: f.country, timeZone: f.timeZone });
    }
  } catch (e) {
    console.error("ip place lookup failed", e);
  }
  return out;
}
