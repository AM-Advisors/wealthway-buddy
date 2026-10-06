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
        // Marketing Drive library: refresh about hourly.
        let drive: unknown = null;
        if (new Date().getUTCMinutes() < 5) {
          const { syncMarketingDrive } = await import("@/lib/marketing-drive.server");
          drive = await syncMarketingDrive(null).catch((e) => { console.error("marketing drive sync", e); return { error: true }; });
        }
        return Response.json({ ...result, clickup, drive });
      },
    },
  },
});
