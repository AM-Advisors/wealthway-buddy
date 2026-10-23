// Standard "what is included" wording per rate-card service (pure). Sales can
// still edit each line's details before saving; these only prefill new lines.

import { ADMIN_QUOTE_KEY_PREFIX } from "@/lib/service-ladders";
import { SPV_TXN_KEY_PREFIX } from "@/lib/spv-transaction-pricing";

export interface StandardInclusions { included: string[]; excluded: string[] }

/** Harmonized SPV (formerly "SPV Administration") — the standard package. */
export const HARMONIZED_SPV_INCLUDED: string[] = [
  "7 years of maintenance",
  "Series LLC entity formed under the Harmonious Master",
  "Obtaining the bank account once the client completes the SS-4",
  "Coordinating bank account setup",
  "SPV fund document templates (changes or redlines by the Harmonious team are not included)",
  "Up to 20 investors onboarded (an additional fee applies beyond 20 investors)",
  "1 close (additional closes are available at additional cost)",
  "1st year of K-1s (additional years of K-1s are available at additional cost)",
];

export const HARMONIZED_SPV_EXCLUDED: string[] = [
  "Changes or redlines to fund documents by the Harmonious team",
  "More than 20 investors (additional fee)",
  "Additional closes beyond the first",
  "K-1s beyond the first year",
];

const SAAS: StandardInclusions = {
  included: ["Platform access only: no Harmonious services are included", "Services available à la carte at additional cost", "Billed quarterly or annually"],
  excluded: ["All Harmonious services (available à la carte)"],
};

const SELF_SERVE: StandardInclusions = {
  included: ["Platform only, included in the base fund price", "General Operations inbox with a guaranteed 5-business-day response"],
  excluded: ["All other service levels and support (available at additional cost)"],
};

/** Standard inclusions for a rate-card service key, or null when none apply. */
export function standardInclusions(serviceKey: string): StandardInclusions | null {
  if (serviceKey.startsWith(SPV_TXN_KEY_PREFIX)) return { included: [...HARMONIZED_SPV_INCLUDED], excluded: [...HARMONIZED_SPV_EXCLUDED] };
  if (serviceKey.startsWith(ADMIN_QUOTE_KEY_PREFIX)) {
    const level = serviceKey.split(":").pop() ?? "";
    if (level === "SAAS") return { included: [...SAAS.included], excluded: [...SAAS.excluded] };
    if (level === "SELF_SERVE") return { included: [...SELF_SERVE.included], excluded: [...SELF_SERVE.excluded] };
  }
  return null;
}
