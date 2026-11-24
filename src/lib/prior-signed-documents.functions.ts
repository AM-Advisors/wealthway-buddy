import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const db = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
const srv = () => import("@/lib/prior-signed-documents.server");
const base = z.object({ fundId: z.string().uuid(), onboardingId: z.string().uuid() });
const KINDS = ["subscription_agreement", "operating_agreement", "ppm_acknowledgment", "tax_form", "side_letter", "accreditation", "schedule_k1", "capital_account_statement", "capital_call_notice", "distribution_notice", "funding_confirmation", "investment_other", "other"] as const;

export const listPriorDocsFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator(base.parse)
  .handler(async ({ data, context }) => (await srv()).listPriorDocs(await db(), context.userId, data));

export const startPriorUploadFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(base.extend({ fileName: z.string().min(1).max(255) }).parse)
  .handler(async ({ data, context }) => (await srv()).startPriorUpload(await db(), context.userId, data));

export const recordPriorDocFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(base.extend({
    path: z.string().min(1).max(500), fileName: z.string().min(1).max(255), kind: z.enum(KINDS), title: z.string().trim().min(1).max(200),
    signedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), note: z.string().max(500).nullish(), replacesId: z.string().uuid().nullish(),
  }).parse)
  .handler(async ({ data, context }) => (await srv()).recordPriorDoc(await db(), context.userId, data));

export const openPriorDocFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(base.extend({ documentId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => (await srv()).openPriorDoc(await db(), context.userId, data));

export const outsideSubscriptionFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator(base.parse)
  .handler(async ({ data, context }) => (await srv()).outsideSubscriptionState(await db(), context.userId, data));

export const markOutsideSubscriptionFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(base.extend({ marked: z.boolean(), signedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(), note: z.string().max(500).nullish() }).parse)
  .handler(async ({ data, context }) => (await srv()).markOutsideSubscription(await db(), context.userId, data));

export const setPriorDocWithdrawnFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(base.extend({ documentId: z.string().uuid(), withdrawn: z.boolean(), reason: z.string().trim().min(1).max(500) }).parse)
  .handler(async ({ data, context }) => (await srv()).setPriorDocWithdrawn(await db(), context.userId, data));

const docIn = z.object({ fundId: z.string().uuid(), onboardingId: z.string().uuid(), documentId: z.string().uuid() });
export const confirmPriorDocSignaturesFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(docIn.extend({ complete: z.boolean(), note: z.string().trim().min(3).max(500) }).parse)
  .handler(async ({ data, context }) => (await import("@/lib/prior-doc-signatures.server")).confirmPriorDocSignatures(context.userId, data));
export const recheckPriorDocSignaturesFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(docIn.parse)
  .handler(async ({ data, context }) => {
    const { access } = await import("@/lib/prior-signed-documents.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await access(supabaseAdmin as any, context.userId, data.fundId, data.onboardingId);
    return { state: await (await import("@/lib/prior-doc-signatures.server")).analyzePriorDoc(data.documentId, context.userId) };
  });
export const prepareMissingSignatureFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(docIn.parse)
  .handler(async ({ data, context }) => (await import("@/lib/prior-doc-signatures.server")).prepareMissingSignature(context.userId, data));
export const catchUpPriorDocSignaturesFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(z.object({ limit: z.number().int().min(1).max(10).default(5) }).parse)
  .handler(async ({ data, context }) => (await import("@/lib/prior-doc-signatures.server")).catchUpPriorDocSignatures(context.userId, data));
export const priorDocSignatureSummaryFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await import("@/lib/prior-doc-signatures.server")).priorDocSignatureSummary(context.userId));
