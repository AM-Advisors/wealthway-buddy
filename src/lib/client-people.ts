/** Client People: relationship-derived rows. Pure and client-safe. */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return "—";
  const [local, domain] = email.split("@");
  if (!domain) return "—";
  return `${(local ?? "").slice(0, 1)}•••@${domain}`;
}

export type RelationshipEdge = { userId: string; kind: "fund_manager" | "investor" | "delegate"; offeringId: string | null; detail?: string };
const KIND_LABEL = { fund_manager: "Fund manager", investor: "Investor", delegate: "Delegated professional" } as const;

/** One row per person; each reason they appear is kept and labelled. */
export function mergeRelationships(edges: RelationshipEdge[], people: Map<string, { name: string | null; email: string }>, fundName: Map<string, string>) {
  const out = new Map<string, { userId: string; name: string; email: string; relationships: { kind: RelationshipEdge["kind"]; label: string; fund: string | null }[] }>();
  for (const e of edges) {
    const p = people.get(e.userId);
    const row = out.get(e.userId) ?? { userId: e.userId, name: p?.name ?? "Unnamed person", email: p?.email ?? "—", relationships: [] };
    const fund = e.offeringId ? fundName.get(e.offeringId) ?? "Fund" : null;
    const label = `${KIND_LABEL[e.kind]}${fund ? ` — ${fund}` : " — client-wide"}`;
    if (!row.relationships.some((r) => r.label === label)) row.relationships.push({ kind: e.kind, label, fund });
    out.set(e.userId, row);
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}
