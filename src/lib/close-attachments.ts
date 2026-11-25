/** Presence and explicit uploader confirmation, never signature authenticity or bank approval. */
export function missingCloseAttachments(input: { hasPurchaseAgreement: boolean; purchaseAgreementSigned: boolean; hasWireInstructions: boolean }): string[] {
  const missing: string[] = [];
  if (!input.hasPurchaseAgreement) missing.push("Upload the signed purchase agreement.");
  else if (!input.purchaseAgreementSigned) missing.push("Confirm the purchase agreement copy is signed.");
  if (!input.hasWireInstructions) missing.push("Upload a copy of the wire instructions.");
  return missing;
}