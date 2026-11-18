/**
 * Custom services written by Sales (pure rules, shared by the browser and the server).
 * A custom service is a shared, reusable quote line with no rate-card price: every price
 * typed for it needs CEO or CRO approval. The product review only classifies the service
 * (design/build, add to a product, not tech related); it never approves prices or quotes.
 * A "Needs design or build" service is then tracked through building; once ready, the CEO or CRO
 * releases it to quotes with a standard price, after which it prices like a rate-card service.
 */
import { canDraftQuote, EXEC_PRICE_ROLES, salesScope, type QuoteLineInput } from "@/lib/sales-model";

export const CUSTOM_SERVICE_PREFIX = "CUSTOM:";
export const customServiceKey = (id: string) => `${CUSTOM_SERVICE_PREFIX}${id}`;
export const isCustomServiceKey = (key: string | null | undefined) => typeof key === "string" && key.startsWith(CUSTOM_SERVICE_PREFIX);
export const customServiceIdFromKey = (key: string) => (isCustomServiceKey(key) ? key.slice(CUSTOM_SERVICE_PREFIX.length) : null);

export const CUSTOM_REVIEW_DECISIONS = ["design_build", "add_to_product", "not_tech"] as const;
export type CustomReviewDecision = (typeof CUSTOM_REVIEW_DECISIONS)[number];
export type CustomReviewStatus = "pending" | CustomReviewDecision;

export const CUSTOM_REVIEW_LABEL: Record<CustomReviewStatus, string> = {
  pending: "Waiting for review",
  design_build: "Needs design or build",
  add_to_product: "Add to an existing product",
  not_tech: "Not tech related",
};

export const CUSTOM_REVIEW_HINT: Record<CustomReviewDecision, string> = {
  design_build: "New screens or automation need to be designed and built for this.",
  add_to_product: "It fits an existing product; add it there.",
  not_tech: "A people-delivered service. Nothing to build.",
};

export const CUSTOM_BILLING = ["one_time", "monthly", "quarterly", "annual"] as const;
export type CustomBilling = (typeof CUSTOM_BILLING)[number];

/** Super Admin, CEO, CRO, Operations and Product Reviewers decide what a new service is. */
export const CUSTOM_SERVICE_REVIEWER_ROLES = ["super_admin", "executive", "cro", "operations", "product_reviewer"] as const;
export const canReviewCustomServices = (roles: readonly string[]) => roles.some((r) => (CUSTOM_SERVICE_REVIEWER_ROLES as readonly string[]).includes(r));
export const canCreateCustomService = (roles: readonly string[]) => canDraftQuote(roles);
export const canSeeCustomServices = (roles: readonly string[]) => salesScope(roles) !== "none" || canReviewCustomServices(roles);

/** The creator, Sales leaders and reviewers may edit or retire a service. */
export function canChangeCustomService(args: { actorId: string; roles: readonly string[]; createdBy: string }): boolean {
  if (args.actorId === args.createdBy && canCreateCustomService(args.roles)) return true;
  const scope = salesScope(args.roles);
  return scope === "all" || scope === "team" || canReviewCustomServices(args.roles);
}

/** A reviewer decides; never on a service they wrote. */
export function reviewProblem(args: { actorId: string; roles: readonly string[]; createdBy: string; decision: string; productTarget?: string | null | undefined; archived?: boolean }): string | null {
  if (!canReviewCustomServices(args.roles)) return "Only Super Admin, CEO, CRO, Operations or a Product Reviewer can decide what a custom service is.";
  if (args.archived) return "This custom service was retired.";
  if (args.actorId === args.createdBy) return "Someone other than the person who wrote this service needs to review it.";
  if (!(CUSTOM_REVIEW_DECISIONS as readonly string[]).includes(args.decision)) return "Choose what this service is.";
  if (args.decision === "add_to_product" && (args.productTarget ?? "").trim().length < 2) return "Say which product it should be added to.";
  return null;
}

export type CustomServiceInput = {
  name: string; category?: string | null | undefined; summary: string; included?: readonly string[] | string | null | undefined; excluded?: readonly string[] | string | null | undefined;
  billingFrequency?: string | null | undefined; suggestedPriceCents?: number | null | undefined;
};

const lines = (v: readonly string[] | string | null | undefined) =>
  (Array.isArray(v) ? v : String(v ?? "").split("\n")).map((s) => String(s).trim().replace(/^[-•*]\s*/, "").slice(0, 300)).filter(Boolean).slice(0, 25);

export function cleanCustomService(input: CustomServiceInput) {
  const billing = (CUSTOM_BILLING as readonly string[]).includes(input.billingFrequency ?? "") ? (input.billingFrequency as CustomBilling) : "one_time";
  const price = input.suggestedPriceCents == null || !Number.isFinite(Number(input.suggestedPriceCents)) ? null : Math.max(0, Math.round(Number(input.suggestedPriceCents)));
  return {
    name: input.name.trim().replace(/\s+/g, " ").slice(0, 120),
    category: (input.category ?? "other").trim() || "other",
    summary: input.summary.trim().slice(0, 4000),
    included: lines(input.included),
    excluded: lines(input.excluded),
    billingFrequency: billing,
    suggestedPriceCents: price && price > 0 ? price : null,
  };
}

export function customServiceProblem(c: ReturnType<typeof cleanCustomService>): string | null {
  if (c.name.length < 2) return "Give the service a name.";
  if (c.summary.length < 10) return "Describe what the service is (at least a sentence).";
  return null;
}

/** Editing what the service is after a decision sends it back for review. Pure, for tests. */
export function editReopensReview(status: CustomReviewStatus, before: ReturnType<typeof cleanCustomService>, after: ReturnType<typeof cleanCustomService>): boolean {
  if (status === "pending") return false;
  const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  return before.name !== after.name || before.summary !== after.summary || !same(before.included, after.included) || !same(before.excluded, after.excluded);
}

export const BUILD_STAGES = ["not_started", "designing", "building", "testing", "ready"] as const;
export type BuildStage = (typeof BUILD_STAGES)[number];
export const BUILD_STAGE_LABEL: Record<BuildStage, string> = {
  not_started: "Not started", designing: "Designing", building: "Building", testing: "Testing", ready: "Ready to release",
};

/** CEO, CRO and Super Admin set standard prices, so they release a built service to quotes. */
export const canReleaseCustomService = (roles: readonly string[]) => roles.some((r) => EXEC_PRICE_ROLES.includes(r));

/** Reviewers move build progress; only for "Needs design or build" services not yet released. */
export function buildUpdateProblem(args: { roles: readonly string[]; reviewStatus: CustomReviewStatus; archived?: boolean; released?: boolean; stage: string }): string | null {
  if (!canReviewCustomServices(args.roles)) return "Only Super Admin, CEO, CRO, Operations or a Product Reviewer can update build progress.";
  if (args.archived) return "This custom service was retired.";
  if (args.released) return "This service is already on quotes.";
  if (args.reviewStatus !== "design_build") return "Only services marked Needs design or build are tracked through building.";
  if (!(BUILD_STAGES as readonly string[]).includes(args.stage)) return "Choose where the build is.";
  return null;
}

/** Releasing to quotes (or changing the standard price later): CEO or CRO, never the person who wrote it. */
export function releaseProblem(args: { actorId: string; roles: readonly string[]; createdBy: string; reviewStatus: CustomReviewStatus; buildStage: string | null; archived?: boolean; priceCents?: number | null; billing?: string | null }): string | null {
  if (!canReleaseCustomService(args.roles)) return "Only the CEO, CRO or Super Admin can release a service to quotes with a standard price.";
  if (args.archived) return "This custom service was retired.";
  if (args.actorId === args.createdBy) return "Someone other than the person who wrote this service needs to release it.";
  if (args.reviewStatus !== "design_build") return "Only services marked Needs design or build are released this way.";
  if (args.buildStage !== "ready") return "Mark the build Ready to release first.";
  if (args.priceCents !== undefined && !(Number(args.priceCents) > 0)) return "Enter the standard price.";
  if (args.billing !== undefined && !(CUSTOM_BILLING as readonly string[]).includes(args.billing ?? "")) return "Choose how it's billed.";
  return null;
}

export type CustomRelease = { listPriceCents: number; listBilling: CustomBilling };
/** The standard price, only when the service was released to quotes. */
export function releaseOf(s: { releasedAt?: string | null; listPriceCents?: number | null; listBilling?: string | null }): CustomRelease | null {
  if (!s.releasedAt || !(Number(s.listPriceCents) > 0) || !(CUSTOM_BILLING as readonly string[]).includes(s.listBilling ?? "")) return null;
  return { listPriceCents: Number(s.listPriceCents), listBilling: s.listBilling as CustomBilling };
}

/**
 * Prices a custom quote line. Unreleased: no rate card, so the typed price is the baseline and the
 * quote always needs CEO or CRO approval. Released: the standard price is the baseline for the same
 * billing; at or above it needs no executive approval, below it (or another billing) does. Never $0.
 */
export function priceCustomLine(line: Pick<QuoteLineInput, "unitCents" | "quantity"> & { billingFrequency?: string | null | undefined }, serviceName: string, release: CustomRelease | null = null): { unitCents: number; quantity: number; baselineUnitCents: number; needsExecApproval: boolean } {
  const unit = Math.max(0, Math.round(Number(line.unitCents) || 0));
  const quantity = Math.max(1, Number(line.quantity) || 1);
  if (unit <= 0) throw new Error(release ? `Enter a price for "${serviceName}".` : `Enter a price for "${serviceName}". Custom services have no rate card price, so CEO or CRO approves it.`);
  if (!release) return { unitCents: unit, quantity, baselineUnitCents: unit, needsExecApproval: true };
  const sameBilling = (line.billingFrequency ?? release.listBilling) === release.listBilling;
  if (!sameBilling) return { unitCents: unit, quantity, baselineUnitCents: unit, needsExecApproval: true };
  return { unitCents: unit, quantity, baselineUnitCents: release.listPriceCents, needsExecApproval: unit < release.listPriceCents };
}

/** A new quote line from a saved custom service; the service wording becomes the line's SOW wording. */
export function customQuoteLine(s: { id: string; name: string; summary: string; included: readonly string[]; excluded: readonly string[]; billingFrequency: CustomBilling; suggestedPriceCents: number | null; releasedAt?: string | null; listPriceCents?: number | null; listBilling?: string | null }): QuoteLineInput {
  const release = releaseOf(s);
  const unit = release?.listPriceCents ?? s.suggestedPriceCents ?? 0;
  return { serviceKey: customServiceKey(s.id), label: s.name, quantity: 1, unitCents: unit, baselineUnitCents: unit, billingFrequency: release?.listBilling ?? s.billingFrequency,
    details: { scope: s.summary, included: [...s.included], excluded: [...s.excluded] } };
}
