/**
 * Fictional investor journey for /qa-sandbox: one invented investor (Casey Alden)
 * investing in the invented fund. The real investor screens render against this
 * in-memory state; the step model is the same pure code the server uses.
 * Nothing here reaches the backend, sends email or moves money.
 */
import { journeySteps, verificationSummary } from "@/lib/investor-journey-model";
import { REQUIREMENT_LABELS, type RequirementKey, type RequirementResult, type RequirementState } from "@/lib/investor-onboarding-model";
import { QA_FUND_ID, QA_FUND_NAME } from "./fictional-data";

export const QA_JOURNEY_ID = "0a000000-0000-4000-8000-00000000a001";
export const QA_JOURNEY_INVESTOR = "Casey Alden";
export const QA_JOURNEY_EMAIL = "casey.alden@example.com";
export const QA_JOURNEY_MINIMUM_CENTS = 5_000_000;

const DOCS = [
  { id: "qa-doc-subscription", title: "Subscription Agreement", requiresSignature: true },
  { id: "qa-doc-operating", title: "Limited Partnership Agreement", requiresSignature: true },
  { id: "qa-doc-ppm", title: "Private Placement Memorandum", requiresSignature: false },
] as const;

const FICTIONAL_TEXT: Record<string, string> = {
  "qa-doc-subscription": `SUBSCRIPTION AGREEMENT\n${QA_FUND_NAME} (fictional sample fund)\n\nThis sample agreement is invented for demonstration. It is not an offer of any security.\n\n1. Subscription. The undersigned subscribes for an interest in the Fund in the amount shown in the subscription particulars.\n\n2. Acceptance. The subscription is accepted only when countersigned by the General Partner.\n\n3. Investor representations. The undersigned confirms the answers given in the investor questionnaire are true and complete.\n\n4. Electronic signature. The undersigned agrees to sign electronically.\n\nEnd of sample agreement.`,
  "qa-doc-operating": `LIMITED PARTNERSHIP AGREEMENT\n${QA_FUND_NAME} (fictional sample fund)\n\nThis sample agreement is invented for demonstration only.\n\n1. Formation. The Partnership is formed to make venture investments.\n\n2. Capital. Each Limited Partner contributes the commitment shown in its subscription.\n\nEnd of sample agreement.`,
  "qa-doc-ppm": `PRIVATE PLACEMENT MEMORANDUM\n${QA_FUND_NAME} (fictional sample fund)\n\nThis sample memorandum is invented for demonstration only.\n\nEnd of sample memorandum.`,
};

export type QaJourney = {
  profile: { id: string; name: string; type: string } | null;
  amountCents: number | null;
  identity: "missing" | "review_required" | "valid";
  accreditation: "missing" | "valid";
  ppmAcknowledged: boolean;
  subscription: { commitment_cents: number; ownership_title: string; tax_classification: string } | null;
  signatures: Record<string, { id: string; signed_at: string; document_hash: string }>;
  submitted: boolean;
  approvedToFund: boolean;
  reportedSent: { sentOn: string | null; amountCents: number | null; sendingBank: string | null } | null;
  received: boolean;
};

export function createQaJourney(): QaJourney {
  return { profile: null, amountCents: null, identity: "missing", accreditation: "missing", ppmAcknowledged: false, subscription: null, signatures: {}, submitted: false, approvedToFund: false, reportedSent: null, received: false };
}

export const QA_JOURNEY_FNS = [
  "onboardingDetailFn", "eligibleProfilesFn", "chooseProfileFn", "setInvestmentAmountFn", "startInvestmentVerificationFn",
  "saveQuestionnaireFn", "prepareSubscriptionDocumentsFn", "recordSubscriptionSignatureFn", "acknowledgeDocumentFn",
  "fundingInstructionsFn", "investorReportsFundsSentFn", "investorFundingLedgerFn", "feeStatusFn", "profileUploadStateFn",
  "getDocumentsStep", "saveSubscription", "signDocument", "getSigningStates", "readOfferingDocument", "recordStepView", "getFundScope",
  "getAccreditation", "submitSelfCertification", "getMyPortfolioValue", "getMyPersonalInvestmentLinks",
] as const;

const allSigned = (j: QaJourney) => DOCS.filter((d) => d.requiresSignature).every((d) => j.signatures[d.id]);
const fundingStatus = (j: QaJourney) => (j.received ? "funded" : j.reportedSent ? "reconciliation_pending" : "awaiting");

export function qaJourneyRequirements(j: QaJourney): RequirementResult[] {
  const r = (key: RequirementKey, state: RequirementState): RequirementResult => ({ key, label: REQUIREMENT_LABELS[key], state });
  const verified = j.identity === "valid";
  return [
    r("account", "valid"),
    r("investment_profile", j.profile ? "valid" : "missing"),
    r("beneficial_owners", "not_applicable"),
    r("investment_amount", j.amountCents ? "valid" : "missing"),
    r("identity_verification", j.identity),
    r("aml", verified ? "valid" : j.identity),
    r("accreditation", j.accreditation),
    r("subscription_questionnaire", "valid"),
    r("subscription_documents", allSigned(j) && j.ppmAcknowledged ? "valid" : "missing"),
    r("signature", j.submitted ? "valid" : "missing"),
    r("funding", j.received ? "valid" : "missing"),
  ];
}

export function qaJourneyDetail(j: QaJourney) {
  const requirements = qaJourneyRequirements(j);
  const journey = journeySteps(requirements, { stage: j.submitted ? "funding" : "signature", approvedToFund: j.approvedToFund, fundingStatus: fundingStatus(j), investorReportsSent: !!j.reportedSent });
  return {
    offering: { id: QA_FUND_ID, slug: QA_FUND_ID, name: QA_FUND_NAME, minInvestmentCents: QA_JOURNEY_MINIMUM_CENTS },
    stage: journey.find((s) => s.key === "verify")?.state === "in_progress" ? "verification" : "signature",
    profileLabel: j.profile?.name ?? null,
    profileType: j.profile?.type ?? null,
    exemption: "506b",
    requestedAmountCents: j.amountCents,
    acceptedAmountCents: j.submitted ? j.amountCents : null,
    fundedAmountCents: j.received ? j.amountCents : 0,
    investmentProfileId: j.profile?.id ?? null,
    verification: verificationSummary(requirements),
    approvedToFund: j.approvedToFund,
    fundingStatus: fundingStatus(j),
    investorReportsSent: !!j.reportedSent,
    executedSnapshot: j.submitted ? { at: "2026-11-11" } : null,
    documentTemplateVersion: "v1",
    documents: DOCS.map((d) => ({ id: d.id, title: d.title, requiresSignature: d.requiresSignature, signed: !!j.signatures[d.id], requiresAcknowledgment: !d.requiresSignature, acknowledged: !d.requiresSignature && j.ppmAcknowledged })),
    questionnaire: { questions: [{ key: "investing_experience", label: "Years of investing experience", type: "number", required: true }] },
    questionnaireResponses: { investing_experience: "8", name_of_subscriber: j.profile?.name ?? "" },
    requirements,
    journey,
  };
}

const block = (message: string) => { const e = new Error(message); e.name = "QaBlockedError"; return e; };

/** Answers one fictional journey call. Throws for anything outside the fictional investment. */
export function handleQaJourneyCall(fnName: string, data: any, j: QaJourney): unknown {
  const id = data?.onboardingId ?? data?.onboarding_id;
  if (id != null && id !== QA_JOURNEY_ID) throw block("Only the fictional investment is available.");
  const fund = data?.offering_id ?? data?.offeringId;
  if (fund != null && fund !== QA_FUND_ID) throw block("Only the fictional fund is available.");
  switch (fnName) {
    case "onboardingDetailFn": return qaJourneyDetail(j);
    case "eligibleProfilesFn": return { profiles: j.profile ? [{ id: j.profile.id, display_label: j.profile.name, legal_name: j.profile.name, profile_type: j.profile.type }] : [] };
    case "chooseProfileFn": {
      const name = String(data?.create?.legalName ?? QA_JOURNEY_INVESTOR).trim();
      j.profile = { id: "qa-journey-profile", name, type: String(data?.create?.profileType ?? "individual") };
      return { ok: true };
    }
    case "setInvestmentAmountFn": {
      const cents = Number(data?.amountCents ?? 0);
      if (!(cents > 0)) throw new Error("Enter an amount.");
      j.amountCents = cents;
      return { ok: true };
    }
    case "startInvestmentVerificationFn": { j.identity = "review_required"; return { inReview: true }; }
    case "saveQuestionnaireFn": return { ok: true };
    case "acknowledgeDocumentFn": { j.ppmAcknowledged = true; return { ok: true }; }
    case "prepareSubscriptionDocumentsFn": return { ok: true };
    case "recordSubscriptionSignatureFn": {
      if (!allSigned(j)) throw new Error("Sign every document first.");
      j.submitted = true;
      return { ok: true };
    }
    case "feeStatusFn": return { terms: { id: "qa-terms", managementFeePct: 2, basis: "Committed capital", carryPct: 20, hurdlePct: 8 }, accepted: { name: j.profile?.name ?? QA_JOURNEY_INVESTOR, at: "2026-11-11" }, sideLetters: [] };
    case "profileUploadStateFn": return [];
    case "fundingInstructionsFn": {
      if (!j.approvedToFund) return { unlocked: false, reasons: ["Funding opens once your subscription is accepted."] };
      return { unlocked: true, saved: null, instructions: { bankName: "First Fictional Bank", details: { account_name: QA_FUND_NAME, routing_number: "000000000", account_number: "••••0000" }, reference: "FABLEWOOD-ALDEN", expectedAmountCents: j.amountCents, warning: "Always confirm wire instructions by phone before sending. They will never change by email.", methods: [{ method: "wire", timeline: "Usually arrives the same business day." }] } };
    }
    case "investorReportsFundsSentFn": { j.reportedSent = { sentOn: data?.sentOn ?? null, amountCents: data?.amountCents ?? j.amountCents, sendingBank: data?.sendingBank ?? null }; return { ok: true }; }
    case "investorFundingLedgerFn": {
      const expected = j.amountCents ?? 0;
      const received = j.received ? expected : 0;
      const entries = [
        ...(j.reportedSent ? [{ id: "qa-ledger-reported", kind: "reported", label: "Wire reported by you", at: "2026-11-11T15:00:00Z", sentOn: j.reportedSent.sentOn, sendingBank: j.reportedSent.sendingBank, amountCents: j.reportedSent.amountCents }] : []),
        ...(j.received ? [{ id: "qa-ledger-received", kind: "received", label: "Wire received and matched", at: "2026-11-11T18:00:00Z", amountCents: expected }] : []),
      ];
      return { expectedCents: expected, receivedCents: received, remainingCents: expected - received, entries };
    }
    case "getDocumentsStep": return {
      offering: { id: QA_FUND_ID, name: QA_FUND_NAME, min_investment_cents: QA_JOURNEY_MINIMUM_CENTS },
      profile: { legal_name: j.profile?.name ?? QA_JOURNEY_INVESTOR },
      subscription: j.subscription,
      application: { documents_status: allSigned(j) ? "approved" : "pending" },
      documents: DOCS.filter((d) => d.requiresSignature).map((d) => ({ id: d.id, title: d.title, requires_signature: true, approvalLabel: "Approved by the fund manager" })),
      signatures: Object.entries(j.signatures).map(([docId, s]) => ({ ...s, offering_document_id: docId })),
    };
    case "saveSubscription": {
      const cents = Number(data?.commitment_cents ?? 0);
      if (!(cents > 0)) throw new Error("Enter your commitment.");
      j.subscription = { commitment_cents: cents, ownership_title: String(data?.ownership_title ?? ""), tax_classification: String(data?.tax_classification ?? "individual") };
      j.amountCents = cents;
      return { ok: true };
    }
    case "signDocument": {
      const docId = String(data?.offering_document_id ?? "");
      if (!DOCS.some((d) => d.id === docId && d.requiresSignature)) throw block("Only the fictional documents can be signed.");
      if (!j.subscription) throw new Error("Save your subscription particulars first.");
      j.signatures[docId] = { id: `qa-sig-${docId}`, signed_at: "2026-11-11T16:00:00Z", document_hash: "f1c7101a5a3b9e0d4c2b8a6f0e1d3c5b7a9f2e4d6c8b0a1f" };
      return { ok: true, allSigned: allSigned(j) };
    }
    case "getSigningStates": return { provider: "internal", documents: [] };
    case "readOfferingDocument": {
      const body = FICTIONAL_TEXT[String(data?.document_id ?? "")];
      if (!body) throw block("Only the fictional documents can be read.");
      return { kind: "text", body, url: null, filename: null };
    }
    case "recordStepView": return { ok: true };
    case "getFundScope": throw block("Fund service scope is not modeled in the sandbox.");
    case "getAccreditation": return { offering: { id: QA_FUND_ID, name: QA_FUND_NAME, reg_type: "506b" }, application: { kyc_status: j.identity === "missing" ? "not_started" : "approved" }, record: j.accreditation === "valid" ? { status: "approved" } : null, documents: [] };
    case "submitSelfCertification": {
      if (String(data?.attested_signature ?? "").trim().length < 2) throw new Error("Type your full legal name.");
      j.accreditation = "valid";
      return { ok: true };
    }
    case "getMyPortfolioValue": return { funds: j.submitted ? [{ offering_id: QA_FUND_ID, offering_name: QA_FUND_NAME, share_class: "Class A", reg_type: "506b", commitment_cents: j.amountCents, funded_cents: j.received ? j.amountCents : 0 }] : [] };
    case "getMyPersonalInvestmentLinks": return { links: [] };
    default: throw block(`Blocked in the fictional QA sandbox: ${fnName}`);
  }
}
