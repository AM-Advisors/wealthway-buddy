/**
 * Client "Launch a new fund or SPV" request - pure rules.
 * Sections mirror Harmonious Fund Setup so staff receive a pre-filled setup
 * they still confirm; nothing here marks any setup section complete.
 */
import { coreServicesFor, defaultVehicle } from "@/lib/client-portal-model";
import type { FundStructure } from "@/lib/fund-setup-model";

export const REQUEST_STEPS = [
  { key: "details", label: "Fund Details" },
  { key: "entity", label: "Entity & EIN" },
  { key: "economics", label: "Offering & Economics" },
  { key: "classes", label: "Classes" },
  { key: "documents", label: "Offering Documents" },
  { key: "banking", label: "Banking" },
  { key: "people", label: "People" },
  { key: "services", label: "Services" },
  { key: "review", label: "Review & send" },
] as const;
export type RequestStepKey = (typeof REQUEST_STEPS)[number]["key"];

export const FUND_KIND_TYPES: { value: string; label: string; structure: FundStructure; fundType: string }[] = [
  { value: "spv", label: "SPV (single deal)", structure: "spv", fundType: "Single asset SPV" },
  { value: "venture_capital", label: "Venture capital fund", structure: "vc_fund", fundType: "Venture capital" },
  { value: "private_equity", label: "Private equity fund", structure: "pe_fund", fundType: "Private equity" },
  { value: "real_estate", label: "Real estate fund", structure: "real_estate_fund", fundType: "Real estate" },
  { value: "private_credit", label: "Private credit fund", structure: "credit_fund", fundType: "Private credit" },
  { value: "hedge", label: "Hedge fund", structure: "hedge_fund", fundType: "Other" },
  { value: "fund_of_funds", label: "Fund of funds", structure: "fund_of_funds", fundType: "Other" },
  { value: "other_private", label: "Other", structure: "other", fundType: "Other" },
];

export const EXEMPTION_TO_REG: Record<string, string | null> = {
  "506(b)": "506b",
  "506(c)": "506c",
  "Reg CF": "regcf",
  "Reg A (Tier 1)": "rega",
  "Reg A+ (Tier 2)": "regaplus",
  "Not sure": null,
};

export const CLASS_TERM_OPTIONS = {
  fee: ["0%", "1%", "1.5%", "2%", "2.5%", "Other", "Not applicable"],
  carry: ["0%", "10%", "15%", "20%", "25%", "30%", "Other", "Not applicable"],
  hurdle: ["None", "6%", "8%", "10%", "Other", "Not applicable"],
};

export const SERIES_HOMES = [
  { value: "hcam_tx", label: "HCAM TX", jurisdiction: "Texas" },
  { value: "hcam_wy", label: "HCAM WY", jurisdiction: "Wyoming" },
  { value: "am_spv", label: "AM SPV Fund Management", jurisdiction: "Delaware" },
  { value: "own", label: "Bring my own", jurisdiction: null },
  { value: "new", label: "Set up new", jurisdiction: null },
] as const;
export const SERIES_NEW_ANNUAL_FEE = "$2,000 per year";
export const isSeries = (r: Pick<FundRequest, "vehicle_structure">) => r.vehicle_structure === "Series LLC";
/** Jurisdiction fixed by a Harmonious-managed Master LLC, else null. */
export const seriesJurisdiction = (home: string) => SERIES_HOMES.find((h) => h.value === home)?.jurisdiction ?? null;
export const isHarmoniousSeries = (r: Pick<FundRequest, "vehicle_structure" | "series_home">) =>
  isSeries(r) && ["hcam_tx", "hcam_wy", "am_spv"].includes(r.series_home);
/** Legal name for a series under a Harmonious master: "{Fund name}, a series of {Master LLC}". */
export const seriesLegalName = (r: Pick<FundRequest, "fund_name" | "vehicle_structure" | "series_home">) => {
  if (!isHarmoniousSeries(r) || !r.fund_name.trim()) return "";
  const master = SERIES_HOMES.find((h) => h.value === r.series_home)?.label ?? "";
  return `${r.fund_name.trim()}, a series of ${master}`;
};
/** SS-4 is collected when an already-formed series under a Harmonious master has no EIN. */
export const needsSs4 = (r: FundRequest) => isHarmoniousSeries(r) && r.already_formed === "yes" && r.has_ein === "no";

export type SeriesInfo = { legal_name: string; jurisdiction: string; date_formed: string; contact_name: string; contact_email: string; notes: string };
export const SS4_FIELDS: { key: string; label: string; required?: boolean; long?: boolean }[] = [
  { key: "legal_name", label: "1. Legal name of entity", required: true },
  { key: "trade_name", label: "2. Trade name (if different)" },
  { key: "care_of", label: "3. Executor / trustee / care of" },
  { key: "mailing_street", label: "4a. Mailing address", required: true },
  { key: "mailing_city_state_zip", label: "4b. City, state, ZIP", required: true },
  { key: "street_address", label: "5a. Street address (if different)" },
  { key: "street_city_state_zip", label: "5b. City, state, ZIP" },
  { key: "county_state", label: "6. County and state of principal business", required: true },
  { key: "responsible_party_name", label: "7a. Responsible party name", required: true },
  { key: "llc_members", label: "8b. Number of LLC members", required: true },
  { key: "entity_detail", label: "9a. Type of entity" },
  { key: "state_incorporated", label: "9b. State of formation", required: true },
  { key: "reason", label: "10. Reason for applying", required: true },
  { key: "date_started", label: "11. Date business started (YYYY-MM-DD)", required: true },
  { key: "closing_month", label: "12. Closing month of accounting year", required: true },
  { key: "employees_other", label: "13. Expected employees (0 if none)" },
  { key: "first_wages_date", label: "14. First date wages paid (or N/A)" },
  { key: "principal_activity", label: "16. Principal activity", required: true },
  { key: "principal_line", label: "17. Principal line of business / products", long: true },
  { key: "previous_ein", label: "18. Previous EIN (if ever applied)" },
  { key: "designee_name", label: "Third-party designee name" },
  { key: "designee_phone", label: "Designee phone" },
  { key: "applicant_name_title", label: "Applicant name and title", required: true },
  { key: "applicant_phone", label: "Applicant phone", required: true },
];
const blankSeries = (): SeriesInfo => ({ legal_name: "", jurisdiction: "", date_formed: "", contact_name: "", contact_email: "", notes: "" });

export type RequestClass = { name: string; fee: string; carry: string; hurdle: string; minimum: string };
export type RequestPerson = { name: string; email: string; title: string };
export type RequestDocument = { kind: string; fileName: string; path: string };

export type FundRequest = {
  kind: string; // FUND_KIND_TYPES value
  fund_name: string;
  investment_asset: string;
  target_raise: string;
  minimum_investment: string;
  expected_close: string;
  bank_or_custodian: string;
  counsel: string;
  auditor: string;
  tax_preparer: string; // "Harmonious" or a name
  legal_name: string;
  vehicle_structure: string;
  jurisdiction: string;
  already_formed: "yes" | "no" | "";
  date_formed: string;
  has_ein: "yes" | "no" | "";
  series_home: string;
  series_existing: SeriesInfo;
  series_new: SeriesInfo;
  series_fee_ack: boolean;
  ein_obtained_by: "harmonious" | "client" | "";
  ss4: Record<string, string>;
  offering_exemption: string;
  investor_eligibility: string;
  management_fee: string;
  carried_interest: string;
  preferred_return: string;
  gp_commitment: string;
  fund_term: string;
  investment_period: string;
  classes: RequestClass[];
  documents_path: "have" | "prepare" | "";
  documents: RequestDocument[];
  banking_path: "harmonious" | "client" | "";
  bank_name: string;
  managers: RequestPerson[];
  signatory: RequestPerson;
  service_keys: string[];
  /** Set when Management / Master LLC support is chosen: start setup of a new entity or transfer an existing one. */
  management_llc_path: "setup" | "transfer" | "";
  notes: string;
};

export function emptyRequest(kind = ""): FundRequest {
  return {
    kind, fund_name: "", investment_asset: "", target_raise: "", minimum_investment: "", expected_close: "",
    bank_or_custodian: "", counsel: "", auditor: "", tax_preparer: "Harmonious",
    legal_name: "", vehicle_structure: kind ? defaultVehicle(kind === "spv" ? "launch_spv" : "launch_fund", kind) : "",
    jurisdiction: "", already_formed: "", date_formed: "", has_ein: "",
    series_home: "", series_existing: blankSeries(), series_new: blankSeries(), series_fee_ack: false, ein_obtained_by: "", ss4: {},
    offering_exemption: "", investor_eligibility: "", management_fee: "", carried_interest: "", preferred_return: "",
    gp_commitment: "", fund_term: "", investment_period: "",
    classes: [{ name: "Class A", fee: "", carry: "", hurdle: "", minimum: "" }],
    documents_path: "", documents: [], banking_path: "", bank_name: "",
    managers: [], signatory: { name: "", email: "", title: "" }, service_keys: [], management_llc_path: "", notes: "",
  };
}

export const isSpv = (r: Pick<FundRequest, "kind">) => r.kind === "spv";

/** Missing required answers, per step. Empty object means ready to send. */
export function missingFields(r: FundRequest): Partial<Record<RequestStepKey, string[]>> {
  const out: Partial<Record<RequestStepKey, string[]>> = {};
  const add = (k: RequestStepKey, m: string) => (out[k] = [...(out[k] ?? []), m]);
  if (!r.kind) add("details", "Fund or SPV type");
  if (!r.fund_name.trim()) add("details", "Fund name");
  if (!r.vehicle_structure) add("entity", "Vehicle / entity structure");
  if (!r.jurisdiction) add("entity", "Jurisdiction");
  if (isSeries(r)) {
    if (!r.series_home) add("entity", "Master LLC");
    const own = r.series_home === "own" ? r.series_existing : r.series_home === "new" ? r.series_new : null;
    if (own && (!own.legal_name?.trim() || !own.jurisdiction || !own.contact_name?.trim() || !own.contact_email?.trim())) add("entity", r.series_home === "own" ? "Existing Series LLC details" : "New Series LLC details");
    if (r.series_home === "new" && !r.series_fee_ack) add("entity", "Acknowledge the $2,000 annual Series LLC fee");
  }
  if (r.already_formed === "no" && !r.ein_obtained_by) add("entity", "Who will obtain the EIN");
  if (r.already_formed === "yes" && !r.has_ein) add("entity", "Has an EIN");
  if (needsSs4(r)) {
    const miss = SS4_FIELDS.filter((f) => f.required && !String(r.ss4?.[f.key] ?? "").trim());
    if (miss.length) add("entity", `SS-4: ${miss.map((f) => f.label.replace(/^[\dab]+\.\s*/, "")).join(", ")}`);
  }
  if (!r.offering_exemption) add("economics", "Offering exemption");
  if ((r.service_keys ?? []).includes("management_llc") && !r.management_llc_path) add("services", "Management / Master LLC: set up a new entity or transfer an existing one");
  if (!r.signatory.name.trim() || !r.signatory.email.trim()) add("people", "Signatory name and email");
  return out;
}

export const dollarsToCents = (v: string | undefined) => {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};
const months = (v: string) => {
  const m = String(v).match(/(\d+(?:\.\d+)?)\s*(year|yr|y|month|mo|m)?/i);
  if (!m) return null;
  const n = Number(m[1]);
  return /^y/i.test(m[2] ?? "y") ? Math.round(n * 12) : Math.round(n);
};

/** Columns for the closed Fund record created from the request. */
export function offeringFieldsFor(r: FundRequest): Record<string, unknown> & { name: string } {
  const kind = FUND_KIND_TYPES.find((k) => k.value === r.kind);
  const entityType = r.vehicle_structure.includes("GP") ? "GP" : r.vehicle_structure.includes("LP") ? "LP" : r.vehicle_structure.includes("Series") ? "Series LLC" : r.vehicle_structure.includes("LLC") ? "LLC" : r.vehicle_structure.includes("company") ? "Corporation" : "Other";
  return {
    name: r.fund_name.trim(),
    legal_entity_name: r.legal_name.trim() || null,
    entity_type: entityType,
    fund_type: kind?.fundType ?? null,
    fund_type_other: kind?.fundType === "Other" ? kind.label : null,
    state_formed: r.jurisdiction || null,
    date_formed: r.already_formed === "yes" && r.date_formed ? r.date_formed : null,
    reg_type: EXEMPTION_TO_REG[r.offering_exemption] ?? null,
    target_raise_cents: dollarsToCents(r.target_raise),
    min_investment_cents: dollarsToCents(r.minimum_investment) ?? 0,
    banking_path: r.banking_path || null,
    ein_path: einPathFor(r),
  };
}

export function einPathFor(r: FundRequest): "existing" | "harmonious" | "client" | null {
  if (r.already_formed === "no") return r.ein_obtained_by || null;
  if (r.has_ein === "yes") return "existing";
  if (r.has_ein === "no") return "harmonious";
  return null;
}

/** SS-4 answers for Fund Setup (never contains a taxpayer ID). */
export function ss4For(r: FundRequest): Record<string, string | boolean> | null {
  if (!needsSs4(r)) return null;
  const out: Record<string, string | boolean> = { is_llc: true, llc_us_organized: true, entity_kind: "partnership" };
  for (const f of SS4_FIELDS) { const v = String(r.ss4?.[f.key] ?? "").trim(); if (v) out[f.key] = v; }
  return out;
}

/** Fund Setup draft values staff will see as "From client request". */
export function setupPrefillFor(r: FundRequest) {
  const kind = FUND_KIND_TYPES.find((k) => k.value === r.kind);
  return {
    structure: (kind?.structure ?? "other") as FundStructure,
    display_name: r.fund_name.trim() || null,
    legal_fund_name: r.legal_name.trim() || null,
    domicile: r.jurisdiction || null,
    entity_type: r.vehicle_structure || null,
    formation_date: r.already_formed === "yes" && r.date_formed ? r.date_formed : null,
    regulatory_structure: r.offering_exemption || null,
    investment_strategy: r.investment_asset || null,
    target_size_cents: dollarsToCents(r.target_raise),
    min_investment_cents: dollarsToCents(r.minimum_investment),
    target_close: r.expected_close || null,
    fund_term_months: r.fund_term ? months(r.fund_term) : null,
    investment_period_months: r.investment_period ? months(r.investment_period) : null,
    service_providers: {
      bank_or_custodian: r.bank_or_custodian || null,
      counsel: r.counsel || null,
      auditor: r.auditor || null,
      tax_preparer: r.tax_preparer || null,
      source: "client_request",
    },
    notes: "Pre-filled from the client's fund request. Confirm each value before approving.",
  };
}

/** Flat answers for the Operations request queue. */
export function flatAnswers(r: FundRequest): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(r)) {
    if (typeof v === "string") { if (v) out[k] = v; }
    else if (k === "classes") out[k] = (v as RequestClass[]).map((c) => `${c.name}: fee ${c.fee || "-"}, carry ${c.carry || "-"}, hurdle ${c.hurdle || "-"}`).join("; ");
    else if (k === "managers") out[k] = (v as RequestPerson[]).map((p) => `${p.name} <${p.email}>`).join("; ");
    else if (k === "signatory") out[k] = `${r.signatory.name} <${r.signatory.email}> ${r.signatory.title}`.trim();
    else if (k === "series_existing" || k === "series_new") {
      if (r.series_home === (k === "series_existing" ? "own" : "new")) out[k] = Object.entries(v as SeriesInfo).filter(([, x]) => x).map(([a, x]) => `${a}: ${x}`).join("; ");
    }
    else if (k === "series_fee_ack") { if (v && r.series_home === "new") out["invoice_item"] = `New Series LLC management - ${SERIES_NEW_ANNUAL_FEE} (client acknowledged; Operations to invoice)`; }
    else if (k === "ss4") { const s4 = ss4For(r); if (s4) out[k] = Object.entries(s4).map(([a, x]) => `${a}: ${x}`).join("; "); }
    else if (k === "documents") out[k] = (v as RequestDocument[]).map((d) => `${d.kind}: ${d.fileName}`).join("; ");
  }
  if (r.series_home) out["series_home"] = SERIES_HOMES.find((h) => h.value === r.series_home)?.label ?? r.series_home;
  return out;
}

/** Bundled offerings: one choice covering several catalogue components. */
export const SERVICE_BUNDLES: Record<string, { label: string; includes: string[] }> = {
  investor_onboarding: {
    label: "Investor Onboarding",
    includes: ["KYC", "KYB", "AML screening", "Sanctions screening", "Beneficial-owner screening", "W-9 / W-8 collection", "Investor records", "Investor inquiries"],
  },
  tax_k1: {
    label: "Tax",
    includes: ["Federal partnership return", "State partnership return", "Schedule K-1 coordination", "Form 1042-S coordination"],
  },
};
/** Catalogue keys never offered separately on a Fund request (bundled, included everywhere, or not offered). */
export const HIDDEN_FUND_SERVICE_KEYS = [
  "kyc", "kyb", "aml_screening", "sanctions_screening", "beneficial_owner_screening", "tax_doc_collection",
  "investor_records", "investor_inquiries", "tax_1065", "tax_state", "tax_1042s",
  "filing_tracking", "fund_management", "cap_table_free", "cap_table_starter", "cap_table_growth", "cap_table_scale", "cap_table_enterprise",
];
/** Included with every Fund (deadline tracking, capital accounts, statements, wire instructions). */
export const ALWAYS_INCLUDED_FUND_SERVICES = ["filing_tracking", "capital_accounts", "capital_account_statements", "wire_instructions"];

export const autoServices = (r: Pick<FundRequest, "kind" | "vehicle_structure" | "offering_exemption" | "jurisdiction">) => {
  const core = coreServicesFor(r.vehicle_structure, r.offering_exemption, r.jurisdiction).filter((k) => k !== "investor_onboarding");
  if (!r.vehicle_structure) return core;
  // Investor Onboarding is included for SPVs and a la carte for every other fund.
  if (r.kind === "spv") core.push("investor_onboarding");
  return Array.from(new Set([...core, ...ALWAYS_INCLUDED_FUND_SERVICES]));
};
/** Paid add-ons on a Fund request: chosen keys minus included and non-offered ones. */
export const fundAddOnKeys = (r: FundRequest) => {
  const core = autoServices(r);
  return Array.from(new Set((r.service_keys ?? []).filter((k) => !core.includes(k) && !HIDDEN_FUND_SERVICE_KEYS.includes(k))));
};
