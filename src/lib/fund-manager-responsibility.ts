/** Actor facts must come from the server's current fund assignments. */
export function managesExactFund(actor: { isStaff: boolean; offeringIds: readonly string[] }, offeringId: string): boolean {
  return actor.isStaff || actor.offeringIds.includes(offeringId);
}

export const MANAGER_RESPONSIBILITIES = [
  { key: "disclosures", label: "Investor answers", area: "investors", safeguard: "Review flagged answers; identity and screening checks remain separate." },
  { key: "terms", label: "Fees & terms", area: "setup", safeguard: "Approve a new version. Signed terms stay unchanged." },
  { key: "signers", label: "Team & signers", area: "setup", safeguard: "Each signer completes their own identity check." },
  { key: "documents", label: "Investor documents & tax forms", area: "documents", safeguard: "Only the correct investor's reviewed copy may be released." },
  { key: "reports", label: "Investor reports", area: "accounting", safeguard: "Financial review must be complete before release." },
  { key: "capital", label: "Received funds & admission", area: "banking", safeguard: "Match recorded bank evidence. Admission and money movement remain separate." },
  { key: "bank", label: "Bank account & instructions", area: "banking", safeguard: "Verified account ownership is required before instructions are released." },
  { key: "verification", label: "Identity & compliance follow-up", area: "investors", safeguard: "Resolve required evidence; fund access cannot clear a global identity check." },
  { key: "formation", label: "Formation & tax ID", area: "setup", safeguard: "Record official evidence. No filing or tax payment happens automatically." },
  { key: "templates", label: "Fund templates", area: "documents", safeguard: "Use your fund's copy; shared templates and signed originals stay protected." },
] as const;

export type ManagerWorkItem = { id: string; title: string; area: string; due?: string | null; waitingOn?: string | null };

/** Read-only priority; never invent dates, owners or permission. */
export function managerNextAction(items: readonly ManagerWorkItem[], today: string): ManagerWorkItem | null {
  return [...items].sort((a, b) => {
    const overdueA = !!a.due && a.due < today;
    const overdueB = !!b.due && b.due < today;
    if (overdueA !== overdueB) return overdueA ? -1 : 1;
    return (a.due ?? "9999").localeCompare(b.due ?? "9999");
  })[0] ?? null;
}