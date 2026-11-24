/** Pure labels for the people on one investment. */
export type PartyAccess = "investor" | "helper" | "view_only" | "none";

export function partyAccess(i: { isInvestorLogin: boolean; participantRoles: string[] }): PartyAccess {
  if (i.isInvestorLogin) return "investor";
  if (i.participantRoles.includes("preparer")) return "helper";
  if (i.participantRoles.includes("contact") || i.participantRoles.includes("signer")) return "view_only";
  return "none";
}

export const ACCESS_LABELS: Record<PartyAccess, string> = {
  investor: "Investor (full)", helper: "Helper (fills details)", view_only: "View and sign own documents", none: "No access yet",
};

export type NextAction = "invite" | "id_check" | "sign" | null;
export function partyNextAction(p: { email: string | null; hasLogin: boolean; access: PartyAccess; kycApproved: boolean; unsignedCount: number }): NextAction {
  if (p.email && !p.hasLogin && p.access === "none") return "invite";
  if (!p.kycApproved) return "id_check";
  if (p.unsignedCount > 0) return "sign";
  return null;
}
