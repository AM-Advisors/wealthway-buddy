/**
 * Pure rules for the government ID copy that backs a KYC submission.
 * Browser checks use these for guidance; the server repeats every check.
 */
export type IdDocumentType = "passport" | "drivers_license" | "state_id";
export type IdSide = "front" | "back" | "passport_page";

export const ID_SIDE_LABELS: Record<IdSide, string> = {
  front: "Front of ID",
  back: "Back of ID",
  passport_page: "Photo / identification page",
};

export const ID_ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png"] as const;
export const ID_MAX_BYTES = 10 * 1024 * 1024;

export function requiredSides(type: string): IdSide[] {
  return type === "passport" ? ["passport_page"] : ["front", "back"];
}

export function isAllowedIdFile(mime: string, size: number, fileName: string): string | null {
  if (!(ID_ALLOWED_MIME as readonly string[]).includes(mime)) return "Use a PDF, JPG, JPEG or PNG file.";
  if (!/\.(pdf|jpe?g|png)$/i.test(fileName)) return "Use a PDF, JPG, JPEG or PNG file.";
  if (size <= 0 || size > ID_MAX_BYTES) return "The file must be smaller than 10 MB.";
  return null;
}

export function extensionFor(mime: string): string {
  return mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : "jpg";
}

export type IdUpload = {
  id: string;
  side: string;
  documentType: string;
  status: string;
  userId: string;
  applicationId: string;
};

/** Authoritative document captured by the identity provider for this same check. */
export type ProviderIdEvidence = {
  provider: string | null;
  documentType: string | null;
  status: string | null;
  documentExpired: boolean | null;
};

const PROVIDER_ACCEPTED = new Set(["approved", "verified", "completed"]);

/** Didit's captured ID can stand in for an upload only when it is a completed, unexpired capture. */
export function providerSatisfiesId(evidence: ProviderIdEvidence | null | undefined): boolean {
  if (!evidence) return false;
  return (
    (evidence.provider ?? "").toLowerCase() === "didit" &&
    Boolean(evidence.documentType) &&
    PROVIDER_ACCEPTED.has((evidence.status ?? "").toLowerCase()) &&
    evidence.documentExpired !== true
  );
}

export function isExpired(expiration: string, today: Date = new Date()): boolean {
  const d = new Date(`${expiration}T23:59:59Z`);
  if (Number.isNaN(d.getTime())) return true;
  return d.getTime() < today.getTime();
}

export type IdEvidenceInput = {
  documentType: string;
  documentNumber: string;
  issuingCountry: string;
  expiration: string;
  uploads: IdUpload[];
  provider?: ProviderIdEvidence | null;
  userId: string;
  applicationId: string;
  today?: Date;
};

export type IdEvidenceResult = {
  ok: boolean;
  satisfiedBy: "upload" | "provider" | null;
  missingSides: IdSide[];
  errors: string[];
};

export function evaluateIdEvidence(input: IdEvidenceInput): IdEvidenceResult {
  const errors: string[] = [];
  if (!["passport", "drivers_license", "state_id"].includes(input.documentType)) errors.push("Document type is required.");
  if (input.documentNumber.trim().length < 4) errors.push("Document number is required.");
  if (input.issuingCountry.trim().length < 2) errors.push("Issuing country is required.");
  if (!input.expiration.trim()) errors.push("Expiration date is required.");
  else if (isExpired(input.expiration, input.today)) errors.push("This ID has expired. Please use a current ID.");

  if (providerSatisfiesId(input.provider)) {
    return { ok: errors.length === 0, satisfiedBy: "provider", missingSides: [], errors };
  }

  // Only uploads owned by this person, for this check and this document type, count.
  const mine = input.uploads.filter(
    (u) =>
      u.status === "active" &&
      u.userId === input.userId &&
      u.applicationId === input.applicationId &&
      u.documentType === input.documentType,
  );
  const missingSides = requiredSides(input.documentType).filter((s) => !mine.some((u) => u.side === s));
  for (const s of missingSides) errors.push(`${ID_SIDE_LABELS[s]} is required.`);
  return { ok: errors.length === 0, satisfiedBy: missingSides.length ? null : "upload", missingSides, errors };
}

/** Replacing material identity evidence after a decision reopens review. */
export function statusAfterReplacement(current: string | null | undefined): string | null {
  const s = (current ?? "").toLowerCase();
  return s === "approved" || s === "verified" || s === "completed" || s === "declined" ? "review" : null;
}

/**
 * Only Harmonious staff holding the onboarding review capability may open an ID
 * copy. Fund-manager, professional and investor-access facts never grant it.
 */
export function canReviewGovernmentId(capabilities: readonly string[]): boolean {
  return capabilities.includes("onboarding:review");
}

export function canInvestorOpen(upload: { userId: string }, callerId: string): boolean {
  return upload.userId === callerId;
}

export function maskDocumentNumber(last4: string | null | undefined): string {
  return last4 ? `•••• ${last4}` : "Not provided";
}
