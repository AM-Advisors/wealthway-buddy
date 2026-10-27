import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
import { SETUP_STEPS } from "@/lib/fund-setup-waiting";

const eng = () => import("@/lib/fund-setup-guided.server");
const uuid = z.string().uuid();

export const guidedSetupFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ offeringId: uuid }).parse)
  .handler(async ({ data, context }) => (await eng()).guidedState(context.userId, data.offeringId));

export const staffSaveSetupFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ offeringId: uuid, section: z.enum(["fund_details", "fees_team"]), payload: z.record(z.string().max(40), z.string().max(500)).refine((r) => Object.keys(r).length <= 30) }).parse)
  .handler(async ({ data, context }) => (await eng()).staffSave(context.supabase, context.userId, data));

export const proposeDefaultsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ offeringId: uuid }).parse)
  .handler(async ({ data, context }) => (await eng()).proposeDefaults(context.userId, data.offeringId));

export const decideProposalsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ offeringId: uuid, ids: z.array(uuid).min(1).max(50), decision: z.enum(["accepted", "skipped"]) }).parse)
  .handler(async ({ data, context }) => (await eng()).decideProposals(context.supabase, context.userId, data));

export const remindSetupFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ offeringId: uuid, step: z.enum(SETUP_STEPS) }).parse)
  .handler(async ({ data, context }) => (await eng()).remind(context.userId, data));

export const fillFromDriveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ offeringId: uuid }).parse)
  .handler(async ({ data, context }) => (await eng()).fillFromDrive(context.userId, data.offeringId));
