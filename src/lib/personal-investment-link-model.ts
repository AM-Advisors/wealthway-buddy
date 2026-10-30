/** Who may do what with an investor's personal link. Replacing/disabling stays Harmonious-only via existing staff tools. */
export function personalLinkStatus(link: { state: string; lastSentAt: string | null } | null) {
  if (!link) return { label: "Not invited", usable: false };
  if (link.state === "disabled") return { label: "Link disabled", usable: false };
  if (link.state === "expired") return { label: "Link expired", usable: false };
  if (link.state === "claimed") return { label: "Invite accepted", usable: true };
  return { label: link.lastSentAt ? "Invite sent" : "Link ready, not emailed", usable: true };
}

export function personalLinkPermissions(input: { isInvestor: boolean; hasLink: boolean; linkActive: boolean; hasEmail: boolean }) {
  return {
    canCreate: !input.isInvestor && !input.hasLink && input.hasEmail,
    canSend: !input.isInvestor && input.hasLink && input.linkActive,
    canReplace: false,
  };
}
