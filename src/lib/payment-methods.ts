/**
 * How investors may send capital to a fund. Display/instructions only: Harmonious never
 * pulls or pushes money for these methods - investors send it from their own bank.
 */
export const PAYMENT_METHODS = ["wire", "ach", "check"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = { wire: "Wire", ach: "ACH", check: "Check" };

/** Typical arrival timeline, shown to investors as a warning. */
export const PAYMENT_METHOD_TIMELINE: Record<PaymentMethod, string> = {
  wire: "Wires usually arrive the same or next business day.",
  ach: "ACH usually takes 3-5 business days to arrive, and can take longer. Send it early so it arrives before the closing date.",
  check: "Checks can take 7-10 business days to arrive and clear. Mail it well before the closing date.",
};

/** Clean a stored/submitted list: known methods only, no duplicates, never empty (falls back to wire). */
export function normalizePaymentMethods(input: unknown): PaymentMethod[] {
  const arr = Array.isArray(input) ? input : [];
  const out = PAYMENT_METHODS.filter((m) => arr.includes(m));
  return out.length ? out : ["wire"];
}
