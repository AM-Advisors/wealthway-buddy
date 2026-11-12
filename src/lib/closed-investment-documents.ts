/**
 * How a fund document reads to an investor whose investment is already closed. Nothing is
 * offered for signing: a closed investment is never sent back through the signing wizard.
 * A document counts as signed only from a recorded platform signature, an executed signing
 * record, or a completed outside-signature record for the Subscription Agreement; anything else
 * that asked for a signature says plainly that none is on file here.
 */
import { outsideSignedLabel } from "@/lib/outside-subscription-document";

export type ClosedDocumentStatus = "signed" | "signed_outside" | "no_signature_on_file" | "reference";

export function closedDocumentStatus(input: {
  requiresSignature: boolean;
  platformSignedAt: string | null;
  executed: boolean;
  outsideSignedOn: string | null;
}): ClosedDocumentStatus {
  if (input.platformSignedAt || input.executed) return "signed";
  if (input.outsideSignedOn != null) return "signed_outside";
  return input.requiresSignature ? "no_signature_on_file" : "reference";
}

export const CLOSED_STATUS_BADGE: Record<ClosedDocumentStatus, string> = {
  signed: "Signed",
  signed_outside: "Signed",
  no_signature_on_file: "No signature on file",
  reference: "For your records",
};

export function closedDocumentDetail(status: ClosedDocumentStatus, input: { platformSignedAt: string | null; outsideSignedOn: string | null }) {
  switch (status) {
    case "signed":
      return input.platformSignedAt
        ? `Signed ${new Date(input.platformSignedAt).toLocaleDateString("en-US", { dateStyle: "medium" })}`
        : "Signed";
    case "signed_outside":
      return `${outsideSignedLabel(input.outsideSignedOn ?? "")}. Your signed copy is on file with the fund.`;
    case "no_signature_on_file":
      return "Not signed here. Your investment is already closed, so there is nothing to sign on this page. The fund will contact you if it needs anything else.";
    case "reference":
      return "For your records. No signature needed.";
  }
}
