import { describe, expect, it } from "vitest";
import { missingCloseAttachments } from "./close-attachments";
describe("required close paperwork", () => {
  it("requires an uploaded purchase agreement even when marked signed", () => {
    expect(missingCloseAttachments({ hasPurchaseAgreement: false, purchaseAgreementSigned: true, hasWireInstructions: true })).toEqual(["Upload the signed purchase agreement."]);
  });
  it("requires explicit signed-copy confirmation for an uploaded purchase agreement", () => {
    expect(missingCloseAttachments({ hasPurchaseAgreement: true, purchaseAgreementSigned: false, hasWireInstructions: true })).toEqual(["Confirm the purchase agreement copy is signed."]);
  });
  it("requires a separate uploaded wire instructions copy", () => {
    expect(missingCloseAttachments({ hasPurchaseAgreement: true, purchaseAgreementSigned: true, hasWireInstructions: false })).toEqual(["Upload a copy of the wire instructions."]);
  });
  it("allows the attachment gate only with both copies and signed-copy confirmation", () => {
    expect(missingCloseAttachments({ hasPurchaseAgreement: true, purchaseAgreementSigned: true, hasWireInstructions: true })).toEqual([]);
  });
});