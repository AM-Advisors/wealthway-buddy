/** Service fee added when a client pays an invoice by card. Wire and ACH have no fee. */
export const CARD_SERVICE_FEE_RATE = 0.035;
export const CARD_SERVICE_FEE_LABEL = "3.5% card service fee";
export function cardServiceFeeCents(invoiceCents: number): number {
  if (!(invoiceCents > 0)) return 0;
  return Math.round(invoiceCents * CARD_SERVICE_FEE_RATE);
}
