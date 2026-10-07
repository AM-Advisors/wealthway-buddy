/** Specific document details for imported Drive files (client-safe). */
export const FUND_DOCUMENT_KINDS = {
  subscription_agreement: "Subscription Agreement",
  lp_agreement: "LP Agreement",
  operating_agreement: "Operating Agreement",
  ppm: "PPM",
  nda: "NDA",
  other: "Other",
} as const;

export const SIGNATURE_STATUSES = {
  signed_by_investor: "Signed by investor",
  signed_all_parties: "Signed by all parties",
  no_signature: "No signature required",
  template: "Template",
} as const;

export const TAX_FORMS = {
  "1099": "1099",
  "1065": "1065",
  investor_k1: "Investor K-1",
} as const;

export const SIGNER_ROLES = { investor: "Investor", manager: "Fund manager", harmonious: "Harmonious" } as const;

export type SignatureBox = { role: keyof typeof SIGNER_ROLES; label: string; page: number; dateField: boolean };

/** Suggested boxes for a subscription agreement template. */
export const SUGGESTED_SUBSCRIPTION_BOXES: SignatureBox[] = [
  { role: "investor", label: "Investor signature", page: 1, dateField: true },
  { role: "manager", label: "Fund manager acceptance", page: 1, dateField: true },
];

export type DocumentDetails = {
  group: "fund_document" | "tax_deliverable";
  kind: string;
  otherName: string | null;
  signatureStatus: keyof typeof SIGNATURE_STATUSES | null;
  signatureBoxes: SignatureBox[];
  sharedProfileId: string | null;
};

export function detailsLabel(d: Pick<DocumentDetails, "group" | "kind" | "otherName">): string {
  if (d.group === "tax_deliverable") return `Tax: ${(TAX_FORMS as Record<string, string>)[d.kind] ?? d.kind}`;
  if (d.kind === "other") return d.otherName || "Other fund document";
  return (FUND_DOCUMENT_KINDS as Record<string, string>)[d.kind] ?? d.kind;
}

/** Problems that block saving. */
export function detailsProblems(d: DocumentDetails): string[] {
  const p: string[] = [];
  if (d.group === "fund_document") {
    if (!(d.kind in FUND_DOCUMENT_KINDS)) p.push("Choose a document type.");
    if (d.kind === "other" && !d.otherName?.trim()) p.push("Name the document.");
    if (d.kind === "subscription_agreement" && !d.signatureStatus) p.push("Mark the signature status.");
    if (d.signatureStatus === "template" && !d.signatureBoxes.length) p.push("Add at least one signature box to the template.");
    if (d.signatureStatus === "signed_by_investor" && !d.sharedProfileId) p.push("Choose which investor signed it.");
  } else {
    if (!(d.kind in TAX_FORMS)) p.push("Choose the tax form.");
    if (d.kind === "investor_k1" && !d.sharedProfileId) p.push("Choose the investor this K-1 belongs to.");
  }
  return p;
}
