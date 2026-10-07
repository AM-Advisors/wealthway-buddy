/**
 * Pure fund health projections. Read-only: nothing here changes state.
 */
export const STUCK_AFTER_DAYS = 7;
export const DEADLINE_WINDOW_DAYS = 14;

const DAY = 86_400_000;

export type CalendarLike = { date: string; title: string; done?: boolean };

/** Next not-done calendar item on or after today. */
export function nextDeadline(items: CalendarLike[], now = new Date()): CalendarLike | null {
  const today = new Date(now.toISOString().slice(0, 10)).getTime();
  return (
    items
      .filter((i) => !i.done && i.date && new Date(i.date).getTime() >= today)
      .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null
  );
}

export type StuckFlag = { kind: "no_progress" | "deadline_soon"; label: string };

/** Flags a fund with no activity for STUCK_AFTER_DAYS or a deadline within DEADLINE_WINDOW_DAYS. */
export function stuckFlags(
  input: { lastActivityAt: string | null; nextDeadlineDate: string | null; open?: boolean },
  now = new Date(),
): StuckFlag[] {
  const flags: StuckFlag[] = [];
  if (input.lastActivityAt) {
    const days = Math.floor((now.getTime() - new Date(input.lastActivityAt).getTime()) / DAY);
    if (days >= STUCK_AFTER_DAYS) flags.push({ kind: "no_progress", label: `No progress in ${days} days` });
  }
  if (input.nextDeadlineDate) {
    const days = Math.ceil((new Date(input.nextDeadlineDate).getTime() - now.getTime()) / DAY);
    if (days >= 0 && days <= DEADLINE_WINDOW_DAYS) flags.push({ kind: "deadline_soon", label: `Deadline in ${days} day${days === 1 ? "" : "s"}` });
  }
  return flags;
}

/** Reminder spacing per investor. */
export const REMINDER_COOLDOWN_DAYS = 3;
export function reminderAllowed(lastSentAt: string | null, now = new Date()): boolean {
  if (!lastSentAt) return true;
  return now.getTime() - new Date(lastSentAt).getTime() >= REMINDER_COOLDOWN_DAYS * DAY;
}
/** Stages where a reminder is useful (Verification, Sign, Fund). */
export function reminderStep(stage: string, docs: string, wiring: string): "verification" | "sign" | "fund" | null {
  if (docs === "Signed") return /funded|reconciled/i.test(wiring) ? null : "fund";
  if (docs === "Out for signature" || stage === "signature") return "sign";
  return "verification";
}
