/**
 * The four-step investor experience, derived — never stored.
 *
 *   About You → Verification → Sign → Fund
 *
 * Every step is a read over the authoritative requirement results produced by
 * `determineOnboardingRequirements` plus the onboarding row. Nothing here
 * creates a second onboarding status; it only groups what already exists.
 */
import type {
  OfferingRequirements,
  RequirementKey,
  RequirementResult,
} from "@/lib/investor-onboarding-model";

export const JOURNEY_STEPS = ["about", "verify", "sign", "fund"] as const;
export type JourneyStep = (typeof JOURNEY_STEPS)[number];

export const JOURNEY_STEP_LABELS: Record<JourneyStep, string> = {
  about: "About You",
  verify: "Verification",
  sign: "Sign",
  fund: "Fund",
};

/** Which internal requirements sit underneath each investor-facing step. */
export const STEP_REQUIREMENTS: Record<JourneyStep, readonly RequirementKey[]> = {
  about: ["account", "investment_profile", "beneficial_owners", "investment_amount"],
  verify: ["identity_verification", "entity_verification", "aml", "eligibility", "accreditation", "tax_documentation"],
  sign: ["subscription_questionnaire", "subscription_documents", "signature"],
  fund: ["funding"],
};

export type StepState = "complete" | "action_required" | "in_progress" | "locked";

export type JourneyStepView = {
  key: JourneyStep;
  label: string;
  state: StepState;
  /** Plain-language line. Never a provider response or internal term. */
  message: string;
};

export type JourneyFacts = {
  stage: string;
  approvedToFund: boolean;
  fundingStatus: string | null;
  investorReportsSent: boolean;
  openInvestorExceptions?: number;
};

function stateFor(results: RequirementResult[]): StepState {
  const relevant = results.filter((r) => r.state !== "not_applicable");
  if (relevant.length === 0 || relevant.every((r) => r.state === "valid")) return "complete";
  if (relevant.some((r) => r.state === "missing" || r.state === "refresh_required")) return "action_required";
  return "in_progress";
}

export function journeySteps(requirements: RequirementResult[], facts: JourneyFacts): JourneyStepView[] {
  const pick = (step: JourneyStep) => requirements.filter((r) => STEP_REQUIREMENTS[step].includes(r.key));

  // About You is incomplete until a profile exists; later steps stay locked.
  const hasProfile = requirements.some((r) => r.key === "investment_profile" && r.state === "valid");
  const about = hasProfile ? stateFor(pick("about")) : "action_required";

  let verify: StepState = hasProfile ? stateFor(pick("verify")) : "locked";
  const refresh = pick("verify").some((r) => r.state === "refresh_required");

  let sign: StepState = "locked";
  if (hasProfile && verify === "complete" && about === "complete") {
    sign = stateFor(pick("sign"));
    // Signed but still with Harmonious: that is review, not investor action.
    if (sign === "complete" && !facts.approvedToFund) sign = "complete";
  } else if (pick("sign").find((r) => r.key === "signature")?.state === "valid") {
    sign = "complete";
  }
  if (verify === "locked" && sign === "complete") verify = "in_progress";

  let fund: StepState = "locked";
  let fundMessage = "Funding opens once Harmonious has reviewed and accepted your subscription.";
  if (facts.fundingStatus === "funded") {
    fund = "complete";
    fundMessage = "Received. Your investment is complete.";
  } else if (facts.approvedToFund) {
    if (facts.investorReportsSent || ["bank_transaction_detected", "reconciliation_pending", "partially_funded"].includes(String(facts.fundingStatus))) {
      fund = "in_progress";
      fundMessage = "Thanks — we'll confirm as soon as your bank transfer is received and matched.";
    } else {
      fund = "action_required";
      fundMessage = "Your subscription has been accepted. You can now view secure wiring instructions.";
    }
  } else if (sign === "complete") {
    fundMessage = "Harmonious is reviewing your subscription.";
  }

  return [
    {
      key: "about",
      label: JOURNEY_STEP_LABELS.about,
      state: about,
      message:
        about === "complete"
          ? "Done."
          : hasProfile
            ? "A few details are still needed about who is investing."
            : "Tell us who is making this investment.",
    },
    {
      key: "verify",
      label: JOURNEY_STEP_LABELS.verify,
      state: verify,
      message:
        verify === "complete"
          ? "Verification complete."
          : verify === "locked"
            ? "Available after About You."
            : refresh
              ? "Some verification has expired and needs to be renewed."
              : verify === "action_required"
                ? "Start verification to continue."
                : "Verification in progress.",
    },
    {
      key: "sign",
      label: JOURNEY_STEP_LABELS.sign,
      state: sign,
      message:
        sign === "complete"
          ? "Documents signed."
          : sign === "locked"
            ? "Available after verification."
            : sign === "in_progress"
              ? "Waiting for signing to finish."
              : "Review and sign your documents.",
    },
    { key: "fund", label: JOURNEY_STEP_LABELS.fund, state: fund, message: fundMessage },
  ];
}

/** The first step the investor can act on or is waiting on. Resume goes here. */
export function nextJourneyStep(steps: JourneyStepView[]): JourneyStep {
  const first = steps.find((s) => s.state === "action_required" || s.state === "in_progress");
  return first?.key ?? (steps.every((s) => s.state === "complete") ? "fund" : "about");
}

export function isJourneyStep(v: unknown): v is JourneyStep {
  return typeof v === "string" && (JOURNEY_STEPS as readonly string[]).includes(v);
}

/** A step can be opened only when it is not locked. */
export function openableStep(steps: JourneyStepView[], requested: unknown): JourneyStep {
  if (isJourneyStep(requested)) {
    const s = steps.find((x) => x.key === requested);
    if (s && s.state !== "locked") return requested;
  }
  return nextJourneyStep(steps);
}

// ------------------------------------------------------- offering exemption

/**
 * The offering's configured exemption sets a floor on its requirements.
 * It only ever tightens configuration — it never relaxes it.
 * 506(c): every investor's accreditation must be verified (REG_TYPES).
 */
export function applyExemption(
  req: OfferingRequirements,
  regType: string | null | undefined,
): OfferingRequirements & { exemption: string | null } {
  const exemption = regType ? String(regType) : null;
  if (exemption === "506c") {
    const method = String(req.accreditationMethod ?? "").toLowerCase();
    return {
      ...req,
      exemption,
      accreditationRequired: true,
      accreditationMethod: !method || method === "self_certification" ? "verified" : req.accreditationMethod ?? "verified",
    };
  }
  return { ...req, exemption };
}

// --------------------------------------------------------- invitations

/** An invitation only works for the person it was sent to. */
export function invitationRecipientError(invitationEmail: string | null | undefined, userEmail: string | null | undefined): string | null {
  const a = String(invitationEmail ?? "").trim().toLowerCase();
  const b = String(userEmail ?? "").trim().toLowerCase();
  if (!a) return null;
  if (!b || a !== b) return "This invitation was sent to a different email address. Sign in with that address to continue.";
  return null;
}

// ------------------------------------------------------------ signatures

export type SignatureEvidence = {
  provider_completed_at?: string | null;
  provider_status?: string | null;
  cancelled_at?: string | null;
  superseded_by?: string | null;
  offering_document_id?: string | null;
  investment_profile_id?: string | null;
  application_id?: string | null;
};

/**
 * A document counts as signed only with provider completion evidence
 * (written by the verified signing webhook), never from a browser claim.
 */
export function isAuthoritativeSignature(
  s: SignatureEvidence,
  scope: { offeringDocumentIds: string[]; investmentProfileId: string | null; applicationId: string | null },
): boolean {
  if (!s.provider_completed_at) return false;
  if (s.cancelled_at || s.superseded_by) return false;
  if (String(s.provider_status ?? "").toLowerCase() && !["completed", "signed", "done"].includes(String(s.provider_status).toLowerCase())) return false;
  if (s.offering_document_id && !scope.offeringDocumentIds.includes(s.offering_document_id)) return false;
  const byApplication = scope.applicationId && s.application_id === scope.applicationId;
  const byProfile = scope.investmentProfileId && s.investment_profile_id === scope.investmentProfileId && Boolean(s.offering_document_id);
  return Boolean(byApplication || byProfile);
}

// --------------------------------------------------------- manager view

export const MANAGER_INVESTOR_STATUSES = [
  "Invited",
  "Investor action required",
  "Harmonious review",
  "Admitted",
  "Funding required",
  "Funding pending",
  "Funded",
  "Closed",
  "Declined",
] as const;
export type ManagerInvestorStatus = (typeof MANAGER_INVESTOR_STATUSES)[number];

export function managerInvestorStatus(input: {
  stage: string | null;
  fundingStatus?: string | null;
  approvedToFund?: boolean;
  investorReportsSent?: boolean;
  acceptedAt?: string | null;
}): ManagerInvestorStatus {
  const stage = String(input.stage ?? "");
  if (!stage) return "Invited";
  if (stage === "declined" || stage === "cancelled") return "Declined";
  if (stage === "closed") return "Closed";
  if (input.fundingStatus === "funded" || stage === "funded") return "Funded";
  if (input.approvedToFund || ["approved_to_fund", "awaiting_funds", "accepted"].includes(stage)) {
    if (input.investorReportsSent || ["bank_transaction_detected", "reconciliation_pending", "partially_funded"].includes(String(input.fundingStatus))) {
      return "Funding pending";
    }
    return input.acceptedAt ? "Admitted" : "Funding required";
  }
  if (stage === "harmonious_review") return "Harmonious review";
  return "Investor action required";
}

/** Aggregate verification wording for the investor. No provider detail. */
export function verificationSummary(requirements: RequirementResult[]): "complete" | "in_progress" | "action_required" | "not_started" {
  const v = requirements.filter((r) => STEP_REQUIREMENTS.verify.includes(r.key) && r.state !== "not_applicable");
  if (v.length === 0 || v.every((r) => r.state === "valid")) return "complete";
  if (v.some((r) => r.state === "refresh_required")) return "action_required";
  if (v.every((r) => r.state === "missing")) return "not_started";
  if (v.some((r) => r.state === "review_required")) return "in_progress";
  return "action_required";
}
