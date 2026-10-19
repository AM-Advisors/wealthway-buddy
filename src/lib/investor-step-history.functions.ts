import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/lib/require-auth';
export const getInvestorStepHistory = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offeringId: z.string().uuid(), onboardingId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => (await import('./investor-step-history.server')).investorStepHistory(context.userId, data.offeringId, data.onboardingId));
