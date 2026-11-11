/**
 * Fund facts first asked on the new fund request that have no dedicated fund column.
 * They live on fund_setups.setup_details (and service_providers / investment_strategy)
 * and are edited in Setup, so the request is never a second place to look.
 * Pure rules, no I/O.
 */

export type DetailOption = readonly [string, string];
export type DetailField = { key: SetupDetailKey; label: string; long?: boolean; options?: readonly DetailOption[] };

export const SETUP_DETAIL_KEYS = [
  "investor_eligibility", "gp_commitment", "class_name", "documents_path", "bank_name",
  "series_master", "management_llc_path", "client_notes",
] as const;
export type SetupDetailKey = (typeof SETUP_DETAIL_KEYS)[number];

export const SETUP_DETAIL_FIELDS: DetailField[] = [
  { key: "investor_eligibility", label: "Investor eligibility", long: true },
  { key: "gp_commitment", label: "GP commitment" },
  { key: "class_name", label: "Class name (one-class fund)" },
  { key: "documents_path", label: "Offering documents", options: [["have", "Client provides the documents"], ["prepare", "Harmonious prepares from templates"]] },
  { key: "bank_name", label: "Preferred bank" },
  { key: "series_master", label: "Series master details", long: true },
  { key: "management_llc_path", label: "Management company", options: [["setup", "Set up a new management company"], ["transfer", "Transfer an existing management company"]] },
  { key: "client_notes", label: "Notes from the client", long: true },
];

export const PROVIDER_KEYS = ["bank_or_custodian", "counsel", "auditor", "tax_preparer"] as const;
export type ProviderKey = (typeof PROVIDER_KEYS)[number];
export const PROVIDER_FIELDS: { key: ProviderKey; label: string }[] = [
  { key: "bank_or_custodian", label: "Bank or custodian" },
  { key: "counsel", label: "Fund counsel" },
  { key: "auditor", label: "Auditor" },
  { key: "tax_preparer", label: "Tax preparer" },
];

export type SetupDetails = Partial<Record<SetupDetailKey, string>> & { requested_services?: string[]; source?: string };
export type Providers = Partial<Record<ProviderKey, string | null>> & { source?: string };

const MAX_SHORT = 300;
const MAX_LONG = 2000;

/** Trimmed, length-limited values; options outside the list are dropped. Empty strings mean "cleared". */
export function cleanSetupDetails(input: Record<string, unknown> | null | undefined): Partial<Record<SetupDetailKey, string>> {
  const out: Partial<Record<SetupDetailKey, string>> = {};
  for (const f of SETUP_DETAIL_FIELDS) {
    if (!input || !(f.key in input)) continue;
    const raw = typeof input[f.key] === "string" ? (input[f.key] as string).trim() : "";
    if (f.options && raw && !f.options.some(([v]) => v === raw)) continue;
    out[f.key] = raw.slice(0, f.long ? MAX_LONG : MAX_SHORT);
  }
  return out;
}

/** Applies an edit: provided keys replace (empty clears), others stay. */
export function applyDetailEdit(base: SetupDetails | null | undefined, edit: Partial<Record<SetupDetailKey, string>>): SetupDetails {
  const next: SetupDetails = { ...(base ?? {}) };
  for (const [k, v] of Object.entries(edit) as [SetupDetailKey, string][]) {
    if (v) next[k] = v; else delete next[k];
  }
  return next;
}

/** Fills from a request: blanks never erase what Setup already has. */
export function fillDetailsFromRequest(base: SetupDetails | null | undefined, fromRequest: SetupDetails): SetupDetails {
  const next: SetupDetails = { ...(base ?? {}) };
  for (const k of SETUP_DETAIL_KEYS) {
    const v = fromRequest[k];
    if (v && !next[k]) next[k] = v;
  }
  if (fromRequest.requested_services?.length && !next.requested_services?.length) next.requested_services = [...fromRequest.requested_services];
  return next;
}

export function fillProvidersFromRequest(base: Providers | null | undefined, fromRequest: Providers): Providers {
  const next: Providers = { ...(base ?? {}) };
  for (const k of PROVIDER_KEYS) {
    const v = fromRequest[k];
    if (v && !next[k]) next[k] = v;
  }
  if (!next.source && fromRequest.source) next.source = fromRequest.source;
  return next;
}

export function cleanProviders(input: Record<string, unknown> | null | undefined): Partial<Record<ProviderKey, string>> {
  const out: Partial<Record<ProviderKey, string>> = {};
  for (const k of PROVIDER_KEYS) {
    if (!input || !(k in input)) continue;
    out[k] = (typeof input[k] === "string" ? (input[k] as string) : "").trim().slice(0, MAX_SHORT);
  }
  return out;
}

export function applyProviderEdit(base: Providers | null | undefined, edit: Partial<Record<ProviderKey, string>>): Providers {
  const next: Providers = { ...(base ?? {}) };
  for (const [k, v] of Object.entries(edit) as [ProviderKey, string][]) next[k] = v || null;
  return next;
}

export const detailLabel = (key: SetupDetailKey, value: string | null | undefined) => {
  const f = SETUP_DETAIL_FIELDS.find((x) => x.key === key);
  if (!value) return "";
  return f?.options?.find(([v]) => v === value)?.[1] ?? value;
};
