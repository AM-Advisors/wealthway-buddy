/**
 * Contract coverage, related-document selection, pricing input normalisation,
 * the September 2026 standard package definition and Harmonious staff RBAC.
 *
 * Pure rules only — no I/O. Server functions call these; the UI mirrors them.
 * Nothing here creates, executes or rewrites a contract, SOW or Fund.
 */
import { z } from "zod";

/* ============================================================ documents */

export type DocLite = {
  id: string;
  title: string;
  doc_type: string;
  version?: number | null;
  review_status?: string | null;
  effective_date?: string | null;
  standard_status?: string | null;
};

export const DOC_TYPE_LABEL: Record<string, string> = {
  msa: "Master Service Agreement",
  sow: "Statement of Work",
  engagement: "Engagement Letter",
  amendment: "Amendment",
  addendum: "Addendum",
  pricing_schedule: "Fee Schedule",
  other: "Other agreement",
};

const STATUS_LABEL: Record<string, string> = {
  approved: "Active",
  superseded: "Superseded",
  awaiting_review: "In review",
  manual_review_required: "In review",
  uploaded: "Uploaded",
  draft: "Draft",
  extraction_failed: "Needs attention",
};

export function docStatusLabel(d: DocLite) {
  return STATUS_LABEL[d.review_status ?? ""] ?? (d.review_status ? d.review_status.replace(/_/g, " ") : "—");
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "No effective date";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "No effective date";
  return `Effective ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`;
}

/** "Master Service Agreement — Effective Sep 1, 2026 — Active · v2" */
export function docLabel(d: DocLite) {
  const type = DOC_TYPE_LABEL[d.doc_type] ?? d.doc_type;
  const name = d.title && d.title.trim() ? d.title.trim() : type;
  const head = name.toLowerCase().includes(type.toLowerCase()) ? name : `${name} (${type})`;
  const v = d.version && d.version > 1 ? ` · v${d.version}` : "";
  return `${head} — ${fmtDate(d.effective_date)} — ${docStatusLabel(d)}${v}`;
}

/* ================================================== relationship types */

export const EXTENDED_RELATIONSHIP_TYPES = [
  { value: "msa_governs_sow", label: "MSA governs the related SOW", from: ["msa"], to: ["sow"] },
  { value: "sow_governed_by_msa", label: "SOW is governed by the related MSA", from: ["sow"], to: ["msa"] },
  { value: "amends", label: "Amendment modifies the related agreement", from: ["amendment", "addendum"], to: ["msa", "engagement", "other"] },
  { value: "amends_sow", label: "Amendment modifies the related SOW", from: ["amendment", "addendum"], to: ["sow"] },
  { value: "supersedes", label: "Agreement supersedes the related agreement", from: ["msa", "engagement", "other"], to: ["msa", "engagement", "other"] },
  { value: "sow_supersedes_sow", label: "SOW supersedes the related SOW", from: ["sow"], to: ["sow"] },
  { value: "order_form_supplements_sow", label: "Order form supplements the related SOW", from: ["other", "addendum", "pricing_schedule"], to: ["sow"] },
  { value: "fee_schedule_supplements", label: "Fee schedule supplements the related agreement / SOW", from: ["pricing_schedule"], to: ["msa", "sow", "engagement"] },
  { value: "incorporates", label: "Document incorporates the related document", from: [], to: [] },
  { value: "supplements", label: "Supplements the related agreement", from: [], to: [] },
  { value: "controls_fund_scope", label: "Controls for Fund-specific scope", from: [], to: [] },
  { value: "controls_service_scope", label: "Controls for Service-specific scope", from: [], to: [] },
  { value: "msa_controls_except_override", label: "MSA controls except where this document expressly overrides", from: [], to: [] },
  { value: "other", label: "Other / manual relationship", from: [], to: [] },
] as const;

const ACTIVE_LIKE = new Set(["approved"]);
const DEAD = new Set(["superseded", "extraction_failed"]);

export type RelatedOption = { id: string; label: string; doc: DocLite; suggested: boolean };

/**
 * Related-document options for the document currently being viewed.
 * Excludes the current document and superseded/failed documents. Preselects
 * only when exactly one valid, currently-active candidate matches the chosen
 * relationship's expected counterparty type — never guesses otherwise.
 */
export function relatedDocumentOptions(current: DocLite, docs: readonly DocLite[], relationshipType: string) {
  const def = EXTENDED_RELATIONSHIP_TYPES.find((r) => r.value === relationshipType);
  const pool = docs.filter((d) => d.id !== current.id && !DEAD.has(d.review_status ?? ""));
  const expected = def && def.to.length ? (def.to as readonly string[]) : null;
  const typed = expected ? pool.filter((d) => expected.includes(d.doc_type)) : pool;
  const activeTyped = typed.filter((d) => ACTIVE_LIKE.has(d.review_status ?? ""));
  const defaultId = expected && activeTyped.length === 1 ? activeTyped[0].id : null;
  const rank = (d: DocLite) => (expected && expected.includes(d.doc_type) ? 0 : 1) + (ACTIVE_LIKE.has(d.review_status ?? "") ? 0 : 2);
  const options: RelatedOption[] = [...pool]
    .sort((a, b) => rank(a) - rank(b) || (b.effective_date ?? "").localeCompare(a.effective_date ?? "") || a.title.localeCompare(b.title))
    .map((d) => ({ id: d.id, label: docLabel(d), doc: d, suggested: d.id === defaultId }));
  return {
    options,
    defaultId,
    ambiguous: !!expected && activeTyped.length > 1,
    hint: !expected
      ? null
      : activeTyped.length === 0
        ? "No active document of the expected type — choose carefully."
        : activeTyped.length > 1
          ? "More than one possible agreement — choose the one this relates to."
          : null,
  };
}

/* ======================================================= maker/checker */

/** Material determinations need a different approver than the preparer. */
export function approvalProblem(preparedBy: string, approverId: string, status: string) {
  if (status !== "pending_approval") return "This determination isn't waiting for approval.";
  if (preparedBy === approverId) return "A different person must approve a determination you prepared.";
  return null;
}

/* ============================================================== pricing */

export const PRICING_MODELS = [
  { value: "fixed", label: "Fixed", needsAmount: true },
  { value: "annual", label: "Annual", needsAmount: true },
  { value: "monthly", label: "Monthly", needsAmount: true },
  { value: "per_fund", label: "Per Fund", needsAmount: true },
  { value: "per_investor", label: "Per Investor", needsAmount: true },
  { value: "per_event", label: "Per Event", needsAmount: true },
  { value: "per_close", label: "Per Close", needsAmount: true },
  { value: "per_asset", label: "Per Asset", needsAmount: true },
  { value: "per_tax_year", label: "Per Taxable Year", needsAmount: true },
  { value: "hourly", label: "Hourly", needsAmount: true },
  { value: "percentage", label: "Percentage", needsAmount: false },
  { value: "tiered", label: "Tiered", needsAmount: false },
  { value: "pass_through", label: "Pass-through", needsAmount: false },
  { value: "government_fee", label: "Government / third-party fee", needsAmount: false },
  { value: "custom", label: "Custom", needsAmount: false },
  { value: "tbd", label: "To be determined", needsAmount: false },
] as const;
export type PricingModel = (typeof PRICING_MODELS)[number]["value"];
export const PRICING_MODEL_VALUES = PRICING_MODELS.map((m) => m.value) as [PricingModel, ...PricingModel[]];
export const pricingNeedsAmount = (m: string) => !!PRICING_MODELS.find((x) => x.value === m)?.needsAmount;

export const PRICE_INPUT_MESSAGE = "Enter a valid service price or select another pricing method.";

/**
 * "$7,500.00" → 750000. Returns null for blank or malformed input — never NaN.
 * Accepts $, commas, spaces and up to two decimals; rejects negatives and
 * anything else (e.g. "7.5.0", "abc", "1e5").
 */
export function parseMoneyToCents(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) && raw >= 0 ? Math.round(raw * 100) : null;
  if (typeof raw !== "string") return null;
  const s = raw.trim().replace(/^\$/, "").replace(/[\s,]/g, "");
  if (!s || !/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const cents = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Percentage input "1.25%" → 125 basis points, or null. */
export function parsePercentToBps(raw: unknown): number | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const s = String(raw).trim().replace(/%$/, "").trim();
  if (!s || !/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const bps = Math.round(Number(s) * 100);
  return bps <= 10_000 ? bps : null;
}

export type PriceTier = { minCents: number; maxCents: number | null; feeCents: number };

export function tiersProblem(tiers: readonly PriceTier[]): string | null {
  if (!tiers.length) return "Add at least one pricing tier.";
  const sorted = [...tiers].sort((a, b) => a.minCents - b.minCents);
  for (let i = 0; i < sorted.length; i += 1) {
    const t = sorted[i];
    if (![t.minCents, t.feeCents].every((n) => Number.isSafeInteger(n) && n >= 0)) return "Each tier needs a valid fee and lower bound.";
    if (t.maxCents != null && (!Number.isSafeInteger(t.maxCents) || t.maxCents < t.minCents)) return "A tier's upper bound must be above its lower bound.";
    if (t.maxCents == null && i !== sorted.length - 1) return "Only the last tier can be open-ended.";
    const next = sorted[i + 1];
    if (next && t.maxCents != null && next.minCents <= t.maxCents) return "Pricing tiers overlap.";
  }
  return null;
}

/** Fee for a basis amount under tiers (inclusive bounds); null if no tier applies. */
export function tierFeeFor(tiers: readonly PriceTier[], basisCents: number): number | null {
  const t = tiers.find((x) => basisCents >= x.minCents && (x.maxCents == null || basisCents <= x.maxCents));
  return t ? t.feeCents : null;
}

export type NormalizedPrice =
  | { ok: true; model: PricingModel; amountCents: number | null; rateBps: number | null; tiers: PriceTier[] | null }
  | { ok: false; message: string };

/** Normalise UI price entry before it goes anywhere near the server. */
export function normalizePriceInput(input: { model: string; amount?: string | null; percent?: string | null; tiers?: PriceTier[] | null }): NormalizedPrice {
  const model = (PRICING_MODEL_VALUES as string[]).includes(input.model) ? (input.model as PricingModel) : null;
  if (!model) return { ok: false, message: "Select a pricing method." };
  if (pricingNeedsAmount(model)) {
    const cents = parseMoneyToCents(input.amount ?? "");
    if (cents == null) return { ok: false, message: PRICE_INPUT_MESSAGE };
    return { ok: true, model, amountCents: cents, rateBps: null, tiers: null };
  }
  if (model === "percentage") {
    const bps = parsePercentToBps(input.percent ?? "");
    if (bps == null) return { ok: false, message: "Enter a valid percentage (for example 1.25%)." };
    return { ok: true, model, amountCents: null, rateBps: bps, tiers: null };
  }
  if (model === "tiered") {
    const tiers = input.tiers ?? [];
    const p = tiersProblem(tiers);
    if (p) return { ok: false, message: p };
    return { ok: true, model, amountCents: null, rateBps: null, tiers: [...tiers].sort((a, b) => a.minCents - b.minCents) };
  }
  // pass-through, government fee, custom, TBD: optional amount, never manufactured.
  const raw = (input.amount ?? "").trim();
  if (!raw) return { ok: true, model, amountCents: null, rateBps: null, tiers: null };
  const cents = parseMoneyToCents(raw);
  if (cents == null) return { ok: false, message: PRICE_INPUT_MESSAGE };
  return { ok: true, model, amountCents: cents, rateBps: null, tiers: null };
}

/** Server-boundary cents field: finite non-negative integer or null, friendly error. */
export const centsSchema = z
  .number({ invalid_type_error: PRICE_INPUT_MESSAGE, required_error: PRICE_INPUT_MESSAGE })
  .refine((n) => Number.isFinite(n), PRICE_INPUT_MESSAGE)
  .refine((n) => Number.isInteger(n) && n >= 0 && n <= 10_000_000_000, PRICE_INPUT_MESSAGE);

/**
 * Parse server input with Zod; log technical detail and surface one
 * human-readable message instead of a raw JSON issue list.
 */
export function friendlyParse<T>(schema: z.ZodType<T>, d: unknown, fallback = "Some details are missing or invalid."): T {
  const r = schema.safeParse(d);
  if (r.success) return r.data;
  console.warn("[validation]", JSON.stringify(r.error.issues));
  const first = r.error.issues[0];
  const msg = first && first.message && !/^(Expected|Required|Invalid)/.test(first.message) ? first.message : fallback;
  throw new Error(msg);
}

/* ========================================================= coverage */

export type CoverageSow = {
  id: string;
  title: string;
  client_id: string;
  offering_id: string | null;
  covered_offering_ids?: readonly string[];
  fund_scope?: "listed" | "client_wide" | null;
  status: string;
  executed_at: string | null;
  amends_sow_id?: string | null;
  template_version?: number | null;
  governing_document_id?: string | null;
  service_keys?: readonly string[];
};

export type FundCoverageStatus =
  | "covered"
  | "covered_client_wide"
  | "msa_only"
  | "not_contracted"
  | "sow_required"
  | "needs_review"
  | "no_governing_agreement";

export const COVERAGE_LABEL: Record<FundCoverageStatus, string> = {
  covered: "Covered",
  covered_client_wide: "Covered — Client-wide SOW",
  msa_only: "MSA only — Review required",
  not_contracted: "No SOW — Not yet contracted",
  sow_required: "SOW required",
  needs_review: "Contract review required",
  no_governing_agreement: "No governing agreement",
};

const live = (s: CoverageSow) => s.status !== "terminated" && s.status !== "cancelled";
export const sowFunds = (s: CoverageSow) => [...new Set([...(s.covered_offering_ids ?? []), ...(s.offering_id ? [s.offering_id] : [])])];

/** Does this SOW list the Fund (junction or legacy single-fund column)? */
export const sowCoversFund = (s: CoverageSow, offeringId: string) => sowFunds(s).includes(offeringId);

/**
 * Resolve Client → governing MSA → applicable SOW(s) → covered Funds for one Fund.
 * Never proposes or creates a SOW; "needs_review" whenever a human must interpret.
 */
export function resolveFundCoverage(input: {
  clientId: string;
  offeringId: string;
  governingMsa: { id: string; title: string } | null;
  sows: readonly CoverageSow[];
  fundHasServices: boolean;
}) {
  const mine = input.sows.filter((s) => s.client_id === input.clientId && live(s));
  const executed = mine.filter((s) => !!s.executed_at && !s.amends_sow_id);
  const explicit = executed.filter((s) => sowCoversFund(s, input.offeringId));
  if (explicit.length === 1) {
    const s = explicit[0];
    return { status: "covered" as const, label: `Covered — ${s.title}${s.template_version ? ` v${s.template_version}` : ""}`, sows: [s], msa: input.governingMsa };
  }
  if (explicit.length > 1) return { status: "needs_review" as const, label: "Contract review required — more than one SOW lists this Fund", sows: explicit, msa: input.governingMsa };
  const clientWide = executed.filter((s) => s.fund_scope === "client_wide");
  if (clientWide.length === 1) return { status: "covered_client_wide" as const, label: `Covered — Client-wide SOW (${clientWide[0].title})`, sows: clientWide, msa: input.governingMsa };
  if (clientWide.length > 1) return { status: "needs_review" as const, label: COVERAGE_LABEL.needs_review, sows: clientWide, msa: input.governingMsa };
  // Executed SOWs exist but their Fund scope doesn't list this Fund, or is unknown:
  // a person decides whether the Fund can be associated under the approved scope.
  if (executed.length) return { status: "needs_review" as const, label: COVERAGE_LABEL.needs_review, sows: executed, msa: input.governingMsa };
  const drafts = mine.filter((s) => !s.executed_at && sowCoversFund(s, input.offeringId));
  if (!input.governingMsa) {
    if (drafts.length) return { status: "not_contracted" as const, label: COVERAGE_LABEL.not_contracted, sows: drafts, msa: null };
    return { status: "no_governing_agreement" as const, label: COVERAGE_LABEL.no_governing_agreement, sows: [], msa: null };
  }
  if (drafts.length) return { status: "not_contracted" as const, label: COVERAGE_LABEL.not_contracted, sows: drafts, msa: input.governingMsa };
  if (input.fundHasServices) return { status: "sow_required" as const, label: COVERAGE_LABEL.sow_required, sows: [], msa: input.governingMsa };
  return { status: "msa_only" as const, label: COVERAGE_LABEL.msa_only, sows: [], msa: input.governingMsa };
}

export type ServiceCoverage = "already_contracted" | "partially_covered" | "not_covered";

/** Selected services vs services in the executed SOW(s) that cover the Fund. */
export function resolveServiceCoverage(selected: readonly string[], coveringSows: readonly CoverageSow[]) {
  const contracted = new Set(coveringSows.filter((s) => !!s.executed_at).flatMap((s) => s.service_keys ?? []));
  const covered = selected.filter((k) => contracted.has(k));
  const uncovered = selected.filter((k) => !contracted.has(k));
  const status: ServiceCoverage =
    selected.length === 0 || uncovered.length === 0 ? "already_contracted" : covered.length === 0 ? "not_covered" : "partially_covered";
  return {
    status,
    covered,
    uncovered,
    newSowNeeded: status === "not_covered",
    amendmentNeeded: status === "partially_covered",
    message:
      status === "already_contracted"
        ? "Already contracted — no new SOW."
        : status === "partially_covered"
          ? "Partially covered — an amendment may be needed for the uncovered services."
          : "Not covered — draft a new SOW or amendment only if you choose to proceed.",
  };
}

/* ====================================== September 2026 standard package */

export const SEPT_2026_PACKAGE = {
  key: "harmonious_standard_2026_09",
  title: "Harmonious Master Service Agreement — September 2026",
  status: "proposed" as const,
  components: [
    { key: "msa", kind: "msa", title: "Master Service Agreement", level: "client" },
    { key: "spv_sow", kind: "sow", title: "SPV Services Statement of Work", level: "engagement" },
    { key: "appendix_a", kind: "appendix", title: "Appendix A — Fund Administration", level: "engagement", partOf: "spv_sow" },
    { key: "exhibit_a", kind: "fee_schedule", title: "Exhibit A — Fees and Expenses", level: "engagement", partOf: "spv_sow" },
  ],
  /** Base SPV fee, tiered by capital raised (from the addendum; confirm against the signed PDF). */
  spvBaseFeeTiers: [
    { minCents: 0, maxCents: 24_999_999, feeCents: 500_000 },
    { minCents: 25_000_000, maxCents: 100_000_000, feeCents: 750_000 },
    { minCents: 100_000_001, maxCents: 1_000_000_000, feeCents: 1_000_000 },
    { minCents: 1_000_000_001, maxCents: 5_000_000_000, feeCents: 1_500_000 },
  ] as PriceTier[],
  /** Additional fees; amounts come from Exhibit A once the PDF is registered. */
  additionalServices: [
    { key: "capital_call", model: "per_event" },
    { key: "additional_close", model: "per_close" },
    { key: "additional_asset", model: "per_asset" },
    { key: "financial_statements", model: "per_tax_year" },
    { key: "side_letter", model: "per_event" },
    { key: "distribution", model: "per_event" },
    { key: "additional_investor", model: "per_investor" },
    { key: "membership_transfer", model: "per_event" },
    { key: "entity_dissolution", model: "per_fund" },
  ] as { key: string; model: PricingModel }[],
  precedence: "The SOW controls for engagement-specific services, fees and operational terms; the MSA supplies general relationship terms.",
} as const;

/* ============================================================ staff RBAC */

export const STAFF_CAPABILITY_GROUPS = [
  { group: "Client Operations", caps: [
    ["view_clients", "View Clients"], ["edit_clients", "Edit Clients"], ["manage_client_people", "Manage Client People"],
    ["manage_client_roles", "Manage Client Roles"], ["create_link_funds", "Create/Link Funds"], ["create_link_companies", "Create/Link Companies"],
  ] },
  { group: "Fund Operations", caps: [
    ["view_funds", "View Funds"], ["edit_fund_setup", "Edit Fund Setup"], ["manage_investors", "Manage Investors"], ["manage_fund_documents", "Manage Fund Documents"],
  ] },
  { group: "Contracts", caps: [
    ["view_contracts", "View Contracts"], ["upload_contracts", "Upload Contracts"], ["map_contract_terms", "Map Contract Terms"],
    ["record_contract_relationships", "Record Contract Relationships"], ["configure_services", "Configure Services"],
    ["configure_pricing", "Configure Pricing"], ["generate_draft_sow", "Generate Draft SOW"],
  ] },
  { group: "Contract Approval", caps: [
    ["approve_contract_mapping", "Approve Contract Mapping"], ["approve_pricing_overrides", "Approve Pricing Overrides"], ["approve_sow", "Approve SOW"],
    ["approve_amendments", "Approve Amendments"], ["approve_precedence", "Approve Precedence Determinations"],
  ] },
  { group: "Banking/Capital", caps: [["view_banking", "View Banking/Capital"], ["manage_banking", "Manage Banking/Capital (no outbound money authority)"]] },
  { group: "Administration", caps: [
    ["manage_staff", "Manage Staff"], ["manage_roles", "Manage Roles"], ["manage_permissions", "Manage Permissions"],
    ["manage_templates", "Manage Templates"], ["manage_service_catalog", "Manage Service Catalog"], ["manage_pricing_catalog", "Manage Pricing Catalog"],
  ] },
] as const;

export type StaffCapability = (typeof STAFF_CAPABILITY_GROUPS)[number]["caps"][number][0];
export const STAFF_CAPABILITIES = STAFF_CAPABILITY_GROUPS.flatMap((g) => g.caps.map((c) => c[0])) as StaffCapability[];

/**
 * Capabilities that can never come from a grant or custom role: full TIN,
 * compliance exception approval, and money movement stay in their own
 * dedicated systems (the separate Tax role, compliance review, outbound money).
 */
export const NEVER_GRANTABLE = ["tax_full_tin", "approve_compliance_exception", "execute_money_movement"] as const;

/** Predefined convenience roles. Authorization still resolves from capabilities. */
export const PREDEFINED_STAFF_ROLES: Record<string, { label: string; caps: StaffCapability[] }> = {
  client_operations_specialist: {
    label: "Client Operations Specialist",
    caps: ["view_clients", "edit_clients", "manage_client_people", "manage_client_roles", "create_link_funds", "create_link_companies", "view_funds", "view_contracts", "configure_services"],
  },
  fund_operations_specialist: {
    label: "Fund Operations Specialist",
    caps: ["view_clients", "view_funds", "edit_fund_setup", "manage_investors", "manage_fund_documents"],
  },
  contracts_specialist: {
    label: "Contracts Specialist",
    caps: ["view_clients", "view_contracts", "upload_contracts", "map_contract_terms", "record_contract_relationships", "configure_services", "configure_pricing", "generate_draft_sow"],
  },
  contract_approver: {
    label: "Contract Approver",
    caps: ["view_clients", "view_contracts", "approve_contract_mapping", "approve_pricing_overrides", "approve_sow", "approve_amendments", "approve_precedence"],
  },
  staff_administrator: {
    label: "Staff Administrator",
    caps: ["view_clients", "manage_staff", "manage_roles", "manage_permissions", "manage_templates", "manage_service_catalog", "manage_pricing_catalog"],
  },
};

/** Legacy platform roles mapped onto capabilities so existing staff keep working. */
const LEGACY_ROLE_CAPS: Record<string, StaffCapability[]> = {
  super_admin: STAFF_CAPABILITIES,
  admin: STAFF_CAPABILITIES,
  operations: PREDEFINED_STAFF_ROLES.client_operations_specialist.caps.concat(["upload_contracts", "map_contract_terms", "generate_draft_sow", "view_funds", "edit_fund_setup"]),
  client_success: ["view_clients", "edit_clients", "manage_client_people", "manage_client_roles", "configure_services", "view_contracts", "upload_contracts"],
  finance: ["view_clients", "view_contracts", "configure_pricing", "view_banking"],
  legal: ["view_clients", "view_contracts", "upload_contracts", "map_contract_terms", "record_contract_relationships", "generate_draft_sow", "approve_contract_mapping", "approve_sow", "approve_amendments", "approve_precedence"],
  compliance: ["view_clients", "view_contracts", "view_funds"],
  executive: ["view_clients", "view_contracts", "view_funds"],
  fund_administration: ["view_clients", "view_funds", "edit_fund_setup", "manage_investors", "manage_fund_documents"],
};

/**
 * Effective staff capabilities = legacy role baseline ∪ assigned predefined/custom
 * roles ∪ direct grants. Unknown strings and NEVER_GRANTABLE are dropped.
 * Only called after the caller is confirmed as active Harmonious staff.
 */
export function staffCapabilitiesFor(input: {
  roles: readonly string[];
  assignedRoleKeys?: readonly string[];
  customRoles?: Record<string, readonly string[]>;
  grants?: readonly string[];
}): StaffCapability[] {
  const valid = new Set<string>(STAFF_CAPABILITIES);
  const out = new Set<StaffCapability>();
  const add = (c: string) => { if (valid.has(c)) out.add(c as StaffCapability); };
  for (const r of input.roles) for (const c of LEGACY_ROLE_CAPS[r] ?? []) add(c);
  for (const k of input.assignedRoleKeys ?? []) {
    for (const c of PREDEFINED_STAFF_ROLES[k]?.caps ?? []) add(c);
    for (const c of input.customRoles?.[k] ?? []) add(c);
  }
  for (const g of input.grants ?? []) add(g);
  return [...out].sort();
}

/** Staff capability → Client 360 capability. */
export const STAFF_TO_CLIENT_CAP: Partial<Record<StaffCapability, string>> = {
  view_clients: "view_client",
  edit_clients: "edit_client",
  manage_client_people: "manage_people",
  manage_client_roles: "manage_roles",
  create_link_funds: "link_funds",
  configure_services: "manage_services",
  configure_pricing: "manage_pricing",
  generate_draft_sow: "manage_sows",
  approve_sow: "approve_terms",
  approve_pricing_overrides: "approve_pricing",
};

/** Staff capability → contract capability. */
export const STAFF_TO_CONTRACT_CAPS: Partial<Record<StaffCapability, string[]>> = {
  view_contracts: ["view_contracts"],
  upload_contracts: ["upload_contracts"],
  map_contract_terms: ["review_terms", "correct_terms"],
  record_contract_relationships: ["review_precedence"],
  configure_pricing: ["configure_pricing", "view_pricing"],
  approve_contract_mapping: ["approve_terms", "confirm_execution"],
  approve_precedence: ["approve_precedence"],
  approve_sow: ["generate_standard"],
};

export function mapStaffCaps(staff: readonly StaffCapability[], table: Partial<Record<StaffCapability, string | string[]>>) {
  const out = new Set<string>();
  for (const c of staff) {
    const v = table[c];
    if (!v) continue;
    for (const x of Array.isArray(v) ? v : [v]) out.add(x);
  }
  return [...out];
}
