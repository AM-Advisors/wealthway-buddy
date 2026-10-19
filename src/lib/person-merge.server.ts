import { planEmailGroup, type MergePerson } from './person-merge-model';
const database = async () => (await import('@/integrations/supabase/client.server')).supabaseAdmin as any;
const COLS = 'id,email,legal_first_name,legal_last_name,date_of_birth,user_id,created_at,merged_into_person_id';

async function requireStaff(db: any, userId: string) {
  const { data } = await db.from('user_roles').select('role').eq('user_id', userId).eq('role', 'admin').maybeSingle();
  if (!data) throw new Error('Forbidden: Harmonious staff only.');
}

/** Merge exact duplicates for one email (or all emails); flag the rest. Idempotent. */
export async function sweepDuplicates(actorUserId: string | null, email?: string | null) {
  const db = await database();
  let q = db.from('persons').select(COLS).not('email', 'is', null).is('merged_into_person_id', null).limit(5000);
  if (email) q = q.ilike('email', email.trim());
  const { data, error } = await q; if (error) throw new Error('People could not be loaded.');
  const groups = new Map<string, MergePerson[]>();
  for (const p of (data ?? []) as MergePerson[]) { const k = String(p.email).trim().toLowerCase(); groups.set(k, [...(groups.get(k) ?? []), p]); }
  let merged = 0, flagged = 0;
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const { merges, flags } = planEmailGroup(g);
    const gone = new Set<string>();
    for (const [keep, drop] of merges) {
      if (gone.has(keep) || gone.has(drop)) continue;
      const r = await db.rpc('merge_persons', { _keep: keep, _drop: drop, _actor: actorUserId, _rule: 'exact_email_name_dob' });
      if (!r.error) { merged++; gone.add(drop); }
    }
    for (const [a, b] of flags) {
      if (gone.has(a) || gone.has(b)) continue;
      const r = await db.from('person_duplicate_flags').upsert({ person_a: a, person_b: b, reason: 'Same email, different name' }, { onConflict: 'person_a,person_b', ignoreDuplicates: true });
      if (!r.error) flagged++;
    }
  }
  return { merged, flagged };
}

export async function listDuplicateFlags(userId: string) {
  const db = await database(); await requireStaff(db, userId);
  const { data: flags } = await db.from('person_duplicate_flags').select('*').eq('status', 'open').order('created_at', { ascending: false }).limit(200);
  const ids = [...new Set(((flags ?? []) as any[]).flatMap((f) => [f.person_a, f.person_b]))];
  const { data: people } = ids.length ? await db.from('persons').select('id,email,legal_first_name,legal_last_name,user_id,created_at').in('id', ids) : { data: [] };
  const counts = new Map<string, number>();
  if (ids.length) { const { data: obs } = await db.from('investor_onboardings').select('person_id').in('person_id', ids); for (const o of (obs ?? []) as any[]) counts.set(o.person_id, (counts.get(o.person_id) ?? 0) + 1); }
  const view = (id: string) => { const p = ((people ?? []) as any[]).find((x) => x.id === id); return p ? { id, name: [p.legal_first_name, p.legal_last_name].filter(Boolean).join(' ') || 'Unnamed', email: p.email, hasAccount: Boolean(p.user_id), investments: counts.get(id) ?? 0, createdAt: p.created_at } : { id, name: 'Unknown', email: null, hasAccount: false, investments: 0, createdAt: null }; };
  return ((flags ?? []) as any[]).map((f) => ({ id: f.id, reason: f.reason, a: view(f.person_a), b: view(f.person_b) }));
}

export async function decideDuplicateFlag(userId: string, input: { id: string; action: 'merge' | 'dismiss'; keepPersonId?: string | undefined; note?: string | undefined }) {
  const db = await database(); await requireStaff(db, userId);
  const { data: f } = await db.from('person_duplicate_flags').select('*').eq('id', input.id).eq('status', 'open').maybeSingle();
  if (!f) throw new Error('This match was already resolved.');
  if (input.action === 'dismiss') {
    await db.from('person_duplicate_flags').update({ status: 'dismissed', decided_by: userId, decided_at: new Date().toISOString(), decision_note: input.note ?? null }).eq('id', f.id);
    return { ok: true };
  }
  const keep = input.keepPersonId === f.person_b ? f.person_b : f.person_a;
  const drop = keep === f.person_a ? f.person_b : f.person_a;
  const r = await db.rpc('merge_persons', { _keep: keep, _drop: drop, _actor: userId, _rule: `staff_confirmed${input.note ? `: ${input.note.slice(0, 200)}` : ''}` });
  if (r.error) throw new Error(r.error.message);
  return { ok: true };
}
