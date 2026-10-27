import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const S = () => import("@/lib/fund-migration-registry.server");
const key = z.string().min(1).max(120);

export const getFundMigrationRegistry = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await S()).registry(context.userId));

export const getFundMigrationHistory = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ key }).parse(d))
  .handler(async ({ context, data }) => (await S()).history(context.userId, data.key));

export const recordFundMigrationDecision = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({
    key,
    decision: z.enum(["approve_match", "reject_match", "confirm_duplicate", "not_duplicate", "confirm_archived", "set_parent", "not_a_fund", "queue_for_import", "needs_review"]),
    reason: z.string().trim().min(3).max(1000),
    parentKey: key.nullable().optional(),
  }).parse(d))
  .handler(async ({ context, data }) => (await S()).decide(context.userId, data));
