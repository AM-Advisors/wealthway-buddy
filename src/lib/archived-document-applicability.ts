/** Read-only projection: which investors each archived document or earlier version still applies to. */
export type ArchDoc = { id: string; title: string; active_version: number | null; removed_at: string | null; removed_reason: string | null; removed_by_name?: string | null };
export type ArchVersion = { offering_document_id: string; version: number; file_name: string | null; created_at: string; superseded_at: string | null };
export type ArchEvidence = { offering_document_id: string; version: number | null; onboarding_id: string; at: string | null; kind: "signed" | "acknowledged" };
export type ArchInvestor = { onboardingId: string; name: string; at: string | null; kind: "signed" | "acknowledged" };

export type ArchivedItem = {
  documentId: string; title: string; version: number; fileName: string | null;
  reason: "archived" | "replaced"; replacedBy: number | null;
  archivedAt: string | null; archivedNote: string | null; archivedBy: string | null;
  investors: ArchInvestor[];
};

export function archivedApplicability(docs: ArchDoc[], versions: ArchVersion[], evidence: ArchEvidence[], names: Record<string, string>): ArchivedItem[] {
  const byDoc = new Map(docs.map((d) => [d.id, d]));
  const out: ArchivedItem[] = [];
  for (const v of versions) {
    const d = byDoc.get(v.offering_document_id);
    if (!d) continue;
    const archived = !!d.removed_at;
    const replaced = !archived && d.active_version != null && v.version !== d.active_version;
    if (!archived && !replaced) continue;
    const seen = new Set<string>();
    const investors: ArchInvestor[] = [];
    for (const e of evidence) {
      if (e.offering_document_id !== d.id || e.version !== v.version || seen.has(e.onboarding_id)) continue;
      seen.add(e.onboarding_id);
      investors.push({ onboardingId: e.onboarding_id, name: names[e.onboarding_id] ?? "Unnamed investor", at: e.at, kind: e.kind });
    }
    out.push({
      documentId: d.id, title: d.title, version: v.version, fileName: v.file_name,
      reason: archived ? "archived" : "replaced", replacedBy: replaced ? d.active_version : null,
      archivedAt: archived ? d.removed_at : v.superseded_at, archivedNote: archived ? d.removed_reason : null, archivedBy: archived ? d.removed_by_name ?? null : null,
      investors,
    });
  }
  return out.sort((a, b) => a.title.localeCompare(b.title) || b.version - a.version);
}
