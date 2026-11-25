export type ParticipantRole = "preparer" | "signer" | "contact";
export type AssignerRole = "harmonious" | "manager" | "investor";

export function participantRoleLabel(role: string) {
  return role === "preparer" ? "Prepares details" : role === "signer" ? "Signs for the investor" : role === "contact" ? "Point of contact (view only)" : role;
}
/** Harmonious, the fund's managers and the investor may assign or remove helpers. */
export function canAssignParticipant(role: AssignerRole | null | undefined) {
  return role === "harmonious" || role === "manager" || role === "investor";
}
/** Extra points of contact are only for investments held by more than one person or by an entity. */
export function allowsMultipleContacts(profileType: string | null | undefined) {
  const t = String(profileType ?? "");
  return t !== "" && t !== "individual" && t !== "ira" && t !== "retirement_plan";
}
/** What an assigned preparer can do. Verification, signing and funding are never theirs. */
export const PREPARER_CAN = { enterDetails: true, ownersAndSigners: true, uploadDocuments: true, passVerification: false, sign: false, approveFunding: false, changeAmount: false } as const;
/** Points of contact only view. */
export const CONTACT_CAN = { view: true, enterDetails: false, sign: false, approveFunding: false, changeAmount: false } as const;
/**
 * A trustee, owner or signer listed on a trust/entity investment may fill in its paperwork
 * even when someone else is also assigned "Prepares details". Verification, signing and money stay unchanged.
 */
export function participantCanPrepare(input: { role: string; profileType: string | null | undefined; listedOnInvestment: boolean }) {
  if (input.role === "preparer") return true;
  return input.role === "contact" && input.listedOnInvestment && allowsMultipleContacts(input.profileType) && String(input.profileType) !== "joint";
}
