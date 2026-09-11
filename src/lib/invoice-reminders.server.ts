import { CLIENT_PORTAL_BASE, money, notifyClientAdminsWith } from "@/lib/client-notify.server";

/** Reminder points relative to the due date, in days. Negative = before due. */
const BEFORE_DAYS = [7, 3, 0];
/** After the due date: day 1, then weekly. */
const OVERDUE_WEEKLY_START = 1;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string) {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/** Which reminder, if any, is due for an invoice today. */
export function reminderStage(dueDate: string, today: string) {
  const daysLeft = daysBetween(today, dueDate);
  if (daysLeft === null) return null;

  if (daysLeft >= 0) {
    if (!BEFORE_DAYS.includes(daysLeft)) return null;
    return {
      key: `due-${daysLeft}`,
      overdue: false,
      timing:
        daysLeft === 0
          ? "due today"
          : `due in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}`,
    };
  }

  const daysPast = -daysLeft;
  const isReminderDay = daysPast === OVERDUE_WEEKLY_START || daysPast % 7 === 0;
  if (!isReminderDay) return null;
  return {
    key: `overdue-${daysPast}`,
    overdue: true,
    timing:
      daysPast === 1 ? "1 day past due" : `${daysPast} days past due`,
  };
}

/**
 * Marks today's reminder run as taken. Returns false when it already ran,
 * so an untrusted caller can't make the job do work more than once a day.
 */
export async function claimReminderRun(today = todayIso()) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("scheduled_job_runs")
    .upsert(
      { job_key: "invoice-reminders", last_run_on: today, last_run_at: new Date().toISOString() },
      { onConflict: "job_key", ignoreDuplicates: false },
    )
    .lt("last_run_on", today)
    .select("job_key");
  if (error) {
    // First ever run: no row to compare against yet.
    const { error: insertError } = await supabaseAdmin
      .from("scheduled_job_runs")
      .insert({ job_key: "invoice-reminders", last_run_on: today });
    return !insertError;
  }
  return Boolean(data && data.length);
}

/**
 * Sends due-date reminders for every issued, unpaid invoice that hits a
 * reminder point today. Idempotency keys mean a repeated run is harmless.
 */
export async function sendInvoiceReminders(today = todayIso()) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: invoices, error } = await supabaseAdmin
    .from("invoices")
    .select("id, number, client_id, total_cents, due_date, status")
    .eq("status", "issued")
    .not("due_date", "is", null);
  if (error) throw new Error(error.message);

  const clientIds = Array.from(new Set((invoices ?? []).map((i: any) => String(i.client_id))));
  const names = new Map<string, string>();
  if (clientIds.length) {
    const { data: clients } = await supabaseAdmin
      .from("clients")
      .select("id, legal_name, name")
      .in("id", clientIds);
    for (const c of (clients ?? []) as any[]) {
      names.set(String(c.id), String(c.legal_name || c.name || "your organisation"));
    }
  }

  let sent = 0;
  const stages: string[] = [];

  for (const invoice of (invoices ?? []) as any[]) {
    const stage = reminderStage(String(invoice.due_date), today);
    if (!stage) continue;

    await notifyClientAdminsWith(
      String(invoice.client_id),
      "invoice-reminder",
      `invoice-reminder:${invoice.id}:${stage.key}`,
      (person) => ({
        contactName: person.name,
        clientName: names.get(String(invoice.client_id)) ?? "your organisation",
        invoiceNumber: String(invoice.number ?? ""),
        amount: money(Number(invoice.total_cents ?? 0)),
        dueDate: String(invoice.due_date),
        timing: stage.timing,
        overdue: stage.overdue,
        payUrl: `${CLIENT_PORTAL_BASE}/client/invoices?invoice=${invoice.id}`,
      }),
    );

    sent += 1;
    stages.push(`${invoice.number ?? invoice.id}:${stage.key}`);
  }

  return { checked: (invoices ?? []).length, reminded: sent, stages, today };
}
