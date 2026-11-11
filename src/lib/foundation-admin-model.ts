/**
 * Foundation Administration: pure, browser-safe rules (phase 1).
 *
 * A foundation profile hangs off an existing client entity. Its legal structure is kept apart from its
 * charitable/tax classification, and a foundation that invests in a fund (investment profile) is a
 * different relationship from a foundation that receives administration services (this profile).
 *
 * Nothing here grants authority. The server and database re-check every rule.
 */
import { z } from "zod";

export const FOUNDATION_FLAG = "foundation_administration";
export const FOUNDATION_KEY_PREFIX = "FOUNDATION_ADMIN:";

export const LEGAL_STRUCTURES = {
  nonprofit_corporation: "Nonprofit corporation",
  charitable_trust: "Charitable trust",
  llc: "LLC",
  unincorporated_association: "Unincorporated association",
  other: "Other",
} as const;
export type LegalStructure = keyof typeof LEGAL_STRUCTURES;

export const CLASSIFICATIONS = {
  private_nonoperating_foundation: "Private nonoperating foundation",
  private_operating_foundation: "Private operating foundation",
  public_charity_509a1: "Public charity, 509(a)(1)",
  public_charity_509a2: "Public charity, 509(a)(2)",
  supporting_organization_509a3: "Supporting organization, 509(a)(3)",
  donor_advised_fund_sponsor: "Donor-advised fund sponsor",
  other: "Other",
  unknown: "Not known yet",
} as const;
export type Classification = keyof typeof CLASSIFICATIONS;

export const EXEMPTION_STATUSES = {
  determined: "Determination letter received",
  pending: "Application pending",
  not_applied: "Not applied",
  revoked: "Revoked",
  unknown: "Not known yet",
} as const;
export type ExemptionStatus = keyof typeof EXEMPTION_STATUSES;

// ------------------------------------------------------------ People and authority

export const AUTHORITY_ROLES = {
  director: "Director",
  trustee: "Trustee",
  officer: "Officer",
  authorized_signer: "Authorized signer",
  approver: "Approver",
  paperwork_preparer: "Paperwork preparer",
} as const;
export type AuthorityRole = keyof typeof AUTHORITY_ROLES;

export const AUTHORITY_SCOPES = {
  sign_agreements: "Sign agreements",
  approve_grants: "Approve grants",
  approve_payments: "Approve payments",
  banking: "Bank account authority",
  submit_verification: "Act for the foundation in verification",
  approve_documents: "Approve documents",
  board_vote: "Board vote",
  prepare_paperwork: "Prepare paperwork only",
} as const;
export type AuthorityScope = keyof typeof AUTHORITY_SCOPES;

/** Scopes that only governing evidence can establish. Preparing paperwork never implies any of them. */
export const EVIDENCED_SCOPES: readonly AuthorityScope[] = ["sign_agreements", "approve_grants", "approve_payments", "banking", "submit_verification", "approve_documents", "board_vote"];

export function authorityProblem(input: { role: string; scopes: readonly string[]; evidenceDocumentId?: string | null }): string | null {
  if (!(input.role in AUTHORITY_ROLES)) return "Choose a recorded role.";
  const unknown = input.scopes.find((s) => !(s in AUTHORITY_SCOPES));
  if (unknown) return "Choose authority from the list.";
  const evidenced = input.scopes.filter((s) => (EVIDENCED_SCOPES as readonly string[]).includes(s));
  if (input.role === "paperwork_preparer" && evidenced.length)
    return "A paperwork preparer can only prepare paperwork. Signing, verification, grant approval, banking and payment authority need a separate role backed by evidence.";
  if (evidenced.length && !input.evidenceDocumentId) return "Attach the foundation document that grants this authority, such as bylaws, a trust instrument or a board resolution.";
  return null;
}

export type AuthorityRow = { person_id: string; role: string; authority_scopes: readonly string[]; status: string; effective_on: string; ended_on?: string | null };

/** True only for an active, effective, evidenced grant of that exact scope. A preparer never holds evidenced scopes. */
export function holdsAuthority(rows: readonly AuthorityRow[], personId: string, scope: AuthorityScope, onDate: string): boolean {
  return rows.some((r) => r.person_id === personId && r.status === "active" && r.effective_on <= onDate
    && r.authority_scopes.includes(scope)
    && (r.role !== "paperwork_preparer" || scope === "prepare_paperwork"));
}

// ------------------------------------------------------------ Service components

export type ComponentKey = "onboarding_setup" | "governance_admin" | "bookkeeping_reporting" | "contributions_restrictions" | "grant_administration" | "annual_compliance";
export type Capability = "partial" | "not_built" | "blocked_by_existing_gate";

export type FoundationComponent = {
  key: ComponentKey; name: string; cadence: "one_time" | "recurring"; summary: string;
  deliverables: string[]; included: string[]; excluded: string[]; harmoniousDuties: string[];
  readiness: { released: false; capability: Capability; available: string[]; missing: string[] };
};

const RETAINED_ALWAYS = "Final decisions, approvals and signatures stay with the foundation's board and trustees.";

export const FOUNDATION_COMPONENTS: readonly FoundationComponent[] = [
  {
    key: "onboarding_setup", name: "Foundation onboarding and setup", cadence: "one_time",
    summary: "Collect the foundation's records, people and authority, and set up its administration workspace.",
    deliverables: ["Foundation profile on file", "People and authority register", "Document checklist with gaps identified"],
    included: ["Review of governing documents supplied by the foundation", "Recording directors, trustees, officers and signers with their evidence"],
    excluded: ["Legal advice on formation or exemption", "Preparing or filing Form 1023 or 1024"],
    harmoniousDuties: ["Organize and record the documents and authority the foundation provides", "Flag missing or expired records"],
    readiness: { released: false, capability: "partial", available: ["Foundation profile", "People and authority register", "Private document storage", "Operations tasks"], missing: ["Client-facing foundation onboarding screens", "Entity verification (KYB) and AML screening for foundations through the canonical verification engine"] },
  },
  {
    key: "governance_admin", name: "Administration and governance support", cadence: "recurring",
    summary: "Ongoing administrative support for board and trustee processes.",
    deliverables: ["Task and deadline tracking", "Document organization"],
    included: ["Tracking governance tasks and deadlines", "Maintaining the authority register when the foundation reports changes"],
    excluded: ["Acting as a director, trustee or officer", "Voting or approving on the foundation's behalf"],
    harmoniousDuties: ["Track tasks and deadlines", "Keep the record current from information the foundation provides"],
    readiness: { released: false, capability: "partial", available: ["Tasks and deadlines", "Documents"], missing: ["Board packets", "Meeting minutes workflow", "Compliance calendar"] },
  },
  {
    key: "bookkeeping_reporting", name: "Bookkeeping and financial reporting", cadence: "recurring",
    summary: "Nonprofit bookkeeping and financial statements.",
    deliverables: ["Monthly or quarterly books", "Financial statements"],
    included: ["Categorizing and reconciling foundation accounts", "Preparing statements for board review"],
    excluded: ["Audit or attestation", "Investment advice"],
    harmoniousDuties: ["Record and reconcile transactions from statements the foundation provides"],
    readiness: { released: false, capability: "blocked_by_existing_gate", available: [], missing: ["Foundation bank account connections and imports", "Nonprofit chart of accounts and restricted net assets", "Statement of activities and financial position", "Existing bookkeeping availability limits stay in place until foundation accounting is validated"] },
  },
  {
    key: "contributions_restrictions", name: "Contribution and donor-restriction tracking", cadence: "recurring",
    summary: "Record contributions, donor restrictions and acknowledgments.",
    deliverables: ["Contribution register", "Restriction tracking", "Acknowledgment letters for board approval"],
    included: ["Recording gifts and their restrictions from documents the foundation provides"],
    excluded: ["Valuing noncash gifts", "Tax advice to donors"],
    harmoniousDuties: ["Record contributions and restrictions as documented"],
    readiness: { released: false, capability: "not_built", available: [], missing: ["Donor records", "Gift documentation", "Restriction balances", "Acknowledgment letters"] },
  },
  {
    key: "grant_administration", name: "Grant administration", cadence: "recurring",
    summary: "Support the grant process from application to closeout.",
    deliverables: ["Grant applications log", "Approval records", "Grantee reporting tracker"],
    included: ["Organizing applications and diligence materials", "Tracking approvals, agreements, reports and closeout"],
    excluded: ["Deciding or approving grants", "Releasing grant payments"],
    harmoniousDuties: ["Organize grant records and track each grant's status"],
    readiness: { released: false, capability: "not_built", available: [], missing: ["Grantee diligence", "Applications", "Conflicts review", "Grant approvals", "Grant agreements", "Grantee reporting and closeout", "Grant payment preparation tied to an approved grant, verified recipient, approved destination and authorized approvers"] },
  },
  {
    key: "annual_compliance", name: "Annual compliance and tax-preparer coordination", cadence: "recurring",
    summary: "Coordinate annual compliance with the foundation's tax preparer.",
    deliverables: ["Annual compliance checklist", "Information package for the tax preparer"],
    included: ["Tracking annual deadlines", "Assembling records the tax preparer requests"],
    excluded: ["Preparing, signing or filing tax returns", "Paying taxes or penalties"],
    harmoniousDuties: ["Track deadlines and assemble records for the foundation's tax preparer"],
    readiness: { released: false, capability: "not_built", available: ["Reference filing deadline from the fiscal year end"], missing: ["Compliance calendar", "Tax-preparer workpapers", "Distribution requirement tracking"] },
  },
];

export const COMPONENT_KEYS = FOUNDATION_COMPONENTS.map((c) => c.key) as [ComponentKey, ...ComponentKey[]];
export const componentByKey = (k: string) => FOUNDATION_COMPONENTS.find((c) => c.key === k) ?? null;
export const foundationServiceKey = (k: ComponentKey) => `${FOUNDATION_KEY_PREFIX}${k}`;
export const isFoundationKey = (k: string | null | undefined) => typeof k === "string" && k.startsWith(FOUNDATION_KEY_PREFIX);

/** No component is released in phase 1. A future release needs approved pricing and terms per component. */
export const RELEASED_COMPONENTS: readonly ComponentKey[] = [];

export const RETAINED_RESPONSIBILITIES: readonly { party: string; items: string[] }[] = [
  { party: "Board and trustees", items: [RETAINED_ALWAYS, "Approving grants, budgets, investments and payments", "Fiduciary duties to the foundation"] },
  { party: "Legal counsel", items: ["Legal advice, governing document drafting and exemption applications"] },
  { party: "Investment adviser", items: ["Investment decisions and discretionary management of foundation assets"] },
  { party: "Tax preparer", items: ["Preparing, signing and filing the foundation's tax returns"] },
];

export const FOUNDATION_ROLE_DISCLAIMER =
  "Harmonious provides administrative support only. Harmonious is not a trustee, director or officer of the foundation, does not act as a discretionary investment adviser, does not prepare, sign or file the foundation's tax returns, and is not a signatory on foundation bank accounts or payments. Decisions on grants, investments, filings and payments remain with the foundation's board and trustees and the advisers they appoint.";

// ------------------------------------------------------------ Quote lines

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const list = z.array(z.string().trim().min(1).max(300)).max(20);
export const foundationLineInputSchema = z.object({
  component: z.enum(COMPONENT_KEYS),
  foundationProfileId: z.string().uuid(),
  clientEntityId: z.string().uuid(),
  billing: z.enum(["one_time", "monthly", "quarterly", "annual"]),
  negotiatedUnitCents: z.number().int().min(0).max(100_000_000_00).nullable(),
  negotiatedReason: z.string().trim().max(1000).nullable(),
  optional: z.boolean(),
  limits: z.array(z.object({ label: z.string().trim().min(1).max(120), quantity: z.number().min(0).max(1_000_000), unit: z.string().trim().min(1).max(40) })).max(10),
  scope: z.string().trim().max(2000),
  deliverables: list, included: list, excluded: list,
  serviceStartOn: day, serviceEndOn: day.nullable(), billingStartOn: day,
});
export type FoundationLineInput = z.infer<typeof foundationLineInputSchema>;

export type FoundationPricing = { unitCents: number; baselineUnitCents: number; rateCents: number | null; priceSource: "rate_card" | "negotiated"; needsExecutiveApproval: boolean; negotiatedReason: string | null };

/** Approved rate when one exists; otherwise an explicit negotiated price that always needs executive approval. Never $0 by default. */
export function priceFoundationLine(input: FoundationLineInput, rateCents: number | null): { ok: true; pricing: FoundationPricing } | { ok: false; problem: string } {
  const c = componentByKey(input.component);
  if (!c) return { ok: false, problem: "Choose a Foundation Administration component." };
  if (c.cadence === "one_time" && input.billing !== "one_time") return { ok: false, problem: `${c.name} is billed once.` };
  if (c.cadence === "recurring" && input.billing === "one_time") return { ok: false, problem: `${c.name} is a recurring service. Choose monthly, quarterly or annual billing.` };
  if (input.billingStartOn < input.serviceStartOn) return { ok: false, problem: "Billing can't start before the service starts." };
  if (input.serviceEndOn && input.serviceEndOn <= input.serviceStartOn) return { ok: false, problem: "The service end date must be after the start date." };
  const rate = rateCents != null && rateCents > 0 ? rateCents : null;
  const reason = input.negotiatedReason?.trim() || null;
  if (rate !== null) {
    const unit = input.negotiatedUnitCents ?? rate;
    if (unit <= 0) return { ok: false, problem: `Enter a price above $0 for ${c.name}.` };
    const below = unit < rate;
    if (below && (!reason || reason.length < 10)) return { ok: false, problem: "Explain the price below the approved rate (at least 10 characters)." };
    return { ok: true, pricing: { unitCents: unit, baselineUnitCents: rate, rateCents: rate, priceSource: "rate_card", needsExecutiveApproval: below, negotiatedReason: below ? reason : null } };
  }
  if (input.negotiatedUnitCents == null || input.negotiatedUnitCents <= 0)
    return { ok: false, problem: `No approved rate exists for ${c.name}. Enter the negotiated price; it will need executive approval.` };
  if (!reason || reason.length < 10) return { ok: false, problem: "Explain how the negotiated price was set (at least 10 characters)." };
  return { ok: true, pricing: { unitCents: input.negotiatedUnitCents, baselineUnitCents: input.negotiatedUnitCents, rateCents: null, priceSource: "negotiated", needsExecutiveApproval: true, negotiatedReason: reason } };
}

export type FoundationCoverageRow = { source: "quote" | "engagement"; ref: string; component: ComponentKey | null; clientEntityId: string; startOn: string | null; endOn: string | null };

const overlaps = (a: { s: string; e: string | null }, b: { s: string | null; e: string | null }) =>
  (b.e === null || a.s < b.e) && (a.e === null || b.s === null || b.s < a.e);

/** Same entity and component already quoted or engaged for an overlapping period. One-time setup conflicts whatever the dates. */
export function foundationCoverageConflict(input: Pick<FoundationLineInput, "component" | "clientEntityId" | "serviceStartOn" | "serviceEndOn">, rows: readonly FoundationCoverageRow[]): string | null {
  const c = componentByKey(input.component);
  const hit = rows.find((r) => r.clientEntityId === input.clientEntityId && (r.component === null || r.component === input.component)
    && (c?.cadence === "one_time" || overlaps({ s: input.serviceStartOn, e: input.serviceEndOn }, { s: r.startOn, e: r.endOn })));
  if (!hit) return null;
  const what = c?.name ?? "This component";
  return hit.source === "engagement"
    ? `${what} is already part of an engagement for this foundation for that period. Change the dates or amend the existing engagement.`
    : `${what} is already on another open quote for this foundation for that period. Update that quote or replace it with a new version.`;
}

export type FoundationActionKind = "send" | "contract" | "sign" | "invoice";
const ACTION_WORDS: Record<FoundationActionKind, string> = { send: "sent to the client", contract: "turned into an SOW or agreement", sign: "signed", invoice: "billed" };

/** Phase 1: drafts save and can be approved internally; nothing with an unreleased component moves toward the client, contract or billing. */
export function foundationReleaseBlocker(lines: readonly { service_key?: string | null; foundation_snapshot?: unknown }[], action: FoundationActionKind): string | null {
  const keys = lines.filter((l) => isFoundationKey(l.service_key) || (l.foundation_snapshot != null))
    .map((l) => String(l.service_key ?? "").slice(FOUNDATION_KEY_PREFIX.length) as ComponentKey);
  const unreleased = [...new Set(keys.filter((k) => !RELEASED_COMPONENTS.includes(k)))];
  if (!unreleased.length) return null;
  const names = unreleased.map((k) => componentByKey(k)?.name ?? "Foundation Administration").join(", ");
  return `Foundation Administration isn't released yet, so this quote can be saved and approved internally but not ${ACTION_WORDS[action]}. Not released: ${names}.`;
}

export function foundationLineTerms(input: FoundationLineInput) {
  const c = componentByKey(input.component)!;
  const pick = (typed: string[], fallback: string[]) => (typed.length ? typed : fallback);
  return {
    componentName: c.name,
    scope: input.scope || c.summary,
    deliverables: pick(input.deliverables, c.deliverables),
    included: pick(input.included, c.included),
    excluded: pick(input.excluded, c.excluded),
    harmoniousDuties: c.harmoniousDuties,
    retainedResponsibilities: RETAINED_RESPONSIBILITIES,
    disclaimer: FOUNDATION_ROLE_DISCLAIMER,
    limits: input.limits,
    optional: input.optional,
    serviceStartOn: input.serviceStartOn, serviceEndOn: input.serviceEndOn, billingStartOn: input.billingStartOn,
  };
}

export function foundationLineLabel(input: Pick<FoundationLineInput, "component" | "optional">) {
  const c = componentByKey(input.component);
  return `Foundation Administration · ${c?.name ?? input.component}${input.optional ? " (optional)" : ""}`;
}

/** Frozen on the quote line. The database reads foundationProfileId, clientEntityId and priceSource. */
export function foundationSnapshot(input: FoundationLineInput, pricing: FoundationPricing, ctx: { entityName: string; checkedAt: string }) {
  const c = componentByKey(input.component)!;
  return {
    version: 1, component: input.component, componentName: c.name,
    foundationProfileId: input.foundationProfileId, clientEntityId: input.clientEntityId, entityName: ctx.entityName,
    input, priceSource: pricing.priceSource, unitCents: pricing.unitCents, pricing,
    terms: foundationLineTerms(input),
    coverageCheck: { checkedAt: ctx.checkedAt, conflicts: [] as string[] },
    releaseStatus: "unreleased" as const, readiness: c.readiness,
  };
}

// ------------------------------------------------------------ Operations handoff and deadlines

export type HandoffTask = { title: string; description: string; team: "operations"; dueInDays: number };

/** Operations work for a foundation. Linked to the foundation entity only; never creates a fund, investors or billing. */
export function foundationHandoffTasks(entityName: string, components: readonly ComponentKey[]): HandoffTask[] {
  const tasks: HandoffTask[] = [
    { title: `Foundation onboarding: review records for ${entityName}`, description: "Confirm governing documents, determination letter and classification are on file. Recording these grants no authority.", team: "operations", dueInDays: 5 },
    { title: `Foundation onboarding: confirm people and authority for ${entityName}`, description: "Check each director, trustee, officer and signer against the foundation's evidence. Paperwork preparers stay limited to preparing paperwork.", team: "operations", dueInDays: 7 },
  ];
  for (const k of components) {
    const c = componentByKey(k);
    if (c && k !== "onboarding_setup") tasks.push({ title: `Plan ${c.name.toLowerCase()} for ${entityName}`, description: `Not released yet. Missing: ${c.readiness.missing.join("; ") || "release approval"}.`, team: "operations", dueInDays: 14 });
  }
  return tasks;
}

/** Reference only: the 15th day of the 5th month after fiscal year end. Filed by the foundation's tax preparer, never by Harmonious. */
export function annualReturnReferenceDate(fiscalYearEndMonth: number | null | undefined, today: string): string | null {
  if (!fiscalYearEndMonth || fiscalYearEndMonth < 1 || fiscalYearEndMonth > 12) return null;
  const year = Number(today.slice(0, 4));
  for (const y of [year - 1, year, year + 1]) {
    const m = fiscalYearEndMonth + 5; // month index (1-based) after adding five
    const due = new Date(Date.UTC(y + Math.floor((m - 1) / 12), (m - 1) % 12, 15)).toISOString().slice(0, 10);
    if (due >= today) return due;
  }
  return null;
}

// ------------------------------------------------------------ Access

/** Staff need clients:see to read and clients:prepare to change; client members may only read their own exact client. */
export function foundationAccessProblem(input: { capabilities: readonly string[]; memberClientIds: readonly string[]; clientId: string; write: boolean }): string | null {
  if (input.write) return input.capabilities.includes("clients:prepare") ? null : "Your role can't change foundation records.";
  if (input.capabilities.includes("clients:see") || input.memberClientIds.includes(input.clientId)) return null;
  return "Foundation not found.";
}
