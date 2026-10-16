/** Which wire instructions a fund offers and which ones a given investor should see. Pure, browser-safe. */
export type WireScope = "domestic" | "international" | "both";

export const DOMESTIC_WIRE_FIELDS = ["bank_name", "bank_address", "account_name", "account_number", "routing_number", "memo"] as const;
export const INTL_WIRE_FIELDS = [
  "intl_bank_name", "intl_account_name", "intl_account_number", "swift",
  "intermediary_bank", "intermediary_swift", "intermediary_routing", "intermediary_account", "intl_memo",
] as const;
export const ALL_WIRE_FIELDS = ["wire_scope", ...DOMESTIC_WIRE_FIELDS, ...INTL_WIRE_FIELDS] as const;

export const WIRE_FIELD_LABELS: Record<string, string> = {
  bank_name: "Receiving bank", bank_address: "Bank address", account_name: "Account name", account_number: "Account number",
  routing_number: "Routing number (ABA)", memo: "Reference / memo",
  intl_bank_name: "Receiving bank", intl_account_name: "Beneficiary name", intl_account_number: "Account number", swift: "SWIFT / BIC",
  intermediary_bank: "Intermediary bank", intermediary_swift: "Intermediary SWIFT", intermediary_routing: "Intermediary routing (ABA)",
  intermediary_account: "Intermediary account", intl_memo: "Reference / memo (FFC)",
};

export function wireScopeOf(details: Record<string, unknown> | null | undefined): WireScope {
  const s = String(details?.["wire_scope"] ?? "");
  if (s === "domestic" || s === "international" || s === "both") return s;
  // Older records: international only if a SWIFT was entered alongside domestic details.
  return details?.["swift"] ? "both" : "domestic";
}

const US = new Set(["us", "usa", "united states", "united states of america", "u.s.", "u.s.a."]);
/** null/blank country = unknown. */
export function isUsCountry(country: string | null | undefined): boolean | null {
  const c = String(country ?? "").trim().toLowerCase();
  if (!c) return null;
  return US.has(c);
}

/**
 * The instructions this investor sees. Domestic-only funds show domestic; international-only show international;
 * "both" shows the set matching the investor's location (both sets when location is unknown).
 */
export function instructionsForInvestor(details: Record<string, unknown> | null | undefined, investorCountry: string | null | undefined) {
  const d = (details ?? {}) as Record<string, unknown>;
  const scope = wireScopeOf(d);
  const us = isUsCountry(investorCountry);
  const showDomestic = scope === "domestic" || (scope === "both" && us !== false);
  const showIntl = scope === "international" || (scope === "both" && us !== true);
  const pick = (keys: readonly string[]) =>
    Object.fromEntries(keys.filter((k) => String(d[k] ?? "").trim()).map((k) => [WIRE_FIELD_LABELS[k] ?? k, String(d[k])]));
  return {
    scope,
    domestic: showDomestic ? pick(DOMESTIC_WIRE_FIELDS) : null,
    international: showIntl ? pick(INTL_WIRE_FIELDS) : null,
  };
}
