/**
 * onboard.harmonious.co — the lightweight investor onboarding presentation.
 *
 * Pure projection of the authoritative requirement results for ONE
 * investment into three investor-facing steps. Nothing here stores progress:
 * every state is derived from records evaluated on the server.
 */
import type { RequirementKey, RequirementResult } from "@/lib/investor-onboarding-model";

export const ONBOARD_ORIGIN = "https://onboard.harmonious.co";

export const PORTAL_STEPS = ["verification", "accreditation", "documents"] as const;
export type PortalStep = (typeof PORTAL_STEPS)[number];

export const PORTAL_STEP_LABELS: Record<PortalStep, string> = {
  verification: "Verification",
  accreditation: "Accreditation",
  documents: "Documents",
};

/** Internal requirements behind each step. Funding is intentionally absent. */
export const PORTAL_STEP_REQUIREMENTS: Record<PortalStep, readonly RequirementKey[]> = {
  verification: [
    "investment_profile",
    "beneficial_owners",
    "identity_verification",
    "entity_verification",
    "aml",
    "eligibility",
    "tax_documentation",
    "bad_actor",
  ],
  accreditation: ["accreditation"],
  documents: ["subscription_questionnaire", "certifications", "subscription_documents", "signature"],
};

export type PortalStepState = "complete" | "not_applicable" | "action_required" | "in_review" | "locked";

export type PortalStepView = { key: PortalStep; label: string; state: PortalStepState };

function stateOf(results: RequirementResult[]): PortalStepState {
  if (results.length === 0 || results.every((r) => r.state === "not_applicable")) return "not_applicable";
  const relevant = results.filter((r) => r.state !== "not_applicable");
  if (relevant.every((r) => r.state === "valid")) return "complete";
  if (relevant.some((r) => r.state === "missing" || r.state === "refresh_required")) return "action_required";
  return "in_review";
}

const done = (s: PortalStepState) => s === "complete" || s === "not_applicable";

/**
 * Steps unlock in order. A signature is only ever counted when the engine
 * reports it valid, which requires provider-confirmed completion.
 */
export function portalSteps(requirements: RequirementResult[]): PortalStepView[] {
  const pick = (s: PortalStep) => requirements.filter((r) => PORTAL_STEP_REQUIREMENTS[s].includes(r.key));
  const hasProfile = requirements.some((r) => r.key === "investment_profile" && r.state === "valid");
  const verification = hasProfile ? stateOf(pick("verification")) : "action_required";
  let accreditation = stateOf(pick("accreditation"));
  if (accreditation !== "not_applicable" && !done(verification) && verification !== "in_review") accreditation = "locked";
  let documents = stateOf(pick("documents"));
  if (!done(documents) && !(done(verification) || verification === "in_review")) documents = "locked";
  if (!done(documents) && !(done(accreditation) || accreditation === "in_review")) documents = "locked";
  const out: [PortalStep, PortalStepState][] = [
    ["verification", verification],
    ["accreditation", accreditation],
    ["documents", documents],
  ];
  return out.map(([key, state]) => ({ key, label: PORTAL_STEP_LABELS[key], state }));
}

export type PortalView = PortalStep | "completed";

/** Where a returning investor lands: the first step still needing them. */
export function portalResumeStep(steps: PortalStepView[]): PortalView {
  const firstAction = steps.find((s) => s.state === "action_required");
  if (firstAction) return firstAction.key;
  if (steps.every((s) => done(s.state))) return "completed";
  const firstOpen = steps.find((s) => s.state === "in_review");
  return firstOpen?.key ?? "verification";
}

/** Onboarding complete ≠ admitted ≠ funded. */
export function portalComplete(steps: PortalStepView[]): boolean {
  return steps.every((s) => done(s.state));
}

/** Manager-safe progress label. Never exposes evidence or provider detail. */
export const MANAGER_PORTAL_STATUSES = [
  "Invitation sent",
  "Verification",
  "Accreditation",
  "Documents",
  "Harmonious review",
  "Complete",
] as const;
export type ManagerPortalStatus = (typeof MANAGER_PORTAL_STATUSES)[number];

export function managerPortalStatus(input: {
  invitedOnly?: boolean;
  requirements: RequirementResult[];
  stage?: string | null;
  acceptedAt?: string | null;
}): ManagerPortalStatus {
  if (input.invitedOnly) return "Invitation sent";
  if (input.acceptedAt || ["accepted", "approved_to_fund", "awaiting_funds", "funded", "closed"].includes(String(input.stage ?? ""))) {
    return "Complete";
  }
  const steps = portalSteps(input.requirements);
  const needs = steps.find((s) => s.state === "action_required" || s.state === "locked");
  if (needs) return PORTAL_STEP_LABELS[needs.key] as ManagerPortalStatus;
  return "Harmonious review";
}

/** The single emailed entry point. Only the opaque invitation reference is in the URL. */
export function onboardInvitationUrl(reference: string, origin: string = ONBOARD_ORIGIN): string {
  if (!/^[A-Za-z0-9]{16,64}$/.test(reference)) throw new Error("Invalid invitation reference.");
  return `${origin.replace(/\/+$/, "")}/onboard/${reference}`;
}

/** Only in-portal paths may be used as a return destination from providers. */
export function safeOnboardReturnPath(path: unknown): string | null {
  if (typeof path !== "string") return null;
  return /^\/onboard\/i\/[0-9a-f-]{36}$/i.test(path) ? path : null;
}
