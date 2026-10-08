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
        // Personal LinkedIn: scheduled posts recheck ownership, delegation and approval right before posting.
        const linkedinPersonal = await (await import("@/lib/linkedin-personal.server")).runDuePersonal().catch((e) => { console.error("linkedin personal", e); return { error: true }; });
        const { syncDueClickup } = await import("@/lib/marketing-imports.server");
        const clickup = await syncDueClickup().catch((e) => { console.error("clickup sync", e); return { synced: 0 }; });
        // Marketing Drive library: refresh about hourly.
        let drive: unknown = null;
        if (new Date().getUTCMinutes() < 5) {
          const { syncMarketingDrive } = await import("@/lib/marketing-drive.server");
          drive = await syncMarketingDrive(null).catch((e) => { console.error("marketing drive sync", e); return { error: true }; });
        }
        // Research engine: ingest + enrich hourly; refresh series ideas once a day (~6am Denver). Never publishes.
        let research: unknown = null;
        const now = new Date();
        if (now.getUTCMinutes() >= 30 && now.getUTCMinutes() < 35) {
          const { runResearch } = await import("@/lib/marketing-research.server");
          research = await runResearch({ ideas: now.getUTCHours() === 12 }).catch((e) => { console.error("marketing research", e); return { error: true }; });
        }
        // Performance: platform metrics + Search Console once a day (~7am Denver). Read-only.
        let perf: unknown = null;
        if (now.getUTCHours() === 13 && now.getUTCMinutes() >= 40 && now.getUTCMinutes() < 45) {
          const q = await import("@/lib/marketing-queue.server");
          perf = { metrics: await q.refreshMetrics().catch((e) => ({ error: String(e) })), search: await q.refreshSearch().catch((e) => ({ error: String(e) })) };
        }
        return Response.json({ ...result, clickup, drive, research, perf });
      },
    },
  },
});
