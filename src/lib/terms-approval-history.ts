/**
 * Approval history for a fund's fees and terms. Pure projection over the
 * append-only fund_setup_events log plus the versions' own approved_by/at,
 * so older approvals recorded before the log carried details still appear.
 */
import { termDocumentsLabel, type EconomicTerms, type FundClass } from "@/lib/fund-setup-canonical";

export type TermsApprovalEntry = {
  versionId: string;
  version: number | null;
  approvedAt: string;
  approverName: string;
  approverRole: "Harmonious" | "Fund team" | null;
  summary: string;
  /** Whether these terms are still the ones in use. */
  current: boolean;
};

type VersionRow = { id: string; version: number | null; status: string | null; approved_by: string | null; approved_at: string | null; terms: unknown; classes: unknown };
type EventRow = { subject_id: string | null; event: string; actor_user_id: string | null; actor_role: string | null; created_at: string; detail: unknown };
type Person = { name?: string | null; email?: string | null };

const pct = (v: number | null | undefined) => (v == null ? null : `${v}%`);
const money = (c: number | null | undefined) => (c == null ? null : `$${(c / 100).toLocaleString("en-US")} min`);

/** Short, plain description of what was approved, e.g. "Class A: 6% fee, 20% carry · Class B: 0% fee, 0% carry". */
export function termsSummary(terms: Partial<EconomicTerms> | null | undefined, classes: FundClass[] | null | undefined): string {
  const part = (fee: number | null | undefined, carry: number | null | undefined, min?: number | null, docs?: readonly string[] | null) =>
    [fee != null ? `${pct(fee)} fee` : null, carry != null ? `${pct(carry)} carry` : null, money(min ?? null), termDocumentsLabel(docs) ? `in ${termDocumentsLabel(docs)}` : null].filter(Boolean).join(", ");
  const list = Array.isArray(classes) ? classes : [];
  if (list.length) {
    return list
      .map((c) => {
        const s = part(c.managementFee?.ratePercent ?? terms?.managementFee?.ratePercent, c.carry?.ratePercent ?? terms?.carry?.ratePercent, c.minInvestmentCents, c.documentedIn ?? terms?.documentedIn);
        return `${c.name}${s ? `: ${s}` : ""}`;
      })
      .join(" · ");
  }
  return part(terms?.managementFee?.ratePercent, terms?.carry?.ratePercent, null, terms?.documentedIn) || "Terms recorded";
}

const roleLabel = (r: string | null | undefined): TermsApprovalEntry["approverRole"] => (r === "harmonious" ? "Harmonious" : r ? "Fund team" : null);

export function termsApprovalHistory(versions: VersionRow[], events: EventRow[], people: Map<string, Person>): TermsApprovalEntry[] {
  const byId = new Map(versions.map((v) => [v.id, v]));
  const nameFor = (uid: string | null | undefined, snap?: Person) => {
    const p = snap?.name || snap?.email ? snap : uid ? people.get(uid) : undefined;
    return p?.name?.trim() || p?.email?.trim() || (uid ? "Unknown user" : "Not recorded");
  };
  const out: TermsApprovalEntry[] = [];
  const seen = new Set<string>();
  for (const e of events) {
    if (e.event !== "economics_approved" || !e.subject_id) continue;
    const v = byId.get(e.subject_id);
    const d = (e.detail && typeof e.detail === "object" ? e.detail : {}) as Record<string, any>;
    seen.add(e.subject_id);
    out.push({
      versionId: e.subject_id,
      version: (d["version"] as number | undefined) ?? v?.version ?? null,
      approvedAt: e.created_at,
      approverName: nameFor(e.actor_user_id, { name: d["approver_name"], email: d["approver_email"] }),
      approverRole: roleLabel(e.actor_role),
      summary: (d["summary"] as string | undefined) || (v ? termsSummary(v.terms as any, v.classes as any) : "Terms recorded"),
      current: v?.status === "approved",
    });
  }
  for (const v of versions) {
    if (seen.has(v.id) || !v.approved_at) continue;
    out.push({ versionId: v.id, version: v.version, approvedAt: v.approved_at, approverName: nameFor(v.approved_by), approverRole: null, summary: termsSummary(v.terms as any, v.classes as any), current: v.status === "approved" });
  }
  return out.sort((a, b) => b.approvedAt.localeCompare(a.approvedAt));
}
