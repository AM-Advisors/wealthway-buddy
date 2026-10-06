import { createFileRoute } from "@tanstack/react-router";

// Public tracked link for a shared marketing sheet. Opaque token; revocable; logs each open.
export const Route = createFileRoute("/api/public/m/$token")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!/^[\w-]{20,64}$/.test(params.token)) return new Response("Not found", { status: 404 });
        const { openShareLink } = await import("@/lib/marketing-drive.server");
        const url = await openShareLink(params.token, request.headers.get("user-agent")).catch((e) => { console.error("share link", e); return null; });
        if (!url) return new Response("This link is no longer available.", { status: 404, headers: { "Cache-Control": "no-store" } });
        return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store" } });
      },
    },
  },
});
