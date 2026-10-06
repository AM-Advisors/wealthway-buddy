/** Harmonious collateral brand rules + banned-content checker. Browser-safe; shared by the Studio, AI prompts and submit checks. */
export const BRAND = {
  navy: "#002856",
  midnight: "#001433",
  cyan: "#5dc6d1",
  slate: "#e2e8f0",
  proof: "$24B+ AUA · 750+ Fund Managers · Your Funds On Easy Mode",
};

export const BRAND_RULES = [
  "Navy #002856 to midnight gradient; cyan #5dc6d1 for highlights and dividers; white cards with soft slate borders.",
  "Rubik Bold headings; Poppins for subtitles and body copy.",
  "80px outer margins; a subtle cyan glow only in the background corner, never under text.",
  "Whole-word wrapping only - no hyphenated or broken words.",
  "Never mention offshore jurisdictions (no Cayman, BVI or 'offshore').",
  "Never include pricing, fees or cost figures.",
  "Footer proof points: $24B+ AUA · 750+ Fund Managers · Your Funds On Easy Mode.",
];

export const IMAGE_RULES =
  "Harmonious brand: deep navy #002856 to midnight gradient background, electric cyan #5dc6d1 accents, white and soft slate neutrals. Clean institutional fintech style; if any text appears use a geometric sans (Rubik-like headings, Poppins-like body), never hyphenate or break words, keep generous margins. Any glow sits only in the background corner, never behind text. Never show prices, fees, dollar amounts for costs, or offshore places (Cayman, BVI, offshore).";

export const COPY_RULES =
  "Never mention pricing, fees or costs, and never mention offshore jurisdictions (Cayman, BVI, offshore). The proof points $24B+ AUA and 750+ fund managers may be used.";

const OFFSHORE = /\b(offshore|cayman(?:\s+islands)?|bvi|british\s+virgin\s+islands)\b/i;
// Prices/fees: "$2,500", "$99/mo", "fee of", "pricing", "per month" etc. Allows the "$24B+ AUA" proof point.
const MONEY = /\$\s?\d[\d,]*(?:\.\d+)?(?!\s*[BbMm]\+?\s*(?:in\s+)?(?:AUA|assets|investable))(?:\s*(?:\/|per)\s*\w+)?/;
const PRICE_WORDS = /\b(pricing|price[sd]?|fees?|cost[s]?|per\s+month|\/mo\b|discount)\b/i;

/** Returns human-readable problems; empty when the text is clean. */
export function brandProblems(text: string): string[] {
  const out: string[] = [];
  const o = text.match(OFFSHORE);
  if (o) out.push(`Mentions an offshore place ("${o[0]}"). Remove it.`);
  const m = text.match(MONEY);
  if (m) out.push(`Contains a price or amount ("${m[0].trim()}"). Remove pricing.`);
  const p = text.match(PRICE_WORDS);
  if (p && !/management fees?\b|carried interest/i.test(p.input ?? "")) out.push(`Mentions "${p[0]}". Collateral and posts can't reference pricing or fees.`);
  return out;
}
