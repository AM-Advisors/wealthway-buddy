import { createFileRoute } from "@tanstack/react-router";

import { requireInternalJob } from "@/lib/internal-job-auth.server";

// Scheduled: Slack #operations notice for anything newly waiting on Harmonious approval.
export const Route = createFileRoute("/api/public/hooks/approval-alerts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = requireInternalJob(request);
        if (unauthorized) return unauthorized;
        try {
          const { runApprovalAlerts } = await import("@/lib/approval-alerts.server");
          return Response.json(await runApprovalAlerts());
        } catch (err) {
          console.error("[approval-alerts] failed", err);
          return Response.json({ error: "approval alert run failed" }, { status: 500 });
        }
      },
    },
  },
});
