import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ops = () => import("@/lib/onboarding-ops.server");

export const staffTaxReviewListFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await ops()).staffTaxReviewList(context.userId));

export const listCompliancePolicyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await ops()).listCompliancePolicy(context.userId));

export const createPolicyDraftFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    kind: z.enum(["high_risk_jurisdiction", "edd_amount_threshold"]),
    countryCode: z.string().trim().length(2).nullable().optional(),
    riskClassification: z.string().trim().min(2).max(80).nullable().optional(),
    thresholdCents: z.number().int().positive().nullable().optional(),
    currency: z.string().trim().length(3).nullable().optional(),
    scope: z.enum(["global", "fund"]),
    offeringId: z.string().uuid().nullable().optional(),
    effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    sourceReference: z.string().trim().min(3).max(500),
    reason: z.string().trim().max(500).nullable().optional(),
  }).parse)
  .handler(async ({ data, context }) => (await ops()).createPolicyDraft(context.userId, data));

export const decidePolicyEntryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), action: z.enum(["approve", "retire"]) }).parse)
  .handler(async ({ data, context }) => (await ops()).decidePolicyEntry(context.userId, data));

export const listLegalWordingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await ops()).listLegalWording(context.userId));

export const createWordingDraftFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    requirementKey: z.string().trim().regex(/^[a-z0-9_:.-]{3,80}$/),
    title: z.string().trim().min(3).max(200),
    wording: z.string().trim().min(10).max(20000),
    effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).parse)
  .handler(async ({ data, context }) => (await ops()).createWordingDraft(context.userId, data));

export const decideWordingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), action: z.enum(["approve", "retire"]) }).parse)
  .handler(async ({ data, context }) => (await ops()).decideWording(context.userId, data));
