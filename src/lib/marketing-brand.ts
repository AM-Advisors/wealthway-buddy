/** Harmonious collateral brand rules + offshore-mention checker. Prices and amounts are allowed. Browser-safe; shared by the Studio, AI prompts and submit checks. */
export const BRAND = {
  navy: "#002856",
  midnight: "#001433",
  cyan: "#5dc6d1",
  slate: "#e2e8f0",
  headingFont: "Rubik, sans-serif",
  bodyFont: "Poppins, sans-serif",
  proof: "$24B+ AUA · 750+ Fund Managers · Your Funds On Easy Mode",
};

export const BRAND_RULES = [
  "Navy #002856 to midnight gradient; cyan #5dc6d1 for highlights and dividers; white cards with soft slate borders.",
  "Rubik Bold headings; Poppins for subtitles and body copy.",
  "80px outer margins; a subtle cyan glow only in the background corner, never under text.",
  "Whole-word wrapping only: no hyphenated or broken words.",
  "Never mention offshore jurisdictions (no Cayman, BVI or 'offshore').",
  "Footer proof points: $24B+ AUA · 750+ Fund Managers · Your Funds On Easy Mode.",
];

export const IMAGE_RULES =
  "Harmonious brand: deep navy #002856 to midnight gradient background, electric cyan #5dc6d1 accents, white and soft slate neutrals. Clean institutional fintech style; if any text appears use a geometric sans (Rubik-like headings, Poppins-like body), never hyphenate or break words, keep generous margins. Any glow sits only in the background corner, never behind text. Never show offshore places (Cayman, BVI, offshore).";

export const COPY_RULES =
  "Never mention offshore jurisdictions (Cayman, BVI, offshore). Only state prices or amounts the writer supplied. The proof points $24B+ AUA and 750+ fund managers may be used.";

const OFFSHORE = /\b(offshore|cayman(?:\s+islands)?|bvi|british\s+virgin\s+islands)\b/i;

/** Returns human-readable problems; empty when the text is clean. */
export function brandProblems(text: string): string[] {
  const out: string[] = [];
  const o = text.match(OFFSHORE);
  if (o) out.push(`Mentions an offshore place ("${o[0]}"). Remove it.`);
  return out;
}
