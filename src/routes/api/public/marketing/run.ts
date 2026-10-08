import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

// Scheduler tick (pg_cron every 5 minutes). Each job runs at most once per slot (idempotency + lock in
// marketing_job_runs). Read-only ingestion jobs catch up when their slot was missed; publishing, sending and
// personal LinkedIn never catch up, and stale scheduled items are never released automatically.
export const Route = createFileRoute("/api/public/marketing/run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["MARKETING_CRON_SECRET"];
        const got = request.headers.get("x-cron-secret") ?? "";
        if (!secret || got.length !== secret.length || !timingSafeEqual(Buffer.from(got), Buffer.from(secret))) {
          return new Response("Unauthorized", { status: 401 });
        }
        const now = new Date();
        const { runJob, recordMissed } = await import("@/lib/marketing-jobs.server");
        const out: Record<string, unknown> = {};
        out["publishing_queue"] = await runJob("publishing_queue", now, async () => {
          const r = await (await import("@/lib/marketing.server")).runDue();
          return { result: r, status: r.failedStage ? "partial" : "completed", failedStage: r.failedStage ?? null };
        });
        out["linkedin_personal"] = await runJob("linkedin_personal", now, async () => ({ result: await (await import("@/lib/linkedin-personal.server")).runDuePersonal() }));
        out["clickup_sync"] = await runJob("clickup_sync", now, async () => ({ result: await (await import("@/lib/marketing-imports.server")).syncDueClickup() }));
        out["drive_sync"] = await runJob("drive_sync", now, async () => ({ result: await (await import("@/lib/marketing-drive.server")).syncMarketingDrive(null) }));
        out["research"] = await runJob("research", now, async () => {
          const ideas = now.getUTCHours() === 12 || (now.getUTCHours() === 13 && now.getUTCMinutes() < 30);
          return { result: await (await import("@/lib/marketing-research.server")).runResearch({ ideas }) };
        });
        out["metrics"] = await runJob("metrics", now, async () => {
          const r: any = await (await import("@/lib/marketing-queue.server")).refreshMetrics();
          return { result: r };
        });
        out["search_console"] = await runJob("search_console", now, async () => {
          const r: any = await (await import("@/lib/marketing-queue.server")).refreshSearch();
          return { result: r, status: r?.error ? "failed" : r?.skipped ? "skipped" : "completed", failedStage: r?.error ? "search_analytics_query" : null };
        });
        out["missed"] = await recordMissed(now).catch((e) => ({ error: String(e) }));
        return Response.json(out);
      },
    },
  },
});
