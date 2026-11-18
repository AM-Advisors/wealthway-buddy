/**
 * Pure rules for undoing a document loaded as "Signed before joining Harmonious".
 * Records are permanent: an undo appends a 'withdrawn' entry (reason required) and a restore
 * appends 'restored'. The latest entry per document wins. Withdrawn copies stay on file but no
 * longer count as the investor's loaded copy anywhere.
 */
export type PriorDocWithdrawalRow = { document_id: string; action: "withdrawn" | "restored" | string; created_at: string; reason?: string | null };

/** Latest withdrawal entry per document, for documents currently withdrawn. */
export function withdrawnPriorDocs(rows: PriorDocWithdrawalRow[]): Map<string, { reason: string | null; at: string }> {
  const latest = new Map<string, PriorDocWithdrawalRow>();
  for (const r of rows) {
    const cur = latest.get(r.document_id);
    if (!cur || r.created_at > cur.created_at) latest.set(r.document_id, r);
  }
  const out = new Map<string, { reason: string | null; at: string }>();
  for (const [id, r] of latest) if (r.action === "withdrawn") out.set(id, { reason: r.reason ?? null, at: r.created_at });
  return out;
}

/** Why an undo/restore can't happen, or null when it can. */
export function withdrawalRefusal(input: { action: "withdrawn" | "restored"; reason: string | null | undefined; replaced: boolean; withdrawn: boolean }): string | null {
  if (!(input.reason ?? "").trim()) return input.action === "withdrawn" ? "Give a reason for undoing this." : "Give a reason for restoring this.";
  if (input.replaced) return "This document was already replaced. The newer copy is the one in use.";
  if (input.action === "withdrawn" && input.withdrawn) return "This document was already undone.";
  if (input.action === "restored" && !input.withdrawn) return "This document is already in use.";
  return null;
}
