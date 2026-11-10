/**
 * Fee answers → canonical Fees & terms (pure). Used when a client's fund request is
 * submitted and when the older fee editor saves, so Setup always shows the same
 * management fee, carry, preferred return and classes. It only builds a draft;
 * approval stays with the existing review.
 */
import { classKey, type EconomicTerms, type FundClass } from "@/lib/fund-setup-canonical";

export type FeeAnswers = { managementFeePct: number | null; carryPct: number | null; hurdlePct: number | null; basis?: string | null };

/** "2%", "2.5", "None", "Not applicable" → number, 0 or null (unknown/blank). */
export function parsePercent(v: string | null | undefined): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (/^(none|n\/?a|not applicable|0)$/i.test(s)) return 0;
  const m = s.match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}
const notApplicableText = (v: string | null | undefined) => /^(none|n\/?a|not applicable)$/i.test(String(v ?? "").trim());

export function feeBasis(v: string | null | undefined): NonNullable<EconomicTerms["managementFee"]>["basis"] {
  const s = String(v ?? "").toLowerCase();
  if (/commit/.test(s)) return "committed_capital";
  if (/invest/.test(s)) return "invested_capital";
  if (/nav|net asset/.test(s)) return "nav";
  if (/flat/.test(s)) return "flat";
  if (/capital account|contribution/.test(s)) return "capital_account_balance";
  return null;
}

/** Overlays the given fee answers on existing terms; blanks never erase a recorded value. */
export function termsWithFees(base: EconomicTerms | null | undefined, f: FeeAnswers): EconomicTerms {
  const t: EconomicTerms = { managementFee: base?.managementFee ?? null, carry: base?.carry ?? null, ...base };
  if (f.managementFeePct != null) t.managementFee = { basis: null, frequency: null, ...(base?.managementFee ?? {}), ratePercent: f.managementFeePct, ...(feeBasis(f.basis) ? { basis: feeBasis(f.basis) } : {}) };
  if (f.carryPct != null) t.carry = { ...(base?.carry ?? {}), ratePercent: f.carryPct };
  if (f.hurdlePct != null) t.preferredReturnPercent = f.hurdlePct;
  return t;
}

const cents = (v: string | null | undefined) => { const n = Number(String(v ?? "").replace(/[^0-9.]/g, "")); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null; };

/** Request answers → draft terms and classes. Classes only when two or more are named with terms. */
export function economicsFromRequest(r: { management_fee?: string; carried_interest?: string; preferred_return?: string; classes?: { name: string; fee: string; carry: string; hurdle: string; minimum: string }[] }) {
  const named = (r.classes ?? []).filter((c) => c.name?.trim() && (c.fee || c.carry || c.hurdle || c.minimum));
  const first = named[0];
  const fees: FeeAnswers = {
    managementFeePct: parsePercent(r.management_fee) ?? parsePercent(first?.fee),
    carryPct: parsePercent(r.carried_interest) ?? parsePercent(first?.carry),
    hurdlePct: parsePercent(r.preferred_return) ?? parsePercent(first?.hurdle),
  };
  const terms = termsWithFees(null, fees);
  const na = [
    ...(notApplicableText(r.preferred_return) ? (["preferredReturn"] as const) : []),
  ];
  if (na.length) { terms.notApplicable = [...na]; if (terms.preferredReturnPercent === 0) delete terms.preferredReturnPercent; }
  const classes: FundClass[] = named.length >= 2
    ? named.map((c) => ({
        key: classKey(c.name),
        name: c.name.trim(),
        ...(parsePercent(c.fee) != null ? { managementFee: { ratePercent: parsePercent(c.fee), basis: null, frequency: null } } : {}),
        ...(parsePercent(c.carry) != null ? { carry: { ratePercent: parsePercent(c.carry) } } : {}),
        ...(parsePercent(c.hurdle) != null ? { preferredReturnPercent: parsePercent(c.hurdle) } : {}),
        ...(cents(c.minimum) != null ? { minInvestmentCents: cents(c.minimum) } : {}),
      }))
    : [];
  const hasAny = fees.managementFeePct != null || fees.carryPct != null || fees.hurdlePct != null || classes.length > 0;
  return { terms, classes, fees, hasAny };
}
