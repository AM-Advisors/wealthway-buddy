import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const srv = () => import("@/lib/fund-drive-intake.server");
const fileId = z.string().regex(/^[\w-]{10,120}$/);

export const scanFundDriveFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(z.object({ fundId: z.string().uuid(), folderLink: z.string().max(500).nullish() }).parse)
  .handler(async ({ data, context }) => (await srv()).scanFundDrive(context.userId, data.fundId, data.folderLink));

export const setFundDriveDecisionFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(z.object({ fundId: z.string().uuid(), fileId, fileName: z.string().min(1).max(500), decision: z.enum(["later", "rejected"]), onboardingId: z.string().uuid().nullish(), target: z.string().max(60).nullish() }).parse)
  .handler(async ({ data, context }) => (await srv()).setIntakeDecision(context.userId, data));

export const approveFundDriveFileFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(z.object({ fundId: z.string().uuid(), fileId, onboardingId: z.string().uuid(), target: z.string().min(1).max(60), signedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), title: z.string().max(200) }).parse)
  .handler(async ({ data, context }) => (await srv()).approveIntakeFile(context.userId, data));

export const fundDriveFileLinkFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(z.object({ fileId }).parse)
  .handler(async ({ data, context }) => (await srv()).intakeFileLink(context.userId, data.fileId));

export const addFundDriveInvestorFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(z.object({
    fundId: z.string().uuid(), folderName: z.string().max(500), confirmedNew: z.boolean(),
    draft: z.object({ type: z.enum(["individual", "entity", "trust"]), firstName: z.string().max(80), lastName: z.string().max(80), legalName: z.string().max(200), email: z.string().max(254) }),
  }).parse)
  .handler(async ({ data, context }) => (await srv()).addIntakeInvestor(context.userId, data));

export const readFundDriveFileFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(z.object({ fundId: z.string().uuid(), fileId }).parse)
  .handler(async ({ data, context }) => (await srv()).readIntakeFile(context.userId, data));

export const fillFundDriveProfileFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(z.object({ fundId: z.string().uuid(), onboardingId: z.string().uuid(), folderName: z.string().max(500), investors: z.array(z.record(z.string(), z.unknown())).max(50) }).parse)
  .handler(async ({ data, context }) => (await srv()).fillProfileFromIntake(context.userId, data));
