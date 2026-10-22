/** Signed-SOW recurrence projection only: no invoices, sends, or money movement. */
import { addMonths } from "./invoice-schedule-model";

export interface PaymentScheduleLine {
  service_key?: string | null;
  label?: string;
  amount_cents?: number;
  billing_frequency?: string | null;
  first_bill_on?: string | null;
}
export interface PaymentScheduleItem {
  sow_id: string;
  service_key: string;
  label: string;
  frequency: "quarterly" | "annual";
  due_on: string;
  amount_cents: number;
}
export interface PaymentScheduleReview {
  lineIndex: number;
  serviceKey: string | null;
  reason: "missing_frequency" | "unsupported_frequency" | "missing_service" | "invalid_first_bill_on" | "invalid_amount";
}

const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date)
  && Number.isFinite(Date.parse(`${date}T00:00:00Z`))
  && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;

/** Inclusive, explicit horizon; callers must extend it during daily reconciliation.
 * Every date is anchored to the signed first billing date to avoid month-end drift.
 * Never substitutes an effective/signature date or infers a billing frequency.
 */
export function buildPaymentSchedule(sowId: string, lines: readonly PaymentScheduleLine[], through: string) {
  if (!sowId.trim() || !validDate(through)) throw new Error("A SOW and valid schedule horizon are required.");
  const items: PaymentScheduleItem[] = [];
  const reviews: PaymentScheduleReview[] = [];
  const keys = new Set<string>();
  lines.forEach((line, lineIndex) => {
    const review = (reason: PaymentScheduleReview["reason"]) => reviews.push({ lineIndex, serviceKey: line.service_key ?? null, reason });
    if (line.billing_frequency === "one_time") return;
    if (!line.billing_frequency) { review("missing_frequency"); return; }
    if (line.billing_frequency !== "quarterly" && line.billing_frequency !== "annual") { review("unsupported_frequency"); return; }
    if (!line.service_key?.trim()) { review("missing_service"); return; }
    if (!line.first_bill_on || !validDate(line.first_bill_on)) { review("invalid_first_bill_on"); return; }
    if (!Number.isSafeInteger(line.amount_cents) || line.amount_cents! <= 0) { review("invalid_amount"); return; }
    const months = line.billing_frequency === "quarterly" ? 3 : 12;
    for (let n = 0; ; n++) {
      const due = addMonths(line.first_bill_on, months * n);
      if (due > through) break;
      const key = paymentScheduleKey(sowId, line.service_key, due);
      if (keys.has(key)) throw new Error("Duplicate signed service and due date require staff review.");
      keys.add(key);
      items.push({ sow_id: sowId, service_key: line.service_key, label: line.label || line.service_key, frequency: line.billing_frequency, due_on: due, amount_cents: line.amount_cents! });
    }
  });
  return { items, reviews };
}

export const paymentScheduleKey = (sowId: string, serviceKey: string, dueOn: string) => JSON.stringify([sowId, serviceKey, dueOn]);
