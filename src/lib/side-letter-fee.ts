/** Side letter for a commitment below the fund minimum: fixed Harmonious fee, pure helpers. */
export const SIDE_LETTER_FEE_CENTS = 150000;
export const SIDE_LETTER_PRICE_ID = "side_letter_fee_onetime";

export const usdWhole = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** The text of the generated side letter. Waives only the minimum; every other fund term is unchanged. */
export function sideLetterText(f: { fundName: string; investorName: string; commitmentCents: number; minimumCents: number; date: string }): string[] {
  return [
    `Side Letter - ${f.fundName}`,
    `Date: ${f.date}`,
    `Investor: ${f.investorName}`,
    "",
    `This side letter is entered into between ${f.fundName} (the "Fund") and ${f.investorName} (the "Investor") in connection with the Investor's subscription for an interest in the Fund.`,
    "",
    `1. Minimum commitment. The Fund's minimum commitment is ${usdWhole(f.minimumCents)}. The Fund agrees to accept the Investor's commitment of ${usdWhole(f.commitmentCents)}, and waives the minimum commitment for this Investor only.`,
    "2. No other changes. Except as stated in paragraph 1, the Fund's governing documents and the Investor's Subscription Agreement apply in full and are not amended.",
    "3. Confidentiality. The Investor will keep the terms of this side letter confidential, except as required by law.",
    "4. Most favored nation. This side letter does not grant, and is not intended to trigger, any most-favored-nation rights for other investors.",
    "",
    "Fund: ______________________________   Date: ____________",
    "Investor: ___________________________   Date: ____________",
  ];
}
