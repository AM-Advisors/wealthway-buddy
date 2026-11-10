/** Pure helpers for the combined Marketing approvals queue. No I/O. */
import { STUDIO_EXECUTIVES, STUDIO_REVIEWERS } from "./marketing-studio-model";

export type ApprovalKind = "post" | "email" | "article" | "collateral";

/** Studio review steps and the step an approval moves them to. */
export const STUDIO_NEXT: Record<string, string> = { fact_check: "design", internal_review: "ceo_approval", ceo_approval: "approved" };

export function studioApprover(status: string, roles: string[]): { canApprove: boolean; reason: string | null } {
  const need = status === "ceo_approval" ? STUDIO_EXECUTIVES : STUDIO_REVIEWERS;
  const ok = roles.some((r) => need.includes(r));
  return { canApprove: ok, reason: ok ? null : status === "ceo_approval" ? "Needs executive approval" : "Waiting for a reviewer" };
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : null);

/** Open items with the same title (case-insensitive) on the same day. Warn only, never merge. */
export function findLikelyDuplicates<T extends { id: string; title: string | null; at: string | null }>(title: string, at: string | null, open: T[], selfId?: string | null): T[] {
  const t = norm(title);
  if (t.length < 3 || t === "untitled post" || t === "untitled") return [];
  return open.filter((o) => o.id !== selfId && norm(o.title) === t && day(o.at) === day(at));
}
