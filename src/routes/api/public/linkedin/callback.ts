import { createFileRoute } from "@tanstack/react-router";

const back = (q: string) => new Response(null, { status: 302, headers: { Location: `/marketing/channels?${q}` } });

export const Route = createFileRoute("/api/public/linkedin/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = new URL(request.url);
        if (u.searchParams.get("error")) return back(`linkedin=error&msg=${encodeURIComponent(u.searchParams.get("error_description") ?? "Cancelled")}`);
        const code = u.searchParams.get("code"), state = u.searchParams.get("state");
        if (!code || !state) return back("linkedin=error&msg=Missing%20code");
        try {
          const personal = await import("@/lib/linkedin-personal.server");
          if (personal.isPersonalState(state)) {
            const go = (q: string) => new Response(null, { status: 302, headers: { Location: `/marketing/linkedin?${q}` } });
            try { await personal.completeConnect(code, state); return go("linkedin=connected"); }
            catch (e) { return go(`linkedin=error&msg=${encodeURIComponent((e as Error).message.slice(0, 200))}`); }
          }
          const li = await import("@/lib/linkedin-direct.server");
          const userId = li.verifyState(state);
          const { requireMarketing } = await import("@/lib/marketing.server");
          const { canApprove } = await requireMarketing(userId);
          if (!canApprove) return back("linkedin=error&msg=Not%20allowed");
          const r = await li.completeAuth(code, userId);
          return back(`linkedin=${r.picked ? "connected" : "choose"}`);
        } catch (e) {
          return back(`linkedin=error&msg=${encodeURIComponent((e as Error).message.slice(0, 200))}`);
        }
      },
    },
  },
});
