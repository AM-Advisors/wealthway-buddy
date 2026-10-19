import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/lib/require-auth';
const s = () => import('./person-merge.server');
export const listDuplicateFlagsFn = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => (await s()).listDuplicateFlags(context.userId));
export const decideDuplicateFlagFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), action: z.enum(['merge', 'dismiss']), keepPersonId: z.string().uuid().optional(), note: z.string().max(500).optional() }).parse(d))
  .handler(async ({ data, context }) => (await s()).decideDuplicateFlag(context.userId, data));
export const sweepDuplicatesFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const m = await s(); await m.listDuplicateFlags(context.userId); // staff check
  return m.sweepDuplicates(context.userId);
});
