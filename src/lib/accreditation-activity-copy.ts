import { PROFESSIONAL_ROLES, type ProfessionalRole } from "@/lib/accreditation-evidence-options";

/**
 * Per-event accreditation activity told to the fund's managers: each proof upload,
 * each verification-letter request and each letter a professional uploads.
 * Copy carries names and file names only, never amounts or tax data.
 */
export type AccreditationActivity =
  | { kind: "evidence_uploaded"; fileName: string; docKind: string; documentId: string | null }
  | { kind: "professional_request_sent"; professionalName: string; professionalRole: string; requestId: string; resent: boolean }
  | { kind: "professional_letter_uploaded"; professionalName: string; documentId: string | null; requestId: string };

export function roleLabel(role: string): string {
  return PROFESSIONAL_ROLES[role as ProfessionalRole] ?? "Professional";
}

export function accreditationActivityCopy(
  event: AccreditationActivity,
  investorName: string,
  fundName: string,
): { headline: string; intro: string; details: { label: string; value: string }[] } {
  const base = [{ label: "Investor", value: investorName }];
  switch (event.kind) {
    case "evidence_uploaded":
      return {
        headline: `Accreditation proof uploaded · ${fundName}`,
        intro: `${investorName} uploaded accreditation proof for ${fundName}. It is waiting for review under Approvals.`,
        details: [...base, { label: "File", value: event.fileName }],
      };
    case "professional_request_sent": {
      const role = roleLabel(event.professionalRole);
      return {
        headline: `Verification letter requested · ${fundName}`,
        intro: `${investorName} asked ${event.professionalName} (${role.toLowerCase()}) to upload an accreditation verification letter for ${fundName}.${event.resent ? " The upload link was sent again." : ""}`,
        details: [...base, { label: "Professional", value: event.professionalName }, { label: "Role", value: role }],
      };
    }
    case "professional_letter_uploaded":
      return {
        headline: `Verification letter received · ${fundName}`,
        intro: `${event.professionalName} uploaded an accreditation verification letter for ${investorName} on ${fundName}. It is waiting for review under Approvals.`,
        details: [...base, { label: "Professional", value: event.professionalName }],
      };
  }
}

/** Stable per-event reference so retries never notify twice for the same upload or request. */
export function accreditationActivityRef(event: AccreditationActivity): string {
  switch (event.kind) {
    case "evidence_uploaded":
      return `accreditation:evidence:${event.documentId ?? event.fileName}`;
    case "professional_request_sent":
      return `accreditation:request:${event.requestId}:${event.resent ? "resent" : "sent"}`;
    case "professional_letter_uploaded":
      return `accreditation:letter:${event.requestId}`;
  }
}
