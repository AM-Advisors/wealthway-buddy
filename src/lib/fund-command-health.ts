/**
 * Fund Health — derived, conservative, never manually set. Categories appear only when backed by data;
 * absence of data is "No data", never "Healthy".
 */
import { daysOverdue, isOpenTask } from "@/lib/responsibility";

export type Health = "HEALTHY" | "ATTENTION_NEEDED" | "ACTION_REQUIRED" | "NO_DATA";
export type CategoryHealth = "HEALTHY" | "IN_PROGRESS" | "ATTENTION_NEEDED" | "ACTION_REQUIRED" | "WAITING" | "NO_DATA";

export const HEALTH_LABEL: Record<Health, string> = { HEALTHY: "Healthy", ATTENTION_NEEDED: "Attention Needed", ACTION_REQUIRED: "Action Required", NO_DATA: "No Data" };
export const CATEGORY_HEALTH_LABEL: Record<CategoryHealth, string> = { HEALTHY: "Healthy", IN_PROGRESS: "In Progress", ATTENTION_NEEDED: "Attention Needed", ACTION_REQUIRED: "Action Required", WAITING: "Waiting", NO_DATA: "No Data" };

type Task = { status: string; priority?: string | null; due_date?: string | null; responsibility_status?: string | null };
type Item = { status: string; due_date: string; category: string; responsible_party?: string | null };

const CLIENT = new Set(["CLIENT_APPROVAL_REQUIRED", "CLIENT_INFORMATION_REQUIRED"]);
const WAIT = new Set(["WAITING_ON_INVESTOR", "WAITING_ON_THIRD_PARTY"]);
const openItem = (i: Item) => i.status === "SCHEDULED" || i.status === "IN_PROGRESS";
const itemOverdue = (i: Item, today: string) => openItem(i) && i.due_date < today ? Math.round((Date.parse(today) - Date.parse(i.due_date)) / 86_400_000) : 0;

/** "Materially overdue" = client action 3+ days late, or an urgent/high item past due. */
const MATERIAL_DAYS = 3;

function grade(entries: { overdue: number; party: string | null | undefined; high: boolean; inProgress: boolean }[]): CategoryHealth {
  if (!entries.length) return "NO_DATA";
  if (entries.some((e) => e.overdue >= MATERIAL_DAYS && CLIENT.has(String(e.party))) || entries.some((e) => e.overdue > 0 && e.high)) return "ACTION_REQUIRED";
  if (entries.some((e) => e.overdue > 0)) return "ATTENTION_NEEDED";
  if (entries.some((e) => WAIT.has(String(e.party)))) return "WAITING";
  if (entries.some((e) => e.inProgress)) return "IN_PROGRESS";
  return "HEALTHY";
}

export function fundHealth(tasks: Task[], items: Item[], capital: { overdue: boolean } | null, today = new Date().toISOString().slice(0, 10)) {
  const openTasks = tasks.filter(isOpenTask);
  const taskEntries = openTasks.map((t) => ({ overdue: daysOverdue(t, today), party: t.responsibility_status, high: t.priority === "high" || t.priority === "urgent", inProgress: t.status === "in_progress" }));
  const categories: { key: string; label: string; health: CategoryHealth }[] = [];
  if (tasks.length) categories.push({ key: "ITEMS", label: "Open items", health: grade(taskEntries) });
  const byCat = new Map<string, Item[]>();
  for (const i of items) if (i.status !== "CANCELLED") byCat.set(i.category, [...(byCat.get(i.category) ?? []), i]);
  for (const [cat, list] of byCat) {
    const open = list.filter(openItem);
    const h = open.length ? grade(open.map((i) => ({ overdue: itemOverdue(i, today), party: i.responsible_party, high: false, inProgress: i.status === "IN_PROGRESS" }))) : "HEALTHY";
    categories.push({ key: cat, label: cat.charAt(0) + cat.slice(1).toLowerCase(), health: h });
  }
  if (capital) categories.push({ key: "CAPITAL_ACTIVITY", label: "Capital activity", health: capital.overdue ? "ATTENTION_NEEDED" : "IN_PROGRESS" });
  const tracked = categories.filter((c) => c.health !== "NO_DATA");
  const overall: Health = !tracked.length ? "NO_DATA"
    : tracked.some((c) => c.health === "ACTION_REQUIRED") ? "ACTION_REQUIRED"
    : tracked.some((c) => c.health === "ATTENTION_NEEDED") ? "ATTENTION_NEEDED" : "HEALTHY";
  return { overall, categories };
}
