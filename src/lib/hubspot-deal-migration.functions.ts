import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
import { DEAL_STAGES } from "@/lib/crm-model";

const srv = () => import("@/lib/hubspot-deal-migration.server");

export const getDealMigrationStatus = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await srv()).migrationStatus(context.userId));

export const startDealMigrationRun = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ kind: z.enum(["initial", "incremental"]) }).parse(d))
  .handler(async ({ data, context }) => (await srv()).startRun(context.userId, data.kind));

export const runDealMigrationBatch = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ runId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).runBatch(context.userId, data.runId));

export const stopDealMigrationRun = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ runId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).stopRun(context.userId, data.runId));

export const setDealStageMapping = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ pipelineId: z.string().max(80), stageId: z.string().max(80), stage: z.enum(DEAL_STAGES) }).parse(d))
  .handler(async ({ data, context }) => (await srv()).setStageMapping(context.userId, data));

export const reconcileDealMigration = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await srv()).reconcile(context.userId));
