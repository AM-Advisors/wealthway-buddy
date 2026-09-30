import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const eng = () => import("./document-templates.server");
const uuid = z.string().uuid();

export const listTemplatesFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await eng()).listTemplates(context.userId));

export const listTemplateSourcesFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ offeringId: uuid }).parse(d))
  .handler(async ({ data, context }) => (await eng()).listTemplateSources(context.userId, data.offeringId));

export const createTemplateFromFundFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ offeringId: uuid, documentId: uuid, version: z.number().int().min(1), title: z.string().max(200).nullable().optional(), description: z.string().max(1000).nullable().optional() }).parse(d))
  .handler(async ({ data, context }) => (await eng()).createTemplateFromFund(context.userId, data));

export const addTemplateVersionFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ templateId: uuid, note: z.string().max(1000).nullable().optional(), fileName: z.string().min(1).max(200), base64: z.string().min(1).max(28_000_000) }).parse(d))
  .handler(async ({ data, context }) => (await eng()).addTemplateVersion(context.userId, data));

export const decideTemplateVersionFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ templateId: uuid, version: z.number().int().min(1), decision: z.enum(["approve", "reject"]), note: z.string().max(1000).nullable().optional() }).parse(d))
  .handler(async ({ data, context }) => (await eng()).decideTemplateVersion(context.userId, data));

export const useTemplateInFundFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ templateId: uuid, version: z.number().int().min(1), offeringId: uuid }).parse(d))
  .handler(async ({ data, context }) => (await eng()).useTemplateInFund(context.userId, data));

export const templateDownloadUrlFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ templateId: uuid, version: z.number().int().min(1) }).parse(d))
  .handler(async ({ data, context }) => (await eng()).templateDownloadUrl(context.userId, data));
