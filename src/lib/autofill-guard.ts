/**
 * Password managers (LastPass, 1Password, Bitwarden, Dashlane) scan and decorate
 * every text box they find. On long record pages that rescanning can move focus
 * or the scroll position while someone types. Data-entry boxes tell them to stay
 * out; boxes that explicitly ask for browser autofill (sign-in email, passwords,
 * one-time codes, an investor's own name or address) keep it.
 */
export const AUTOFILL_IGNORE_ATTRS = {
  "data-lpignore": "true",
  "data-1p-ignore": "true",
  "data-bwignore": "true",
  "data-form-type": "other",
} as const;

export function autofillGuardProps(type: string | undefined, autoComplete: string | undefined): Record<string, string> {
  if (type === "password") return {};
  const requested = autoComplete?.trim().toLowerCase();
  if (requested && requested !== "off") return {};
  return { ...AUTOFILL_IGNORE_ATTRS, autoComplete: "off" };
}
