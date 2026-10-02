// Pure K-1 allocation: fund-level year totals split across investors by share.
export const K1_FIELDS = [
  { key: "ordinary_income", box: "1", label: "Ordinary business income (loss)" },
  { key: "interest", box: "5", label: "Interest income" },
  { key: "dividends", box: "6a", label: "Ordinary dividends" },
  { key: "st_gain", box: "8", label: "Net short-term capital gain (loss)" },
  { key: "lt_gain", box: "9a", label: "Net long-term capital gain (loss)" },
  { key: "sec1231", box: "10", label: "Net section 1231 gain (loss)" },
  { key: "deductions", box: "13", label: "Other deductions" },
  { key: "distributions", box: "19", label: "Distributions" },
] as const;
export type K1Totals = Partial<Record<(typeof K1_FIELDS)[number]["key"], number>>;
export type K1Investor = { onboardingId: string; name: string; investorUserId: string | null; investmentProfileId: string | null; basisCents: number };
export type K1Line = { onboardingId: string; name: string; investorUserId: string | null; investmentProfileId: string | null; sharePct: number; boxes: Record<string, number> };

/** Largest-remainder split so each box adds back to the fund total exactly. */
export function allocateK1(totals: K1Totals, investors: K1Investor[]) {
  const flags: string[] = [];
  const pool = investors.reduce((t, i) => t + Math.max(0, i.basisCents), 0);
  if (!investors.length || pool <= 0) return { lines: [] as K1Line[], flags: ["No investors with a commitment or funded amount to allocate to."] };
  const lines: K1Line[] = investors.map((i) => ({ onboardingId: i.onboardingId, name: i.name, investorUserId: i.investorUserId, investmentProfileId: i.investmentProfileId, sharePct: Math.round((Math.max(0, i.basisCents) / pool) * 1e6) / 1e4, boxes: {} }));
  for (const f of K1_FIELDS) {
    const total = Math.round(Number(totals[f.key] ?? 0));
    if (!total) continue;
    const raw = investors.map((i) => (total * Math.max(0, i.basisCents)) / pool);
    const base = raw.map((r) => Math.trunc(r));
    let rest = total - base.reduce((a, b) => a + b, 0);
    const order = raw.map((r, idx) => ({ idx, frac: Math.abs(r - Math.trunc(r)) })).sort((a, b) => b.frac - a.frac);
    for (let k = 0; rest !== 0 && k < order.length * 2; k++) { const j = order[k % order.length]!.idx; base[j]! += Math.sign(rest); rest -= Math.sign(rest); }
    base.forEach((v, idx) => { if (v) lines[idx]!.boxes[f.box] = v; });
  }
  const missing = lines.filter((l) => !l.investorUserId).length;
  if (missing) flags.push(`${missing} investor(s) haven't signed in yet; their K-1 lines can't be recorded until they claim their account.`);
  if (!Object.values(totals).some((v) => v)) flags.push("All figures are zero.");
  return { lines, flags };
}
