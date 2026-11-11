/**
 * Foundation Administration release controls (pure, browser-safe).
 *
 * Five things stay separate:
 *  - feature visibility (platform_feature_flags: staff workspace, client onboarding),
 *  - the ability to draft quotes (its own switch),
 *  - commercial release per component (send, contract, sign, price),
 *  - operational delivery readiness per component (enrol, invoice),
 *  - protected financial permissions, which are never releasable here.
 * A switch never releases a component. Releases need recorded evidence, a reason, and a different Super Admin's
 * approval; history is append-only. The database re-checks every rule.
 */
import { COMPONENT_KEYS, componentByKey, type ComponentKey } from "@/lib/foundation-admin-model";

export const FOUNDATION_FLAGS = {
  foundation_administration: { label: "Staff workspace", description: "Staff can see and record foundations, people, documents and tasks." },
  foundation_quote_drafting: { label: "Quote drafting", description: "Sales can add Foundation Administration to draft quotes. Drafts never send, contract or bill on their own." },
  foundation_client_onboarding: { label: "Client onboarding", description: "Client members can fill in foundation details, upload documents and submit them for review." },
} as const;
export type FoundationFlagKey = keyof typeof FOUNDATION_FLAGS;
export const FOUNDATION_FLAG_KEYS = Object.keys(FOUNDATION_FLAGS) as [FoundationFlagKey, ...FoundationFlagKey[]];

export const RELEASE_DIMENSIONS = {
  delivery: { label: "Delivery readiness", allows: "Enrolling the client in the service and invoicing it, once commercially released too." },
  commercial: { label: "Commercial release", allows: "Sending quotes and proposals, SOWs, signing and contracted pricing." },
} as const;
export type ReleaseDimension = keyof typeof RELEASE_DIMENSIONS;

export const RELEASE_EVIDENCE = {
  terms: "Approved terms: SOW scope and responsibilities that stay with the foundation",
  pricing_policy: "Pricing policy: approved rate or negotiated-price policy",
  verification: "Verification requirements for this component",
  delivery_workflow: "Delivery workflow that Operations will follow",
  validation: "Validation evidence: tests and QA results",
} as const;
export type ReleaseEvidenceKey = keyof typeof RELEASE_EVIDENCE;

export const REQUIRED_EVIDENCE: Record<ReleaseDimension, readonly ReleaseEvidenceKey[]> = {
  delivery: ["delivery_workflow", "validation"],
  commercial: ["terms", "pricing_policy", "verification", "delivery_workflow", "validation"],
};

/** Never releasable through these controls. They keep their own protected approvers and are not built for foundations. */
export const PROTECTED_FINANCIAL = [
  "Moving money, including grant payments",
  "Bank account or payment signing authority",
  "Filing tax returns or paying taxes",
] as const;

export type ReleaseEvent = {
  id: string; component: string; dimension: string; action: "requested" | "approved" | "withdrawn" | "revoked";
  request_id: string | null; evidence: Record<string, unknown>; reason: string; actor_id: string; created_at: string;
};

export type DimensionState = { released: boolean; openRequest: ReleaseEvent | null; lastDecision: ReleaseEvent | null };
export type ComponentReleaseState = Record<ReleaseDimension, DimensionState>;

const byTime = (a: ReleaseEvent, b: ReleaseEvent) => (a.created_at === b.created_at ? a.id.localeCompare(b.id) : a.created_at.localeCompare(b.created_at));

/** Same rule as public.foundation_component_released: the latest approval or revocation decides. */
export function releaseState(events: readonly ReleaseEvent[]): Record<ComponentKey, ComponentReleaseState> {
  const out = {} as Record<ComponentKey, ComponentReleaseState>;
  for (const k of COMPONENT_KEYS) {
    out[k] = { delivery: dim(events, k, "delivery"), commercial: dim(events, k, "commercial") };
  }
  return out;
}

function dim(events: readonly ReleaseEvent[], component: string, dimension: ReleaseDimension): DimensionState {
  const mine = events.filter((e) => e.component === component && e.dimension === dimension).sort(byTime);
  const decisions = mine.filter((e) => e.action === "approved" || e.action === "revoked");
  const last = decisions[decisions.length - 1] ?? null;
  const closed = new Set(mine.filter((e) => e.action === "approved" || e.action === "withdrawn").map((e) => e.request_id));
  const open = [...mine].reverse().find((e) => e.action === "requested" && !closed.has(e.id)) ?? null;
  return { released: last?.action === "approved", openRequest: open, lastDecision: last };
}

export type ReleasedSets = { commercial: readonly ComponentKey[]; delivery: readonly ComponentKey[] };
export const NOTHING_RELEASED: ReleasedSets = { commercial: [], delivery: [] };

export function releasedSets(events: readonly ReleaseEvent[]): ReleasedSets {
  const s = releaseState(events);
  return {
    commercial: COMPONENT_KEYS.filter((k) => s[k].commercial.released),
    delivery: COMPONENT_KEYS.filter((k) => s[k].delivery.released),
  };
}

export function missingEvidence(dimension: ReleaseDimension, evidence: Partial<Record<ReleaseEvidenceKey, string>>): ReleaseEvidenceKey[] {
  return REQUIRED_EVIDENCE[dimension].filter((k) => (evidence[k] ?? "").trim().length < 10);
}

export function releaseRequestProblem(input: { component: string; dimension: ReleaseDimension; evidence: Partial<Record<ReleaseEvidenceKey, string>>; reason: string; roles: readonly string[]; state: DimensionState }): string | null {
  if (!componentByKey(input.component)) return "Choose a Foundation Administration component.";
  if (!input.roles.some((r) => r === "admin" || r === "super_admin")) return "Only an administrator can request a release.";
  if (input.state.released) return "This is already released.";
  if (input.state.openRequest) return "A release request is already open. Approve or withdraw it first.";
  const missing = missingEvidence(input.dimension, input.evidence);
  if (missing.length) return `Record the evidence first: ${missing.map((k) => RELEASE_EVIDENCE[k]).join("; ")}.`;
  if (input.reason.trim().length < 10) return "Give the reason for this release (at least 10 characters).";
  return null;
}

export function releaseApprovalProblem(input: { request: ReleaseEvent | null; approverId: string; roles: readonly string[]; deliveryReleased: boolean }): string | null {
  if (!input.request) return "There is no open release request.";
  if (!input.roles.includes("super_admin")) return "Only a Super Admin can approve a release.";
  if (input.request.actor_id === input.approverId) return "Someone other than the requester must approve a release.";
  if (input.request.dimension === "commercial" && !input.deliveryReleased) return "Release delivery readiness for this component first.";
  return null;
}
