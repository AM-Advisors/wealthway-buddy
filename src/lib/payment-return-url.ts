/**
 * Payment/billing return addresses. Card checkout and billing pages send the
 * payer back to a URL we give the payment provider; that URL must always be one
 * of our own addresses so nobody can route payers to a look-alike site.
 *
 * Pure and dependency-light so it can be unit-tested and used by any server fn.
 */
import { configuredOrigins, LEGACY_ORIGIN } from "@/lib/app-origins";

/** Published platform host and this project's preview hosts. */
const PROJECT_ID = "0d29ab32-07e0-42f9-a3fc-80d86f0b9c9a";
const PLATFORM_HOSTS = new Set(["wealthway-buddy.lovable.app"]);
const HARMONIOUS_HOSTS = new Set([
  "harmonious.co",
  "www.harmonious.co",
  "app.harmonious.co",
  "ops.harmonious.co",
  "portal.harmonious.co",
  "onboard.harmonious.co",
]);

function hostAllowed(url: URL, env?: Record<string, string | undefined>): boolean {
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") return true; // local development only
  if (url.protocol !== "https:") return false;
  if (HARMONIOUS_HOSTS.has(host)) return true;
  if (/^app\.[a-z0-9-]+\.harmonious\.co$/.test(host)) return true; // white-label client addresses
  if (PLATFORM_HOSTS.has(host)) return true;
  if ((host.endsWith(".lovable.app") || host.endsWith(".lovableproject.com")) && host.includes(PROJECT_ID)) return true;
  const origins = configuredOrigins(env);
  return [origins.client, origins.ops, LEGACY_ORIGIN].some((o) => {
    try { return new URL(o).host.toLowerCase() === url.host.toLowerCase(); } catch { return false; }
  });
}

/** True when the value is an absolute URL on one of the application's own addresses. */
export function isAllowedReturnUrl(value: string | null | undefined, env?: Record<string, string | undefined>): boolean {
  if (typeof value !== "string" || !value.trim()) return false;
  let url: URL;
  try { url = new URL(value.trim()); } catch { return false; }
  if (url.username || url.password) return false;
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  return hostAllowed(url, env);
}

/** Returns the URL unchanged when it is ours; otherwise refuses with a plain message. */
export function requireAllowedReturnUrl(value: string, env?: Record<string, string | undefined>): string {
  if (!isAllowedReturnUrl(value, env)) throw new Error("That return address isn't part of Harmonious.");
  return value.trim();
}
