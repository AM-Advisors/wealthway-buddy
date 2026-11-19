/**
 * New fund request AI fill (pure). Turns fund document readings into suggested answers for
 * the Launch a new fund or SPV form. Suggestions fill blank answers only unless the person
 * ticks a different value on purpose; nothing is saved until the form itself is saved.
 */
import type { FundDocKind, FundDocReading, FundFieldKey } from "@/lib/fund-doc-extract-model";
import { JURISDICTIONS, VEHICLE_STRUCTURES } from "@/lib/client-portal-model";
import type { FundRequest } from "@/lib/fund-request-model";

export type RequestAnswerKey =
  | "legal_name" | "vehicle_structure" | "jurisdiction" | "date_formed" | "target_raise" | "minimum_investment"
  | "management_fee" | "carried_interest" | "preferred_return" | "fund_term" | "investment_period"
  | "investor_eligibility" | "bank_name" | "signatory_name" | "signatory_title";

export const REQUEST_ANSWER_LABEL: Record<RequestAnswerKey, string> = {
  legal_name: "Legal name", vehicle_structure: "Vehicle / entity structure", jurisdiction: "Jurisdiction", date_formed: "Date formed",
  target_raise: "Target raise", minimum_investment: "Minimum investment", management_fee: "Management fee", carried_interest: "Carried interest",
  preferred_return: "Preferred return", fund_term: "Fund term", investment_period: "Investment period", investor_eligibility: "Investor eligibility",
  bank_name: "Bank", signatory_name: "Signatory name", signatory_title: "Signatory title",
};

const SOURCE: Record<RequestAnswerKey, FundFieldKey> = {
  legal_name: "legalName", vehicle_structure: "entityType", jurisdiction: "jurisdiction", date_formed: "formationDate",
  target_raise: "targetRaiseCents", minimum_investment: "minInvestmentCents", management_fee: "managementFeePercent", carried_interest: "carryPercent",
  preferred_return: "preferredReturnPercent", fund_term: "fundTermMonths", investment_period: "investmentPeriodMonths",
  investor_eligibility: "investorEligibility", bank_name: "bankName", signatory_name: "signatoryName", signatory_title: "signatoryTitle",
};

const dollars = (cents: string) => { const n = Number(cents) / 100; return Number.isFinite(n) && n > 0 ? String(Number.isInteger(n) ? n : n.toFixed(2)) : null; };
const term = (months: string) => { const n = Number(months); if (!Number.isFinite(n) || n <= 0) return null; return n % 12 === 0 ? `${n / 12} year${n === 12 ? "" : "s"}` : `${n} months`; };

export function structureFor(entity: string): string | null {
  const s = entity.toLowerCase();
  if (/series/.test(s)) return "Series LLC";
  if (/limited partnership|\blp\b|l\.p\./.test(s)) return "LP";
  if (/limited liability company|\bllc\b|l\.l\.c\./.test(s)) return "LLC";
  if (/general partner|\bgp\b/.test(s)) return "GP";
  return VEHICLE_STRUCTURES.find((v) => v.toLowerCase() === s) ?? null;
}
export function jurisdictionFor(state: string): string | null {
  const s = state.trim().toLowerCase().replace(/^state of /, "");
  const abbr: Record<string, string> = { de: "Delaware", wy: "Wyoming", nv: "Nevada", tx: "Texas", ny: "New York" };
  if (abbr[s]) return abbr[s]!;
  return JURISDICTIONS.find((j) => j !== "Other" && (s === j.toLowerCase() || s.includes(j.toLowerCase()))) ?? null;
}

/** The form value a reading suggests for one answer, in the form's own format, or null. */
export function answerFromReading(key: RequestAnswerKey, raw: string): string | null {
  switch (key) {
    case "target_raise": case "minimum_investment": return dollars(raw);
    case "management_fee": case "carried_interest": return `${raw}%`;
    case "preferred_return": return Number(raw) === 0 ? "None" : `${raw}%`;
    case "fund_term": case "investment_period": return term(raw);
    case "vehicle_structure": return structureFor(raw);
    case "jurisdiction": return jurisdictionFor(raw);
    default: return raw.trim() || null;
  }
}

export function currentAnswer(r: FundRequest, key: RequestAnswerKey): string {
  if (key === "signatory_name") return r.signatory.name;
  if (key === "signatory_title") return r.signatory.title;
  return String((r as any)[key] ?? "");
}

const same = (a: string, b: string) => a.replace(/[\s,$]/g, "").toLowerCase() === b.replace(/[\s,$]/g, "").toLowerCase();

export type RequestSuggestion = { key: RequestAnswerKey; label: string; value: string; current: string; fileNames: string[]; status: "blank" | "different" };

/** Suggestions from every read file; answers already matching are left out, and the first file wins ties. */
export function requestSuggestions(r: FundRequest, readings: Array<{ fileName: string; reading: FundDocReading }>): RequestSuggestion[] {
  const out: RequestSuggestion[] = [];
  for (const key of Object.keys(SOURCE) as RequestAnswerKey[]) {
    const byValue = new Map<string, string[]>();
    for (const { fileName, reading } of readings) {
      const raw = reading.fields[SOURCE[key]]?.value;
      const v = raw ? answerFromReading(key, raw) : null;
      if (v) byValue.set(v, [...(byValue.get(v) ?? []), fileName]);
    }
    const first = [...byValue.entries()][0];
    if (!first) continue;
    const current = currentAnswer(r, key);
    if (current && same(current, first[0])) continue;
    out.push({ key, label: REQUEST_ANSWER_LABEL[key], value: first[0], current, fileNames: first[1], status: current.trim() ? "different" : "blank" });
  }
  return out;
}

/** Applies only the chosen suggestions; formation date also records the fund as already formed. */
export function applySuggestions(r: FundRequest, chosen: Array<Pick<RequestSuggestion, "key" | "value">>): FundRequest {
  let next: FundRequest = { ...r, signatory: { ...r.signatory } };
  for (const { key, value } of chosen) {
    if (key === "signatory_name") next.signatory.name = value;
    else if (key === "signatory_title") next.signatory.title = value;
    else (next as any)[key] = value;
    if (key === "date_formed" && !next.already_formed) next.already_formed = "yes";
  }
  return next;
}

/** Where a read file goes on the form's document lists. */
export function requestDocKindFor(kind: FundDocKind, r: Pick<FundRequest, "vehicle_structure">): string {
  switch (kind) {
    case "operating_agreement": return "Operating agreement / LPA";
    case "subscription_agreement": return "Subscription agreement";
    case "ppm": return "PPM";
    case "side_letter": return "Side letter";
    case "ein_letter": case "ss4": return "IRS EIN letter";
    case "formation_certificate": return r.vehicle_structure === "Series LLC" ? "Series designation / joinder (if any)" : "Formation document";
    default: return "Other";
  }
}
export const isOfferingDocKind = (k: string) => ["Operating agreement / LPA", "Subscription agreement", "PPM", "Side letter", "Other"].includes(k);
