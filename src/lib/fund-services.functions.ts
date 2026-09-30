import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const x = () => import("@/lib/fund-services.server");
const uuid = z.string().uuid();
const kind = z.enum(["formation", "ein", "boi"]);

export const getFundServicesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid }).parse)
  .handler(async ({ data, context }) => (await x()).getServices(context.userId, data.offeringId));

export const saveFundServiceFieldsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid, kind, fields: z.record(z.string(), z.string().max(1000)) }).parse)
  .handler(async ({ data, context }) => (await x()).saveServiceFields(context.userId, data));

export const moveFundServiceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    offeringId: uuid, kind,
    to: z.enum(["not_started", "preparing", "ready_for_review", "reviewed", "submitted", "completed", "rejected", "exempt"]),
    note: z.string().max(1000).nullish(),
  }).parse)
  .handler(async ({ data, context }) => (await x()).moveService(context.userId, data));

export const addBoiPartyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid, personId: uuid, role: z.enum(["beneficial_owner", "company_applicant"]) }).parse)
  .handler(async ({ data, context }) => (await x()).addBoiParty(context.userId, data));

export const updateBoiPartyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid, id: uuid, idProvided: z.boolean().optional(), remove: z.boolean().optional() }).parse)
  .handler(async ({ data, context }) => (await x()).updateBoiParty(context.userId, data));
