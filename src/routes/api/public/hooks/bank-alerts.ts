import { createFileRoute } from "@tanstack/react-router";

import { requireInternalJob } from "@/lib/internal-job-auth.server";

// Scheduled bank alert scan. Internal job only: the caller must present the
// server-side job secret. Detection only records alerts (deduplicated);
// it never changes bank records or moves money.
export const Route = createFileRoute("/api/public/hooks/bank-alerts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = requireInternalJob(request);
        if (unauthorized) return unauthorized;
        try {
          const { scanAllFundsBankAlerts } = await import("@/lib/accounting-phase5.server");
          return Response.json(await scanAllFundsBankAlerts());
        } catch (err) {
          console.error("[bank-alerts] scheduled scan failed", err);
          return Response.json({ error: "scan failed" }, { status: 500 });
        }
      },
    },
  },
});
