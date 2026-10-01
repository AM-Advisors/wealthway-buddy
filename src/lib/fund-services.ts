/**
 * Fund Operations Services (record-only): entity formation, EIN application and BOI
 * report tracking. Harmonious completes these services outside the platform; the
 * platform only records status, evidence and who prepared / reviewed. Pure module.
 */
export type ServiceKind = "formation" | "ein" | "boi";
export const SERVICE_KINDS: ServiceKind[] = ["formation", "ein", "boi"];
export const SERVICE_LABELS: Record<ServiceKind, string> = {
  formation: "Entity formation",
  ein: "EIN application",
  boi: "Beneficial ownership (BOI) report",
};

export type ServiceStatus =
  | "not_started" | "preparing" | "ready_for_review" | "reviewed" | "submitted" | "completed" | "rejected" | "exempt";

export const STATUS_LABELS: Record<ServiceStatus, string> = {
  not_started: "Not started",
  preparing: "Preparing",
  ready_for_review: "Ready for review",
  reviewed: "Reviewed",
  submitted: "Submitted by Harmonious",
  completed: "Completed",
  rejected: "Rejected — needs changes",
  exempt: "Exempt",
};

export const COMPLETED_LABEL: Record<ServiceKind, string> = {
  formation: "Approved by the state",
  ein: "EIN received",
  boi: "Accepted",
};

const NEXT: Record<ServiceStatus, ServiceStatus[]> = {
  not_started: ["preparing", "exempt"],
  preparing: ["ready_for_review", "exempt"],
  ready_for_review: ["reviewed", "preparing"],
  reviewed: ["submitted", "preparing"],
  submitted: ["completed", "rejected"],
  rejected: ["preparing"],
  completed: [],
  exempt: ["preparing"],
};

export function allowedNext(kind: ServiceKind, from: ServiceStatus): ServiceStatus[] {
  return NEXT[from].filter((s) => s !== "exempt" || kind === "boi");
}

export type TransitionInput = {
  kind: ServiceKind;
  from: ServiceStatus;
  to: ServiceStatus;
  actorId: string;
  preparedBy: string | null;
  fields: Record<string, unknown>;
  hasEinLetter?: boolean;
  hasCertificate?: boolean;
  boiPartyCount?: number;
  hasFormationAuthorization?: boolean;
};

/** Returns an error message, or null when the move is allowed. */
export function checkTransition(t: TransitionInput): string | null {
  if (!allowedNext(t.kind, t.from).includes(t.to)) return `Can't move from ${STATUS_LABELS[t.from]} to ${STATUS_LABELS[t.to]}.`;
  const f = t.fields;
  const has = (k: string) => typeof f[k] === "string" && (f[k] as string).trim().length > 0;
  if (t.to === "ready_for_review") {
    if (t.kind === "formation" && !(has("state") && has("entityType"))) return "Enter the state and entity type first.";
    if (t.kind === "boi" && !(t.boiPartyCount && t.boiPartyCount > 0)) return "Add at least one beneficial owner or company applicant.";
  }
  if (t.to === "reviewed" && t.preparedBy && t.preparedBy === t.actorId) return "A different Harmonious team member must review this.";
  if (t.to === "submitted" && t.kind === "formation" && t.hasFormationAuthorization === false) return "Record the client's authorization for Harmonious to form the entity first.";
  if (t.to === "submitted" && !has("submittedOn")) return "Enter the date Harmonious submitted it.";
  if (t.to === "completed") {
    if (t.kind === "formation" && !t.hasCertificate) return "Upload the Certificate of Formation first.";
    if (t.kind === "ein" && !t.hasEinLetter) return "Upload the IRS EIN letter first.";
    if (t.kind === "boi" && !has("confirmationNumber")) return "Enter the FinCEN confirmation number.";
  }
  if (t.to === "exempt" && !has("exemptionReason")) return "Enter the exemption reason.";
  return null;
}

export function isDone(s: ServiceStatus) {
  return s === "completed" || s === "exempt";
}

/** Fields a fund manager may see: status and dates only, no numbers or owner details. */
export function managerView(fields: Record<string, unknown>) {
  const pick = ["state", "entityType", "submittedOn", "completedOn"];
  return Object.fromEntries(Object.entries(fields).filter(([k]) => pick.includes(k)));
}

export function maskEin(v: unknown) {
  const s = String(v ?? "").replace(/\D/g, "");
  return s.length === 9 ? `**-***${s.slice(5)}` : "";
}
