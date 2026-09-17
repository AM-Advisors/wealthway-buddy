/**
 * Server-only authentication for scheduled / internal jobs.
 *
 * Internal jobs (cron runs, drains, retries) are not user traffic: they must
 * present a dedicated server-side shared secret before any privileged work
 * — service-role database access, provider calls, notifications — happens.
 *
 * Rules enforced here:
 *  - The secret lives only in server environment configuration (CRON_SECRET,
 *    with LOVABLE_CRON_SECRET accepted for continuity). Never a VITE_* value.
 *  - A Supabase publishable / anon key is never a valid credential, even if
 *    someone configures one by mistake.
 *  - Comparison is timing-safe and the secret is never logged or echoed.
 *  - Failures return a generic 401 with no hint about what was expected.
 */

const CLIENT_KEY_PREFIXES = ["sb_publishable_", "sb_secret_", "eyJ"];

function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  // Compare full length of both so the loop cost does not reveal the match
  // position; the length check is folded into the accumulator.
  let diff = aBytes.length ^ bBytes.length;
  const max = Math.max(aBytes.length, bBytes.length);
  for (let i = 0; i < max; i += 1) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

/** The configured internal-job secret, or null when none is set. */
export function internalJobSecret(): string | null {
  const candidates = [process.env["CRON_SECRET"], process.env["LOVABLE_CRON_SECRET"]];
  for (const value of candidates) {
    if (!value) continue;
    const trimmed = value.trim();
    if (trimmed.length < 16) continue;
    // Defence in depth: a client-distributable key must never act as a
    // privileged-job credential, however it got into the environment.
    if (CLIENT_KEY_PREFIXES.some((p) => trimmed.startsWith(p))) continue;
    return trimmed;
  }
  return null;
}

function presentedSecret(request: Request): string | null {
  const header = request.headers.get("x-cron-secret");
  if (header && header.trim()) return header.trim();
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  return bearer || null;
}

/**
 * True when the caller proved it is an internal job.
 * When no secret is configured at all, nothing can authenticate.
 */
export function isInternalJobRequest(request: Request): boolean {
  const expected = internalJobSecret();
  if (!expected) return false;
  const provided = presentedSecret(request);
  if (!provided) return false;

  // Never accept a client-accessible Supabase key as a job credential.
  if (CLIENT_KEY_PREFIXES.some((p) => provided.startsWith(p))) return false;
  const publishable =
    process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (publishable && provided === publishable) return false;

  return timingSafeEqual(provided, expected);
}

/** Generic rejection — reveals nothing about the expected credential. */
export function internalJobUnauthorized(): Response {
  return new Response("unauthorized", {
    status: 401,
    headers: { "cache-control": "no-store" },
  });
}

/**
 * Guard for internal endpoints. Returns a Response to send back when the
 * caller is not authenticated, or null when the job may proceed.
 * Call this before touching the database or any provider.
 */
export function requireInternalJob(request: Request): Response | null {
  return isInternalJobRequest(request) ? null : internalJobUnauthorized();
}
