import { createMiddleware } from "@tanstack/react-start";

/**
 * Server-side timing for every server function: logs failures and calls over 3 s via
 * ext-call-log.server. Returns or rethrows exactly what the function produced
 * (Responses, redirects and not-found objects pass through unchanged).
 */
export const fnTimingMiddleware = createMiddleware({ type: "function" }).server(async ({ next, serverFnMeta }) => {
  let timer: typeof import("@/lib/ext-call-log.server")["timeServerFn"] | null = null;
  try { timer = (await import("@/lib/ext-call-log.server")).timeServerFn; } catch { timer = null; }
  if (!timer) return next();
  return timer((serverFnMeta as any)?.name ?? "unknown", () => next());
});
