import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const x = () => import("@/lib/tax-phase4.server");
const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const list1065sFn = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid.optional() }).parse)
  .handler(async ({ data, context }) => (await x()).list1065s(context.userId, data));

export const get1065DetailFn = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ returnId: uuid }).parse)
  .handler(async ({ data, context }) => (await x()).get1065Detail(context.userId, data.returnId));

export const save1065DetailFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    returnId: uuid, values: z.record(z.string(), z.number().int().min(-1e15).max(1e15)), answers: z.record(z.string(), z.string().max(300)),
    stage: z.enum(["draft", "ready_for_review", "reviewed", "returned"]), note: z.string().max(1000).nullish(),
  }).parse)
  .handler(async ({ data, context }) => (await x()).save1065Detail(context.userId, data));

export const k1HistoryFn = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid, taxYear: z.number().int().optional() }).parse)
  .handler(async ({ data, context }) => (await x()).k1History(context.userId, data));

export const listFormPfFn = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await x()).listFormPf(context.userId));

export const createFormPfFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ adviserName: z.string().min(1).max(200), periodType: z.enum(["annual", "quarterly"]), periodEnd: date }).parse)
  .handler(async ({ data, context }) => (await x()).createFormPf(context.userId, data));

export const saveFormPfFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    filingId: uuid, status: z.enum(["draft", "ready_for_review", "reviewed", "filed_by_adviser"]),
    crd: z.string().max(40).nullish(), sec: z.string().max(40).nullish(), size: z.enum(["smaller", "large_hedge", "large_liquidity", "large_private_equity"]),
    dueDate: date.nullish(), offeringIds: z.array(uuid).max(200), sections: z.array(z.string().max(40)).max(20),
    aumCents: z.number().int().min(0).nullish(), filedOn: date.nullish(), confirmation: z.string().max(120).nullish(), note: z.string().max(1000).nullish(),
  }).parse)
  .handler(async ({ data, context }) => (await x()).saveFormPfVersion(context.userId, data));

export const listIrsFn = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid.optional() }).parse)
  .handler(async ({ data, context }) => (await x()).listIrs(context.userId, data));

export const recordIrsFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    offeringId: uuid, direction: z.enum(["received", "sent", "phone_call"]), noticeCode: z.string().max(60).nullish(), subject: z.string().min(1).max(300),
    taxYear: z.number().int().min(1990).max(2100).nullish(), formType: z.string().max(20).nullish(), receivedOn: date, responseDue: date.nullish(),
    path: z.string().max(500).nullish(), shareWithManager: z.boolean(), note: z.string().max(1000).nullish(),
  }).parse)
  .handler(async ({ data, context }) => (await x()).recordIrs(context.userId, data));

export const updateIrsStatusFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: uuid, status: z.enum(["open", "responded", "closed"]), note: z.string().max(1000), path: z.string().max(500).nullish() }).parse)
  .handler(async ({ data, context }) => (await x()).updateIrsStatus(context.userId, data));
