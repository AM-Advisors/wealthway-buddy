import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "./lib/auth-attach";
import { canonicalRedirect } from "./lib/host-routing";

/**
 * Keeps each page on its own address: client pages on app.harmonious.co,
 * Harmonious Operations on ops.harmonious.co, old links forwarded to whichever
 * of the two now owns them. Temporary redirects while the new address is being
 * proven. This is addressing only — it grants nothing; every request is still
 * authorized on the server.
 */
const canonicalHostMiddleware = createMiddleware().server(async ({ next, request }) => {
  if (request.method === "GET" || request.method === "HEAD") {
    const target = canonicalRedirect({ url: request.url }, process.env as Record<string, string>);
    if (target) {
      return new Response(null, {
        status: target.status,
        headers: { location: target.location, "cache-control": "no-store" },
      });
    }
  }
  return next();
});

const errorMiddleware = createMiddleware().server(async ({ next, request }) => {
  // /lovable/* routes (email webhooks, previews) authenticate themselves and
  // must bypass app middleware.
  if (new URL(request.url).pathname.startsWith("/lovable/")) {
    return next();
  }
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [canonicalHostMiddleware, errorMiddleware, csrfMiddleware],
  functionMiddleware: [attachSupabaseAuth],
}));
