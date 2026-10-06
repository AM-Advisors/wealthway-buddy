import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const srv = () => import("@/lib/prior-subscription.server");

export const getFundLaunchFlow = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ offeringId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).launchFlow(context.userId, data.offeringId));

export const recordPriorSubscription = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    offeringId: z.string().uuid(), onboardingId: z.string().uuid(),
    commitmentCents: z.number().int().positive().max(1e14), fundedCents: z.number().int().min(0).max(1e14),
    signedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), evidenceItemIds: z.array(z.string().uuid()).max(20), reason: z.string().max(500).nullish(),
  }).parse(d))
  .handler(async ({ data, context }) => (await srv()).recordPrior(context.userId, data));

export const decidePriorSubscription = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ offeringId: z.string().uuid(), priorId: z.string().uuid(), confirm: z.boolean(), note: z.string().max(500).nullish() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).decidePrior(context.userId, data));

export const sendFundLaunchInvites = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ offeringId: z.string().uuid(), onboardingIds: z.array(z.string().uuid()).min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => (await srv()).sendInvites(context.userId, data));
