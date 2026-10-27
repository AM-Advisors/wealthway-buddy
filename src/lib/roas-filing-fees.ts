/** Conditional ROAS filing-fee review values; preparation only, never a filing or payment. */
export const ROAS_FILING_FEES = {
  harmoniousPreparationCents: 16000,
  stateBaseLowCents: 95000,
  stateBaseHighCents: 185000,
  texasCapCents: 50000,
} as const;

export function roasFilingFeeRange(texasCents: number = ROAS_FILING_FEES.texasCapCents) {
  if (!Number.isSafeInteger(texasCents) || texasCents < 0 || texasCents > ROAS_FILING_FEES.texasCapCents) {
    throw new Error("Texas notice fees must be between $0 and the $500 cap.");
  }
  return {
    lowCents: ROAS_FILING_FEES.harmoniousPreparationCents + ROAS_FILING_FEES.stateBaseLowCents + texasCents,
    highCents: ROAS_FILING_FEES.harmoniousPreparationCents + ROAS_FILING_FEES.stateBaseHighCents + texasCents,
  };
}
