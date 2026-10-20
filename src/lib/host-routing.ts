/**
 * Which Harmonious address a page belongs to.
 *
 * Two applications share one codebase:
 *   - the client platform at app.harmonious.co
 *   - Harmonious Operations at ops.harmonious.co
 *
 * These rules decide, for a given address and path, whether the browser should
 * be sent to the other one. They are pure and testable, and they are *only*
 * about addresses. A hostname never grants anything: every request is still
 * authorized on the server against the person's real staff and relationship
 * records.
 */

import {
  LEGACY_ORIGIN,
  configuredOrigins,
  normalizeOrigin,
  safeInternalPath,
  type AppSurface,
} from "@/lib/app-origins";

/** The old Harmonious Capital Admin address. Compatibility only. */
export const LEGACY_ADMIN_ORIGIN = "https://app.harmoniouscapitaladmin.com";

/** Every address that historical links may still point at. */
export const LEGACY_ORIGINS = [LEGACY_ORIGIN, LEGACY_ADMIN_ORIGIN];

/** Sections that belong to Harmonious Operations. */
export const OPS_PREFIXES = ["/ops", "/admin", "/staff", "/sales", "/marketing", "/account-manager"];

/**
 * Paths that belong to neither application in particular: sign-in and its
 * callbacks, machine endpoints, tracking and static files. These are never
 * moved between addresses, so a sign-in started on Operations finishes there
 * and an email tracking pixel keeps resolving.
 */
const SHARED_PREFIXES = [
  "/api/",
  "/lovable/",
  "/__l5e/",
  "/_serverFn",
  "/_build",
  "/assets/",
  "/@",
  "/auth",
  "/reset-password",
  "/invite/",
  "/client-login",
  "/investor-login",
  "/manager-login",
  "/robots.txt",
  "/sitemap.xml",
  "/favicon",
  "/og-",
  // onboard.harmonious.co investor onboarding portal: served on its own address.
  "/onboard/",
  // Time-limited Report Card share links work on any Harmonious address.
  "/report-card-share/",
];

// Personal account pages belong to the application in which they are opened.
const SHARED_ACCOUNT_PREFIXES = ["/profile", "/access", "/inbox", "/messages", "/prepared", "/sign-off", "/policies", "/security"];

export type PathSurface = AppSurface | "shared";

function hasPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`);
}

/** Which application a path belongs to. */
export function surfaceForPath(pathname: string): PathSurface {
  const path = pathname || "/";
  if (SHARED_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix))) return "shared";
  if (SHARED_ACCOUNT_PREFIXES.some((prefix) => hasPrefix(path, prefix))) return "shared";
  if (OPS_PREFIXES.some((prefix) => hasPrefix(path, prefix))) return "ops";
  return "client";
}

/** What kind of thing an old link pointed at, so it lands somewhere sensible. */
export type LegacyKind = "client" | "invitation" | "operations" | "shared";

const INVITATION_PREFIXES = [
  "/invite",
  "/invest",
  "/fund",
  "/shares",
  "/cap-claim",
  "/onboarding",
  "/subscription",
  "/diligence",
  "/packet",
];

export function classifyLegacyPath(pathname: string): LegacyKind {
  const surface = surfaceForPath(pathname);
  if (surface === "shared") return "shared";
  if (surface === "ops") return "operations";
  if (INVITATION_PREFIXES.some((prefix) => hasPrefix(pathname, prefix))) return "invitation";
  return "client";
}

function hostOf(origin: string): string {
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Addresses used while building and previewing. They serve both applications
 * at once and are never redirected, so local work and preview links keep
 * behaving exactly as they do today.
 */
export function isDevelopmentHost(host: string): boolean {
  const h = host.toLowerCase().split(":")[0] ?? "";
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "0.0.0.0" ||
    h.endsWith(".local") ||
    h.endsWith(".lovable.app") ||
    h.endsWith(".lovableproject.com") ||
    h.endsWith(".lovable.dev")
  );
}

export type HostConfig = { client: string; ops: string };

/** Display context only; unknown/preview hosts retain workspace-based menus. */
export function applicationSurfaceForHost(host: string, env?: Record<string, string | undefined>): AppSurface | null {
  if (!host || isDevelopmentHost(host)) return null;
  const origins = configuredOrigins(env);
  if (host.toLowerCase() === hostOf(origins.ops)) return "ops";
  if (host.toLowerCase() === hostOf(origins.client) || /^app\.[a-z0-9-]+\.harmonious\.co$/i.test(host)) return "client";
  return null;
}

export function workspaceLeavesCurrentHost(currentHost: string, destinationOrigin: string): boolean {
  return Boolean(currentHost) && !isDevelopmentHost(currentHost) && currentHost.toLowerCase() !== hostOf(destinationOrigin);
}

export function hostConfig(env?: Record<string, string | undefined>): HostConfig {
  return configuredOrigins(env);
}

/** Every address the applications are allowed to be reached on. */
export function trustedOrigins(env?: Record<string, string | undefined>): string[] {
  const { client, ops } = hostConfig(env);
  return Array.from(new Set([client, ops, ...LEGACY_ORIGINS]));
}

export function isTrustedOrigin(
  origin: string | null | undefined,
  env?: Record<string, string | undefined>,
): boolean {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  if (isDevelopmentHost(hostOf(normalized))) return true;
  return trustedOrigins(env).includes(normalized);
}

export type CanonicalRedirect = { location: string; status: 302 };

/**
 * Where a request should go instead, or nothing when it is already in the right
 * place. Temporary (302) on purpose while the new address is being proven in
 * production - nothing here is cached permanently by a browser.
 */
export function canonicalRedirect(
  input: { url: string },
  env?: Record<string, string | undefined>,
): CanonicalRedirect | null {
  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    return null;
  }

  const host = parsed.host.toLowerCase();
  if (isDevelopmentHost(host)) return null;

  const { client, ops } = hostConfig(env);
  const clientHost = hostOf(client);
  const opsHost = hostOf(ops);
  const legacyHosts = LEGACY_ORIGINS.map(hostOf);

  const pathname = safeInternalPath(parsed.pathname, "/");
  const tail = `${pathname}${parsed.search}${parsed.hash}`;
  const surface = surfaceForPath(pathname);

  const onLegacy = legacyHosts.includes(host);
  const known = onLegacy || host === clientHost || host === opsHost;
  // An address we don't recognize (a custom domain, a staging host) is left
  // alone rather than bounced somewhere it may not be able to come back from.
  if (!known) return null;

  if (pathname === "/" && !onLegacy) {
    return { location: host === opsHost ? `${ops}/ops${parsed.search}` : `${client}/home${parsed.search}`, status: 302 };
  }

  if (onLegacy) {
    // Machine endpoints, tracking and sign-in callbacks keep working on the old
    // address; only pages move.
    if (surface === "shared") return null;
    const kind = classifyLegacyPath(pathname);
    const base = kind === "operations" ? ops : client;
    return { location: `${base}${pathname === "/" ? `/home${parsed.search}${parsed.hash}` : tail}`, status: 302 };
  }

  if (surface === "shared") return null;
  if (surface === "ops" && host !== opsHost) return { location: `${ops}${tail}`, status: 302 };
  if (surface === "client" && host !== clientHost) {
    return { location: `${client}${tail}`, status: 302 };
  }
  return null;
}

/**
 * A redirect must never produce another one. Used by the tests to prove there
 * is no loop between the client, Operations and the old addresses.
 */
export function redirectSettles(url: string, env?: Record<string, string | undefined>): boolean {
  let current = url;
  for (let hop = 0; hop < 5; hop += 1) {
    const next = canonicalRedirect({ url: current }, env);
    if (!next) return true;
    if (next.location === current) return false;
    current = next.location;
  }
  return false;
}

/**
 * Whether choosing Harmonious Operations in the workspace switcher has to leave
 * this address. On a preview or local address Operations stays in place.
 */
export function opsLeavesCurrentHost(currentHost: string, opsOrigin: string): boolean {
  if (!currentHost || isDevelopmentHost(currentHost)) return false;
  return currentHost.toLowerCase() !== hostOf(opsOrigin);
}
