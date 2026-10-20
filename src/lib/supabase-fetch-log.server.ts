/**
 * Server-only logging of failed database/storage/auth responses.
 * Wraps the global fetch once so every server Supabase client (admin, auth middleware,
 * publishable) is covered without editing generated files. Logs only status >= 400:
 * resource, status, error code and a short scrubbed message. Never logs bodies sent,
 * filter values, headers or keys. Never throws and always returns the original response.
 */

const WINDOW_MS = 60_000;
const MAX_KEYS = 500;
const seen = new Map<string, { at: number; suppressed: number }>();

/** "/rest/v1/marketing_posts?id=eq.x" -> "marketing_posts"; rpc/storage/auth get a prefix. Query strings are dropped. */
export function resourceFromUrl(url: string): string {
  try {
    const p = new URL(url).pathname;
    const rest = p.match(/^\/rest\/v1\/(rpc\/)?([^/]+)/);
    if (rest) return rest[1] ? `rpc:${rest[2]}` : rest[2]!;
    const svc = p.match(/^\/(storage|auth|functions)\/v1\/([^/]+)/);
    if (svc) return `${svc[1]}:${svc[2]}`;
    return "other";
  } catch { return "unknown"; }
}

/** Removes quoted values, parenthesised details and long digit runs, then truncates. */
export function scrubMessage(msg: unknown): string {
  if (typeof msg !== "string") return "";
  return msg
    .replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '"…"')
    .replace(/\([^)]*\)/g, "(…)")
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, "…")
    .replace(/\d{4,}/g, "…")
    .replace(/\s+/g, " ").trim().slice(0, 120);
}

export function formatLine(resource: string, status: number, code: string, message: string) {
  return `[db-fail] ${resource} status=${status} code=${code || "-"} msg=${message || "-"}`;
}

/** Returns the line to print, or null when an identical line was printed within the window. */
export function rateLimit(line: string, now = Date.now()): string | null {
  const s = seen.get(line);
  if (s && now - s.at < WINDOW_MS) { s.suppressed++; return null; }
  if (!s && seen.size >= MAX_KEYS) seen.delete(seen.keys().next().value!);
  seen.set(line, { at: now, suppressed: 0 });
  return s?.suppressed ? `${line} (+${s.suppressed} repeats suppressed)` : line;
}

export function __resetForTests() { seen.clear(); }

async function report(url: string, res: Response, log: (l: string) => void) {
  try {
    let code = "", message = "";
    try {
      const j = JSON.parse(await res.clone().text());
      code = String(j?.code ?? j?.error_code ?? j?.error ?? j?.statusCode ?? "").slice(0, 40);
      message = scrubMessage(j?.message ?? j?.msg ?? j?.error_description);
    } catch { /* non-JSON body: status only */ }
    const line = rateLimit(formatLine(resourceFromUrl(url), res.status, code, message));
    if (line) log(line);
  } catch { /* never affect the caller */ }
}

/** Wrap a fetch; exported for tests. */
export function withFailureLogging(base: typeof fetch, isTarget: (url: string) => boolean, log: (l: string) => void = console.warn): typeof fetch {
  return (async (input: any, init?: any) => {
    const res = await base(input, init);
    try {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url ?? "";
      if (res.status >= 400 && isTarget(url)) void report(url, res, log);
    } catch { /* ignore */ }
    return res;
  }) as typeof fetch;
}

let installed = false;
export function installSupabaseFailureLogging() {
  try {
    if (installed || typeof globalThis.fetch !== "function") return;
    installed = true;
    const base = globalThis.fetch.bind(globalThis);
    globalThis.fetch = withFailureLogging(base, (url) => {
      const host = process.env["SUPABASE_URL"];
      return !!host && url.startsWith(host);
    });
  } catch { /* never block startup */ }
}
