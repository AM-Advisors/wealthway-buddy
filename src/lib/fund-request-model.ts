/**
 * Client "Launch a new fund or SPV" request — pure rules.
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
  notes: string;
};

export function emptyRequest(kind = ""): FundRequest {
  return {
    kind, fund_name: "", investment_asset: "", target_raise: "", minimum_investment: "", expected_close: "",
    bank_or_custodian: "", counsel: "", auditor: "", tax_preparer: "Harmonious",
    legal_name: "", vehicle_structure: kind ? defaultVehicle(kind === "spv" ? "launch_spv" : "launch_fund", kind) : "",
    jurisdiction: "", already_formed: "", date_formed: "", has_ein: "",
    offering_exemption: "", investor_eligibility: "", management_fee: "", carried_interest: "", preferred_return: "",
    gp_commitment: "", fund_term: "", investment_period: "",
    classes: [{ name: "Class A", fee: "", carry: "", hurdle: "", minimum: "" }],
    documents_path: "", documents: [], banking_path: "", bank_name: "",
    managers: [], signatory: { name: "", email: "", title: "" }, service_keys: [], notes: "",
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
  if (!r.offering_exemption) add("economics", "Offering exemption");
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
  const entityType = r.vehicle_structure.includes("LP") ? "LP" : r.vehicle_structure.includes("Series") ? "Series LLC" : r.vehicle_structure.includes("LLC") ? "LLC" : r.vehicle_structure.includes("company") ? "Corporation" : "Other";
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
    ein_path: r.has_ein === "yes" ? "existing" : r.has_ein === "no" ? "harmonious" : null,
  };
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
    else if (k === "classes") out[k] = (v as RequestClass[]).map((c) => `${c.name}: fee ${c.fee || "—"}, carry ${c.carry || "—"}, hurdle ${c.hurdle || "—"}`).join("; ");
    else if (k === "managers") out[k] = (v as RequestPerson[]).map((p) => `${p.name} <${p.email}>`).join("; ");
    else if (k === "signatory") out[k] = `${r.signatory.name} <${r.signatory.email}> ${r.signatory.title}`.trim();
    else if (k === "documents") out[k] = (v as RequestDocument[]).map((d) => `${d.kind}: ${d.fileName}`).join("; ");
  }
  return out;
}

export const autoServices = (r: FundRequest) => coreServicesFor(r.vehicle_structure, r.offering_exemption);
