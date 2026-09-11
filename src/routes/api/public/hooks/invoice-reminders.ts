import { createFileRoute } from "@tanstack/react-router";

// Daily due-date reminders for issued, unpaid invoices.
// Callable by the scheduler. A shared secret is accepted when configured;
// without one the run is throttled so it can only do useful work once a day,
// and every reminder carries an idempotency key so repeats never double-send.
export const Route = createFileRoute("/api/public/hooks/invoice-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["LOVABLE_CRON_SECRET"];
        const provided =
          request.headers.get("x-cron-secret") ??
          (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        const trusted = Boolean(secret) && provided === secret;

        try {
          const { sendInvoiceReminders, claimReminderRun } = await import(
            "@/lib/invoice-reminders.server"
          );
          if (!trusted) {
            const claimed = await claimReminderRun();
            if (!claimed) {
              return Response.json({ skipped: true, reason: "already ran today" });
            }
          }
          const result = await sendInvoiceReminders();
          return Response.json(result);
        } catch (err) {
          console.error("[invoice-reminders] failed", err);
          return Response.json({ error: "reminder run failed" }, { status: 500 });
        }
      },
    },
  },
});
