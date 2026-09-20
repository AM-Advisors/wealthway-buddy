/**
 * Stage 1 of the platform consolidation: one place that knows the Harmonious
 * application origins, instead of the address being typed into 48 files.
 *
 * Pure and dependency-free so it can be imported from server functions,
 * email builders and the browser alike, and unit-tested directly.
 */

/** Where external clients (investors, fund managers, founders, advisors) live. */
export const CLIENT_ORIGIN_DEFAULT = "https://app.harmonious.co";

/** Where Harmonious staff operate. Privileged. */
export const OPS_ORIGIN_DEFAULT = "https://ops.harmonious.co";

/** The original address. Kept alive as a redirect surface for old links. */
export const LEGACY_ORIGIN = "https://onboard.harmonious.co";

/** Every origin an internal link is allowed to point at. */
export function allowedOrigins(
  overrides?: { client?: string | undefined; ops?: string | undefined },
): string[] {
  const client = normalizeOrigin(overrides?.client) ?? CLIENT_ORIGIN_DEFAULT;
  const ops = normalizeOrigin(overrides?.ops) ?? OPS_ORIGIN_DEFAULT;
  return Array.from(new Set([client, ops, LEGACY_ORIGIN]));
}

/** Trims a trailing slash and rejects anything that isn't an absolute https origin. */
export function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^/\s]+$/i.test(trimmed)) return null;
  return trimmed;
}

export type AppSurface = "client" | "ops";

/** Reads the configured origins. Server-side only values; falls back to the canonical ones. */
export function configuredOrigins(env?: Record<string, string | undefined>): {
  client: string;
  ops: string;
} {
  const source = env ?? {};
  return {
    client: normalizeOrigin(source["CLIENT_APP_ORIGIN"]) ?? CLIENT_ORIGIN_DEFAULT,
    ops: normalizeOrigin(source["OPS_APP_ORIGIN"]) ?? OPS_ORIGIN_DEFAULT,
  };
}

/** Builds a link into one of the two applications. Paths are validated first. */
export function appUrl(
  surface: AppSurface,
  path: string,
  env?: Record<string, string | undefined>,
): string {
  const origins = configuredOrigins(env);
  const base = surface === "ops" ? origins.ops : origins.client;
  return `${base}${safeInternalPath(path, "/")}`;
}

/**
 * Accepts only a same-application path. Anything that could leave the
 * application — absolute URLs, protocol-relative paths, backslash tricks,
 * control characters — is refused and the fallback is used instead.
 */
export function safeInternalPath(value: string | null | undefined, fallback = "/"): string {
  if (typeof value !== "string") return fallback;
  const raw = value.trim();
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback;
  if (/^\/+\s*[a-z][a-z0-9+.-]*:/i.test(raw)) return fallback;
  if (raw.includes("\\")) return fallback;
  return raw;
}

/**
 * Turns a legacy link into its replacement, keeping the path and query so an
 * invitation link in an email sent months ago still lands on the same flow.
 */
export function migrateLegacyUrl(
  url: string,
  surface: AppSurface = "client",
  env?: Record<string, string | undefined>,
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.origin !== LEGACY_ORIGIN) return null;
  const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  return appUrl(surface, path || "/", env);
}
