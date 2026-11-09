/**
 * Pure helpers that keep caller-written text in outbound emails plain and
 * bounded. Links are only kept when they point at Harmonious itself, so a
 * note typed by staff or a manager can never carry an outside link in the
 * platform's name.
 */

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi;
const ALLOWED_HOST = /(^|\.)harmonious\.co$/i;

function linkAllowed(raw: string): boolean {
  try {
    const url = new URL(raw.toLowerCase().startsWith("www.") ? `https://${raw}` : raw);
    return url.protocol === "https:" && ALLOWED_HOST.test(url.hostname);
  } catch {
    return false;
  }
}

/** Multi-line note: strips markup, control characters and outside links. */
export function plainEmailText(input: string | null | undefined, max = 2000): string {
  if (!input) return "";
  let text = String(input)
    .replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(URL_PATTERN, (match) => (linkAllowed(match) ? match : "[link removed]"))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length > max) text = `${text.slice(0, max).trimEnd()}…`;
  return text;
}

/** Single-line text such as a subject or name. */
export function plainEmailLine(input: string | null | undefined, max = 200): string {
  return plainEmailText(input, max).replace(/\s+/g, " ").trim();
}
