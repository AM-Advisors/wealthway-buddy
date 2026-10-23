/** Time-zone helpers: timestamps are stored in UTC and shown/entered in an IANA zone. Pure. */
export const DEFAULT_ORG_TZ = "America/Chicago";
export const TZ_CHOICES = ["America/Chicago", "America/New_York", "America/Denver", "America/Phoenix", "America/Los_Angeles", "Europe/London", "UTC"];

export function isValidTz(tz: string) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}
function parts(d: Date, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
  return { y: +p["year"]!, m: +p["month"]!, d: +p["day"]!, h: +p["hour"]! % 24, min: +p["minute"]!, s: +p["second"]! };
}
export function hourIn(d: Date, tz: string) { return parts(d, tz).h; }

/** Wall-clock time in `tz` → UTC Date (handles DST). */
export function zonedToUtc(y: number, m: number, d: number, h: number, min: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, h, min);
  const p = parts(new Date(guess), tz);
  const offset = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - guess;
  const first = guess - offset;
  const p2 = parts(new Date(first), tz);
  const off2 = Date.UTC(p2.y, p2.m - 1, p2.d, p2.h, p2.min) - first;
  return new Date(guess - off2);
}
const pad = (n: number) => String(n).padStart(2, "0");
/** UTC ISO → value for <input type="datetime-local"> in tz. */
export function toZonedInput(iso: string | null | undefined, tz: string) {
  if (!iso) return "";
  const p = parts(new Date(iso), tz);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.min)}`;
}
/** <input type="datetime-local"> value interpreted in tz → UTC ISO. */
export function fromZonedInput(v: string, tz: string) {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) throw new Error("Invalid date/time");
  return zonedToUtc(+m[1]!, +m[2]!, +m[3]!, +m[4]!, +m[5]!, tz).toISOString();
}
export function fmtInTz(iso: string | null | undefined, tz: string, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }) {
  return iso ? new Date(iso).toLocaleString("en-US", { timeZone: tz, timeZoneName: opts.timeStyle ? "short" : undefined, ...opts }) : "—";
}

/* ---------- calendar-day math in a configured zone (never the viewer's clock) ---------- */
/** Calendar date (YYYY-MM-DD) of an instant as seen in tz. */
export function ymdIn(d: Date | string, tz: string) {
  const p = parts(typeof d === "string" ? new Date(d) : d, tz);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}
const ymdUtc = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y!, m! - 1, d!, 12)); };
export function addYmd(s: string, n: number) { const x = ymdUtc(s); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
/** 0 = Sunday … 6 = Saturday for a calendar date. */
export const weekdayOf = (s: string) => ymdUtc(s).getUTCDay();
export const mondayOf = (s: string) => addYmd(s, -((weekdayOf(s) + 6) % 7));
/** UTC instant of local midnight starting that calendar day in tz. */
export const ymdStartUtc = (s: string, tz: string) => { const [y, m, d] = s.split("-").map(Number); return zonedToUtc(y!, m!, d!, 0, 0, tz); };
/** Label a calendar date without any zone shift. */
export const fmtYmd = (s: string, o: Intl.DateTimeFormatOptions) => ymdUtc(s).toLocaleDateString("en-US", { ...o, timeZone: "UTC" });
/** Move an instant to another calendar day, keeping its wall-clock time in tz. */
export function moveToDay(iso: string | null, day: string, tz: string, defaultTime = "09:00") {
  const t = iso ? toZonedInput(iso, tz).slice(11) : defaultTime;
  return fromZonedInput(`${day}T${t}`, tz);
}
