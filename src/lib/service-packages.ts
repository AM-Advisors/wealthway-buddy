/**
 * Harmonious service packages (Phase 3.10B) — pure rules.
 * Package → included components → included quantities → pricing rule → add-ons.
 * Prices always come from the canonical rate card passed in; nothing here is a
 * second price table. Commercial states never feed investor readiness.
 */

export type CapTier = "free" | "starter" | "growth" | "scale" | "enterprise";
export const CAP_TIERS: CapTier[] = ["free", "starter", "growth", "scale", "enterprise"];
export type OnboardingBilling = "annual" | "per_investor";

export type ClientServiceConfig = {
  spv?: { structure: "standard" | "series"; masterId?: string | null; expectedRaiseCents?: number | null; formationState?: string | null } | null;
  fund?: { management: boolean; formationState?: string | null } | null;
  capTable?: { tier: CapTier } | null;
  investorOnboarding?: { billing: OnboardingBilling | null } | null;
  taxes?: { sets: number } | null;
  financialReporting?: { reports: number } | null;
  alaCarte?: { serviceKey: string; quantity: number }[];
};

export type EntitlementKind = "asset" | "class" | "close" | "capital_account_statements" | "investor_onboarding";
export type Entitlement = { kind: EntitlementKind; quantity: number; source: string };

/** Catalog keys whose wording changed. Historical documents are never rewritten. */
export const SERVICE_LABEL_OVERRIDES: Record<string, string> = { delaware_formation: "State Formation" };
export const serviceLabel = (key: string, fallback: string) => SERVICE_LABEL_OVERRIDES[key] ?? fallback;

const SPV_COMMON = [
  "ein_ss4", "governing_documents", "bank_setup", "form_d", "blue_sky", "wire_instructions", "filing_tracking",
  "capital_account_statements", "investor_onboarding",
];
export const ONBOARDING_COMPONENTS = [
  "kyc", "kyb", "aml_screening", "sanctions_screening", "tax_doc_collection", "accreditation_506b",
  "accreditation_506c", "beneficial_owner_screening", "capital_accounts", "investor_records", "funding_tracking", "investor_inquiries",
];
export const TAX_COMPONENTS = ["tax_state", "tax_k1", "tax_1042s", "tax_1065"];
export const REPORTING_COMPONENTS = ["fund_expenses", "capital_account_statements", "investor_reporting"];

export type PackageDef = {
  key: string; label: string; components: string[]; includedText: string[];
  entitlements: Partial<Record<EntitlementKind, number>>;
};

const QTY_TEXT = ["1 asset included", "1 class included", "1 close included"];

export const PACKAGES: Record<string, PackageDef> = {
  spv_standard: {
    key: "spv_standard", label: "Standard SPV LLC", components: SPV_COMMON,
    includedText: ["EIN / SS-4 coordination", "Governing-document coordination", "Bank-account setup or coordination", "Form D filing support", "Blue Sky filing support", ...QTY_TEXT, "Wire-instruction management", "Filing-deadline tracking", "1 set of Capital-account statements", "Investor Onboarding"],
    entitlements: { asset: 1, class: 1, close: 1, capital_account_statements: 1, investor_onboarding: 1 },
  },
  spv_series: {
    key: "spv_series", label: "Series SPV LLC", components: ["management_llc", "registered_agent", ...SPV_COMMON],
    includedText: ["Series LLC Formation under a Harmonious-owned Master", "EIN / SS-4 coordination", "Registered agent coordination", "Governing-document coordination", "Bank-account setup or coordination", "Form D filing support", "Blue Sky filing support", ...QTY_TEXT, "Wire-instruction management", "Filing-deadline tracking", "1 set of Capital-account statements", "Investor Onboarding"],
    entitlements: { asset: 1, class: 1, close: 1, capital_account_statements: 1, investor_onboarding: 1 },
  },
  fund_management: {
    key: "fund_management", label: "Fund Management",
    components: ["fund_management", "entity_formation", "delaware_formation", "ein_ss4", "registered_agent", "governing_documents", "bank_setup", "form_d", "blue_sky", "wire_instructions", "filing_tracking"],
    includedText: ["U.S. entity formation", "State Formation", "EIN / SS-4 coordination", "Registered agent coordination", "Governing-document coordination", "Bank-account setup or coordination", "Form D filing support", "Blue Sky filing support", ...QTY_TEXT, "Wire-instruction management", "Filing-deadline tracking"],
    entitlements: { asset: 1, class: 1, close: 1 },
  },
  investor_onboarding: {
    key: "investor_onboarding", label: "Investor Onboarding", components: ["investor_onboarding", ...ONBOARDING_COMPONENTS],
    includedText: ["KYC", "KYB", "AML", "Sanctions screening", "W-9 / W-8 collection", "Rule 506(b) onboarding", "Rule 506(c) verification", "Beneficial-owner screening", "Capital-account tracking", "Investor records", "Investor funding tracking", "Investor inquiries"],
    entitlements: { investor_onboarding: 1 },
  },
  taxes: {
    key: "taxes", label: "Taxes", components: TAX_COMPONENTS,
    includedText: ["State partnership return coordination", "Schedule K-1 coordination", "Form 1042-S coordination", "Form 1065 coordination"], entitlements: {},
  },
  financial_reporting: {
    key: "financial_reporting", label: "Financial Reporting", components: ["financial_statements", ...REPORTING_COMPONENTS],
    includedText: ["Fund expense administration", "1 set of Capital-account statements", "Investor reporting"],
    entitlements: { capital_account_statements: 1 },
  },
};

/** Rate-card service keys each package prices from. */
export const RATE_KEYS = {
  fund_management: "fund_management",
  onboarding_annual: "investor_onboarding",
  onboarding_per_investor: "investor_onboarding_per_investor",
  taxes: "tax_k1",
  financial_reporting: "financial_statements",
} as const;
/** À la carte keys that buy more of an included entitlement. */
const ADDITIONAL_QTY: Record<string, EntitlementKind> = {
  additional_asset: "asset", additional_close: "close", capital_account_statements: "capital_account_statements",
};

export type RateItem = { serviceKey: string | null; label: string; amountCents: number | null; pricingModel: string | null; passThrough?: boolean; category?: string | null };
export type SpvTier = { minCents: number; maxCents: number | null; amountCents: number; label: string };

const dollars = (s: string) => Math.round(Number(s.replace(/[$,]/g, "")) * 100);

/** Reads the raise-based SPV tiers from the rate card labels ("SPV under $250,000", "SPV $250,000–$1,000,000", "SPV over $1,000,000"). */
export function spvTiers(rate: readonly RateItem[]): SpvTier[] {
  const out: SpvTier[] = [];
  const seen = new Set<string>();
  for (const r of rate) {
    if (r.amountCents == null || !/^SPV\s/i.test(r.label) || seen.has(r.label)) continue;
    const m = r.label.match(/\$[\d,]+/g) ?? [];
    let t: SpvTier | null = null;
    if (/under/i.test(r.label) && m[0]) t = { minCents: 0, maxCents: dollars(m[0]), amountCents: r.amountCents, label: r.label };
    else if (/over/i.test(r.label) && m[0]) t = { minCents: dollars(m[0]), maxCents: null, amountCents: r.amountCents, label: r.label };
    else if (m.length === 2) t = { minCents: dollars(m[0]!), maxCents: dollars(m[1]!), amountCents: r.amountCents, label: r.label };
    if (t) { seen.add(r.label); out.push(t); }
  }
  return out.sort((a, b) => a.minCents - b.minCents);
}

export function spvPriceFor(raiseCents: number, tiers: readonly SpvTier[]): SpvTier | null {
  return tiers.find((t) => raiseCents >= t.minCents && (t.maxCents == null || raiseCents < t.maxCents || (t === tiers[tiers.length - 1]))) ?? null;
}

function rateFor(rate: readonly RateItem[], key: string, prefer?: string): RateItem | null {
  const all = rate.filter((r) => r.serviceKey === key);
  return (prefer ? all.find((r) => r.pricingModel === prefer) : null) ?? all[0] ?? null;
}

export type PriceStatus = "priced" | "included" | "raise_based" | "pricing_required" | "billed_at_cost";
export type PriceLine = {
  key: string; label: string; status: PriceStatus; quantity: number; unitCents: number | null; totalCents: number | null;
  unit: string | null; note: string | null; rateKey: string | null;
};

export function hasSpv(c: ClientServiceConfig) { return Boolean(c.spv); }
export function selectedPackages(c: ClientServiceConfig): string[] {
  const out: string[] = [];
  if (c.spv) out.push(c.spv.structure === "series" ? "spv_series" : "spv_standard");
  if (c.fund?.management) out.push("fund_management");
  if (c.investorOnboarding) out.push("investor_onboarding");
  if (c.taxes) out.push("taxes");
  if (c.financialReporting) out.push("financial_reporting");
  return out;
}

/** Components already included by the selected packages (for "Included" instead of charging again). */
export function includedComponents(c: ClientServiceConfig): Set<string> {
  const s = new Set<string>();
  for (const p of selectedPackages(c)) for (const k of PACKAGES[p]!.components) s.add(k);
  return s;
}

/** Included entitlements with their source; never summed into charges. */
export function entitlementsFor(c: ClientServiceConfig): Entitlement[] {
  const out: Entitlement[] = [];
  for (const p of selectedPackages(c)) {
    for (const [kind, q] of Object.entries(PACKAGES[p]!.entitlements)) {
      if (p === "investor_onboarding" && hasSpv(c)) continue; // already included with SPV
      const qty = p === "financial_reporting" && kind === "capital_account_statements" ? Math.max(1, c.financialReporting?.reports ?? 1) : q!;
      out.push({ kind: kind as EntitlementKind, quantity: qty, source: PACKAGES[p]!.label });
    }
  }
  return out;
}

export function validateConfig(c: ClientServiceConfig, knownMasterIds?: readonly string[]): string[] {
  const e: string[] = [];
  if (c.spv) {
    if (c.spv.structure !== "standard" && c.spv.structure !== "series") e.push("Choose Standard SPV LLC or Series SPV LLC.");
    if (c.spv.structure === "series" && c.spv.masterId && knownMasterIds && !knownMasterIds.includes(c.spv.masterId)) e.push("Choose a Harmonious-owned Master from the list.");
  }
  if (c.capTable && !CAP_TIERS.includes(c.capTable.tier)) e.push("Choose one Cap Table tier.");
  if (c.investorOnboarding && !hasSpv(c) && !c.investorOnboarding.billing) e.push("Choose how Investor Onboarding is billed: Annual or Per Investor.");
  if (c.taxes && (!Number.isInteger(c.taxes.sets) || c.taxes.sets < 1)) e.push("Number of tax sets must be 1 or more.");
  if (c.financialReporting && (!Number.isInteger(c.financialReporting.reports) || c.financialReporting.reports < 1)) e.push("Number of reports must be 1 or more.");
  for (const a of c.alaCarte ?? []) if (!Number.isInteger(a.quantity) || a.quantity < 1) e.push("À la carte quantities must be 1 or more.");
  return e;
}

const line = (p: Partial<PriceLine> & Pick<PriceLine, "key" | "label" | "status">): PriceLine => ({
  quantity: 1, unitCents: null, totalCents: null, unit: null, note: null, rateKey: null, ...p,
});

function priced(key: string, label: string, r: RateItem | null, qty: number, unit: string | null): PriceLine {
  if (!r || r.amountCents == null) return line({ key, label, status: r?.passThrough ? "billed_at_cost" : "pricing_required", quantity: qty, note: r?.passThrough ? "Billed at cost" : "Pricing Required", rateKey: r?.serviceKey ?? null });
  return line({ key, label, status: "priced", quantity: qty, unitCents: r.amountCents, totalCents: r.amountCents * qty, unit, rateKey: r.serviceKey });
}

/** Resolves every selected package against the current rate card. */
export function priceConfig(c: ClientServiceConfig, rate: readonly RateItem[], catalogNames: Record<string, string> = {}): PriceLine[] {
  const out: PriceLine[] = [];
  if (c.spv) {
    const p = PACKAGES[c.spv.structure === "series" ? "spv_series" : "spv_standard"]!;
    const tiers = spvTiers(rate);
    const t = c.spv.expectedRaiseCents ? spvPriceFor(c.spv.expectedRaiseCents, tiers) : null;
    out.push(t
      ? line({ key: p.key, label: p.label, status: "priced", unitCents: t.amountCents, totalCents: t.amountCents, unit: "per SPV", note: `Raise-based: ${t.label}` })
      : line({ key: p.key, label: p.label, status: tiers.length ? "raise_based" : "pricing_required", note: tiers.length ? "Raise-based pricing" : "Pricing Required" }));
  }
  if (c.fund?.management) out.push(priced("fund_management", "Fund Management", rateFor(rate, RATE_KEYS.fund_management), 1, "per year"));
  if (c.investorOnboarding) {
    if (hasSpv(c)) out.push(line({ key: "investor_onboarding", label: "Investor Onboarding", status: "included", note: "Included with SPV" }));
    else if (c.investorOnboarding.billing === "per_investor") out.push(priced("investor_onboarding", "Investor Onboarding", rateFor(rate, RATE_KEYS.onboarding_per_investor), 1, "per investor"));
    else if (c.investorOnboarding.billing === "annual") out.push(priced("investor_onboarding", "Investor Onboarding", rateFor(rate, RATE_KEYS.onboarding_annual), 1, "per year"));
    else out.push(line({ key: "investor_onboarding", label: "Investor Onboarding", status: "pricing_required", note: "Choose Annual or Per Investor" }));
  } else if (hasSpv(c)) {
    out.push(line({ key: "investor_onboarding", label: "Investor Onboarding", status: "included", note: "Included with SPV" }));
  }
  if (c.taxes) out.push(priced("taxes", "Taxes", rateFor(rate, RATE_KEYS.taxes), Math.max(1, c.taxes.sets), "per set"));
  if (c.financialReporting) out.push(priced("financial_reporting", "Financial Reporting", rateFor(rate, RATE_KEYS.financial_reporting), Math.max(1, c.financialReporting.reports), "per report"));
  if (c.capTable) {
    const r = rateFor(rate, `cap_table_${c.capTable.tier}`, "annual");
    const label = `Cap Table Management — ${c.capTable.tier[0]!.toUpperCase()}${c.capTable.tier.slice(1)}`;
    out.push(r && r.amountCents != null ? priced(`cap_table_${c.capTable.tier}`, label, r, 1, r.pricingModel === "annual" ? "per year" : "per month")
      : line({ key: `cap_table_${c.capTable.tier}`, label, status: "pricing_required", note: "Pricing Required" }));
  }
  const included = includedComponents(c);
  for (const a of c.alaCarte ?? []) {
    const name = serviceLabel(a.serviceKey, catalogNames[a.serviceKey] ?? a.serviceKey);
    const ent = ADDITIONAL_QTY[a.serviceKey];
    if (ent) {
      const l = priced(a.serviceKey, `${name} — Additional Quantity`, rateFor(rate, a.serviceKey), a.quantity, null);
      out.push({ ...l, note: l.note ?? "Beyond the included quantity" });
    } else if (included.has(a.serviceKey)) {
      out.push(line({ key: a.serviceKey, label: name, status: "included", note: "Included in package" }));
    } else {
      out.push(priced(a.serviceKey, name, rateFor(rate, a.serviceKey), a.quantity, null));
    }
  }
  return out;
}

/** Catalog service keys a Fund inherits as proposed services. */
export function serviceKeysFor(c: ClientServiceConfig, packageKeys?: readonly string[]): string[] {
  const pk = packageKeys ?? selectedPackages(c);
  const s = new Set<string>();
  for (const p of pk) for (const k of PACKAGES[p]?.components ?? []) s.add(k);
  for (const a of c.alaCarte ?? []) s.add(a.serviceKey);
  return [...s];
}

/** Keeps only the chosen packages of a Client configuration for one Fund. Cap Table stays Client-level unless chosen. */
export function fundSubset(c: ClientServiceConfig, packageKeys: readonly string[]): ClientServiceConfig {
  const has = (k: string) => packageKeys.includes(k);
  return {
    spv: c.spv && (has("spv_standard") || has("spv_series")) ? c.spv : null,
    fund: c.fund?.management && has("fund_management") ? c.fund : null,
    investorOnboarding: c.investorOnboarding && has("investor_onboarding") ? c.investorOnboarding : null,
    taxes: c.taxes && has("taxes") ? c.taxes : null,
    financialReporting: c.financialReporting && has("financial_reporting") ? c.financialReporting : null,
    capTable: c.capTable && has("cap_table") ? c.capTable : null,
    alaCarte: has("ala_carte") ? c.alaCarte ?? [] : [],
  };
}

/** Deterministic mapping of old flat selections. Anything uncertain stays for Service Mapping Review. */
export function mapLegacyServices(keys: readonly string[]): { config: ClientServiceConfig; review: string[] } {
  const k = new Set(keys);
  const config: ClientServiceConfig = { alaCarte: [] };
  const review: string[] = [];
  const used = new Set<string>();
  if (TAX_COMPONENTS.some((x) => k.has(x))) { config.taxes = { sets: 1 }; TAX_COMPONENTS.forEach((x) => used.add(x)); }
  if (k.has("financial_statements") || k.has("investor_reporting")) {
    config.financialReporting = { reports: 1 }; ["financial_statements", ...REPORTING_COMPONENTS].forEach((x) => used.add(x));
  }
  if (k.has("investor_onboarding") || ONBOARDING_COMPONENTS.some((x) => k.has(x))) {
    config.investorOnboarding = { billing: null }; // billing method was never recorded
    ["investor_onboarding", ...ONBOARDING_COMPONENTS].forEach((x) => used.add(x));
    review.push("investor_onboarding_billing");
  }
  const tiers = CAP_TIERS.filter((t) => k.has(`cap_table_${t}`));
  if (tiers.length === 1) { config.capTable = { tier: tiers[0]! }; used.add(`cap_table_${tiers[0]}`); }
  else if (tiers.length > 1) tiers.forEach((t) => review.push(`cap_table_${t}`));
  for (const x of keys) if (!used.has(x) && !review.includes(x)) review.push(x);
  return { config, review };
}

export type ClientServiceStatus = "configured" | "service_mapping_review" | "legacy_service_review" | "none";
export const CLIENT_SERVICE_STATUS_LABEL: Record<ClientServiceStatus, string> = {
  configured: "Expected services set",
  service_mapping_review: "Service Mapping Review",
  legacy_service_review: "Legacy Service Review",
  none: "No expected services yet",
};
export function clientServiceStatus(current: { mappingReview: string[] } | null, legacy: readonly string[]): ClientServiceStatus {
  if (current) return current.mappingReview.length ? "service_mapping_review" : "configured";
  return legacy.length ? "legacy_service_review" : "none";
}
/** Commercial service states are internal follow-ups; they never gate readiness. */
export const isServiceReadinessCondition = (_s: ClientServiceStatus) => false;

export function summarize(lines: readonly PriceLine[]): string[] {
  const money = (c: number) => `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return lines.map((l) => {
    if (l.status === "priced") return l.quantity > 1 ? `${l.label}: ${l.quantity} × ${money(l.unitCents!)}${l.unit ? ` ${l.unit}` : ""}` : `${l.label}: ${money(l.unitCents!)}${l.unit ? ` ${l.unit}` : ""}`;
    return `${l.label}: ${l.note ?? l.status}`;
  });
}

/** Only one Primary contact per Client. */
export function primaryConflict(designations: readonly (readonly string[])[]): boolean {
  return designations.filter((d) => d.includes("Primary")).length > 1;
}
