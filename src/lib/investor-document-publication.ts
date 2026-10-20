import { type DocumentUsage, type SigningConfigStatus, type VersionApproval } from "./offering-document-model";

/** Fund publication is distinct from an investor's admission and signature. */
export function investorDocumentPublication(input: {
  published: boolean;
  approval: VersionApproval | null;
  usage: DocumentUsage | null;
  requiresSignature: boolean;
  signingStatus: SigningConfigStatus | null;
}) {
  const approved = input.approval === "approved" || (input.published && input.approval === "superseded");
  const signature = input.usage ? input.usage === "signature" : input.requiresSignature;
  const ready = input.published && approved && (!signature || input.signingStatus === "confirmed");
  return {
    approved,
    ready,
    label: ready ? signature ? "Approved · Ready to sign" : "Approved · Ready to review"
      : approved ? !input.published ? "Approved · Not yet in use" : "Approved · Signing setup pending"
      : "Awaiting document approval",
  };
}