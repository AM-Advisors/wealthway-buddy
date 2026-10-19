export const MAX_SHARE_DAYS = 30;
export type ShareLinkRow = { expires_at: string; revoked_at: string | null };
export function shareLinkState(link: ShareLinkRow | null, now = new Date()): 'active' | 'expired' | 'revoked' | 'missing' {
  if (!link) return 'missing'; if (link.revoked_at) return 'revoked'; return new Date(link.expires_at) <= now ? 'expired' : 'active';
}
/** Investor risk assessments are private and never shareable; only published cards may be shared. */
export function shareRefusal(input: { kind: string; published: boolean; days: number }) {
  if (input.kind === 'investor') return 'Investor risk assessments are private and cannot be shared.';
  if (!input.published) return 'Only a published report card can be shared.';
  if (input.days < 1 || input.days > MAX_SHARE_DAYS) return `Links can last 1 to ${MAX_SHARE_DAYS} days.`;
  return null;
}
