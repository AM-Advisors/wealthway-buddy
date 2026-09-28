import { createFileRoute, redirect } from "@tanstack/react-router";

import { resolveSession } from "@/lib/session.functions";
import { safeInternalPath } from "@/lib/app-origins";

/**
 * Retired legacy home. Old bookmarks and email links still arrive here; the
 * server resolver decides where this signed-in person belongs and they are
 * redirected there. Nothing is ever rendered and no query parameters are
 * forwarded. Redirecting grants nothing: the destination re-checks access.
 */
export const Route = createFileRoute("/_authenticated/portal")({
  head: () => ({ meta: [{ title: "Redirecting — Harmonious" }, { name: "robots", content: "noindex, nofollow" }] }),
  beforeLoad: async () => {
    let to = "/home";
    try {
      const result: any = await resolveSession({ data: { intended: null } });
      to = safeInternalPath(result?.destination, "/home");
    } catch {
      to = "/home";
    }
    if (to === "/portal" || to.startsWith("/portal/") || to === "/dashboard" || to === "/portal") to = "/home";
    throw redirect({ to: to as never, replace: true });
  },
  component: () => null,
});
