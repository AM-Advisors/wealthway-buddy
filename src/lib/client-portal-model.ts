/**
 * Client portal information architecture — pure rules, no I/O.
 *
 * Platform sign-offs vs documents, Fund vs SPV setup schemas, request groups,
 * My Funds projection/filters, the investor-safe Fund view and workspace
 * categories. Navigation built from these is a courtesy: every Fund is still
 * authorised server-side from the person's actual relationships.
 */

/* ======================================== platform agreements vs documents */

export type PlatformCategory = "platform_agreement" | "pricing_commercial";

/** policy_acceptances.kind → platform section. Unknown kinds stay platform agreements. */
const POLICY_KIND_META: Record<string, { label: string; category: PlatformCategory; order: number }> = {
  terms: { label: "Terms & Conditions", category: "platform_agreement", order: 1 },
  terms_of_service: { label: "Terms & Conditions", category: "platform_agreement", order: 1 },
  e_records: { label: "Electronic Records / E-Sign Consent", category: "platform_agreement", order: 2 },
  esign: { label: "Electronic Records / E-Sign Consent", category: "platform_agreement", order: 2 },
  e_sign: { label: "Electronic Records / E-Sign Consent", category: "platform_agreement", order: 2 },
  privacy: { label: "Privacy", category: "platform_agreement", order: 3 },
  migration: { label: "Migration Terms", category: "platform_agreement", order: 4 },
  pricing: { label: "Standard Pricing Acknowledgment", category: "pricing_commercial", order: 1 },
  fee_schedule: { label: "Platform Fee Schedule", category: "pricing_commercial", order: 2 },
};

export function policyMeta(kind: string) {
  const k = String(kind ?? "").toLowerCase();
  return POLICY_KIND_META[k] ?? { label: k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) || "Platform acknowledgment", category: "platform_agreement" as const, order: 9 };
}

export type Acceptance = { id: string; kind: string; version: string | number; accepted_at: string | null; signer_name?: string | null; effective_date?: string | null };

export type AcceptanceHistoryRow = {
  id: string;
  kind: string;
  label: string;
  category: PlatformCategory;
  version: string;
  acceptedBy: string | null;
  acceptedAt: string | null;
  effectiveDate: string | null;
  current: boolean;
};

/**
 * Every acceptance is kept (no history lost). The newest acceptance per kind is
 * "Current"; older ones are "Superseded".
 */
export function platformAgreementHistory(rows: readonly Acceptance[]) {
  const sorted = [...rows].sort((a, b) => String(b.accepted_at ?? "").localeCompare(String(a.accepted_at ?? "")));
  const seen = new Set<string>();
  const history: AcceptanceHistoryRow[] = sorted.map((a) => {
    const meta = policyMeta(a.kind);
    const key = meta.label;
    const current = !seen.has(key);
    seen.add(key);
    return {
      id: a.id,
      kind: a.kind,
      label: meta.label,
      category: meta.category,
      version: String(a.version),
      acceptedBy: a.signer_name ?? null,
      acceptedAt: a.accepted_at,
      effectiveDate: a.effective_date ?? null,
      current,
    };
  });
  const order = (r: AcceptanceHistoryRow) => policyMeta(r.kind).order;
  return {
    agreements: history.filter((h) => h.current && h.category === "platform_agreement").sort((a, b) => order(a) - order(b)),
    pricing: history.filter((h) => h.current && h.category === "pricing_commercial").sort((a, b) => order(a) - order(b)),
    history,
  };
}

export type SignedRecord = { id: string; kind: "agreement" | "policy" | string };

/** Documents keep only real executed documents; policy sign-offs go to Platform Agreements. */
export function separateSignedRecords<T extends SignedRecord>(rows: readonly T[]) {
  return { documents: rows.filter((r) => r.kind !== "policy"), platform: rows.filter((r) => r.kind === "policy") };
}

export const DOCUMENT_SECTIONS = [
  { key: "platform", label: "Platform Agreements" },
  { key: "client_contracts", label: "Client Contracts" },
  { key: "fund", label: "Fund Documents" },
  { key: "investment", label: "Investment Documents" },
  { key: "tax", label: "Tax Documents" },
] as const;

/* ============================================================ fund types */

export const FUND_TYPES = [
  { value: "venture_capital", label: "Venture Capital", filter: "vc" },
  { value: "private_equity", label: "Private Equity", filter: "pe" },
  { value: "hedge", label: "Hedge Fund", filter: "hedge" },
  { value: "real_estate", label: "Real Estate", filter: "real_estate" },
  { value: "private_credit", label: "Private Credit", filter: "private_credit" },
  { value: "fund_of_funds", label: "Fund of Funds", filter: "other" },
  { value: "search_fund", label: "Search Fund", filter: "other" },
  { value: "other_private", label: "Other Private Fund", filter: "other" },
] as const;
export type FundTypeValue = (typeof FUND_TYPES)[number]["value"];

export const MY_FUNDS_FILTERS = [
  { key: "all", label: "All" },
  { key: "vc", label: "VC" },
  { key: "pe", label: "PE" },
  { key: "hedge", label: "Hedge" },
  { key: "real_estate", label: "Real Estate" },
  { key: "private_credit", label: "Private Credit" },
  { key: "spv", label: "SPV" },
  { key: "other", label: "Other" },
] as const;
export type MyFundsFilter = (typeof MY_FUNDS_FILTERS)[number]["key"];

/** Map the authoritative Fund record's free-text fund_type onto a filter bucket. */
export function fundFilterKey(fundType: string | null | undefined, entityType?: string | null): Exclude<MyFundsFilter, "all"> {
  const t = `${fundType ?? ""} ${entityType ?? ""}`.toLowerCase();
  if (/\bspv\b|special purpose|single.?purpose/.test(t)) return "spv";
  const exact = FUND_TYPES.find((f) => t.includes(f.value));
  if (exact) return exact.filter;
  if (/venture|\bvc\b/.test(t)) return "vc";
  if (/private equity|\bpe\b|buyout/.test(t)) return "pe";
  if (/hedge/.test(t)) return "hedge";
  if (/real estate|property|reit/.test(t)) return "real_estate";
  if (/credit|debt|lending/.test(t)) return "private_credit";
  return "other";
}

export function fundTypeLabel(fundType: string | null | undefined, entityType?: string | null) {
  const key = fundFilterKey(fundType, entityType);
  if (key === "spv") return "SPV";
  const exact = FUND_TYPES.find((f) => (fundType ?? "").toLowerCase() === f.value);
  if (exact) return exact.label;
  return MY_FUNDS_FILTERS.find((f) => f.key === key)?.label ?? "Other";
}

/* ======================================================== setup schemas */

export type SetupField = { key: string; label: string; helpKey?: string; kind?: "text" | "money" | "percent" | "date" | "choice"; options?: string[]; professional?: boolean };

const ECON: SetupField[] = [
  { key: "management_fee", label: "Management fee", helpKey: "management_fee", kind: "percent" },
  { key: "carried_interest", label: "Carried interest", helpKey: "carried_interest", kind: "percent" },
  { key: "gp_commitment", label: "GP commitment", helpKey: "gp", kind: "money" },
  { key: "minimum_investment", label: "Minimum investment", kind: "money" },
];

const COMMON_FUND: SetupField[] = [
  { key: "fund_name", label: "Fund name" },
  { key: "target_size", label: "Target Fund size", kind: "money" },
  { key: "offering_exemption", label: "Offering exemption (506(b) / 506(c))", helpKey: "506b", kind: "choice", options: ["506(b)", "506(c)", "Not sure"], professional: true },
];

export const FUND_SETUP_SCHEMAS: Record<FundTypeValue, SetupField[]> = {
  venture_capital: [
    ...COMMON_FUND,
    { key: "investment_period", label: "Investment period" },
    { key: "fund_term", label: "Fund term" },
    ...ECON,
    { key: "strategy", label: "Strategy" },
    { key: "portfolio_focus", label: "Portfolio / investment focus" },
    { key: "capital_call_structure", label: "Capital call structure", helpKey: "capital_call" },
  ],
  private_equity: [
    ...COMMON_FUND,
    { key: "investment_period", label: "Investment period" },
    { key: "fund_term", label: "Fund term" },
    ...ECON,
    { key: "acquisition_strategy", label: "Acquisition / investment strategy" },
    { key: "capital_call_structure", label: "Capital call structure", helpKey: "capital_call" },
  ],
  hedge: [
    { key: "fund_name", label: "Fund name" },
    { key: "strategy", label: "Strategy" },
    { key: "subscriptions", label: "Subscription terms", helpKey: "subscription" },
    { key: "redemptions", label: "Redemption terms", helpKey: "redemption" },
    { key: "liquidity_terms", label: "Liquidity terms (lock-up, gates, notice)" },
    { key: "nav_frequency", label: "NAV frequency", helpKey: "nav", kind: "choice", options: ["Monthly", "Quarterly", "Other"] },
    { key: "management_fee", label: "Management fee", helpKey: "management_fee", kind: "percent" },
    { key: "performance_allocation", label: "Performance / incentive allocation", kind: "percent" },
    { key: "high_water_mark", label: "High-water mark / hurdle" },
    { key: "service_providers", label: "Administrator / broker / custodian relationships" },
    { key: "regulatory_setup", label: "Regulatory setup", professional: true },
  ],
  real_estate: [...COMMON_FUND, { key: "property_focus", label: "Property type / geography" }, { key: "fund_term", label: "Fund term" }, ...ECON.filter((f) => f.key !== "carried_interest"), { key: "promote", label: "Promote", helpKey: "promote", kind: "percent" }],
  private_credit: [...COMMON_FUND, { key: "credit_strategy", label: "Credit strategy" }, { key: "fund_term", label: "Fund term" }, ...ECON, { key: "capital_call_structure", label: "Capital call structure", helpKey: "capital_call" }],
  fund_of_funds: [...COMMON_FUND, { key: "underlying_funds", label: "Underlying fund focus" }, ...ECON],
  search_fund: [...COMMON_FUND, { key: "search_focus", label: "Search focus / industry" }, ...ECON],
  other_private: [...COMMON_FUND, { key: "strategy", label: "Strategy" }, ...ECON],
};

export const SPV_SETUP_SCHEMA: SetupField[] = [
  { key: "spv_name", label: "SPV name", helpKey: "spv" },
  { key: "investment_asset", label: "Investment / asset" },
  { key: "issuer_target", label: "Issuer / target company" },
  { key: "target_raise", label: "Target raise", kind: "money" },
  { key: "jurisdiction", label: "Jurisdiction", professional: true },
  { key: "vehicle_structure", label: "Vehicle / entity structure", professional: true },
  { key: "offering_exemption", label: "Offering exemption (506(b) / 506(c))", helpKey: "506b", kind: "choice", options: ["506(b)", "506(c)", "Not sure"], professional: true },
  { key: "investor_eligibility", label: "Investor eligibility", helpKey: "accredited_investor", professional: true },
  { key: "management_fee", label: "Management fee", helpKey: "management_fee", kind: "percent" },
  { key: "carried_interest", label: "Carried interest / promote", helpKey: "carried_interest", kind: "percent" },
  { key: "minimum_investment", label: "Minimum investment", kind: "money" },
  { key: "expected_close", label: "Expected close", kind: "date" },
];

/** Fund and SPV are separate workflows; SPV is shorter and transaction-focused. */
export function setupSchemaFor(vehicle: "fund" | "spv", fundType?: string | null): SetupField[] {
  if (vehicle === "spv") return SPV_SETUP_SCHEMA;
  const ft = (FUND_TYPES.find((f) => f.value === fundType)?.value ?? "other_private") as FundTypeValue;
  return FUND_SETUP_SCHEMAS[ft];
}

export const PROFESSIONAL_DETERMINATION_NOTE = "Not sure? Leave this for Harmonious review.";

/* ================================== set up from existing MSA/SOW (prefill) */

export type ContractTermFact = { term_key: string; current_value: string | null; status: string; service_key?: string | null; amount_cents?: number | null; source_page?: number | null };

export type PrefillField = { key: string; value: string; source: "found_in_agreement"; confirmed: boolean; needsConfirmation: boolean; page: number | null };

const TERM_TO_FIELD: Record<string, string> = {
  fund_name: "fund_name",
  entity_name: "fund_name",
  effective_date: "effective_date",
  term_length: "fund_term",
  management_fee: "management_fee",
  carried_interest: "carried_interest",
  scope_of_services: "scope",
};
const MATERIAL = new Set(["fund_name", "management_fee", "carried_interest", "effective_date", "scope"]);

/**
 * Prefill only from facts the contract supports. Human-reviewed (confirmed /
 * corrected) terms are "Found in agreement"; unreviewed AI extractions are
 * proposed and material ones always need confirmation. Nothing is invented.
 */
export function prefillFromContract(terms: readonly ContractTermFact[], opts: { sowExecuted: boolean }) {
  const fields: PrefillField[] = [];
  for (const t of terms) {
    const key = TERM_TO_FIELD[t.term_key];
    if (!key || !t.current_value || t.status === "not_applicable") continue;
    const reviewed = t.status === "confirmed" || t.status === "corrected";
    if (fields.some((f) => f.key === key)) continue;
    fields.push({ key, value: t.current_value, source: "found_in_agreement", confirmed: reviewed && opts.sowExecuted, needsConfirmation: !(reviewed && opts.sowExecuted) && MATERIAL.has(key), page: t.source_page ?? null });
  }
  const services = [...new Set(terms.filter((t) => t.service_key && (t.status === "confirmed" || t.status === "corrected")).map((t) => t.service_key as string))];
  const pricing = terms
    .filter((t) => t.service_key && t.amount_cents != null && (t.status === "confirmed" || t.status === "corrected"))
    .map((t) => ({ serviceKey: t.service_key as string, amountCents: t.amount_cents as number }));
  return { fields, proposedServices: services, pricing, unconfirmed: fields.filter((f) => f.needsConfirmation).map((f) => f.key) };
}

/* ======================================================= request screen */

export const REQUEST_GROUPS = [
  { key: "funds", label: "Funds & Investment Vehicles", intents: ["launch_fund", "launch_spv", "move_fund_spv"] },
  { key: "companies", label: "Companies & Entities", intents: ["add_company", "add_gp_mgmt", "add_entity", "cap_table"] },
  { key: "services", label: "Services", intents: ["add_service", "complete_filing", "transaction_support"] },
  { key: "migration", label: "Migration", intents: ["move_to_harmonious"] },
  { key: "other", label: "Other", intents: ["something_else"] },
] as const;

/* ============================================================ My Funds */

export type FundRelationship = "fund_manager" | "investor";

export type MyFundsFacts = {
  managedFundIds: readonly string[];
  investorFundIds: readonly string[];
};

export type FundRow = { id: string; name: string; fund_type: string | null; entity_type: string | null; is_open: boolean | null; client_name?: string | null };

/**
 * Only Funds the person is related to: exact fund-manager rows or their own
 * investments. Client membership alone never grants Fund access.
 */
export function buildMyFunds(facts: MyFundsFacts, funds: readonly FundRow[], outstanding: Record<string, number> = {}) {
  const managed = new Set(facts.managedFundIds);
  const invested = new Set(facts.investorFundIds);
  return funds
    .filter((f) => managed.has(f.id) || invested.has(f.id))
    .map((f) => {
      const relationships: FundRelationship[] = [];
      if (managed.has(f.id)) relationships.push("fund_manager");
      if (invested.has(f.id)) relationships.push("investor");
      const isManager = managed.has(f.id);
      return {
        id: f.id,
        name: f.name,
        typeLabel: fundTypeLabel(f.fund_type, f.entity_type),
        filter: fundFilterKey(f.fund_type, f.entity_type),
        relationships,
        relationshipLabel: relationships.map((r) => (r === "fund_manager" ? "Fund Manager" : "Investor")).join(" · "),
        status: f.is_open ? "Open" : "In setup",
        client: isManager ? f.client_name ?? null : null,
        setupStatus: isManager ? (f.is_open ? "Live" : "Setup in progress") : null,
        outstandingActions: isManager ? outstanding[f.id] ?? 0 : null,
        path: isManager ? `/manager/fund/${f.id}` : `/my-funds/${f.id}`,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function filterMyFunds<T extends { filter: string }>(rows: readonly T[], filter: MyFundsFilter) {
  return filter === "all" ? [...rows] : rows.filter((r) => r.filter === filter);
}

/* ================================================= investor-safe Fund view */

/** The only Fund fields an investor may see. */
export const INVESTOR_FUND_FIELDS = ["id", "name", "fund_type", "entity_type", "public_summary", "summary"] as const;

export const INVESTOR_FORBIDDEN_KEYS = [
  "investors", "other_investors", "manager_documents", "bank_accounts", "wire_instructions", "banking",
  "journal", "ledger", "accounting", "compliance", "compliance_reviews", "ops", "operations", "notes",
  "manager_review_notes", "fees_internal", "client_id",
] as const;

/**
 * Same Fund record, investor presentation: whitelisted Fund fields plus the
 * caller's own positions/documents only. Anything else is dropped.
 */
export function investorFundView(input: {
  fund: Record<string, unknown>;
  myPositions: readonly Record<string, unknown>[];
  myDocuments: readonly Record<string, unknown>[];
  notices?: readonly Record<string, unknown>[];
}) {
  const fund: Record<string, unknown> = {};
  for (const k of INVESTOR_FUND_FIELDS) if (k in input.fund) fund[k] = input.fund[k];
  const safe = (r: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) if (!(INVESTOR_FORBIDDEN_KEYS as readonly string[]).includes(k)) out[k] = v;
    return out;
  };
  return {
    fund: { ...fund, typeLabel: fundTypeLabel(input.fund["fund_type"] as string, input.fund["entity_type"] as string) },
    myInvestments: input.myPositions.map(safe),
    documents: input.myDocuments.map(safe),
    notices: (input.notices ?? []).map(safe),
  };
}

/* ================================================ workspace categories */

export type WorkspaceCategory = "company" | "funds" | "investments";

/** Categories come from relationships only — never email or a broad role. */
export function workspaceCategories(f: { companyIds: readonly string[]; clientIds: readonly string[]; managedFundIds: readonly string[]; investmentCount: number; investmentProfileIds: readonly string[] }) {
  const out: WorkspaceCategory[] = [];
  if (f.companyIds.length || f.clientIds.length) out.push("company");
  if (f.managedFundIds.length || f.investmentCount > 0) out.push("funds");
  if (f.investmentCount > 0 || f.investmentProfileIds.length) out.push("investments");
  return out;
}

export const CATEGORY_NAV: Record<WorkspaceCategory, { title: string; url: string; icon: string }> = {
  company: { title: "My Company", url: "/client", icon: "building" },
  funds: { title: "My Funds", url: "/my-funds", icon: "briefcase" },
  investments: { title: "My Investments", url: "/dashboard", icon: "money" },
};
