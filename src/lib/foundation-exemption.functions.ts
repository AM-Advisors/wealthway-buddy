import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
import { EXEMPTION_STAGES, EZ_KEYS, IRS_LETTER_KINDS, LETTER_STATUSES } from "@/lib/foundation-exemption-model";

const S = () => import("@/lib/foundation-exemption.server");
const id = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const keys = <T extends Record<string, string>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];
const stage = z.enum(keys(EXEMPTION_STAGES));
const letterStatus = z.enum(keys(LETTER_STATUSES));
const ez = z.object(Object.fromEntries(EZ_KEYS.map((k) => [k, z.boolean().optional()])) as Record<(typeof EZ_KEYS)[number], z.ZodOptional<z.ZodBoolean>>).strict();

export const getExemptionWorkspace = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ profileId: id }).parse(d))
  .handler(async ({ data, context }) => (await S()).getExemptionWorkspace(context.userId, data.profileId));

export const startExemptionApplication = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ profileId: id }).parse(d))
  .handler(async ({ data, context }) => (await S()).startExemptionApplication(context.userId, data.profileId));

export const saveExemptionDetails = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({
    applicationId: id, expectedStage: stage, form: z.enum(["1023", "1023_ez"]).nullish(), ezScreen: ez.optional(),
    projectionsDocumentId: id.nullish(), draftDocumentId: id.nullish(), boardApprovedOn: day.nullish(), boardApproverPersonId: id.nullish(),
    boardEvidenceDocumentId: id.nullish(), boardNote: z.string().max(2000).nullish(),
  }).parse(d))
  .handler(async ({ data, context }) => (await S()).saveExemptionDetails(context.userId, data));

export const advanceExemption = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({
    applicationId: id, expectedStage: stage, to: stage,
    input: z.object({
      submittedOn: day.nullish(), submittedByPersonId: id.nullish(), confirmationRef: z.string().max(120).nullish(),
      outcome: z.enum(["approved", "denied", "withdrawn"]).nullish(), determinationDocumentId: id.nullish(), determinationLetterOn: day.nullish(),
      exemptionEffectiveOn: day.nullish(), note: z.string().max(2000).nullish(),
    }).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => (await S()).advanceExemption(context.userId, data));

export const addIrsLetter = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ applicationId: id, kind: z.enum(keys(IRS_LETTER_KINDS)), receivedOn: day, summary: z.string().trim().min(3).max(2000), letterDocumentId: id.nullish(), responseDueOn: day.nullish() }).parse(d))
  .handler(async ({ data, context }) => (await S()).addIrsLetter(context.userId, data));

export const advanceIrsLetter = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({
    letterId: id, expectedStatus: letterStatus, to: letterStatus,
    input: z.object({ responseDocumentId: id.nullish(), approverPersonId: id.nullish(), approvedOn: day.nullish(), respondedOn: day.nullish(), sentByPersonId: id.nullish(), reason: z.string().max(1000).nullish() }).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => (await S()).advanceIrsLetter(context.userId, data));
