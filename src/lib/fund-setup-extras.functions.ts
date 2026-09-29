import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const x = () => import("@/lib/fund-setup-extras.server");
const uuid = z.string().uuid();
const t = (n: number) => z.string().trim().max(n).nullish();

export const getFundSetupExtrasFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid }).parse)
  .handler(async ({ data, context }) => (await x()).getExtras(context.userId, data.offeringId));

export const saveFundProvidersFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      offeringId: uuid,
      providers: z.object({
        bankName: z.string().trim().max(160).optional(), custodianName: z.string().trim().max(160).optional(),
        counsel: z.string().trim().max(160).optional(), auditor: z.string().trim().max(160).optional(),
        taxPreparer: z.string().trim().max(160).optional(), taxPreparerIsHarmonious: z.boolean().optional(),
      }),
    }).parse,
  )
  .handler(async ({ data, context }) => (await x()).saveProviders(context.userId, data));

export const uploadFormationEvidenceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid, kind: z.enum(["formation", "certificate", "ein_letter"]), path: z.string().min(3).max(400) }).parse)
  .handler(async ({ data, context }) => (await x()).uploadEvidence(context.userId, data));

export const addRegulatoryFilingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      offeringId: uuid, type: z.enum(["form_d", "blue_sky"]), kind: z.enum(["initial", "amendment", "renewal"]),
      state: z.string().trim().length(2).nullish(), accessionNumber: t(40), efdId: t(40),
      filingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish().or(z.literal("")), notes: t(1000),
    }).parse,
  )
  .handler(async ({ data, context }) => (await x()).addFiling(context.userId, { ...data, filingDate: data.filingDate || null }));

export const removeRegulatoryFilingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid, id: uuid }).parse)
  .handler(async ({ data, context }) => (await x()).removeFiling(context.userId, data));
