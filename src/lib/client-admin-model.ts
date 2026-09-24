/**
 * Client 360 administration — pure rules.
 *
 * The chain this file encodes:
 *   Client → People/Roles → Fund/Engagement → Applicable Services → Pricing
 *   → Draft SOW → Review → Client acceptance/signature → Contracted services.
 *
 * Three rules hold everywhere:
 *  - descriptive Client relationship roles never become application authority;
 *  - selecting a service only ever makes it Proposed — Contracted comes only
 *    from a fully executed SOW (also enforced in the database);
 *  - nothing is guessed: no price, no template and no precedence decision.
 */

/* ------------------------------------------------------------ people */

export const CLIENT_RELATIONSHIP_ROLES = [
  { value: "owner_founder", label: "Owner / Founder" },
  { value: "fund_manager", label: "Fund Manager" },
  { value: "investment_manager", label: "Investment Manager" },
  { value: "general_partner", label: "General Partner" },
  { value: "managing_member", label: "Managing Member" },
  { value: "authorized_signatory", label: "Authorized Signatory" },
  { value: "operations", label: "Operations" },
  { value: "finance", label: "Finance / Accounting" },
  { value: "tax", label: "Tax" },
  { value: "legal", label: "Legal" },
  { value: "billing", label: "Billing" },
  { value: "primary", label: "Primary Contact" },
  { value: "company_admin", label: "Company Administrator" },
  { value: "read_only", label: "Read Only" },
  { value: "other", label: "Other" },
] as const;
export type ClientRelationshipRole = (typeof CLIENT_RELATIONSHIP_ROLES)[number]["value"];
export const RELATIONSHIP_ROLE_VALUES = CLIENT_RELATIONSHIP_ROLES.map((r) => r.value) as [
  ClientRelationshipRole,
  ...ClientRelationshipRole[],
];
export const roleLabel = (v: string) => CLIENT_RELATIONSHIP_ROLES.find((r) => r.value === v)?.label ?? v;

/**
 * The application authority a relationship role carries: always none.
 * Access comes only from memberships, fund_managers rows, delegations and capabilities.
 */
export function applicationAuthorityFromRoles(_roles: readonly string[]): {
  fundAccess: string[];
  moneyMovement: boolean;
  signing: boolean;
} {
  return { fundAccess: [], moneyMovement: false, signing: false };
}

/**
 * The funds a person may open in the portal: exactly the fund_managers rows
 * they hold — never every fund of the Client, whatever their descriptive role.
 */
export function portalFundAccess(
  userId: string | null,
  fundManagerRows: readonly { user_id: string; offering_id: string }[],
): string[] {
  if (!userId) return [];
  return fundManagerRows.filter((r) => r.user_id === userId).map((r) => r.offering_id);
}

/* ------------------------------------------------------- capabilities */

export const CLIENT_CAPABILITIES = [
  { value: "view_client", label: "View Client" },
  { value: "edit_client", label: "Edit Client" },
  { value: "manage_people", label: "Manage Client People" },
  { value: "manage_roles", label: "Manage Client Roles" },
  { value: "link_funds", label: "Add / Link Funds" },
  { value: "manage_services", label: "Manage Applicable Services" },
  { value: "manage_pricing", label: "Manage Pricing" },
  { value: "manage_sows", label: "Manage Contracts / SOWs" },
  { value: "approve_terms", label: "Approve Contract Terms" },
] as const;
export type ClientCapability = (typeof CLIENT_CAPABILITIES)[number]["value"];
const ALL: ClientCapability[] = CLIENT_CAPABILITIES.map((c) => c.value);

const CLIENT_ROLE_BASELINE: Record<string, ClientCapability[]> = {
  super_admin: ALL,
  admin: ALL,
  operations: ["view_client", "edit_client", "manage_people", "manage_roles", "link_funds", "manage_services", "manage_sows"],
  client_success: ["view_client", "edit_client", "manage_people", "manage_roles", "manage_services"],
  finance: ["view_client", "manage_pricing"],
  legal: ["view_client", "manage_sows", "approve_terms"],
  compliance: ["view_client"],
  executive: ["view_client"],
  fund_administration: ["view_client"],
};

/**
 * Client capabilities from active Harmonious staff roles only. Unknown roles,
 * investors and fund managers get nothing; email domain plays no part.
 */
export function clientCapabilitiesFor(roles: readonly string[]): ClientCapability[] {
  const out = new Set<ClientCapability>();
  for (const r of roles) for (const c of CLIENT_ROLE_BASELINE[r] ?? []) out.add(c);
  return [...out].sort();
}

/* ------------------------------------------------------ client edits */

export const EDITABLE_CLIENT_FIELDS = [
  "legal_name", "name", "dba_name", "client_type", "entity_type", "jurisdiction", "address",
  "website", "primary_contact_email", "primary_contact_name", "phone", "relationship_owner_id",
  "referral_source", "status", "notes", "billing_contact_name", "billing_contact_email",
  "default_billing_frequency", "payment_terms_days",
] as const;
export type EditableClientField = (typeof EDITABLE_CLIENT_FIELDS)[number];

/** Before/after for every material field that actually changed. */
export function diffClient(before: Record<string, unknown>, patch: Record<string, unknown>) {
  const changes: { field: string; before: unknown; after: unknown }[] = [];
  for (const f of EDITABLE_CLIENT_FIELDS) {
    if (!(f in patch)) continue;
    const a = before[f] ?? null;
    const b = patch[f] ?? null;
    if (JSON.stringify(a) !== JSON.stringify(b)) changes.push({ field: f, before: a, after: b });
  }
  return changes;
}

/* ------------------------------------------------------ fund linking */

export type LinkPlan =
  | { kind: "link" }
  | { kind: "already_linked" }
  | { kind: "reassignment_required"; fromClientId: string };

/** A fund owned by another Client is never moved silently. */
export function planFundLink(fund: { client_id: string | null }, clientId: string): LinkPlan {
  if (!fund.client_id) return { kind: "link" };
  if (fund.client_id === clientId) return { kind: "already_linked" };
  return { kind: "reassignment_required", fromClientId: fund.client_id };
}

/* ------------------------------------------------------ service groups */

export type CatalogService = {
  id: string;
  key: string;
  name: string;
  category: string | null;
  service_group: string | null;
  description?: string | null;
  standard_scope?: string | null;
  standard_deliverables?: string[] | null;
  default_pricing_model?: string | null;
  billing_frequency?: string | null;
  standard_price_cents?: number | null;
  active?: boolean | null;
  status?: string | null;
  sort_order?: number | null;
};
export type ServiceGroup = { key: string; label: string; sort_order: number; active: boolean };

/** Only approved/active catalog items, grouped by configurable functional area. */
export function groupServices(catalog: readonly CatalogService[], groups: readonly ServiceGroup[]) {
  const usable = catalog.filter((s) => s.active !== false && (s.status ?? "active") === "active");
  const order = [...groups].filter((g) => g.active).sort((a, b) => a.sort_order - b.sort_order);
  const fallback = order.find((g) => g.key === "custom")?.key ?? order[order.length - 1]?.key ?? "custom";
  const known = new Set(order.map((g) => g.key));
  return order
    .map((g) => ({
      ...g,
      services: usable
        .filter((s) => (s.service_group && known.has(s.service_group) ? s.service_group : fallback) === g.key)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name)),
    }))
    .filter((g) => g.services.length > 0);
}

/* ------------------------------------------------------ pricing */

export const PRICING_SOURCES = {
  engagement: "Engagement / Fund agreement",
  client: "Client-specific pricing",
  msa: "Client agreement (MSA)",
  standard: "Harmonious standard pricing",
  custom: "Custom pricing",
} as const;
export type PricingSource = keyof typeof PRICING_SOURCES;

export type ClientPriceRow = {
  id: string;
  service_key: string;
  contracted_cents: number | null;
  offering_id: string | null;
  superseded_at: string | null;
  approved_at: string | null;
  pricing_model?: string | null;
  /** "msa" when the row came from the Client's main agreement. */
  origin: "engagement" | "client" | "msa";
};
export type StandardPriceRow = {
  service_key: string;
  amount_cents: number | null;
  pricing_model?: string | null;
  unit?: string | null;
};

export type PriceResult =
  | {
      status: "resolved";
      cents: number;
      source: PricingSource;
      sourceRef: string | null;
      pricingModel: string | null;
      unit: string | null;
    }
  | { status: "conflict"; source: PricingSource; amounts: number[] }
  | { status: "pricing_required" };

/**
 * Pricing hierarchy:
 *   1 approved engagement/fund-specific → 2 approved client-specific
 *   → 3 approved MSA schedule → 4 current approved standard. Otherwise Pricing Required.
 * Two different amounts at the same tier are a conflict, never a pick.
 */
export function resolveServicePrice(input: {
  serviceKey: string;
  offeringId: string | null;
  clientRows: readonly ClientPriceRow[];
  standard: readonly StandardPriceRow[];
  catalogStandardCents?: number | null;
  catalogPricingModel?: string | null;
}): PriceResult {
  const live = input.clientRows.filter(
    (r) => r.service_key === input.serviceKey && !r.superseded_at && r.approved_at && r.contracted_cents != null,
  );
  const tiers: { source: PricingSource; rows: ClientPriceRow[] }[] = [
    { source: "engagement", rows: input.offeringId ? live.filter((r) => r.offering_id === input.offeringId) : [] },
    { source: "client", rows: live.filter((r) => !r.offering_id && r.origin !== "msa") },
    { source: "msa", rows: live.filter((r) => !r.offering_id && r.origin === "msa") },
  ];
  for (const t of tiers) {
    if (!t.rows.length) continue;
    const amounts = [...new Set(t.rows.map((r) => Number(r.contracted_cents)))];
    if (amounts.length > 1) return { status: "conflict", source: t.source, amounts };
    const r = t.rows[0]!;
    return { status: "resolved", cents: amounts[0]!, source: t.source, sourceRef: r.id, pricingModel: r.pricing_model ?? null, unit: null };
  }
  const std = input.standard.filter((s) => s.service_key === input.serviceKey && s.amount_cents != null);
  if (std.length) {
    const amounts = [...new Set(std.map((s) => Number(s.amount_cents)))];
    if (amounts.length > 1) return { status: "conflict", source: "standard", amounts };
    return { status: "resolved", cents: amounts[0]!, source: "standard", sourceRef: null, pricingModel: std[0]!.pricing_model ?? null, unit: std[0]!.unit ?? null };
  }
  if (input.catalogStandardCents != null) {
    return { status: "resolved", cents: Number(input.catalogStandardCents), source: "standard", sourceRef: null, pricingModel: input.catalogPricingModel ?? null, unit: null };
  }
  return { status: "pricing_required" };
}

/** A custom override applies to this selection only and never changes global pricing. */
export function effectiveSelectionPrice(
  resolved: PriceResult,
  sel: { custom_price_cents: number | null; override_status: string | null },
): { cents: number | null; source: PricingSource | null; customPending: boolean } {
  if (sel.custom_price_cents != null && sel.override_status !== "rejected") {
    return { cents: Number(sel.custom_price_cents), source: "custom", customPending: sel.override_status === "pending_approval" };
  }
  if (resolved.status === "resolved") return { cents: resolved.cents, source: resolved.source, customPending: false };
  return { cents: null, source: null, customPending: false };
}

/* ------------------------------------------------------ templates */

export type SowTemplate = {
  id: string;
  name: string;
  engagement_type: string;
  version: number;
  effective_date: string;
  status: "draft" | "approved" | "retired" | string;
  retired_at: string | null;
  approved_at: string | null;
};

export function engagementTypeFor(offering: { fund_type?: string | null; name?: string | null } | null): string {
  if (!offering) return "client_services";
  const t = `${offering.fund_type ?? ""} ${offering.name ?? ""}`.toLowerCase();
  return t.includes("spv") ? "spv_administration" : "fund_administration";
}

function usable(t: SowTemplate, type: string, onDate: string) {
  return (
    t.engagement_type === type &&
    t.status === "approved" &&
    !!t.approved_at &&
    t.effective_date <= onDate &&
    (!t.retired_at || t.retired_at.slice(0, 10) > onDate)
  );
}

/**
 * Latest APPROVED/CURRENT template for this engagement type on this date.
 * Drafts and retired templates are never eligible, however new. Two approved
 * templates sharing the top version is ambiguous and resolves to none.
 */
export function resolveSowTemplate(
  templates: readonly SowTemplate[],
  engagementType: string,
  onDate: string,
): { status: "resolved"; template: SowTemplate } | { status: "none" } | { status: "ambiguous"; ids: string[] } {
  const ok = templates.filter((t) => usable(t, engagementType, onDate)).sort((a, b) => b.version - a.version);
  if (!ok.length) return { status: "none" };
  const top = ok.filter((t) => t.version === ok[0]!.version);
  if (top.length > 1) return { status: "ambiguous", ids: top.map((t) => t.id) };
  return { status: "resolved", template: ok[0]! };
}

/** A manual override may choose another approved template — never draft/retired, always with a reason. */
export function validateTemplateOverride(
  t: SowTemplate | undefined,
  engagementType: string,
  onDate: string,
  reason: string | null | undefined,
): string | null {
  if (!reason || reason.trim().length < 5) return "Give a reason for choosing a different template.";
  if (!t) return "That template does not exist.";
  if (t.status !== "approved") return "Only an approved, current template can be selected.";
  if (!usable(t, engagementType, onDate)) return "That template does not apply to this engagement or date.";
  return null;
}

/* ------------------------------------------------------ SOWs */

export type SowLite = {
  id: string;
  client_id: string;
  offering_id: string | null;
  status: string;
  executed_at: string | null;
  generated_automatically?: boolean | null;
  locked?: boolean | null;
  client_status?: string | null;
  approval_status?: string | null;
  amends_sow_id?: string | null;
  template_version?: number | null;
  review_blockers?: unknown;
};

export const isExecuted = (s: SowLite) => !!s.executed_at;

/**
 * The SOW that covers this client + scope. Only this client's SOW for this
 * exact fund (or its client-wide SOW when no fund) — never another client's
 * or another fund's negotiated SOW.
 */
export function findApplicableSow(sows: readonly SowLite[], clientId: string, offeringId: string | null) {
  const mine = sows.filter((s) => s.client_id === clientId && (s.offering_id ?? null) === (offeringId ?? null) && s.status !== "terminated" && s.status !== "cancelled");
  const executed = mine.filter(isExecuted).filter((s) => !s.amends_sow_id);
  const draft = mine.find((s) => !isExecuted(s) && !s.amends_sow_id && !s.locked);
  const amendmentDraft = mine.find((s) => !isExecuted(s) && !!s.amends_sow_id && !s.locked);
  return { executed: executed[0] ?? null, draft: draft ?? null, amendmentDraft: amendmentDraft ?? null };
}

export type SowDisplay = "No SOW" | "Draft" | "Needs Pricing" | "Needs Review" | "Awaiting Acceptance" | "Executed";

export function sowDisplayStatus(s: SowLite | null): SowDisplay {
  if (!s) return "No SOW";
  if (s.executed_at) return "Executed";
  const blockers = Array.isArray(s.review_blockers) ? (s.review_blockers as { kind: string }[]) : [];
  if (blockers.some((b) => b.kind === "pricing_required" || b.kind === "pricing_conflict")) return "Needs Pricing";
  if (blockers.length) return "Needs Review";
  if (s.approval_status === "approved" && s.client_status !== "signed") return "Awaiting Acceptance";
  return "Draft";
}

export type Selection = {
  id: string;
  client_id: string;
  offering_id: string | null;
  service_key: string;
  status: string;
  pending_change: string | null;
  custom_price_cents: number | null;
  override_status: string | null;
  contracted_snapshot?: unknown;
};

export type SowLine = {
  selectionId: string;
  serviceKey: string;
  serviceName: string;
  group: string | null;
  scope: string | null;
  deliverables: string[];
  offeringId: string | null;
  frequency: string | null;
  pricingModel: string | null;
  cents: number | null;
  pricingSource: PricingSource | null;
  pricingSourceRef: string | null;
  change: "add" | "remove";
};

export type SowBlocker = { kind: string; serviceKey?: string; message: string };

/**
 * Selected services → resolved pricing → SOW scope and fee schedule. One source:
 * the lines carry references to the selection and pricing records used.
 */
export function buildSowLines(input: {
  clientId: string;
  offeringId: string | null;
  selections: readonly Selection[];
  catalog: readonly CatalogService[];
  prices: Record<string, PriceResult>;
  /** Approved client contract wording that excludes work, lowercased. */
  excludedWork?: string | null;
  amendment?: boolean;
}): { lines: SowLine[]; blockers: SowBlocker[] } {
  const lines: SowLine[] = [];
  const blockers: SowBlocker[] = [];
  const bySvc = new Map(input.catalog.map((c) => [c.key, c]));
  for (const sel of input.selections) {
    if (sel.client_id !== input.clientId) continue;
    const inScope = (sel.offering_id ?? null) === (input.offeringId ?? null) || (!sel.offering_id && !input.amendment);
    if (!inScope) continue;
    const isRemoval = sel.pending_change === "remove";
    const wanted = input.amendment ? !!sel.pending_change : sel.status === "proposed";
    if (!wanted) continue;
    const svc = bySvc.get(sel.service_key);
    if (!svc) {
      blockers.push({ kind: "unknown_service", serviceKey: sel.service_key, message: `${sel.service_key} is not an approved catalog service.` });
      continue;
    }
    const resolved = input.prices[sel.id] ?? { status: "pricing_required" as const };
    const eff = effectiveSelectionPrice(resolved, sel);
    if (!isRemoval) {
      if (eff.cents == null) {
        blockers.push({
          kind: resolved.status === "conflict" ? "pricing_conflict" : "pricing_required",
          serviceKey: svc.key,
          message: resolved.status === "conflict" ? `${svc.name}: pricing conflict — Harmonious review required.` : `${svc.name}: Pricing Required.`,
        });
      }
      if (eff.customPending) blockers.push({ kind: "custom_pricing_unapproved", serviceKey: svc.key, message: `${svc.name}: custom pricing awaits approval.` });
      if (!(svc.standard_scope || svc.description)) blockers.push({ kind: "missing_scope", serviceKey: svc.key, message: `${svc.name}: no service scope on the catalog item.` });
      const ex = (input.excludedWork ?? "").toLowerCase();
      if (ex && ex.includes(svc.name.toLowerCase())) blockers.push({ kind: "contract_conflict", serviceKey: svc.key, message: `${svc.name}: the Client's approved agreement lists this as excluded work — SOW requires Harmonious review.` });
    }
    lines.push({
      selectionId: sel.id,
      serviceKey: svc.key,
      serviceName: svc.name,
      group: svc.service_group,
      scope: svc.standard_scope ?? svc.description ?? null,
      deliverables: svc.standard_deliverables ?? [],
      offeringId: sel.offering_id,
      frequency: svc.billing_frequency ?? null,
      pricingModel: resolved.status === "resolved" ? resolved.pricingModel ?? svc.default_pricing_model ?? null : svc.default_pricing_model ?? null,
      cents: eff.cents,
      pricingSource: eff.source,
      pricingSourceRef: resolved.status === "resolved" ? resolved.sourceRef : null,
      change: isRemoval ? "remove" : "add",
    });
  }
  return { lines, blockers };
}

/** Whether a later service change needs a contract document or can stay a proposal. */
export function serviceChangeRequirement(executedSow: SowLite | null): "draft_sow" | "amendment" {
  return executedSow ? "amendment" : "draft_sow";
}

export const SERVICE_STATE_LABEL: Record<string, string> = {
  proposed: "Proposed",
  contracted: "Contracted",
  active: "Active",
  paused: "Paused",
  terminated: "Terminated",
  removed: "Removed",
};

export const NO_TEMPLATE_MESSAGE = "SOW required — no approved current template available";
