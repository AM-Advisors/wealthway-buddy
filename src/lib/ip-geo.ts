/**
 * Approximate place and local time for recorded activity, derived from the sign-in IP address.
 * Pure. An IP location is approximate (city level, mobile networks can be far off); it never
 * proves where a person was or that they were online.
 */
export type IpPlace = { ip: string; city: string | null; region: string | null; postal: string | null; country: string | null; timeZone: string | null };
export type IpPoint = { at: string; ip: string; userAgent?: string | null };

/** Private, loopback and link-local addresses cannot be located. */
export function isPublicIp(ip: string | null | undefined): ip is string {
  if (!ip) return false;
  const v = ip.trim().toLowerCase();
  if (!v || v === "unknown") return false;
  if (v.includes(":")) return !(v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80"));
  const p = v.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = p as [number, number, number, number];
  return !(a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127));
}

/** "Fort Lauderdale, Florida 33301, United States" style address from whatever parts are known. */
export function placeLabel(p: Partial<IpPlace> | null | undefined): string {
  if (!p) return "";
  const region = [p.region, p.postal].filter(Boolean).join(" ");
  return [p.city, region, p.country].filter(Boolean).join(", ");
}

/** Event IP for rows that carry none (clicks, page views): the latest recorded IP at or before it, within `maxGapMs`. */
export function ipAt(points: IpPoint[], at: string, maxGapMs = 12 * 3600_000): IpPoint | null {
  let best: IpPoint | null = null;
  for (const p of points) if (p.at <= at && (!best || p.at > best.at)) best = p;
  if (!best) return null;
  return Date.parse(at) - Date.parse(best.at) <= maxGapMs ? best : null;
}

const validZone = (tz: string | null | undefined) => {
  if (!tz) return null;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz; } catch { return null; }
};

/** The time in the person's own time zone, e.g. "Nov 19, 2026, 1:11 AM EST". Null when the zone is unknown. */
export function localTime(iso: string, timeZone: string | null | undefined): string | null {
  const tz = validZone(timeZone);
  if (!tz) return null;
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso))
    + " " + (new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(new Date(iso)).find((x) => x.type === "timeZoneName")?.value ?? tz);
}

export type LocatedFields = { ip: string | null; place: string | null; timeZone: string | null; localWhen: string | null };

/** Attach IP, approximate address and the person's local time to one row. */
export function locate(when: string, ip: string | null | undefined, places: Map<string, IpPlace>): LocatedFields {
  const p = ip ? places.get(ip) ?? null : null;
  return { ip: ip ?? null, place: placeLabel(p) || null, timeZone: p?.timeZone ?? null, localWhen: localTime(when, p?.timeZone) };
}
