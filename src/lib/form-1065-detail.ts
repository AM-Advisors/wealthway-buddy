/**
 * Form 1065 line detail (pure). Line catalogue by schedule, prefill from our own
 * prepared return and K-1s, and tie checks. Amounts are integer cents.
 * Preparing detail never files or transmits anything.
 */
export type Schedule1065 = "page1" | "scheduleB" | "scheduleK" | "scheduleL" | "scheduleM1" | "scheduleM2" | "analysis";
export const SCHEDULES_1065: { id: Schedule1065; label: string; note: string }[] = [
  { id: "page1", label: "Page 1 — Income & deductions", note: "Trade or business income and deductions." },
  { id: "scheduleB", label: "Schedule B — Other information", note: "Partnership questions and the partnership representative." },
  { id: "scheduleK", label: "Schedule K — Partners' distributive share", note: "Must equal the sum of all current K-1s." },
  { id: "scheduleL", label: "Schedule L — Balance sheet per books", note: "Assets must equal liabilities plus capital." },
  { id: "scheduleM1", label: "Schedule M-1 — Book-to-tax reconciliation", note: "Ends at Schedule K income." },
  { id: "scheduleM2", label: "Schedule M-2 — Partners' capital accounts", note: "Ending capital ties to partner capital." },
  { id: "analysis", label: "Analysis of net income (loss)", note: "Net income by partner type." },
];

export type LineDef = { id: string; schedule: Schedule1065; line: string; label: string; kind?: "money" | "text" | "yesno"; k1Box?: string };
export const LINES_1065: LineDef[] = [
  { id: "p1_1a", schedule: "page1", line: "1a", label: "Gross receipts or sales" },
  { id: "p1_8", schedule: "page1", line: "8", label: "Total income (loss)" },
  { id: "p1_10", schedule: "page1", line: "10", label: "Guaranteed payments to partners" },
  { id: "p1_21", schedule: "page1", line: "21", label: "Total deductions" },
  { id: "p1_23", schedule: "page1", line: "23", label: "Ordinary business income (loss)" },
  { id: "b_1", schedule: "scheduleB", line: "1", label: "Type of entity filing this return", kind: "text" },
  { id: "b_4", schedule: "scheduleB", line: "4", label: "Meets all small-partnership requirements (Q4)?", kind: "yesno" },
  { id: "b_pr", schedule: "scheduleB", line: "PR", label: "Partnership representative (name only)", kind: "text" },
  { id: "k_1", schedule: "scheduleK", line: "1", label: "Ordinary business income (loss)", k1Box: "1" },
  { id: "k_2", schedule: "scheduleK", line: "2", label: "Net rental real estate income (loss)", k1Box: "2" },
  { id: "k_4", schedule: "scheduleK", line: "4", label: "Guaranteed payments", k1Box: "4" },
  { id: "k_5", schedule: "scheduleK", line: "5", label: "Interest income", k1Box: "5" },
  { id: "k_6a", schedule: "scheduleK", line: "6a", label: "Ordinary dividends", k1Box: "6a" },
  { id: "k_6b", schedule: "scheduleK", line: "6b", label: "Qualified dividends", k1Box: "6b" },
  { id: "k_7", schedule: "scheduleK", line: "7", label: "Royalties", k1Box: "7" },
  { id: "k_8", schedule: "scheduleK", line: "8", label: "Net short-term capital gain (loss)", k1Box: "8" },
  { id: "k_9a", schedule: "scheduleK", line: "9a", label: "Net long-term capital gain (loss)", k1Box: "9a" },
  { id: "k_10", schedule: "scheduleK", line: "10", label: "Net section 1231 gain (loss)", k1Box: "10" },
  { id: "k_11", schedule: "scheduleK", line: "11", label: "Other income (loss)", k1Box: "11" },
  { id: "k_12", schedule: "scheduleK", line: "12", label: "Section 179 deduction", k1Box: "12" },
  { id: "k_13", schedule: "scheduleK", line: "13", label: "Other deductions", k1Box: "13" },
  { id: "k_16", schedule: "scheduleK", line: "16", label: "Foreign taxes paid", k1Box: "16" },
  { id: "k_18b", schedule: "scheduleK", line: "18b", label: "Other tax-exempt income", k1Box: "18B" },
  { id: "k_18c", schedule: "scheduleK", line: "18c", label: "Nondeductible expenses", k1Box: "18C" },
  { id: "k_19a", schedule: "scheduleK", line: "19a", label: "Distributions of cash and marketable securities", k1Box: "19A" },
  { id: "l_assets", schedule: "scheduleL", line: "14", label: "Total assets (end of year)" },
  { id: "l_liab", schedule: "scheduleL", line: "20", label: "Total liabilities (end of year)" },
  { id: "l_capital", schedule: "scheduleL", line: "21", label: "Partners' capital accounts (end of year)" },
  { id: "m1_1", schedule: "scheduleM1", line: "1", label: "Net income (loss) per books" },
  { id: "m1_adj", schedule: "scheduleM1", line: "2–7", label: "Net book-to-tax adjustments" },
  { id: "m1_9", schedule: "scheduleM1", line: "9", label: "Income (loss) per Schedule K analysis" },
  { id: "m2_1", schedule: "scheduleM2", line: "1", label: "Balance at beginning of year" },
  { id: "m2_2", schedule: "scheduleM2", line: "2", label: "Capital contributed" },
  { id: "m2_3", schedule: "scheduleM2", line: "3", label: "Net income (loss)" },
  { id: "m2_6", schedule: "scheduleM2", line: "6", label: "Distributions" },
  { id: "m2_9", schedule: "scheduleM2", line: "9", label: "Balance at end of year" },
  { id: "an_1", schedule: "analysis", line: "1", label: "Net income (loss)" },
];
export const linesFor = (s: Schedule1065) => LINES_1065.filter((l) => l.schedule === s);
export const MONEY_LINE_IDS = new Set(LINES_1065.filter((l) => (l.kind ?? "money") === "money").map((l) => l.id));

export type K1Lite = { boxes: Record<string, number>; endingCapitalCents?: number | null };
export type ReturnLite = { book_income_cents: number; adjustments_cents: number; tax_income_cents: number };

/** Sum current K-1 boxes. */
export function sumK1Boxes(k1s: K1Lite[]) {
  const out: Record<string, number> = {};
  for (const k of k1s) for (const [b, v] of Object.entries(k.boxes ?? {})) out[b] = (out[b] ?? 0) + Math.round(Number(v) || 0);
  return out;
}

/** Prefill from the prepared return and current K-1s. Never invents amounts we don't have. */
export function prefill1065(ret: ReturnLite, k1s: K1Lite[]): Record<string, number> {
  const sums = sumK1Boxes(k1s);
  const v: Record<string, number> = {};
  for (const l of LINES_1065) if (l.k1Box && sums[l.k1Box] !== undefined) v[l.id] = sums[l.k1Box]!;
  v["m1_1"] = Number(ret.book_income_cents) || 0;
  v["m1_adj"] = Number(ret.adjustments_cents) || 0;
  v["m1_9"] = Number(ret.tax_income_cents) || 0;
  v["an_1"] = Number(ret.tax_income_cents) || 0;
  return v;
}

export type TieResult = { id: string; label: string; ok: boolean | null; detail: string };
const usd = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export function tieChecks(values: Record<string, number>, k1s: K1Lite[]): TieResult[] {
  const out: TieResult[] = [];
  const sums = sumK1Boxes(k1s);
  const kLines = LINES_1065.filter((l) => l.k1Box);
  const mismatched = kLines.filter((l) => (values[l.id] ?? 0) !== (sums[l.k1Box!] ?? 0));
  out.push({
    id: "k_vs_k1", label: "Schedule K equals the sum of current K-1s",
    ok: k1s.length === 0 ? null : mismatched.length === 0,
    detail: k1s.length === 0 ? "No K-1s generated yet." : mismatched.length === 0 ? `${k1s.length} K-1s tie.` : `Differs on line ${mismatched.map((l) => l.line).join(", ")}.`,
  });
  const has = (id: string) => values[id] !== undefined;
  const m1 = (values["m1_1"] ?? 0) + (values["m1_adj"] ?? 0);
  out.push({
    id: "m1", label: "M-1: book income plus adjustments equals line 9",
    ok: has("m1_9") ? m1 === values["m1_9"] : null,
    detail: has("m1_9") ? `${usd(m1)} vs ${usd(values["m1_9"]!)}` : "Line 9 not entered.",
  });
  const okL = has("l_assets") && has("l_liab") && has("l_capital");
  out.push({
    id: "l_balance", label: "Schedule L: assets equal liabilities plus capital",
    ok: okL ? values["l_assets"] === (values["l_liab"]! + values["l_capital"]!) : null,
    detail: okL ? `${usd(values["l_assets"]!)} vs ${usd(values["l_liab"]! + values["l_capital"]!)}` : "Balance sheet not complete.",
  });
  const m2calc = (values["m2_1"] ?? 0) + (values["m2_2"] ?? 0) + (values["m2_3"] ?? 0) - (values["m2_6"] ?? 0);
  out.push({
    id: "m2_roll", label: "M-2 rolls forward to the ending balance",
    ok: has("m2_9") ? m2calc === values["m2_9"] : null,
    detail: has("m2_9") ? `${usd(m2calc)} vs ${usd(values["m2_9"]!)}` : "Ending balance not entered.",
  });
  const caps = k1s.map((k) => k.endingCapitalCents).filter((x): x is number => typeof x === "number");
  out.push({
    id: "m2_partners", label: "M-2 ending capital equals the sum of partner capital",
    ok: has("m2_9") && caps.length === k1s.length && caps.length > 0 ? caps.reduce((a, b) => a + b, 0) === values["m2_9"] : null,
    detail: caps.length === k1s.length && caps.length > 0 ? `Partners total ${usd(caps.reduce((a, b) => a + b, 0))}` : "Partner ending capital isn't on every K-1 yet.",
  });
  return out;
}

export function failingTies(t: TieResult[]) { return t.filter((x) => x.ok === false); }

export type DetailStage = "draft" | "ready_for_review" | "reviewed" | "returned";
/** Returns an error message or null. */
export function checkDetailStage(i: { from: DetailStage | null; to: DetailStage; actorId: string; preparedBy: string | null; ties: TieResult[] }): string | null {
  const allowed: Record<string, DetailStage[]> = {
    none: ["draft"], draft: ["draft", "ready_for_review"], returned: ["draft", "ready_for_review"],
    ready_for_review: ["reviewed", "returned"], reviewed: [],
  };
  if (!allowed[i.from ?? "none"]!.includes(i.to)) return i.from === "reviewed" ? "This 1065 detail is reviewed and locked. Amend the return to change it." : "That step isn't available now.";
  if (i.to === "ready_for_review" && failingTies(i.ties).length) return "Resolve the tie-out differences before sending for review.";
  if (i.to === "reviewed" && i.preparedBy === i.actorId) return "A different Harmonious team member must review this.";
  return null;
}
