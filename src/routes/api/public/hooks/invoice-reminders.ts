import { createFileRoute } from "@tanstack/react-router";

import { requireInternalJob } from "@/lib/internal-job-auth.server";

// Daily due-date reminders for issued, unpaid invoices.
// Internal job only: the caller must present the server-side job secret
// before any database or email work happens. Each reminder still carries an
// idempotency key, and the daily claim keeps repeats from double-sending.
export const Route = createFileRoute("/api/public/hooks/invoice-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = requireInternalJob(request);
        if (unauthorized) return unauthorized;

        try {
          const { sendInvoiceReminders, claimReminderRun } = await import(
            "@/lib/invoice-reminders.server"
          );
          const claimed = await claimReminderRun();
          if (!claimed) {
            return Response.json({ skipped: true, reason: "already ran today" });
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
