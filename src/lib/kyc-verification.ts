/**
 * KYC / AML normalisation rules (pure, no I/O).
 *
 * Didit is the identity-verification provider. Harmonious remains the
 * authoritative system: the provider decision is recorded separately from the
 * Harmonious compliance decision, every underlying check keeps its own result,
 * and nothing a browser sends can move a check forward.
 */

export type CheckStatus = "not_started" | "pending" | "review" | "approved" | "declined";

export const CHECK_KINDS = [
  "identity",
  "document",
  "liveness",
  "face_match",
  "address",
  "proof_of_address",
  "aml",
] as const;
export type CheckKind = (typeof CHECK_KINDS)[number];

export const EXPIRED_ID_MESSAGE =
  "Your identification document has expired. Please provide a current government-issued ID.";

/** Fields Harmonious may send to Didit as prefill. Nothing else ever leaves. */
export const ALLOWED_PREFILL_FIELDS = [
  "first_name",
  "last_name",
  "date_of_birth",
  "email",
  "phone",
  "address",
  "city",
  "state",
  "postal_code",
  "country",
] as const;
export type PrefillField = (typeof ALLOWED_PREFILL_FIELDS)[number];

const FORBIDDEN_PREFILL = /(ssn|tax_id|tin|password|token|secret|api[_-]?key|account_number|routing)/i;

export interface PersonForPrefill {
  legal_first_name?: string | null;
  legal_last_name?: string | null;
  date_of_birth?: string | null;
  email?: string | null;
  phone?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  region?: string | null;
  postal_code?: string | null;
  country?: string | null;
  [key: string]: unknown;
}

/**
 * Builds the prefill Harmonious already knows, so the person does not retype
 * it. Sensitive identifiers are never included, even if present on the record.
 */
export function buildDiditPrefill(person: PersonForPrefill | null | undefined): Partial<
  Record<PrefillField, string>
> {
  if (!person) return {};
  const line = [person.address_line1, person.address_line2].filter(Boolean).join(", ");
  const candidate: Partial<Record<PrefillField, unknown>> = {
    first_name: person.legal_first_name,
    last_name: person.legal_last_name,
    date_of_birth: person.date_of_birth,
    email: person.email,
    phone: person.phone,
    address: line || null,
    city: person.city,
    state: person.region,
    postal_code: person.postal_code,
    country: person.country ?? (person["residence_country"] as string | null | undefined),
  };

  const out: Partial<Record<PrefillField, string>> = {};
  for (const field of ALLOWED_PREFILL_FIELDS) {
    if (FORBIDDEN_PREFILL.test(field)) continue;
    const value = candidate[field];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) out[field] = trimmed;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Provider payload hygiene
// ---------------------------------------------------------------------------

const URLISH_KEY = /(url|image|photo|portrait|file|link|pdf|media)/i;
const TEMP_URL = /^https?:\/\//i;
const DOC_NUMBER_KEY = /(document_number|personal_number|id_number|licence_number|license_number|passport_number)/i;

/**
 * Removes temporary Didit document/media URLs and full document numbers before
 * anything is persisted. Document numbers are reduced to their last 4 digits.
 */
export function sanitizeProviderPayload(value: unknown, depth = 0): unknown {
  if (depth > 8) return null;
  if (typeof value === "string") return TEMP_URL.test(value.trim()) ? "[redacted-url]" : value;
  if (Array.isArray(value)) return value.map((item) => sanitizeProviderPayload(item, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (URLISH_KEY.test(key)) {
        if (typeof raw === "string" && TEMP_URL.test(raw)) continue;
      }
      if (DOC_NUMBER_KEY.test(key)) {
        out[key] = typeof raw === "string" && raw ? maskDocumentNumber(raw) : null;
        continue;
      }
      out[key] = sanitizeProviderPayload(raw, depth + 1);
    }
    return out;
  }
  return value ?? null;
}

export function maskDocumentNumber(value: string | null | undefined): string | null {
  const digits = String(value ?? "").replace(/\s+/g, "");
  if (!digits) return null;
  return `••••${digits.slice(-4)}`;
}

export function lastFour(value: string | null | undefined): string | null {
  const raw = String(value ?? "").replace(/\s+/g, "");
  return raw ? raw.slice(-4) : null;
}

/** True when the value contains a live provider URL that must never be shown. */
export function containsTemporaryUrl(value: unknown): boolean {
  const json = JSON.stringify(value ?? null);
  return /https?:\/\/[^"]*(didit|verification\.didit|amazonaws|blob\.core)/i.test(json ?? "");
}

// ---------------------------------------------------------------------------
// Normalising a Didit decision
// ---------------------------------------------------------------------------

export interface NormalizedDocument {
  status: CheckStatus;
  documentType: string | null;
  issuingCountry: string | null;
  issuingRegion: string | null;
  issueDate: string | null;
  expirationDate: string | null;
  numberLast4: string | null;
  verifiedName: string | null;
  dateOfBirth: string | null;
  warnings: string[];
}

export interface NormalizedAddress {
  status: CheckStatus;
  extracted: {
    line1: string | null;
    city: string | null;
    region: string | null;
    postalCode: string | null;
    country: string | null;
    formatted: string | null;
  } | null;
  documentType: string | null;
  issueDate: string | null;
  name: string | null;
  warnings: string[];
}

export interface NormalizedVerification {
  providerDecision: string | null;
  providerStatus: CheckStatus;
  sessionId: string | null;
  vendorData: string | null;
  document: NormalizedDocument;
  liveness: { status: CheckStatus; warnings: string[] };
  faceMatch: { status: CheckStatus; score: number | null; warnings: string[] };
  proofOfAddress: NormalizedAddress;
  aml: { status: CheckStatus; hitCount: number; warnings: string[] };
  warnings: string[];
}

function pick(source: any, keys: string[]): any {
  if (!source || typeof source !== "object") return undefined;
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function isoDate(value: unknown): string | null {
  const raw = str(value);
  if (!raw) return null;
  const direct = /^\d{4}-\d{2}-\d{2}$/.exec(raw);
  if (direct) return raw;
  const slash = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  if (slash) return `${slash[3]}-${slash[1]}-${slash[2]}`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

/** Maps any provider status string onto a closed Harmonious check status. */
export function providerStatusToCheck(value: unknown): CheckStatus {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "not_started";
  if (["approved", "success", "passed", "pass", "verified", "clear", "cleared", "match", "true"].includes(raw))
    return "approved";
  if (["declined", "failed", "fail", "rejected", "no_match", "false"].includes(raw)) return "declined";
  if (["in review", "in_review", "review", "warning", "manual_review", "attention"].includes(raw))
    return "review";
  if (["in progress", "in_progress", "pending", "processing", "resubmitted", "not started", "not_started"].includes(raw))
    return "pending";
  // Anything unrecognised is never treated as a pass.
  return "review";
}

function warningsOf(section: any): string[] {
  const list = section?.warnings;
  if (!Array.isArray(list)) return [];
  return list
    .map((w: any) => (typeof w === "string" ? w : (w?.short_description ?? w?.risk ?? w?.log_type)))
    .filter(Boolean)
    .map(String);
}

export function normalizeDiditDecision(decision: any): NormalizedVerification {
  const d = decision && typeof decision === "object" ? decision : {};
  const id = pick(d, ["id_verification", "id_document", "document_verification", "kyc"]) ?? {};
  const liveness = pick(d, ["liveness"]) ?? {};
  const face = pick(d, ["face_match", "facematch"]) ?? {};
  const poa = pick(d, ["poa", "proof_of_address", "address_verification"]) ?? {};
  const amlSection = pick(d, ["aml", "aml_screening"]) ?? {};
  const screenings = Array.isArray(d["aml_screenings"]) ? d["aml_screenings"] : [];

  const amlHits = [
    ...(Array.isArray(amlSection?.hits) ? amlSection.hits : []),
    ...screenings.flatMap((s: any) => (Array.isArray(s?.hits) ? s.hits : [])),
  ];
  const amlStatuses = [amlSection?.status, ...screenings.map((s: any) => s?.status)].filter(Boolean);
  let amlStatus: CheckStatus = amlStatuses.length
    ? amlStatuses.map(providerStatusToCheck).reduce(worst, "approved" as CheckStatus)
    : "not_started";
  if (amlStatus === "approved" && amlHits.length > 0) amlStatus = "review";

  const poaAddress = pick(poa, ["address", "extracted_address", "standardized_address"]);

  const document: NormalizedDocument = {
    status: providerStatusToCheck(pick(id, ["status", "result"])),
    documentType: str(pick(id, ["document_type", "type"])),
    issuingCountry: str(pick(id, ["issuing_state", "issuing_country", "issuing_state_name", "country"])),
    issuingRegion: str(pick(id, ["issuing_region", "issuing_state_name", "state"])),
    issueDate: isoDate(pick(id, ["date_of_issue", "issue_date", "issued_at"])),
    expirationDate: isoDate(pick(id, ["expiration_date", "date_of_expiry", "expiry_date", "expires_at"])),
    numberLast4: lastFour(str(pick(id, ["document_number", "personal_number", "id_number"]))),
    verifiedName: str(
      pick(id, ["full_name"]) ??
        [str(pick(id, ["first_name"])), str(pick(id, ["last_name"]))].filter(Boolean).join(" "),
    ),
    dateOfBirth: isoDate(pick(id, ["date_of_birth", "dob"])),
    warnings: warningsOf(id),
  };

  const proofOfAddress: NormalizedAddress = {
    status: providerStatusToCheck(pick(poa, ["status", "result"])),
    extracted: poaAddress
      ? {
          line1: str(pick(poaAddress, ["address_line1", "line1", "street", "address"])),
          city: str(pick(poaAddress, ["city", "locality"])),
          region: str(pick(poaAddress, ["state", "region", "province"])),
          postalCode: str(pick(poaAddress, ["postal_code", "zip", "zip_code"])),
          country: str(pick(poaAddress, ["country", "country_code"])),
          formatted: str(pick(poaAddress, ["formatted_address", "full_address", "formatted"])),
        }
      : null,
    documentType: str(pick(poa, ["document_type", "type"])),
    issueDate: isoDate(pick(poa, ["issue_date", "document_date", "date_of_issue"])),
    name: str(pick(poa, ["full_name", "name", "account_holder"])),
    warnings: warningsOf(poa),
  };

  const providerDecision = str(pick(d, ["status", "decision_status"]));

  return {
    providerDecision,
    providerStatus: providerStatusToCheck(providerDecision),
    sessionId: str(pick(d, ["session_id", "id"])),
    vendorData: str(pick(d, ["vendor_data"])),
    document,
    liveness: { status: providerStatusToCheck(pick(liveness, ["status"])), warnings: warningsOf(liveness) },
    faceMatch: {
      status: providerStatusToCheck(pick(face, ["status"])),
      score: typeof face?.score === "number" ? face.score : null,
      warnings: warningsOf(face),
    },
    proofOfAddress,
    aml: { status: amlStatus, hitCount: amlHits.length, warnings: warningsOf(amlSection) },
    warnings: collectAllWarnings(d),
  };
}

const SEVERITY: Record<CheckStatus, number> = {
  approved: 0,
  not_started: 1,
  pending: 2,
  review: 3,
  declined: 4,
};

/** The least favourable of two statuses. */
export function worst(a: CheckStatus, b: CheckStatus): CheckStatus {
  return SEVERITY[b] > SEVERITY[a] ? b : a;
}

export function collectAllWarnings(decision: any): string[] {
  if (!decision || typeof decision !== "object") return [];
  const out: string[] = [];
  const walk = (value: any, depth: number) => {
    if (depth > 6 || !value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }
    for (const [key, raw] of Object.entries(value)) {
      if (key === "warnings" && Array.isArray(raw)) {
        for (const w of raw) {
          const text = typeof w === "string" ? w : ((w as any)?.short_description ?? (w as any)?.risk);
          if (text) out.push(String(text));
        }
      } else walk(raw, depth + 1);
    }
  };
  walk(decision, 0);
  return [...new Set(out)];
}

// ---------------------------------------------------------------------------
// Document expiry
// ---------------------------------------------------------------------------

export interface ExpiryResult {
  expired: boolean;
  /** Message the person sees; empty when the document is current. */
  message: string | null;
  known: boolean;
}

/**
 * Compares the provider's authoritative expiration date against the date the
 * verification was performed. A browser-supplied date is never accepted here.
 */
export function evaluateDocumentExpiry(input: {
  expirationDate: string | null | undefined;
  verificationDate: string | Date;
}): ExpiryResult {
  const expiration = isoDate(input.expirationDate);
  if (!expiration) return { expired: false, message: null, known: false };
  const verifiedOn = isoDate(
    input.verificationDate instanceof Date
      ? input.verificationDate.toISOString().slice(0, 10)
      : input.verificationDate,
  );
  if (!verifiedOn) return { expired: false, message: null, known: false };
  const expired = expiration < verifiedOn;
  return { expired, message: expired ? EXPIRED_ID_MESSAGE : null, known: true };
}

// ---------------------------------------------------------------------------
// Name & address comparison
// ---------------------------------------------------------------------------

export type MatchResult = "match" | "partial" | "mismatch" | "unknown";

function tokens(value: string | null | undefined): string[] {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function compareNames(a: string | null | undefined, b: string | null | undefined): MatchResult {
  const left = tokens(a);
  const right = tokens(b);
  if (!left.length || !right.length) return "unknown";
  const leftSet = new Set(left);
  const shared = right.filter((t) => leftSet.has(t));
  if (shared.length === Math.max(left.length, right.length)) return "match";
  // Surname plus at least one given name in common is a partial (initials, middle names).
  if (shared.length >= 2) return "partial";
  return "mismatch";
}

export interface AddressParts {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

const STREET_ABBREV: Record<string, string> = {
  street: "st",
  avenue: "ave",
  road: "rd",
  drive: "dr",
  boulevard: "blvd",
  lane: "ln",
  court: "ct",
  suite: "ste",
  apartment: "apt",
  north: "n",
  south: "s",
  east: "e",
  west: "w",
};

function addressTokens(parts: AddressParts): string[] {
  const raw = [parts.line1, parts.line2].filter(Boolean).join(" ");
  return tokens(raw).map((t) => STREET_ABBREV[t] ?? t);
}

export function compareAddresses(a: AddressParts | null, b: AddressParts | null): MatchResult {
  if (!a || !b) return "unknown";
  const left = addressTokens(a);
  const right = addressTokens(b);
  if (!left.length || !right.length) return "unknown";

  const postalA = tokens(a.postalCode).join("");
  const postalB = tokens(b.postalCode).join("");
  const cityMatch = tokens(a.city).join(" ") === tokens(b.city).join(" ");
  const postalMatch = !!postalA && !!postalB && postalA.slice(0, 5) === postalB.slice(0, 5);

  const leftSet = new Set(left);
  const shared = right.filter((t) => leftSet.has(t));
  const overlap = shared.length / Math.max(left.length, right.length);

  if (overlap >= 0.9 && (postalMatch || cityMatch)) return "match";
  if (overlap >= 0.5 && (postalMatch || cityMatch)) return "partial";
  return "mismatch";
}

// ---------------------------------------------------------------------------
// Address verification state machine
// ---------------------------------------------------------------------------

export const ADDRESS_STATES = [
  "entered",
  "normalized",
  "validated",
  "proof_required",
  "proof_pending",
  "proof_verified",
  "review_required",
  "failed",
] as const;
export type AddressState = (typeof ADDRESS_STATES)[number];

export type AddressEvent =
  | { type: "manual_entry" }
  | { type: "provider_normalized" }
  | { type: "provider_validated" }
  | { type: "provider_unresolved" }
  | { type: "proof_required" }
  | { type: "proof_submitted" }
  | { type: "proof_verified"; match: MatchResult; nameMatch: MatchResult }
  | { type: "proof_failed" }
  | { type: "review" };

/**
 * Closed transition table. Nothing reaches a verified state without provider
 * evidence, and autocomplete alone never satisfies proof of residence.
 */
export function nextAddressState(current: AddressState, event: AddressEvent): AddressState {
  switch (event.type) {
    case "manual_entry":
      return "entered";
    case "provider_normalized":
      return current === "proof_verified" ? current : "normalized";
    case "provider_validated":
      return current === "proof_verified" ? current : "validated";
    case "provider_unresolved":
      return "review_required";
    case "proof_required":
      return "proof_required";
    case "proof_submitted":
      return "proof_pending";
    case "proof_verified":
      if (event.match === "match" && event.nameMatch !== "mismatch") return "proof_verified";
      return "review_required";
    case "proof_failed":
      return "failed";
    case "review":
      return "review_required";
    default:
      return current;
  }
}

/** States that constitute evidence of residence. Validation alone does not. */
export function isProofOfResidence(state: AddressState): boolean {
  return state === "proof_verified";
}

// ---------------------------------------------------------------------------
// Harmonious compliance decision
// ---------------------------------------------------------------------------

export interface HarmoniousInput {
  normalized: NormalizedVerification;
  verificationDate: string | Date;
  /** Harmonious policy: does this person need documented proof of residence? */
  proofOfAddressRequired: boolean;
  /** Harmonious address on file, used for the provider comparison. */
  addressOnFile?: AddressParts | null;
  /** Legal name Harmonious holds for the person. */
  legalName?: string | null;
  /** An active compliance hold can never be cleared by a provider approval. */
  holdActive?: boolean;
}

export interface CheckOutcome {
  kind: CheckKind;
  providerStatus: string | null;
  harmoniousStatus: CheckStatus;
  warnings: string[];
  detail: Record<string, unknown>;
}

export interface HarmoniousDecision {
  /** Untouched provider verdict; never conflated with the Harmonious one. */
  providerDecision: string | null;
  kyc: CheckStatus;
  aml: CheckStatus;
  reasons: string[];
  /** Message safe to show the person. */
  investorMessage: string | null;
  documentExpired: boolean;
  checks: CheckOutcome[];
  reviewRequired: boolean;
}

/**
 * Turns normalised provider results into the Harmonious decision. The provider
 * result is an input, never the conclusion: an expired document, a warning, a
 * name/address mismatch or an active hold each prevent a current verification.
 */
export function evaluateHarmoniousDecision(input: HarmoniousInput): HarmoniousDecision {
  const n = input.normalized;
  const reasons: string[] = [];
  const checks: CheckOutcome[] = [];

  const expiry = evaluateDocumentExpiry({
    expirationDate: n.document.expirationDate,
    verificationDate: input.verificationDate,
  });

  // Government ID -----------------------------------------------------------
  let documentStatus = n.document.status;
  if (!n.document.documentType && documentStatus === "approved") {
    documentStatus = "review";
    reasons.push("No government-issued identity document was returned.");
  }
  if (expiry.expired) {
    documentStatus = "review";
    reasons.push("Identity document expired before the verification date.");
  }
  if (n.document.warnings.length) documentStatus = worst(documentStatus, "review");

  checks.push({
    kind: "document",
    providerStatus: n.document.status,
    harmoniousStatus: documentStatus,
    warnings: n.document.warnings,
    detail: {
      documentType: n.document.documentType,
      issuingCountry: n.document.issuingCountry,
      issuingRegion: n.document.issuingRegion,
      issueDate: n.document.issueDate,
      expirationDate: n.document.expirationDate,
      numberLast4: n.document.numberLast4,
      expired: expiry.expired,
    },
  });

  // Liveness and face match --------------------------------------------------
  checks.push({
    kind: "liveness",
    providerStatus: n.liveness.status,
    harmoniousStatus: n.liveness.warnings.length ? worst(n.liveness.status, "review") : n.liveness.status,
    warnings: n.liveness.warnings,
    detail: {},
  });
  checks.push({
    kind: "face_match",
    providerStatus: n.faceMatch.status,
    harmoniousStatus: n.faceMatch.warnings.length
      ? worst(n.faceMatch.status, "review")
      : n.faceMatch.status,
    warnings: n.faceMatch.warnings,
    detail: { score: n.faceMatch.score },
  });

  // Identity (name / DOB against the Harmonious record) ----------------------
  const nameMatch = compareNames(input.legalName, n.document.verifiedName);
  let identityStatus: CheckStatus = documentStatus === "approved" ? "approved" : documentStatus;
  if (nameMatch === "mismatch") {
    identityStatus = worst(identityStatus, "review");
    reasons.push("Verified name does not match the name on file.");
  }
  checks.push({
    kind: "identity",
    providerStatus: n.providerDecision,
    harmoniousStatus: identityStatus,
    warnings: [],
    detail: {
      verifiedName: n.document.verifiedName,
      nameMatch,
      dateOfBirthOnFile: !!n.document.dateOfBirth,
    },
  });

  // Address and proof of address ---------------------------------------------
  const addressMatch = compareAddresses(
    input.addressOnFile ?? null,
    n.proofOfAddress.extracted
      ? {
          line1: n.proofOfAddress.extracted.line1,
          city: n.proofOfAddress.extracted.city,
          region: n.proofOfAddress.extracted.region,
          postalCode: n.proofOfAddress.extracted.postalCode,
          country: n.proofOfAddress.extracted.country,
        }
      : null,
  );
  const poaNameMatch = compareNames(input.legalName, n.proofOfAddress.name);

  let poaStatus: CheckStatus = n.proofOfAddress.status;
  if (input.proofOfAddressRequired) {
    if (poaStatus === "not_started") {
      poaStatus = "pending";
      reasons.push("Proof of residential address is required.");
    } else if (poaStatus === "approved") {
      if (addressMatch === "mismatch" || poaNameMatch === "mismatch") {
        poaStatus = "review";
        reasons.push("Proof-of-address details do not match the address or name on file.");
      } else if (n.proofOfAddress.warnings.length) {
        poaStatus = "review";
      }
    }
  }
  checks.push({
    kind: "proof_of_address",
    providerStatus: n.proofOfAddress.status,
    harmoniousStatus: poaStatus,
    warnings: n.proofOfAddress.warnings,
    detail: {
      documentType: n.proofOfAddress.documentType,
      issueDate: n.proofOfAddress.issueDate,
      addressMatch,
      nameMatch: poaNameMatch,
      extracted: n.proofOfAddress.extracted,
    },
  });
  checks.push({
    kind: "address",
    providerStatus: n.proofOfAddress.extracted ? "extracted" : null,
    harmoniousStatus:
      input.proofOfAddressRequired && poaStatus !== "approved"
        ? worst("pending", poaStatus)
        : n.proofOfAddress.extracted
          ? "approved"
          : "not_started",
    warnings: [],
    detail: { addressMatch },
  });

  // AML — always kept separate from identity verification --------------------
  let amlStatus = n.aml.status;
  if (amlStatus === "approved" && n.aml.warnings.length) amlStatus = "review";
  checks.push({
    kind: "aml",
    providerStatus: n.aml.status,
    harmoniousStatus: amlStatus,
    warnings: n.aml.warnings,
    detail: { hitCount: n.aml.hitCount },
  });

  // Overall KYC (identity side only; AML stands on its own) ------------------
  let kyc = [documentStatus, identityStatus, n.liveness.status, n.faceMatch.status].reduce(
    worst,
    "approved" as CheckStatus,
  );
  if (input.proofOfAddressRequired) kyc = worst(kyc, poaStatus === "approved" ? "approved" : poaStatus);
  if (n.providerStatus === "declined") kyc = "declined";
  if (n.providerStatus === "pending" || n.providerStatus === "not_started") kyc = worst(kyc, "pending");
  if (n.warnings.length) kyc = worst(kyc, "review");

  if (input.holdActive) {
    // A provider approval can never release a Harmonious compliance hold.
    kyc = worst(kyc, "review");
    amlStatus = worst(amlStatus, "review");
    reasons.push("A Harmonious compliance hold is active on this person.");
  }

  const investorMessage = expiry.expired
    ? EXPIRED_ID_MESSAGE
    : kyc === "review"
      ? "We need to take another look at your verification. We'll be in touch if anything is needed."
      : kyc === "declined"
        ? "We couldn't verify your identity. Please contact your Harmonious representative."
        : null;

  return {
    providerDecision: n.providerDecision,
    kyc,
    aml: amlStatus,
    reasons,
    investorMessage,
    documentExpired: expiry.expired,
    checks,
    reviewRequired: kyc === "review" || amlStatus === "review",
  };
}

// ---------------------------------------------------------------------------
// Audience-safe views
// ---------------------------------------------------------------------------

export type Audience = "investor" | "manager" | "operations" | "compliance";

export interface VerificationView {
  document?: Record<string, unknown>;
  [key: string]: unknown;
}

const INTERNAL_ONLY = /(risk_score|risk|investigation|internal_note|reviewer_note|raw|payload|decision|result)/i;

/**
 * Trims a verification view to what the audience may see. Full document
 * numbers and provider media URLs never appear for any audience.
 */
export function redactVerificationView(view: VerificationView, audience: Audience): VerificationView {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(view)) {
    if (DOC_NUMBER_KEY.test(key) && !/last4/i.test(key)) continue;
    if (URLISH_KEY.test(key) && typeof value === "string" && TEMP_URL.test(value)) continue;
    if (audience !== "compliance" && INTERNAL_ONLY.test(key)) continue;
    if (audience === "investor" && /warning|reason|matches|hit/i.test(key)) continue;
    out[key] = value;
  }
  return out;
}

/** Who may write verification results. Investors and managers never can. */
export function canWriteVerificationResults(roles: readonly string[]): boolean {
  return false || roles.includes("__provider_webhook__");
}

/** The investor-facing progression. No risk scores, no investigation notes. */
export interface InvestorStep {
  id: "identity" | "government_id" | "face" | "address" | "aml";
  title: string;
  status: "waiting" | "in_progress" | "action_required" | "complete";
  message: string | null;
}

export function investorProgress(input: {
  decision: HarmoniousDecision | null;
  started: boolean;
}): { steps: InvestorStep[]; summary: string } {
  const byKind = new Map<CheckKind, CheckOutcome>();
  for (const check of input.decision?.checks ?? []) byKind.set(check.kind, check);

  const stateOf = (kind: CheckKind): InvestorStep["status"] => {
    const status = byKind.get(kind)?.harmoniousStatus;
    if (!input.started || !status || status === "not_started") return "waiting";
    if (status === "approved") return "complete";
    if (status === "pending") return "in_progress";
    return "action_required";
  };

  const steps: InvestorStep[] = [
    { id: "identity", title: "Identity", status: stateOf("identity"), message: null },
    { id: "government_id", title: "Government ID", status: stateOf("document"), message: null },
    { id: "face", title: "Face verification", status: stateOf("face_match"), message: null },
    { id: "address", title: "Residential address", status: stateOf("proof_of_address"), message: null },
    { id: "aml", title: "AML screening", status: stateOf("aml"), message: null },
  ];

  if (input.decision?.documentExpired) {
    const idStep = steps.find((s) => s.id === "government_id");
    if (idStep) {
      idStep.status = "action_required";
      idStep.message = EXPIRED_ID_MESSAGE;
    }
  }

  const summary =
    input.decision && input.decision.kyc === "approved" && input.decision.aml === "approved"
      ? "Verification complete"
      : steps.some((s) => s.status === "action_required")
        ? "Additional information required"
        : input.started
          ? "Verification in progress"
          : "Verification not started";

  return { steps, summary };
}
