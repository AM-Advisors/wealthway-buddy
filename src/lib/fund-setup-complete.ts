/** Pure completeness rules for the simplified Fund Setup boxes. */
export const EIN_RE = /^\d{2}-?\d{7}$/;
export const ROUTING_RE = /^\d{9}$/;

export function formatEin(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, 9);
  return d.length > 2 ? `${d.slice(0, 2)}-${d.slice(2)}` : d;
}

/** EIN box is complete once an EIN is on file and the IRS letter is uploaded. */
export function einComplete(input: { status: string | null | undefined; hasLetter: boolean; hasSignedW9?: boolean }) {
  return input.status === "recorded" && (input.hasLetter || input.hasSignedW9 === true);
}

/** Banking box is complete with a bank name and an account on file; the bank letter is optional. */
export function bankComplete(input: { bankName?: string | null | undefined; accountMasked?: string | null | undefined; hasLetter?: boolean }) {
  return !!input.bankName?.trim() && !!input.accountMasked?.replace(/\D/g, "").length;
}

/** Staff bank entry: both numbers typed twice and matching; routing is 9 digits. */
export function validateBankEntry(v: { bankName: string; accountName: string; account: string; account2: string; routing: string; routing2: string }): string | null {
  if (!v.bankName.trim()) return "Enter the bank name.";
  if (!v.accountName.trim()) return "Enter the account name.";
  const a = v.account.replace(/\s/g, ""), r = v.routing.replace(/\s/g, "");
  if (!/^\d{4,17}$/.test(a)) return "Account number should be 4-17 digits.";
  if (a !== v.account2.replace(/\s/g, "")) return "Account numbers don't match.";
  if (!ROUTING_RE.test(r)) return "Routing number should be 9 digits.";
  if (r !== v.routing2.replace(/\s/g, "")) return "Routing numbers don't match.";
  return null;
}

/** A field section is complete when every required field has a saved value and nothing is unsaved. */
export function fieldSectionComplete(required: string[], saved: Record<string, string>, dirty: boolean) {
  return !dirty && required.every((k) => String(saved[k] ?? "").trim() !== "");
}
