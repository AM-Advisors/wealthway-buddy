/**
 * Agreement preparation — pure rules.
 *
 * Harmonious never runs its own signature ceremony. Everything here produces
 * *native Box Sign* configuration: signer roles become Box signers, and placed
 * fields become Box Sign inputs (signature, initial, date, text, checkbox …)
 * carried on the sign request. Box renders them, enforces them and records the
 * signature. Nothing in this file decides that anything has been signed.
 *
 * No database, no Box calls: every rule below is decidable from values, so the
 * same rules are used by the preparation screen, the server and the tests.
 */

import type { SignerCapacity } from "@/lib/document-signing";

/* ------------------------------------------------------------------ roles */

/** Roles a preparer may require on an agreement. Never inferred from email. */
export const SIGNER_ROLES = [
  { key: "investor", label: "Investor", capacity: "individual" },
  { key: "joint_owner", label: "Joint owner", capacity: "joint_owner" },
  { key: "authorized_signatory", label: "Authorized signatory", capacity: "authorized_signatory" },
  { key: "trustee", label: "Trustee", capacity: "trustee" },
  { key: "fund_manager", label: "Fund manager", capacity: "authorized_representative" },
  { key: "company_representative", label: "Company representative", capacity: "authorized_representative" },
  { key: "general_partner", label: "GP / Manager", capacity: "general_partner" },
  { key: "other", label: "Other required signer", capacity: "other" },
] as const satisfies readonly { key: string; label: string; capacity: SignerCapacity }[];

export type SignerRoleKey = (typeof SIGNER_ROLES)[number]["key"];

export function roleLabel(key: string): string {
  return SIGNER_ROLES.find((r) => r.key === key)?.label ?? "Signer";
}

export function capacityForRole(key: string): SignerCapacity {
  return (SIGNER_ROLES.find((r) => r.key === key)?.capacity ?? "other") as SignerCapacity;
}

/** Stable colour slot so each signer's fields are visually distinct. */
export function roleColorIndex(roles: readonly { key: string }[], key: string): number {
  const index = roles.findIndex((r) => r.key === key);
  return index < 0 ? 0 : index % 6;
}

/* ----------------------------------------------------------------- fields */

/** Native Box Sign field types. We do not invent field types of our own. */
export const FIELD_TYPES = [
  { value: "signature", label: "Signature", width: 0.28, height: 0.05, signerFills: true },
  { value: "initial", label: "Initials", width: 0.1, height: 0.04, signerFills: true },
  { value: "date", label: "Date signed", width: 0.18, height: 0.035, signerFills: true },
  { value: "full_name", label: "Printed name", width: 0.28, height: 0.035, signerFills: true },
  { value: "title", label: "Title", width: 0.24, height: 0.035, signerFills: true },
  { value: "company", label: "Company / entity", width: 0.28, height: 0.035, signerFills: true },
  { value: "text", label: "Text", width: 0.24, height: 0.035, signerFills: true },
  { value: "checkbox", label: "Checkbox", width: 0.03, height: 0.03, signerFills: true },
] as const;

export type FieldType = (typeof FIELD_TYPES)[number]["value"];

export function fieldLabel(type: string): string {
  return FIELD_TYPES.find((f) => f.value === type)?.label ?? type;
}

export function defaultSize(type: string) {
  const meta = FIELD_TYPES.find((f) => f.value === type) ?? FIELD_TYPES[0];
  return { width: meta.width, height: meta.height };
}

/** A field placed on the document, always owned by exactly one signer role. */
export interface PlacedField {
  key: string;
  roleKey: string;
  type: FieldType | string;
  /** 0-based, matching Box's page_index. */
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  /** Optional prefill token, resolved from authoritative Harmonious data. */
  prefill?: PrefillToken | null;
  label?: string | null;
}

export interface TemplateRole {
  key: string;
  label?: string;
  order: number;
  required: boolean;
}

/* ---------------------------------------------------------------- prefill */

/**
 * Values that may be written into a document before it is sent. Every one
 * comes from an authoritative Harmonious record — never free text typed by the
 * preparer, and never anything that replaces a signature or acknowledgement.
 */
export const PREFILL_TOKENS = [
  { value: "legal_investor_name", label: "Legal investor name" },
  { value: "investing_entity", label: "Investing entity" },
  { value: "signer_name", label: "Signer name" },
  { value: "signer_title", label: "Signer title / capacity" },
  { value: "fund_name", label: "Fund name" },
  { value: "commitment_amount", label: "Commitment amount" },
  { value: "today", label: "Today's date" },
] as const;

export type PrefillToken = (typeof PREFILL_TOKENS)[number]["value"];

export interface PrefillContext {
  legalInvestorName?: string | null;
  investingEntity?: string | null;
  signerName?: string | null;
  signerTitle?: string | null;
  fundName?: string | null;
  commitmentCents?: number | null;
  today?: string;
}

function money(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(Number(cents))) return "";
  return `$${(Number(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function resolvePrefill(token: string | null | undefined, ctx: PrefillContext): string {
  switch (token) {
    case "legal_investor_name":
      return ctx.legalInvestorName ?? "";
    case "investing_entity":
      return ctx.investingEntity ?? "";
    case "signer_name":
      return ctx.signerName ?? "";
    case "signer_title":
      return ctx.signerTitle ?? "";
    case "fund_name":
      return ctx.fundName ?? "";
    case "commitment_amount":
      return money(ctx.commitmentCents);
    case "today":
      return ctx.today ?? new Date().toISOString().slice(0, 10);
    default:
      return "";
  }
}

/** Prefill may never stand in for something the signer must personally do. */
export const NON_PREFILLABLE: readonly string[] = ["signature", "initial", "checkbox"];

/* -------------------------------------------------------------- validation */

export interface LayoutProblem {
  field?: string;
  message: string;
}

/**
 * A layout is only sendable when every field belongs to a declared role and
 * every required role actually has something to sign.
 */
export function validateLayout(input: {
  roles: readonly TemplateRole[];
  fields: readonly PlacedField[];
}): LayoutProblem[] {
  const problems: LayoutProblem[] = [];
  const roleKeys = new Set(input.roles.map((r) => r.key));

  if (input.roles.length === 0) problems.push({ message: "Choose at least one signer role." });

  for (const role of input.roles) {
    if (!SIGNER_ROLES.some((r) => r.key === role.key)) {
      problems.push({ message: `“${role.key}” is not a signer role we support.` });
    }
  }

  const seen = new Set<string>();
  for (const role of input.roles) {
    if (seen.has(role.key)) problems.push({ message: `${roleLabel(role.key)} is listed twice.` });
    seen.add(role.key);
  }

  for (const field of input.fields) {
    if (!roleKeys.has(field.roleKey)) {
      problems.push({ field: field.key, message: "Every field must belong to a signer." });
    }
    if (!FIELD_TYPES.some((f) => f.value === field.type)) {
      problems.push({ field: field.key, message: `“${field.type}” is not a Box Sign field.` });
    }
    if (field.pageIndex < 0 || !Number.isInteger(field.pageIndex)) {
      problems.push({ field: field.key, message: "That field is not on a real page." });
    }
    const inRange = (n: number) => Number.isFinite(n) && n >= 0 && n <= 1;
    if (!inRange(field.x) || !inRange(field.y) || !inRange(field.width) || !inRange(field.height)) {
      problems.push({ field: field.key, message: "That field sits outside the page." });
    }
    if (field.prefill && NON_PREFILLABLE.includes(String(field.type))) {
      problems.push({
        field: field.key,
        message: `A ${fieldLabel(field.type)} field must be completed by the signer.`,
      });
    }
  }

  for (const role of input.roles.filter((r) => r.required !== false)) {
    const mine = input.fields.filter((f) => f.roleKey === role.key);
    if (!mine.some((f) => f.type === "signature")) {
      problems.push({ message: `${roleLabel(role.key)} has no signature field.` });
    }
  }

  return problems;
}

/* ------------------------------------------------------------ box payload */

export interface BoxInput {
  document_tag_id: string;
  type: string;
  page_index: number;
  coordinates: { x: number; y: number };
  dimensions: { width: number; height: number };
  is_required: boolean;
  text_value?: string;
}

/**
 * Turns the placed layout into native Box Sign inputs, one bundle per signer.
 * Signers are matched to roles by role key: a field can only ever reach the
 * signer whose role owns it.
 */
export function boxInputsByRole(input: {
  fields: readonly PlacedField[];
  prefillFor: (roleKey: string) => PrefillContext;
}): Record<string, BoxInput[]> {
  const out: Record<string, BoxInput[]> = {};
  input.fields.forEach((field, index) => {
    const bucket = (out[field.roleKey] ??= []);
    const prefillable = field.prefill && !NON_PREFILLABLE.includes(String(field.type));
    const value = prefillable ? resolvePrefill(field.prefill, input.prefillFor(field.roleKey)) : "";
    bucket.push({
      document_tag_id: `${field.roleKey}-${field.type}-${index}`,
      type: String(field.type),
      page_index: Math.max(0, Math.trunc(field.pageIndex)),
      coordinates: { x: field.x, y: field.y },
      dimensions: { width: field.width, height: field.height },
      is_required: field.required !== false,
      ...(value ? { text_value: value } : {}),
    });
  });
  return out;
}

/* ------------------------------------------------------- who may prepare */

export interface PreparerActor {
  userId: string;
  /** Harmonious staff capabilities, e.g. "documents:prepare". Empty for clients. */
  capabilities: readonly string[];
  /** Funds this person is recorded as managing. */
  offeringIds: readonly string[];
  /** Companies this person is a recorded representative of. */
  companyIds: readonly string[];
}

export type PrepareTarget = {
  scope: "harmonious" | "fund" | "company";
  offeringId?: string | null;
  companyId?: string | null;
};

/**
 * Authorization for preparing. Checked against the actual fund/company
 * relationship — never against an email address or its domain.
 */
export function canPrepare(actor: PreparerActor, target: PrepareTarget): boolean {
  const staffPrepare = actor.capabilities.includes("documents:prepare");
  switch (target.scope) {
    case "harmonious":
      return staffPrepare;
    case "fund":
      if (!target.offeringId) return false;
      return staffPrepare || actor.offeringIds.includes(target.offeringId);
    case "company":
      if (!target.companyId) return false;
      return staffPrepare || actor.companyIds.includes(target.companyId);
    default:
      return false;
  }
}

/** Reading a template follows the same relationship, plus Harmonious standards. */
export function canUseTemplate(actor: PreparerActor, target: PrepareTarget): boolean {
  if (target.scope === "harmonious") {
    return (
      actor.capabilities.includes("documents:see") ||
      actor.offeringIds.length > 0 ||
      actor.companyIds.length > 0
    );
  }
  return canPrepare(actor, target);
}

/* ------------------------------------------------------- send-time review */

export interface SendReviewSigner {
  roleKey: string;
  name: string;
  email: string;
  order: number;
  required: boolean;
}

export interface SendReview {
  agreement: string;
  investor: string;
  primarySigner: SendReviewSigner | null;
  capacityLabel: string;
  requiredFieldCount: number;
  additionalSigners: SendReviewSigner[];
  problems: LayoutProblem[];
}

export function buildSendReview(input: {
  agreementTitle: string;
  investorName: string;
  roles: readonly TemplateRole[];
  fields: readonly PlacedField[];
  signers: readonly SendReviewSigner[];
}): SendReview {
  const ordered = [...input.signers].sort((a, b) => a.order - b.order);
  const primary = ordered[0] ?? null;
  const problems = validateLayout({ roles: input.roles, fields: input.fields });

  for (const role of input.roles.filter((r) => r.required !== false)) {
    const filled = input.signers.find((s) => s.roleKey === role.key);
    if (!filled?.email) {
      problems.push({ message: `Choose who signs as ${roleLabel(role.key)}.` });
    }
  }

  return {
    agreement: input.agreementTitle,
    investor: input.investorName,
    primarySigner: primary,
    capacityLabel: primary ? roleLabel(primary.roleKey) : "",
    requiredFieldCount: input.fields.filter((f) => f.required !== false).length,
    additionalSigners: ordered.slice(1),
    problems,
  };
}

/* ---------------------------------------------------------- version locks */

/**
 * A signature request is pinned to the template version and the Box file
 * version it was sent with. Publishing a new template version affects only
 * requests sent afterwards.
 */
export function requestUsesCurrentTemplate(input: {
  requestTemplateVersionId: string | null | undefined;
  currentTemplateVersionId: string | null | undefined;
}): boolean {
  if (!input.requestTemplateVersionId || !input.currentTemplateVersionId) return true;
  return input.requestTemplateVersionId === input.currentTemplateVersionId;
}

/** Nothing may be re-prepared or re-sent once the agreement is executed. */
export function preparationAllowed(state: string): { allowed: boolean; reason?: string } {
  if (state === "executed") {
    return { allowed: false, reason: "This agreement is executed and cannot be changed." };
  }
  if (state === "partially_signed" || state === "out_for_signature") {
    return {
      allowed: false,
      reason: "This agreement is out for signature. Cancel it first to prepare a new version.",
    };
  }
  return { allowed: true };
}

/** Operations pipeline buckets, derived from authoritative state only. */
export const AGREEMENT_PIPELINE = [
  { key: "templates", label: "Templates" },
  { key: "draft", label: "Drafts" },
  { key: "prepared", label: "Prepared" },
  { key: "sent", label: "Sent" },
  { key: "awaiting", label: "Awaiting signature" },
  { key: "partially_signed", label: "Partially signed" },
  { key: "executed", label: "Executed" },
  { key: "attention", label: "Declined / expired / error" },
] as const;

export type PipelineKey = (typeof AGREEMENT_PIPELINE)[number]["key"];

/** Maps an execution state onto a pipeline bucket. Never a stored status. */
export function pipelineBucket(state: string, sentAt: string | null | undefined): PipelineKey {
  switch (state) {
    case "executed":
      return "executed";
    case "partially_signed":
      return "partially_signed";
    case "declined":
    case "expired":
    case "cancelled":
    case "error":
      return "attention";
    case "out_for_signature":
      return sentAt ? "awaiting" : "sent";
    default:
      return "prepared";
  }
}
