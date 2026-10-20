export type ParticipantRole = "preparer" | "signer";
export type AssignerRole = "harmonious" | "manager" | "investor";

export function participantRoleLabel(role: string) {
  return role === "preparer" ? "Prepares details" : role === "signer" ? "Signs for the investor" : role;
}
/** Harmonious, the fund's managers and the investor may assign or remove helpers. */
export function canAssignParticipant(role: AssignerRole | null | undefined) {
  return role === "harmonious" || role === "manager" || role === "investor";
}
/** What an assigned preparer can do. Verification, signing and funding are never theirs. */
export const PREPARER_CAN = { enterDetails: true, ownersAndSigners: true, uploadDocuments: true, passVerification: false, sign: false, approveFunding: false, changeAmount: false } as const;
