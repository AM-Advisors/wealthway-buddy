import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const S = () => import("@/lib/financial-pilot.server");
const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const fn = () => createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]);

export const listPilotCandidatesFn = fn().handler(async ({ context }) => (await S()).listPilotCandidates(context.userId));

export const candidateFactorSuggestionFn = fn()
  .inputValidator((d: unknown) => z.object({ offeringId: uuid }).parse(d))
  .handler(async ({ data, context }) => (await S()).candidateFactorSuggestion(context.userId, data.offeringId));

const lvl = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
const factors = z.object({
  investorCount: z.number().int().min(0), entityComplexity: lvl, investmentCount: z.number().int().min(0),
  monthlyTransactions: z.number().int().min(0), bankAccountCount: z.number().int().min(0), sideLetters: z.number().int().min(0),
  waterfallTiers: z.number().int().min(0), internationalInvestors: z.number().int().min(0), taxComplexity: lvl,
  historicalCompleteness: lvl, dataQuality: lvl, outstandingExceptions: z.number().int().min(0),
  multiCurrency: z.boolean(), hasFeederBlockerOrParallel: z.boolean(), unusualTaxAllocation: z.boolean(), nextCloseIsQuarterOrYearEnd: z.boolean(),
});
export const recordCandidateScoreFn = fn()
  .inputValidator((d: unknown) => z.object({ offeringId: uuid, factors, note: z.string().max(1000).nullable().optional() }).parse(d))
  .handler(async ({ data, context }) => (await S()).recordCandidateScore(context.userId, data));

export const startPilotEvaluationFn = fn()
  .inputValidator((d: unknown) => z.object({ offeringId: uuid }).parse(d))
  .handler(async ({ data, context }) => (await S()).startPilotEvaluation(context.userId, data.offeringId));

export const pilotReadinessFn = fn()
  .inputValidator((d: unknown) => z.object({ offeringId: uuid }).parse(d))
  .handler(async ({ data, context }) => (await S()).pilotReadiness(context.userId, data.offeringId));

export const transitionPilotFn = fn()
  .inputValidator((d: unknown) => z.object({
    pilotId: uuid,
    to: z.enum(["selected", "opening_data", "parallel_active", "parallel_closed", "parallel_passed", "withdrawn"]),
    reason: z.string().trim().min(5).max(1000),
    periodLabel: z.string().max(20).nullable().optional(), periodStart: date.nullable().optional(), periodEnd: date.nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => (await S()).transitionPilot(context.userId, data));

export const assignPilotStaffFn = fn()
  .inputValidator((d: unknown) => z.object({ pilotId: uuid, role: z.string(), assigneeId: uuid }).parse(d))
  .handler(async ({ data, context }) => (await S()).assignPilotStaff(context.userId, data as any));

export const addOpeningBalanceFn = fn()
  .inputValidator((d: unknown) => z.object({ pilotId: uuid, category: z.string().max(40), label: z.string().max(200).nullable().optional(), positionId: uuid.nullable().optional(), officialCents: z.number().int(), sourceDocument: z.string().trim().min(3).max(500) }).parse(d))
  .handler(async ({ data, context }) => (await S()).addOpeningBalance(context.userId, data));

export const raiseVarianceFn = fn()
  .inputValidator((d: unknown) => z.object({
    pilotId: uuid, kind: z.enum(["variance", "migration_exception"]), periodLabel: z.string().min(1).max(20), metric: z.string().min(1).max(80),
    positionId: uuid.nullable().optional(), component: z.string().max(80).nullable().optional(),
    officialCents: z.number().int(), harmoniousCents: z.number().int(), source: z.string().trim().min(2).max(500), cause: z.string().max(1000).nullable().optional(), ownerUserId: uuid.nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => (await S()).raiseVariance(context.userId, data));

export const resolveVarianceFn = fn()
  .inputValidator((d: unknown) => z.object({ varianceId: uuid, status: z.enum(["resolved", "accepted"]), classification: z.string().max(40), resolution: z.string().max(2000) }).parse(d))
  .handler(async ({ data, context }) => (await S()).resolveVariance(context.userId, data));

export const setMaterialityFn = fn()
  .inputValidator((d: unknown) => z.object({ pilotId: uuid, metric: z.string().min(1).max(80), toleranceCents: z.number().int().min(0) }).parse(d))
  .handler(async ({ data, context }) => (await S()).setMateriality(context.userId, data));

export const signOffPilotFn = fn()
  .inputValidator((d: unknown) => z.object({ pilotId: uuid, role: z.enum(["accounting_lead", "operations_admin", "finance_controller", "leadership"]), confirmations: z.record(z.string(), z.boolean()), note: z.string().max(1000).nullable().optional() }).parse(d))
  .handler(async ({ data, context }) => (await S()).signOffPilot(context.userId, data));

export const decidePilotFn = fn()
  .inputValidator((d: unknown) => z.object({ pilotId: uuid, decision: z.enum(["continue_parallel", "approve_production_cutover", "requires_remediation"]), reason: z.string().max(2000) }).parse(d))
  .handler(async ({ data, context }) => (await S()).decidePilot(context.userId, data));
