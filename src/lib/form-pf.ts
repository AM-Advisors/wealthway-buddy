/** Form PF and IRS correspondence records (pure). Record-only: nothing is filed from the app. */
export type PfStatus = "draft" | "ready_for_review" | "reviewed" | "filed_by_adviser";
export const PF_STATUS_LABEL: Record<PfStatus, string> = {
  draft: "Draft", ready_for_review: "Ready for review", reviewed: "Reviewed", filed_by_adviser: "Filed by adviser",
};
export const PF_SECTIONS = ["Section 1a", "Section 1b", "Section 1c", "Section 2", "Section 3", "Section 4", "Section 5"] as const;
export const ADVISER_SIZES = [
  { key: "smaller", label: "Smaller private fund adviser" },
  { key: "large_hedge", label: "Large hedge fund adviser" },
  { key: "large_liquidity", label: "Large liquidity fund adviser" },
  { key: "large_private_equity", label: "Large private equity fund adviser" },
] as const;

const NEXT: Record<PfStatus, PfStatus[]> = {
  draft: ["draft", "ready_for_review"],
  ready_for_review: ["reviewed", "draft"],
  reviewed: ["filed_by_adviser", "draft"],
  filed_by_adviser: [],
};
export const pfNext = (s: PfStatus) => NEXT[s].filter((x) => x !== s);

export type PfVersion = { status: PfStatus; recordedBy: string; preparedBy: string | null; filedOn?: string | null; filingConfirmation?: string | null; offeringIds: string[] };
export function checkPf(from: PfStatus | null, to: PfStatus, actorId: string, preparedBy: string | null, v: { filedOn?: string | null; filingConfirmation?: string | null; offeringIds: string[] }): string | null {
  if (from === null) return to === "draft" ? null : "A new Form PF starts as a draft.";
  if (from === "filed_by_adviser") return "This Form PF is recorded as filed and is locked.";
  if (!NEXT[from].includes(to)) return "That step isn't available now.";
  if (to === "ready_for_review" && v.offeringIds.length === 0) return "Choose at least one Fund this Form PF covers.";
  if (to === "reviewed" && preparedBy === actorId) return "A different Harmonious team member must review this.";
  if (to === "filed_by_adviser" && (!v.filedOn || !v.filingConfirmation?.trim())) return "Enter the date the adviser filed and the filing confirmation.";
  return null;
}

export type IrsStatus = "open" | "responded" | "closed";
export const IRS_STATUS_LABEL: Record<IrsStatus, string> = { open: "Open", responded: "Responded", closed: "Closed" };
export const IRS_NOTICE_SUGGESTIONS = ["CP575 (EIN assigned)", "CP2000", "CP162 (late filing penalty)", "Acceptance acknowledgement", "Rejection notice", "Letter 147C", "Other"];

/** What a fund manager may see of an IRS item. */
export function managerIrsView<T extends { shareWithManager: boolean }>(items: T[]) {
  return items.filter((i) => i.shareWithManager).map((i) => ({ ...i, notes: undefined, documentPath: undefined }));
}

export function daysUntil(date: string | null | undefined, today = new Date().toISOString().slice(0, 10)) {
  if (!date) return null;
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}
