/** Marketing Studio: pure editorial workflow rules (client + server). No I/O. */
export const STUDIO_STATUSES = [
  "idea", "researching", "drafting", "fact_check", "design", "internal_review",
  "ceo_approval", "approved", "scheduled", "published", "performance_review",
] as const;
export type StudioStatus = (typeof STUDIO_STATUSES)[number];
export const STUDIO_STATUS_LABEL: Record<StudioStatus, string> = {
  idea: "Idea", researching: "Researching", drafting: "Drafting", fact_check: "Fact check", design: "Design",
  internal_review: "Internal review", ceo_approval: "CEO approval", approved: "Approved", scheduled: "Scheduled",
  published: "Published", performance_review: "Performance review",
};

export const STUDIO_ACCESS = [
  "marketing_contributor", "marketing_specialist", "marketing_manager", "compliance_reviewer",
  "executive_approver", "executive", "super_admin", "admin",
];
/** May pass Fact check and Internal review. */
export const STUDIO_REVIEWERS = ["marketing_manager", "compliance_reviewer", "executive_approver", "executive", "super_admin", "admin"];
/** May give CEO / executive approval. */
export const STUDIO_EXECUTIVES = ["executive_approver", "executive", "super_admin", "admin"];
/** May schedule, mark published and plan weeks. */
export const STUDIO_MANAGERS = ["marketing_manager", "executive_approver", "executive", "super_admin", "admin"];

const idx = (s: string) => (STUDIO_STATUSES as readonly string[]).indexOf(s);
const has = (roles: string[], set: string[]) => roles.some((r) => set.includes(r));

export type MoveInput = {
  from: string; to: string; roles: string[]; actorId: string; authorId: string | null;
  publishAt: string | null; note?: string | null | undefined; unverifiedClaims?: number | undefined;
};

/** Returns null when the move is allowed, otherwise the reason it is refused. Server re-checks. */
export function moveProblem(m: MoveInput): string | null {
  const f = idx(m.from), t = idx(m.to);
  if (f < 0 || t < 0) return "Unknown step.";
  if (f === t) return "Already at that step.";
  if (!has(m.roles, STUDIO_ACCESS)) return "Only the Marketing team can move content.";
  const note = (m.note ?? "").trim();
  if (t < f) {
    if (m.from === "published" || m.from === "performance_review") return "Published content can't be moved back.";
    return note ? null : "Say why you're sending it back.";
  }
  if (t !== f + 1) return "Move one step at a time.";
  const self = !!m.authorId && m.authorId === m.actorId;
  const superSelf = self && m.roles.includes("super_admin");
  if (m.to === "design" || m.to === "ceo_approval") {
    if (!has(m.roles, STUDIO_REVIEWERS)) return "A reviewer must pass this step.";
    if (self && !superSelf) return "Someone other than the author must review this.";
    if (superSelf && !note) return "Super Admin self-review needs a reason.";
  }
  if (m.to === "approved") {
    if ((m.unverifiedClaims ?? 0) > 0) return "Some factual claims have no primary source. Verify or remove them before approval.";
    if (!has(m.roles, STUDIO_EXECUTIVES)) return "Only an executive approver can approve.";
    if (self && !superSelf) return "Someone other than the author must approve this.";
    if (superSelf && !note) return "Super Admin self-approval needs a reason.";
  }
  if (m.to === "scheduled" || m.to === "published" || m.to === "performance_review") {
    if (!has(m.roles, STUDIO_MANAGERS)) return "Only a marketing manager can do this.";
    if (m.to === "scheduled" && !m.publishAt) return "Set a publish date and time first.";
  }
  return null;
}

/** Content fields are locked once approved; send it back to edit. */
export const isLocked = (status: string) => idx(status) >= idx("approved");

/** Monday (UTC date string) of the week containing d. */
export function weekStart(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const wd = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() - (wd - 1));
  return x.toISOString().slice(0, 10);
}
