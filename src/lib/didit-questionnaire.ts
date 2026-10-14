/**
 * Didit questionnaire -> Harmonious fund questionnaire.
 * Pure mapping. Sensitive answers (tax IDs, bank account/routing numbers) are never
 * carried over: tax IDs live encrypted on the profile and funding details in the Fund step.
 */
import type { Question } from "@/lib/investor-onboarding-model";

export const SENSITIVE_TITLE = /taxpayer|social security|\bssn\b|account number|routing|\baba\b|swift|name on bank account|bank account type/i;

type DiditItem = { uuid?: string; title?: string; element_type?: string; is_required?: boolean; choices?: { label?: string; value?: string }[] | null; answer?: { value?: unknown } | null };

export function questionKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60) || "question";
}

function items(responses: unknown): DiditItem[] {
  const out: DiditItem[] = [];
  for (const q of (Array.isArray(responses) ? responses : responses && typeof responses === "object" ? [responses] : []) as any[])
    for (const s of (q?.sections ?? []) as any[]) for (const i of (s?.items ?? []) as any[]) out.push(i);
  return out;
}

function formatAddress(v: any): string {
  if (!v || typeof v !== "object") return String(v ?? "");
  return [v.street, v.streetExtraInfo, v.city, v.state, v.postalCode, v.country].filter((x) => x && String(x).trim()).join(", ");
}

function answerText(i: DiditItem): string | null {
  const v = i.answer?.value;
  if (v === undefined || v === null || v === "") return null;
  if (i.element_type === "SINGLE_CHOICE" || i.element_type === "MULTIPLE_CHOICE") {
    const vals = Array.isArray(v) ? v : [v];
    return vals.map((x) => (i.choices ?? []).find((c) => c.value === x)?.label?.trim() ?? String(x)).join(", ");
  }
  if (i.element_type === "ADDRESS") return formatAddress(v) || null;
  if (i.element_type === "PHONE" && typeof v === "object") return `+${(v as any).callingCode ?? ""} ${(v as any).number ?? ""}`.trim();
  return typeof v === "object" ? JSON.stringify(v) : String(v).trim();
}

/** Questions for a fund questionnaire, built from a Didit questionnaire's structure. */
export function questionsFromDidit(responses: unknown): Question[] {
  const seen = new Set<string>();
  const out: Question[] = [];
  for (const i of items(responses)) {
    const title = (i.title ?? "").trim();
    if (!title || SENSITIVE_TITLE.test(title)) continue;
    const key = questionKey(title);
    if (seen.has(key)) continue;
    seen.add(key);
    const options = [...new Set((i.choices ?? []).map((c) => c.label?.trim()).filter(Boolean) as string[])];
    out.push({ key, label: title, type: options.length ? "select" : "text", required: Boolean(i.is_required), ...(options.length ? { options } : {}) });
  }
  return out;
}

/** Answers keyed like questionsFromDidit, without sensitive answers. */
export function answersFromDidit(responses: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of items(responses)) {
    const title = (i.title ?? "").trim();
    if (!title || SENSITIVE_TITLE.test(title)) continue;
    const a = answerText(i);
    if (a !== null) out[questionKey(title)] = a;
  }
  return out;
}
