import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const x = () => import("@/lib/fund-formation.server");
const uuid = z.string().uuid();
const money = z.number().min(0).max(10_000_000);

export const getFormationRecordFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid }).parse)
  .handler(async ({ data, context }) => (await x()).getFormationRecord(context.userId, data.offeringId));

export const recordFormationAuthorizationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid, personId: uuid, authorizedOn: z.string(), method: z.enum(["written", "e_signature", "email"]), authorizationText: z.string().max(4000), registeredAgentChoice: z.string().max(200).nullish() }).parse)
  .handler(async ({ data, context }) => (await x()).recordAuthorization(context.userId, data));

export const addFormationDocumentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid, docType: z.string().max(60), path: z.string().max(500), title: z.string().max(200).nullish() }).parse)
  .handler(async ({ data, context }) => (await x()).addFormationDocument(context.userId, data));

export const setFormationProviderFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid, providerId: uuid.nullable(), bundleId: uuid.nullable() }).parse)
  .handler(async ({ data, context }) => (await x()).setProviderBundle(context.userId, data));

export const recordFormationCostFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid, priceId: uuid.nullish(), stateFees: money, providerCost: money, customerTotal: money, note: z.string().max(500).nullish() }).parse)
  .handler(async ({ data, context }) => (await x()).recordCost(context.userId, data));

export const openFormationDiscrepancyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid, field: z.string().max(200), ours: z.string().max(500).nullish(), provider: z.string().max(500).nullish() }).parse)
  .handler(async ({ data, context }) => (await x()).openDiscrepancy(context.userId, data));

export const resolveFormationDiscrepancyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid, id: uuid, resolution: z.enum(["kept_ours", "accepted_provider", "other"]), note: z.string().max(1000) }).parse)
  .handler(async ({ data, context }) => (await x()).resolveDiscrepancy(context.userId, data));

export const listFormationReferenceFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await x()).listReference(context.userId));

export const saveFormationProviderFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: uuid.optional(), name: z.string().min(1).max(200), providerType: z.enum(["formation_and_registered_agent", "formation", "registered_agent"]), active: z.boolean(), notes: z.string().max(1000).nullish() }).parse)
  .handler(async ({ data, context }) => (await x()).saveProvider(context.userId, data));

export const addFormationPriceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ providerId: uuid.nullish(), jurisdiction: z.string().min(2).max(40), entityType: z.string().max(40).nullish(), stateFee: money, expediteFee: money, providerFee: money, verified: z.boolean() }).parse)
  .handler(async ({ data, context }) => (await x()).addPrice(context.userId, data));

export const saveFormationBundleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: uuid.optional(), name: z.string().min(1).max(200), description: z.string().max(1000).nullish(), servicePackageKey: z.string().max(80).nullish(), ra: z.boolean(), ein: z.boolean(), oa: z.boolean(), expedite: z.boolean(), active: z.boolean() }).parse)
  .handler(async ({ data, context }) => (await x()).saveBundle(context.userId, data));
