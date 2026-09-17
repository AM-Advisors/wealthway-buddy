import { createFileRoute } from "@tanstack/react-router";

import { requireInternalJob } from "@/lib/internal-job-auth.server";

// Safety-net drain for fund manager alert emails. Normal flows send within
// seconds; this endpoint catches anything that failed or was missed.
// Internal job only — never callable without the server-side job secret.
export const Route = createFileRoute("/api/public/notify/drain")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = requireInternalJob(request);
        if (unauthorized) return unauthorized;

        const { drainManagerAlerts } = await import("@/lib/manager-alerts.server");
        const result = await drainManagerAlerts(50);
        return Response.json(result);
      },
    },
  },
});
