import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/lib/require-auth';
import { WEALTH_ASSET_CLASSES, currentWealthHoldings, type WealthObservation } from '@/lib/wealth-services';
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const getWealthServices = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const [selections, holdings, funds] = await Promise.all([
    context.supabase.from('wealth_service_selections').select('*').eq('owner_user_id', context.userId).order('created_at', { ascending: false }),
    context.supabase.from('personal_wealth_observations').select('*').eq('owner_user_id', context.userId).order('created_at', { ascending: false }),
    context.supabase.from('fund_managers').select('offering_id,offerings(name)').eq('user_id', context.userId),
  ]);
  if (selections.error || holdings.error || funds.error) throw new Error('Your wealth records could not be loaded. Please try again.');
  const history = (holdings.data ?? []) as WealthObservation[];
  return { selections: selections.data ?? [], history, holdings: currentWealthHoldings(history, context.userId, new Date().toISOString().slice(0,10)), funds: (funds.data ?? []).map(f => ({ id: f.offering_id, name: f.offerings?.name ?? 'Fund' })) };
});
export const selectWealthServices = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offeringId: z.string().uuid().nullable(), services: z.array(z.enum(['portfolio','report_cards'])).max(2) }).parse(d))
  .handler(async ({ context, data }) => {
    if (data.offeringId) {
      const r = await context.supabase.from('fund_managers').select('id').eq('offering_id', data.offeringId).eq('user_id', context.userId).limit(1);
      if (r.error || !r.data?.length) throw new Error('Only an assigned manager may select services for this fund.');
    }
    const r = await context.supabase.from('wealth_service_selections').insert({ owner_user_id: context.userId, offering_id: data.offeringId, services: [...new Set(data.services)] });
    if (r.error) throw new Error('Your service selection could not be saved.');
    return { ok: true };
  });
export const saveWealthHolding = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ priorId: z.string().uuid().optional(), name: z.string().trim().min(1).max(160), assetClass: z.enum(WEALTH_ASSET_CLASSES), currency: z.string().regex(/^[A-Z]{3}$/), costCents: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(), valueCents: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(), asOf: date, sourceNote: z.string().trim().min(3).max(1000), archived: z.boolean().default(false) }).parse(d))
  .handler(async ({ context, data }) => {
    let holdingId = crypto.randomUUID();
    if (data.priorId) {
      const prior = await context.supabase.from('personal_wealth_observations').select('holding_id,owner_user_id').eq('id', data.priorId).eq('owner_user_id', context.userId).maybeSingle();
      if (prior.error || !prior.data || prior.data.owner_user_id !== context.userId) throw new Error('Holding not found.');
      holdingId = prior.data.holding_id;
    }
    const r = await context.supabase.from('personal_wealth_observations').insert({ owner_user_id: context.userId, holding_id: holdingId, supersedes_id: data.priorId ?? null, name: data.name, asset_class: data.assetClass, currency: data.currency, cost_cents: data.costCents, value_cents: data.valueCents, as_of: data.asOf, source_note: data.sourceNote, archived: data.archived });
    if (r.error) throw new Error('The holding could not be saved. Refresh before recording another correction.');
    return { ok: true };
  });