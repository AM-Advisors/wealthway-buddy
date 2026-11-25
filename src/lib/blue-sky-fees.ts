/**
 * Built-in Rule 506(b)/(c) state notice fee table (initial filings), based on the NASAA EFD fee list.
 * "review" = formula, offering-size or uncertain fee: never guessed. Keep this table current; Harmonious
 * confirms every state fee on EFD before paying. Form D electronic filing is the Harmonious fee.
 */
export const FORM_D_FILING_CENTS = 16000;

type Fee = number | "review" | "none";
export const BLUE_SKY_FEES: Record<string, Fee> = {
  AL: 30000, AK: 60000, AZ: 25000, AR: "review", CA: "review", CO: 5000, CT: 15000, DE: 25000, DC: 25000,
  FL: "none", GA: 25000, HI: 10000, ID: 5000, IL: 10000, IN: 10000, IA: 10000, KS: "review", KY: 25000,
  LA: 30000, ME: 30000, MD: 10000, MA: "review", MI: 10000, MN: 10000, MS: 30000, MO: 10000, MT: "review",
  NE: 20000, NV: 50000, NH: 50000, NJ: "review", NM: 35000, NY: "review", NC: 35000, ND: "review", OH: "review",
  OK: "review", OR: "review", PA: "review", PR: 30000, RI: 30000, SC: 30000, SD: 25000, TN: "review", TX: "review",
  UT: 10000, VT: 60000, VA: 25000, WA: 30000, WV: "review", WI: 20000, WY: "review", GU: "review", VI: "review",
};

const NAMES: Record<string, string> = {
  ALABAMA: "AL", ALASKA: "AK", ARIZONA: "AZ", ARKANSAS: "AR", CALIFORNIA: "CA", COLORADO: "CO", CONNECTICUT: "CT",
  DELAWARE: "DE", "DISTRICT OF COLUMBIA": "DC", FLORIDA: "FL", GEORGIA: "GA", HAWAII: "HI", IDAHO: "ID", ILLINOIS: "IL",
  INDIANA: "IN", IOWA: "IA", KANSAS: "KS", KENTUCKY: "KY", LOUISIANA: "LA", MAINE: "ME", MARYLAND: "MD",
  MASSACHUSETTS: "MA", MICHIGAN: "MI", MINNESOTA: "MN", MISSISSIPPI: "MS", MISSOURI: "MO", MONTANA: "MT",
  NEBRASKA: "NE", NEVADA: "NV", "NEW HAMPSHIRE": "NH", "NEW JERSEY": "NJ", "NEW MEXICO": "NM", "NEW YORK": "NY",
  "NORTH CAROLINA": "NC", "NORTH DAKOTA": "ND", OHIO: "OH", OKLAHOMA: "OK", OREGON: "OR", PENNSYLVANIA: "PA",
  "PUERTO RICO": "PR", "RHODE ISLAND": "RI", "SOUTH CAROLINA": "SC", "SOUTH DAKOTA": "SD", TENNESSEE: "TN",
  TEXAS: "TX", UTAH: "UT", VERMONT: "VT", VIRGINIA: "VA", WASHINGTON: "WA", "WEST VIRGINIA": "WV",
  WISCONSIN: "WI", WYOMING: "WY", GUAM: "GU", "VIRGIN ISLANDS": "VI",
};

/** "Texas", "tx", "TX " → "TX"; unknown → null. */
export function stateCode(v: string | null | undefined): string | null {
  const s = (v ?? "").trim().toUpperCase().replace(/\./g, "");
  if (!s) return null;
  if (s in BLUE_SKY_FEES) return s;
  return NAMES[s] ?? null;
}

export type BlueSkyLine = { state: string; investors: number; status: "fee" | "filed" | "review" | "none"; cents: number | null };
export type CloseFilingEstimate = { formDCents: number; lines: BlueSkyLine[]; totalCents: number; needsReview: string[] };

export function estimateCloseFilingCosts(input: { investorStates: (string | null | undefined)[]; filedStates: (string | null | undefined)[] }): CloseFilingEstimate {
  const filed = new Set(input.filedStates.map(stateCode).filter(Boolean) as string[]);
  const counts = new Map<string, number>();
  for (const raw of input.investorStates) { const c = stateCode(raw); if (c) counts.set(c, (counts.get(c) ?? 0) + 1); }
  const lines: BlueSkyLine[] = [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([state, investors]) => {
    if (filed.has(state)) return { state, investors, status: "filed", cents: 0 };
    const fee = BLUE_SKY_FEES[state];
    if (fee === "none") return { state, investors, status: "none", cents: 0 };
    if (typeof fee === "number") return { state, investors, status: "fee", cents: fee };
    return { state, investors, status: "review", cents: null };
  });
  const totalCents = FORM_D_FILING_CENTS + lines.reduce((s, l) => s + (l.cents ?? 0), 0);
  return { formDCents: FORM_D_FILING_CENTS, lines, totalCents, needsReview: lines.filter((l) => l.status === "review").map((l) => l.state) };
}
