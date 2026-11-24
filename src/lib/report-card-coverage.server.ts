/**
 * Server-only: which funds and clients a signed-in client user can see Report Cards for.
 * Fund managers see a fund when it has the fund add-on or its client has the whole-client
 * (standalone) service; client members see their client's own cards only with the standalone
 * service. Harmonious staff are never limited by this.
 */
import { REPORT_CARDS_SERVICE_KEY, reportCardsCoverage, type Coverage, type ServiceRow } from './report-card-insights-model';

function checked<T>(r: { data: T; error: any }): T { if (r.error) throw new Error('Report Cards access could not be checked.'); return r.data; }

export type CoverageView = {
  funds: { id: string; label: string; clientId: string | null; via: Coverage }[];
  clients: { id: string; label: string; via: Coverage }[];
};

export async function myReportCardCoverage(db: any, userId: string, today = new Date().toISOString().slice(0, 10)): Promise<CoverageView> {
  const { exactManagerFundIds } = await import('@/lib/fund-access.server');
  const [fundIds, cu] = await Promise.all([
    exactManagerFundIds(db, userId).catch(() => checked<string[]>({ data: [], error: true })),
    db.from('client_users').select('client_id').eq('user_id', userId).is('revoked_at', null),
  ]);
  const memberClientIds = [...new Set((checked<any[]>(cu) ?? []).map((r) => r.client_id).filter(Boolean))] as string[];
  const funds = fundIds.length ? checked<any[]>(await db.from('offerings').select('id,name,client_id').in('id', fundIds)) ?? [] : [];
  const clientIds = [...new Set([...memberClientIds, ...funds.map((f) => f.client_id).filter(Boolean)])] as string[];
  const [cs, es] = clientIds.length ? await Promise.all([
    db.from('clients').select('id,name').in('id', memberClientIds.length ? memberClientIds : ['00000000-0000-0000-0000-000000000000']),
    db.from('service_entitlements').select('client_id,offering_id,service_key,status,effective_date,termination_date').eq('service_key', REPORT_CARDS_SERVICE_KEY).in('client_id', clientIds),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  const rows = (checked<any[]>(es) ?? []) as ServiceRow[];
  return {
    funds: funds.map((f) => ({ id: f.id, label: f.name ?? 'Fund', clientId: f.client_id ?? null, via: reportCardsCoverage(rows, { clientId: f.client_id ?? null, offeringId: f.id }, today) })),
    clients: (checked<any[]>(cs) ?? []).map((c) => ({ id: c.id, label: c.name ?? 'Client', via: reportCardsCoverage(rows, { clientId: c.id, offeringId: null }, today) })),
  };
}

/** Coverage for one subject (fund or client), for any viewer. */
export async function subjectCoverage(db: any, subject: { type: string; id: string }, today = new Date().toISOString().slice(0, 10)): Promise<{ clientId: string | null; via: Coverage }> {
  let clientId: string | null = null, offeringId: string | null = null;
  if (subject.type === 'fund') { const f = checked<any>(await db.from('offerings').select('id,client_id').eq('id', subject.id).maybeSingle()); clientId = f?.client_id ?? null; offeringId = subject.id; }
  else if (subject.type === 'client') clientId = subject.id;
  else return { clientId: null, via: null };
  if (!clientId) return { clientId: null, via: null };
  const rows = (checked<any[]>(await db.from('service_entitlements').select('client_id,offering_id,service_key,status,effective_date,termination_date').eq('service_key', REPORT_CARDS_SERVICE_KEY).eq('client_id', clientId)) ?? []) as ServiceRow[];
  return { clientId, via: reportCardsCoverage(rows, { clientId, offeringId }, today) };
}
