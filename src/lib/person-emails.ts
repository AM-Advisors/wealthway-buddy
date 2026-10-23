/**
 * Secondary email for a person: an extra address (e.g. a personal email) that
 * receives copies of that person's informational Harmonious emails — signing
 * requests, signing reminders, document sends and identity-check links.
 *
 * Security boundary: account credentials, one-time codes, invitations and
 * password resets NEVER go to the secondary address — the primary login email
 * is the only address that can receive anything that grants access.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CleanedSecondary =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

/** Validates and normalizes a secondary email. Empty clears it. */
export function cleanSecondaryEmail(
  primary: string | null | undefined,
  secondary: string | null | undefined,
): CleanedSecondary {
  const s = (secondary ?? "").trim().toLowerCase();
  if (!s) return { ok: true, value: null };
  if (!EMAIL_RE.test(s)) return { ok: false, error: "That secondary email doesn't look like an email address." };
  const p = (primary ?? "").trim().toLowerCase();
  if (p && s === p) return { ok: false, error: "The secondary email must be different from the main email." };
  return { ok: true, value: s };
}
