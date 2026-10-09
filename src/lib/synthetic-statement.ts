/**
 * Internal-only synthetic investor statement previews (pure). Built solely
 * from synthetic capital accounts + their movements; never reads or writes
 * production statements. Any channel other than internal preview is refused.
 */
import type { PdfDocSpec } from "@/lib/pdf-render";

export const SYNTHETIC_STATEMENT_LABEL =
  "DEMO / SYNTHETIC — UNAUDITED — NOT CONTRACTUAL — NOT FOR INVESTOR DISTRIBUTION";

export const SYNTHETIC_DISCLOSURES = [
  "Valuations are synthetic assumptions without independent supporting evidence.",
  "Investor allocations use a synthetic QA policy, not verified fund agreements.",
  "Carried interest and waterfall allocations have not been modeled.",
  "This statement exists solely for internal software testing and must not be sent to any investor.",
];

export type SynAccount = {
  id: string; offering_id: string; position_id: string; investor_name: string; class_label: string;
  admission_status: string; opening_capital_source: string; policy_version: number; allocation_run_id: string;
  period_start: string; period_end: string; version: number; classification: string;
  opening_capital_cents: number; contributions_cents: number; interest_cents: number; unrealized_gain_cents: number;
  operating_expense_cents: number; management_fee_cents: number; ending_capital_cents: number;
  unpaid_call_cents: number; credits_liability_cents: number; restrictions: string[];
};
export type SynMovement = { account_id: string; offering_id: string; kind: string; amount_cents: number; effective_date: string; source_ref: string; classification: string };
export type Channel = "internal_preview" | "internal_pdf" | "investor_portal" | "email" | "public_link" | "production_statement" | "financial_report";

const SINGLE = ["opening", "interest_income", "unrealized_gain_synthetic", "operating_expense", "management_fee"] as const;

export function channelError(c: Channel): string | null {
  return c === "internal_preview" || c === "internal_pdf"
    ? null
    : `Synthetic statements cannot be sent to ${c.replace("_", " ")}; internal preview only.`;
}

export type SyntheticStatement = {
  accountId: string; investorName: string; classLabel: string; offeringId: string; positionId: string;
  period: { start: string; end: string }; label: string; badges: string[];
  lines: { label: string; cents: number; ref: string }[];
  netResultCents: number; endingCapitalCents: number; unpaidCallCents: number; creditsCents: number;
  restrictions: string[]; contributions: { date: string; cents: number; ref: string }[];
  references: string[]; disclosures: string[];
};

export function buildSyntheticStatement(
  a: SynAccount, movements: SynMovement[], opts: { channel: Channel; navCents: number; fundIsTestDemo: boolean; residualCents: number },
): { ok: true; statement: SyntheticStatement } | { ok: false; errors: string[] } {
  const e: string[] = [];
  const ch = channelError(opts.channel);
  if (ch) e.push(ch);
  if (!opts.fundIsTestDemo) e.push("Synthetic statements are allowed only on TEST/DEMO funds.");
  if (a.classification !== SYNTHETIC_STATEMENT_LABEL) e.push("Synthetic classification is missing or altered.");
  const mine = movements.filter((m) => m.account_id === a.id);
  if (mine.some((m) => m.offering_id !== a.offering_id)) e.push("Cross-fund movement refused.");
  if (mine.some((m) => m.classification !== SYNTHETIC_STATEMENT_LABEL)) e.push("A movement lacks the synthetic classification.");
  const refs = new Set<string>();
  for (const m of mine) {
    const k = `${m.kind}|${m.source_ref}`;
    if (refs.has(k)) e.push(`Duplicated movement ${k}.`);
    refs.add(k);
    if (!m.source_ref) e.push(`Movement ${m.kind} has no source reference.`);
  }
  const one = (kind: string) => {
    const ms = mine.filter((m) => m.kind === kind);
    if (ms.length !== 1) e.push(`${a.investor_name}: expected exactly one ${kind} movement, found ${ms.length}.`);
    return ms[0];
  };
  const [op, int, gain, exp, fee] = SINGLE.map(one);
  const contribs = mine.filter((m) => m.kind === "contribution");
  const csum = contribs.reduce((s, m) => s + Number(m.amount_cents), 0);
  if (csum !== Number(a.contributions_cents)) e.push(`${a.investor_name}: contribution movements ${csum} ≠ account ${a.contributions_cents}.`);
  const pairs: [SynMovement | undefined, number, string][] = [
    [op, a.opening_capital_cents, "opening"], [int, a.interest_cents, "interest"], [gain, a.unrealized_gain_cents, "gain"],
    [exp, a.operating_expense_cents, "expenses"], [fee, a.management_fee_cents, "fee"],
  ];
  for (const [m, v, n] of pairs) if (m && Number(m.amount_cents) !== Number(v)) e.push(`${a.investor_name}: ${n} movement differs from account.`);
  const total = mine.reduce((s, m) => s + Number(m.amount_cents), 0);
  if (total !== Number(a.ending_capital_cents)) e.push(`${a.investor_name}: movements ${total} ≠ ending capital ${a.ending_capital_cents}; no balancing entry is made.`);
  if (e.length) return { ok: false, errors: e };

  const net = Number(a.interest_cents) + Number(a.unrealized_gain_cents) + Number(a.operating_expense_cents) + Number(a.management_fee_cents);
  const badges = ["DEMO / SYNTHETIC"];
  if (a.admission_status === "source_only_not_formally_admitted") badges.push("SOURCE-ONLY / NOT FORMALLY ADMITTED");
  return {
    ok: true,
    statement: {
      accountId: a.id, investorName: a.investor_name, classLabel: a.class_label, offeringId: a.offering_id, positionId: a.position_id,
      period: { start: a.period_start, end: a.period_end }, label: SYNTHETIC_STATEMENT_LABEL, badges,
      lines: [
        { label: "Opening capital (Dec 31, 2025)", cents: Number(a.opening_capital_cents), ref: op!.source_ref },
        { label: "Accepted contributions", cents: csum, ref: contribs.map((c) => c.source_ref).join("; ") || "none in Q1" },
        { label: "Interest income allocated", cents: Number(a.interest_cents), ref: int!.source_ref },
        { label: "Unrealized gain allocated (synthetic assumption)", cents: Number(a.unrealized_gain_cents), ref: gain!.source_ref },
        { label: "Operating expenses allocated", cents: Number(a.operating_expense_cents), ref: exp!.source_ref },
        { label: "Management fee (traced)", cents: Number(a.management_fee_cents), ref: fee!.source_ref },
      ],
      netResultCents: net, endingCapitalCents: Number(a.ending_capital_cents),
      unpaidCallCents: Number(a.unpaid_call_cents), creditsCents: Number(a.credits_liability_cents),
      restrictions: a.restrictions ?? [],
      contributions: contribs.map((c) => ({ date: c.effective_date, cents: Number(c.amount_cents), ref: c.source_ref })),
      references: [
        `Synthetic capital account ${a.id} v${a.version}`, `Allocation run ${a.allocation_run_id} (policy v${a.policy_version})`,
        `Opening source: ${a.opening_capital_source}`, `Rounding cents assigned to this investor in the approved run: ${opts.residualCents}`,
      ],
      disclosures: SYNTHETIC_DISCLOSURES,
    },
  };
}

const usd = (c: number) => `${c < 0 ? "-" : ""}$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function syntheticStatementPdfSpec(s: SyntheticStatement, fundName: string): PdfDocSpec {
  return {
    kicker: "Synthetic capital account statement — internal preview",
    title: fundName,
    subtitle: `${s.investorName} · Class ${s.classLabel} · ${s.period.start} to ${s.period.end}`,
    badge: "SYNTHETIC",
    watermark: SYNTHETIC_STATEMENT_LABEL,
    meta: [{ label: "Status", value: s.badges.join(" · ") }],
    sections: [
      { heading: "Capital rollforward", rows: [
        ...s.lines.map((l) => ({ label: l.label, value: usd(l.cents) })),
        { label: "Net investment result", value: usd(s.netResultCents) },
        { label: "Ending provisional capital", value: usd(s.endingCapitalCents) },
      ] },
      { heading: "Held separately (not capital)", rows: [
        { label: "Outstanding capital calls", value: usd(s.unpaidCallCents) },
        { label: "Investor credit (fund liability)", value: usd(s.creditsCents) },
        ...s.restrictions.map((r) => ({ label: "Restriction", value: r })),
      ] },
      { heading: "Source and calculation references", text: [...s.references, ...s.lines.map((l) => `${l.label}: ${l.ref}`)].join("\n") },
    ],
    notes: [SYNTHETIC_STATEMENT_LABEL, ...s.disclosures],
    fileName: `SYNTHETIC-INTERNAL-${s.investorName.replace(/[^A-Za-z0-9]+/g, "-")}-${s.period.end}.pdf`,
  };
}
