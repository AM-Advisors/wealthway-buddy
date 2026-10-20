import { createFileRoute } from "@tanstack/react-router";

import { requireInternalJob } from "@/lib/internal-job-auth.server";

// Daily sweep that connects invitations, accounts and investor records by
// verified email and fills tax-ID match codes. Internal job secret required.
// Returns counts only, never personal data.
export const Route = createFileRoute("/api/public/hooks/connect-accounts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = requireInternalJob(request);
        if (unauthorized) return unauthorized;
        try {
          const { sweepUnconnected } = await import("@/lib/account-connect.server");
          return Response.json(await sweepUnconnected());
        } catch (err) {
          console.error("[connect-accounts] sweep failed", err);
          return Response.json({ error: "sweep failed" }, { status: 500 });
        }
      },
    },
  },
});
