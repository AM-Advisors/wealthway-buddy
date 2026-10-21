import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const db = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
const srv = () => import("@/lib/prior-signed-documents.server");
const base = z.object({ fundId: z.string().uuid(), onboardingId: z.string().uuid() });
const KINDS = ["subscription_agreement", "operating_agreement", "ppm_acknowledgment", "tax_form", "side_letter", "accreditation", "other"] as const;

export const listPriorDocsFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(base.parse)
  .handler(async ({ data, context }) => (await srv()).listPriorDocs(await db(), context.userId, data));

export const startPriorUploadFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(base.extend({ fileName: z.string().min(1).max(255) }).parse)
  .handler(async ({ data, context }) => (await srv()).startPriorUpload(await db(), context.userId, data));

export const recordPriorDocFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(base.extend({
    path: z.string().min(1).max(500), fileName: z.string().min(1).max(255), kind: z.enum(KINDS), title: z.string().trim().min(1).max(200),
    signedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), note: z.string().max(500).nullish(), replacesId: z.string().uuid().nullish(),
  }).parse)
  .handler(async ({ data, context }) => (await srv()).recordPriorDoc(await db(), context.userId, data));

export const openPriorDocFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(base.extend({ documentId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => (await srv()).openPriorDoc(await db(), context.userId, data));
