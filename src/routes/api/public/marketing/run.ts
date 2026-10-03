import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

// Scheduler tick (pg_cron every 5 minutes). Publishes/sends only items already approved and due.
export const Route = createFileRoute("/api/public/marketing/run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["MARKETING_CRON_SECRET"];
        const got = request.headers.get("x-cron-secret") ?? "";
        if (!secret || got.length !== secret.length || !timingSafeEqual(Buffer.from(got), Buffer.from(secret))) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { runDue } = await import("@/lib/marketing.server");
        const result = await runDue();
        const { syncDueClickup } = await import("@/lib/marketing-imports.server");
        const clickup = await syncDueClickup().catch((e) => { console.error("clickup sync", e); return { synced: 0 }; });
        return Response.json({ ...result, clickup });
      },
    },
  },
});
