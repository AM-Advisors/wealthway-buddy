import { createFileRoute } from "@tanstack/react-router";

// Safety-net drain for fund manager alert emails. Normal flows send within
// seconds; this endpoint catches anything that failed or was missed.
// Protected by a shared secret — never publicly callable without it.
export const Route = createFileRoute("/api/public/notify/drain")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["LOVABLE_CRON_SECRET"];
        const provided =
          request.headers.get("x-cron-secret") ??
          (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");

        if (!secret || provided !== secret) {
          return new Response("unauthorized", { status: 401 });
        }

        const { drainManagerAlerts } = await import("@/lib/manager-alerts.server");
        const result = await drainManagerAlerts(50);
        return Response.json(result);
      },
    },
  },
});
