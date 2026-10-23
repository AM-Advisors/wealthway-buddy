/**
 * Server-only logging of outbound calls to outside services and of server function calls.
 * Logs only failures (status >= 400, network errors/timeouts) and slow calls (> 3 s):
 * service, method, at most two scrubbed path segments, status and duration.
 * Reads only the status line (never the body) so streams and downloads are untouched.
 * Never logs bodies, headers, keys, query strings, file names or storage paths.
 * Never throws; always returns/rethrows the original result.
 */
import { rateLimit } from "@/lib/supabase-fetch-log.server";

export const SLOW_MS = 3000;
const GATEWAY_HOSTS = new Set(["connector-gateway.lovable.dev"]);
const HOST_SERVICES: Record<string, string> = {
  "ai.gateway.lovable.dev": "ai-gateway",
  "verification.didit.me": "didit",
  "api.box.com": "box",
  "upload.box.com": "box",
};

/** Keeps a segment only if it looks like a fixed API word; IDs, tokens and file-like names become ":id". */
function scrubSegment(s: string) {
  let d = s;
  try { d = decodeURIComponent(s); } catch { /* keep raw */ }
  if (!d || d.length > 40 || /\d{3,}/.test(d) || /[^A-Za-z0-9._-]/.test(d) || /\.[A-Za-z0-9]{2,5}$/.test(d) && !/^[a-z]+\.[a-zA-Z]+$/.test(d)) return ":id";
  if (/^[A-Za-z0-9_-]{20,}$/.test(d) && /\d/.test(d)) return ":id";
  return d;
}

/** Returns { service, path } with at most two path segments, or null for addresses we don't classify. */
export function describeUrl(url: string, isDb: (u: string) => boolean = () => false): { service: string; path: string } | null {
  try {
    if (isDb(url)) return null; // database calls have their own logger
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    let segs = u.pathname.split("/").filter(Boolean);
    let service = HOST_SERVICES[u.hostname];
    if (GATEWAY_HOSTS.has(u.hostname)) {
      service = scrubSegment(segs[0] ?? "gateway");
      segs = segs.slice(1);
      if (service === "aws") segs = segs.slice(0, 1); // bucket and keys are storage paths
    }
    if (!service) service = u.hostname.replace(/^www\./, "").slice(0, 60);
    const path = "/" + segs.slice(0, 2).map(scrubSegment).join("/");
    return { service, path };
  } catch { return null; }
}

function methodOf(input: any, init?: any): string {
  try { return String(init?.method ?? (typeof input === "object" && input && "method" in input ? input.method : "GET")).toUpperCase().slice(0, 10); }
  catch { return "GET"; }
}

function emit(line: string, log: (l: string) => void) {
  try { const l = rateLimit(line); if (l) log(l); } catch { /* ignore */ }
}

/** Wrap a fetch; exported for tests. Reads only res.status. */
export function withExternalCallLogging(base: typeof fetch, isDb: (u: string) => boolean, log: (l: string) => void = console.warn, now: () => number = Date.now): typeof fetch {
  return (async (input: any, init?: any) => {
    const t0 = now();
    let d: { service: string; path: string } | null = null;
    let method = "GET";
    try {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url ?? "";
      d = describeUrl(url, isDb);
      method = methodOf(input, init);
    } catch { d = null; }
    try {
      const res = await base(input, init);
      try {
        const ms = now() - t0;
        if (d && (res.status >= 400 || ms > SLOW_MS)) emit(`[ext] service=${d.service} method=${method} path=${d.path} status=${res.status} ms=${ms}${res.status < 400 ? " slow" : ""}`, log);
      } catch { /* ignore */ }
      return res;
    } catch (e) {
      try {
        if (d) {
          const name = (e as any)?.name;
          const kind = name === "TimeoutError" || name === "AbortError" ? "timeout" : "error";
          emit(`[ext] service=${d.service} method=${method} path=${d.path} status=${kind} ms=${now() - t0}`, log);
        }
      } catch { /* ignore */ }
      throw e;
    }
  }) as typeof fetch;
}

let installed = false;
export function installExternalCallLogging() {
  try {
    if (installed || typeof globalThis.fetch !== "function") return;
    installed = true;
    const base = globalThis.fetch.bind(globalThis);
    globalThis.fetch = withExternalCallLogging(base, (url) => {
      const host = process.env["SUPABASE_URL"];
      return !!host && url.startsWith(host);
    });
  } catch { /* never block startup */ }
}

/* ---------- Server function calls ---------- */

/** Redirects, not-found, thrown Responses below 500 and auth denials are expected outcomes, not failures. */
export function isExpectedOutcome(e: unknown): boolean {
  try {
    if (e instanceof Response) return e.status < 500;
    if (!e || typeof e !== "object") return false;
    const o = e as any;
    if (o.isNotFound === true || o.routerCode === "NOT_FOUND") return true;
    if (o.options && typeof o.status === "number" && o.status >= 300 && o.status < 400) return true; // redirect()
    if (o.isRedirect === true) return true;
    const status = Number(o.status ?? o.statusCode);
    if (status === 401 || status === 403 || (status >= 300 && status < 400)) return true;
    return /\b(unauthori[sz]ed|forbidden|not authorized|not signed in|sign in required)\b/i.test(String(o.message ?? ""));
  } catch { return false; }
}

/** Runs next(), logs a failure or slow call, and returns/rethrows exactly what next() produced. */
export async function timeServerFn<T>(name: string, next: () => Promise<T>, log: (l: string) => void = console.warn, now: () => number = Date.now): Promise<T> {
  const t0 = now();
  let fnName = "unknown";
  try { fnName = String(name || "unknown").replace(/[^A-Za-z0-9_$.-]/g, "").slice(0, 80) || "unknown"; } catch { /* ignore */ }
  try {
    const r = await next();
    try { const ms = now() - t0; if (ms > SLOW_MS) emit(`[fn] name=${fnName} result=ok ms=${ms} slow`, log); } catch { /* ignore */ }
    return r;
  } catch (e) {
    try {
      const ms = now() - t0;
      const expected = isExpectedOutcome(e);
      if (!expected) emit(`[fn] name=${fnName} result=error ms=${ms}`, log);
      else if (ms > SLOW_MS) emit(`[fn] name=${fnName} result=expected ms=${ms} slow`, log);
    } catch { /* ignore */ }
    throw e;
  }
}
