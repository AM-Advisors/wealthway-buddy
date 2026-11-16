/**
 * Fund request answers that feed real Setup steps (pure, no I/O):
 * - investor eligibility → the fund's investor eligibility requirements (what investors are asked);
 * - who opens the bank account and the preferred bank → Banking;
 * - management company (new or transfer) → Team & Signatory.
 * These only suggest or prefill; drafts still need the usual approval and nothing is signed or sent.
 */
import type { EligibilityRequirementType } from "@/lib/onboarding-compliance-model";

export type EligibilitySuggestion = { text: string; keys: EligibilityRequirementType[]; undetermined: boolean };
export type BankingSuggestion = { setupBy: "fund" | "harmonious" | null; preferredBank: string | null; partnerBank: "texas_capital" | null };
export type ManagementCompanySuggestion = { path: "setup" | "transfer" };
export type RequestWiring = { eligibility: EligibilitySuggestion | null; banking: BankingSuggestion | null; managementCompany: ManagementCompanySuggestion | null };

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Reads which eligibility requirements a plain-words answer asks for. */
export function eligibilityFromAnswer(text: string): EligibilitySuggestion {
  const t = text.toLowerCase();
  const keys: EligibilityRequirementType[] = [];
  const undetermined = !t || /help determine|not sure|to be determined|tbd/.test(t);
  const allowsNonAccredited = /non[- ]?accredited|open to all|anyone/.test(t);
  if (!allowsNonAccredited && /accredited/.test(t)) keys.push("accredited_investor");
  if (/qualified purchaser/.test(t)) keys.push("qualified_purchaser");
  if (/qualified client/.test(t)) keys.push("qualified_client");
  return { text, keys, undetermined: undetermined && !keys.length };
}

/** True when the approved requirements already include everything the request asked for. */
export function eligibilityCovered(suggested: readonly string[], approved: readonly string[] | null | undefined) {
  return suggested.every((k) => (approved ?? []).includes(k));
}

export function bankingFromRequest(details: Record<string, any>): BankingSuggestion | null {
  const path = str(details["banking_path"]);
  const bank = str(details["bank_name"]);
  if (!path && !bank) return null;
  const setupBy = path === "harmonious" ? "harmonious" : path === "client" ? "fund" : null;
  return { setupBy, preferredBank: bank || null, partnerBank: /texas\s*capital/i.test(bank) ? "texas_capital" : null };
}

export const BANKING_SETUP_LABEL: Record<"fund" | "harmonious", string> = { harmonious: "Harmonious coordinates the bank account", fund: "The fund uses its own bank" };
export const MANAGEMENT_COMPANY_LABEL: Record<"setup" | "transfer", string> = { setup: "Set up a new management company", transfer: "Transfer an existing management company" };
/** Status a recorded management company starts with: a new one is planned, a transferred one already exists. */
export const managementCompanyStatus = (path: "setup" | "transfer") => (path === "transfer" ? "active" : "planned") as "active" | "planned";

export function requestWiring(details: Record<string, any> | null | undefined): RequestWiring {
  if (!details || typeof details !== "object") return { eligibility: null, banking: null, managementCompany: null };
  const elig = str(details["investor_eligibility"]);
  const mc = str(details["management_llc_path"]);
  return {
    eligibility: elig ? eligibilityFromAnswer(elig) : null,
    banking: bankingFromRequest(details),
    managementCompany: mc === "setup" || mc === "transfer" ? { path: mc } : null,
  };
}
