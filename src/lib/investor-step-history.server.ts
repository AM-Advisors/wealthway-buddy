import { onboardingActor } from './investor-onboarding.server';
import { canReadFundHistory, normaliseSteps, type RawStep } from './investor-step-history-model';
const database = async () => (await import('@/integrations/supabase/client.server')).supabaseAdmin as any;
const ok = <T,>(r: { data: T; error: any }) => { if (r.error) throw new Error('History could not be loaded.'); return r.data; };

/** Read-only investor step history for one fund (optionally one investor). */
export async function investorStepHistory(userId: string, offeringId: string, onboardingId?: string) {
  const actor = await onboardingActor(userId);
  if (!canReadFundHistory(actor, offeringId)) throw new Error('Forbidden: you do not manage that fund.');
  const db = await database();
  let obq = db.from('investor_onboardings').select('id,investor_user_id,investment_profile_id').eq('offering_id', offeringId);
  if (onboardingId) obq = obq.eq('id', onboardingId);
  let obs = ok<any[]>(await obq.limit(1000)) ?? [];
  if (onboardingId && !obs.length) throw new Error('Investor not found in this fund.');
  const pids = [...new Set(obs.map((o) => o.investment_profile_id).filter(Boolean))];
  const profs = pids.length ? ok<any[]>(await db.from('investment_profiles').select('id,legal_name').in('id', pids)) ?? [] : [];
  const profName = (id: string | null) => profs.find((p) => p.id === id)?.legal_name ?? null;
  const ids = obs.map((o) => o.id);
  if (!ids.length) return { entries: [], investors: [] };
  const profileIds = [...new Set(obs.map((o) => o.investment_profile_id).filter(Boolean))];
  const [ev, ch, pe] = await Promise.all([
    db.from('investor_onboarding_events').select('id,onboarding_id,event,actor_user_id,actor_role,created_at,from_status,to_status').in('onboarding_id', ids).order('created_at', { ascending: false }).limit(2000),
    (() => { let q = db.from('investor_record_changes').select('id,onboarding_id,field,old_value,new_value,actor_user_id,manager_visible,created_at').in('onboarding_id', ids).limit(2000); if (!actor.isStaff) q = q.neq('manager_visible', false); return q; })(),
    profileIds.length ? db.from('investment_profile_events').select('id,profile_id,event,actor_id,created_at').in('profile_id', profileIds).limit(2000) : Promise.resolve({ data: [], error: null }),
  ]);
  const raw: RawStep[] = [
    ...(ok<any[]>(ev) ?? []).map((e) => ({ id: `ev-${e.id}`, at: e.created_at, onboardingId: e.onboarding_id, kind: 'step' as const, event: e.event, actorId: e.actor_user_id, actorRole: e.actor_role, before: e.from_status, after: e.to_status })),
    ...(ok<any[]>(ch) ?? []).map((e) => ({ id: `ch-${e.id}`, at: e.created_at, onboardingId: e.onboarding_id, kind: 'change' as const, event: e.field ?? 'field', actorId: e.actor_user_id, before: e.old_value, after: e.new_value })),
    ...(ok<any[]>(pe) ?? []).flatMap((e) => obs.filter((o) => o.investment_profile_id === e.profile_id).map((o) => ({ id: `pe-${e.id}-${o.id}`, at: e.created_at, onboardingId: o.id, kind: 'profile' as const, event: `profile_${e.event}`, actorId: e.actor_id }))),
  ];
  const actorIds = [...new Set(raw.map((r) => r.actorId).filter(Boolean))] as string[];
  const [roles, people] = actorIds.length ? await Promise.all([
    db.from('user_roles').select('user_id,role').in('user_id', actorIds).eq('role', 'admin'),
    db.from('profiles').select('user_id,legal_name,email').in('user_id', actorIds),
  ]) : [{ data: [] }, { data: [] }];
  const names = new Map<string, string>(((people as any).data ?? []).map((p: any) => [p.user_id, p.legal_name || p.email]));
  const entries = normaliseSteps(raw, { viewerIsStaff: actor.isStaff, staffIds: new Set(((roles as any).data ?? []).map((r: any) => r.user_id)), investorIds: new Set(obs.map((o) => o.investor_user_id).filter(Boolean)), names });
  return { entries, investors: obs.map((o) => ({ id: o.id, name: profName(o.investment_profile_id) || 'Investor' })) };
}
