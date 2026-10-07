/**
 * Responsibility ("who is this waiting on") — shared, pure. Stored values are stable keys;
 * display copy lives here only. Responsibility is never priority and never grants access.
 */
export const RESPONSIBILITY_STATUSES = [
  "HARMONIOUS_HANDLING", "CLIENT_APPROVAL_REQUIRED", "CLIENT_INFORMATION_REQUIRED",
  "WAITING_ON_INVESTOR", "WAITING_ON_THIRD_PARTY", "COMPLETED",
] as const;
export type ResponsibilityStatus = (typeof RESPONSIBILITY_STATUSES)[number];

export const RESPONSIBILITY_LABEL: Record<ResponsibilityStatus, string> = {
  HARMONIOUS_HANDLING: "Harmonious Handling",
  CLIENT_APPROVAL_REQUIRED: "Your Approval Required",
  CLIENT_INFORMATION_REQUIRED: "Information Required",
  WAITING_ON_INVESTOR: "Waiting on Investor",
  WAITING_ON_THIRD_PARTY: "Waiting on Third Party",
  COMPLETED: "Completed",
};

export const RESPONSIBILITY_CLIENT_EXPLANATION: Record<ResponsibilityStatus, string> = {
  HARMONIOUS_HANDLING: "Your Harmonious team is currently working on this item. No action is required from you.",
  CLIENT_APPROVAL_REQUIRED: "Harmonious has completed its work and needs your approval before proceeding.",
  CLIENT_INFORMATION_REQUIRED: "Harmonious needs information or documents from you before this can move forward.",
  WAITING_ON_INVESTOR: "This is waiting on an investor to complete their part.",
  WAITING_ON_THIRD_PARTY: "This is waiting on an outside party, such as a bank, auditor or tax preparer.",
  COMPLETED: "This item is complete. No further action is required.",
};

/** Tone tiers — consistent with the design system, not six unrelated colors. */
export type ResponsibilityTone = "active" | "action" | "waiting" | "done";
export const RESPONSIBILITY_TONE: Record<ResponsibilityStatus, ResponsibilityTone> = {
  HARMONIOUS_HANDLING: "active",
  CLIENT_APPROVAL_REQUIRED: "action",
  CLIENT_INFORMATION_REQUIRED: "action",
  WAITING_ON_INVESTOR: "waiting",
  WAITING_ON_THIRD_PARTY: "waiting",
  COMPLETED: "done",
};

export const THIRD_PARTY_TYPES = {
  BANK: "Bank", AUDITOR: "Auditor", TAX_PREPARER: "Tax preparer", ATTORNEY: "Attorney", CUSTODIAN: "Custodian",
  TRANSFER_AGENT: "Transfer agent", REGISTERED_AGENT: "Registered agent", VALUATION_PROVIDER: "Valuation provider",
  ISSUER: "Issuer", OTHER: "Other",
} as const;
export type ThirdPartyType = keyof typeof THIRD_PARTY_TYPES;

export const asResponsibility = (v: unknown): ResponsibilityStatus =>
  (RESPONSIBILITY_STATUSES as readonly string[]).includes(String(v)) ? (v as ResponsibilityStatus) : "HARMONIOUS_HANDLING";

type WaitingInput = { responsibility_status?: string | null; waiting_on_type?: string | null; waiting_on_name?: string | null };

/** Waiting-on detail line. Client view never shows third-party names (internal context). */
export function waitingOnDetail(t: WaitingInput, audience: "client" | "internal", investorName?: string | null): string | null {
  const s = asResponsibility(t.responsibility_status);
  if (s === "WAITING_ON_INVESTOR") return investorName || t.waiting_on_name || null;
  if (s === "WAITING_ON_THIRD_PARTY") {
    const type = t.waiting_on_type ? THIRD_PARTY_TYPES[t.waiting_on_type as ThirdPartyType] ?? null : null;
    if (audience === "client") return type;
    return [type, t.waiting_on_name].filter(Boolean).join(" — ") || null;
  }
  return null;
}

export const isOpenTask = (t: { status?: string | null }) => !["done", "cancelled"].includes(String(t.status));

export function daysOverdue(t: { due_date?: string | null; status?: string | null }, today = new Date().toISOString().slice(0, 10)): number {
  if (!t.due_date || !isOpenTask(t) || t.due_date >= today) return 0;
  return Math.round((Date.parse(today) - Date.parse(t.due_date)) / 86_400_000);
}

export type ResponsibilityCounts = Record<ResponsibilityStatus, number>;
/** Reusable counts (for the future Command Center). */
export function responsibilityCounts(rows: { responsibility_status?: string | null }[]): ResponsibilityCounts {
  const c = Object.fromEntries(RESPONSIBILITY_STATUSES.map((s) => [s, 0])) as ResponsibilityCounts;
  for (const r of rows) c[asResponsibility(r.responsibility_status)]++;
  return c;
}

/** Notification hooks — detection only; nothing is sent from here. */
export type ResponsibilityAlert = "moved_to_approval" | "moved_to_information" | "investor_overdue" | "third_party_overdue";
export function responsibilityAlerts(
  t: { responsibility_status?: string | null; due_date?: string | null; status?: string | null },
  previous?: string | null,
): ResponsibilityAlert[] {
  const s = asResponsibility(t.responsibility_status);
  const out: ResponsibilityAlert[] = [];
  if (previous !== undefined && previous !== s) {
    if (s === "CLIENT_APPROVAL_REQUIRED") out.push("moved_to_approval");
    if (s === "CLIENT_INFORMATION_REQUIRED") out.push("moved_to_information");
  }
  if (daysOverdue(t) > 0) {
    if (s === "WAITING_ON_INVESTOR") out.push("investor_overdue");
    if (s === "WAITING_ON_THIRD_PARTY") out.push("third_party_overdue");
  }
  return out;
}
