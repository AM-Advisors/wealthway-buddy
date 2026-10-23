/**
 * Pure rules for current-client services, migration payment records and
 * payment reminders. Reminders only ask the client to pay - nothing here
 * charges, refunds or moves money.
 */
import { INVESTOR_TIERS } from "@/lib/product-pricing";
import { alaCarteCatalog, CAP_TIERS, SERVICING_KEYS } from "@/lib/saas-order-model";

export type Cadence = "annual" | "quarterly" | "one_time";
export const CADENCES: Cadence[] = ["annual", "quarterly", "one_time"];

export type ServiceOption = { key: string; label: string; group: string };

const SERVICING_LABEL: Record<string, string> = { self_serve: "Self Serve", core: "Core", plus: "Plus", white_glove: "White Glove" };

/** Everything staff can mark a current client as having. Keys match self-serve entitlements. */
export function serviceCatalog(): ServiceOption[] {
  return [
    { key: "platform_core", label: "Platform access", group: "Platform" },
    { key: "fund_platform", label: "Fund platform (per fund)", group: "Platform" },
    { key: "fund_administration", label: "Fund Administration", group: "Administration" },
    { key: "portfolio", label: "Portfolio", group: "Wealth & reporting" },
    { key: "report_cards", label: "Report Cards", group: "Wealth & reporting" },
    { key: "forecasting", label: "Forecasting", group: "Wealth & reporting" },
    ...SERVICING_KEYS.map((k) => ({ key: `servicing_${k}`, label: `${SERVICING_LABEL[k]} servicing`, group: "Servicing" })),
    { key: "servicing_institutional", label: "Institutional servicing", group: "Servicing" },
    ...INVESTOR_TIERS.map((t) => ({ key: `investor_servicing_${t.key}`, label: `${t.name} investor servicing${t.maxInvestors ? ` (up to ${t.maxInvestors})` : ""}`, group: "Investor servicing" })),
    ...CAP_TIERS.filter((t) => t !== "none").map((t) => ({ key: `cap_table_${t}`, label: `Cap table · ${t[0]!.toUpperCase()}${t.slice(1)}`, group: "Cap table" })),
    ...alaCarteCatalog().map((a) => ({ key: `alacarte_${a.key}`, label: a.name, group: "A la carte" })),
  ];
}

/** Entitlement keys a set of active services grants (cap table plans also grant the cap_table area). */
export function entitlementsFromServices(keys: readonly string[]): string[] {
  const out = new Set<string>(["platform_core"]);
  for (const k of keys) {
    out.add(k);
    if (k.startsWith("cap_table_")) out.add("cap_table");
  }
  return [...out];
}

const DAY = 86_400_000;
const parse = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);
function addMonths(iso: string, months: number) {
  const d = new Date(parse(iso));
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return fmt(d.getTime());
}

/**
 * Next renewal date: the first period boundary after the latest paid-through
 * date (or the start date when nothing is recorded). One-time services are
 * due on their start date until a payment covers them.
 */
export function nextDueDate(input: { cadence: Cadence; startDate: string; paidThrough?: string | null }): string | null {
  const { cadence, startDate, paidThrough } = input;
  if (cadence === "one_time") return paidThrough ? null : startDate;
  const step = cadence === "annual" ? 12 : 3;
  if (!paidThrough) return startDate;
  let due = startDate;
  for (let i = 0; i < 400 && parse(due) <= parse(paidThrough); i++) due = addMonths(startDate, step * (i + 1));
  return due;
}

/** Reminder points: 30 and 7 days before, the due date, then 7 and 14 days overdue. */
export const REMINDER_POINTS = [30, 7, 0, -7, -14] as const;

export function reminderStageFor(dueOn: string, today: string): { key: string; label: string } | null {
  const days = Math.round((parse(dueOn) - parse(today)) / DAY);
  if (!(REMINDER_POINTS as readonly number[]).includes(days)) return null;
  if (days > 0) return { key: `before-${days}`, label: `due in ${days} days` };
  if (days === 0) return { key: "due", label: "due today" };
  return { key: `overdue-${-days}`, label: `${-days} days past due` };
}

export type DueBucket = "upcoming" | "due" | "overdue" | "later";
export function dueBucket(dueOn: string, today: string): DueBucket {
  const days = Math.round((parse(dueOn) - parse(today)) / DAY);
  if (days < 0) return "overdue";
  if (days === 0) return "due";
  return days <= 30 ? "upcoming" : "later";
}

/** Card-autopay services are never emailed; paused or ended ones neither. */
export function wantsReminder(r: { status: string; card_autopay: boolean; reminders_paused: boolean; amount_cents: number }) {
  return r.status === "active" && !r.card_autopay && !r.reminders_paused && r.amount_cents > 0;
}

/** Second-person rule: anyone else may confirm; a Super Admin may confirm their own only with a reason. */
export function canConfirm(actor: string, maker: string, roles: readonly string[], note: string | null | undefined) {
  if (actor !== maker) return { ok: true } as const;
  if (roles.includes("super_admin") && (note ?? "").trim().length >= 3) return { ok: true } as const;
  return { ok: false, reason: roles.includes("super_admin") ? "A reason is required to approve your own entry." : "A different staff member must approve this." } as const;
}
