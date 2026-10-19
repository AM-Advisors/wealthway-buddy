/** Who may do what with an investor's personal link. Replacing/disabling stays Harmonious-only via existing staff tools. */
export function personalLinkPermissions(input: { isInvestor: boolean; hasLink: boolean; linkActive: boolean; hasEmail: boolean }) {
  return {
    canCreate: !input.isInvestor && !input.hasLink && input.hasEmail,
    canSend: !input.isInvestor && input.hasLink && input.linkActive,
    canReplace: false,
  };
}
