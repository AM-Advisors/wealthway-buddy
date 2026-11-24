/**
 * Server-only Report Cards additions: service coverage overview, alerts, downloads with
 * permanent history, side-by-side data, the investor progress funnel and access requests.
 * Every read reuses cardWorkspace's existing visibility rules; nothing here grants staff
 * authority, changes a card, files, emails or moves money.
 */
import { cardWorkspace, manager, staff } from './portfolio-report-cards.server';
import { subjectCoverage, myReportCardCoverage } from './report-card-coverage.server';
import {
  REPORT_CARDS_SERVICE_KEY, accessDecisionError, accessRequestRefusal, accessState, figureChecks, funnelSteps,
  gradeChangeAlerts, previousPublished, type AccessDecision, type CardLite, type ExportCard,
} from './report-card-insights-model';
import { assessmentGrade } from './report-card-model';
import { isReconciledFunding } from './funding-status';

const database = async () => (await import('@/integrations/supabase/client.server')).supabaseAdmin as any;
function checked<T>(r: { data: T; error: any }): T { if (r.error) throw new Error('The requested records could not be loaded or saved.'); return r.data; }
const KINDS = ['operational', 'diligence'] as const;

/** Staff: where Report Cards is switched on, plus clients and funds to choose from. */
export async function serviceOverview(userId: string) {
  const db = await database();
  if (!(await staff(db, userId))) throw new Error('Report access required.');
  const [es, cs, fs] = await Promise.all([
    db.from('service_entitlements').select('id,client_id,offering_id,status,effective_date,termination_date,updated_at').eq('service_key', REPORT_CARDS_SERVICE_KEY),
    db.from('clients').select('id,name').order('name').limit(2000),
    db.from('offerings').select('id,name,client_id').not('client_id', 'is', null).order('name').limit(3000),
  ]);
  const clients = checked<any[]>(cs) ?? [], funds = checked<any[]>(fs) ?? [];
  const cName = new Map(clients.map((c) => [c.id, c.name])), fName = new Map(funds.map((f) => [f.id, f.name]));
  const rows = (checked<any[]>(es) ?? []).map((e) => ({
    id: e.id, clientId: e.client_id, clientName: cName.get(e.client_id) ?? 'Client', offeringId: e.offering_id, fundName: e.offering_id ? fName.get(e.offering_id) ?? 'Fund' : null,
    scope: e.offering_id ? 'fund_add_on' : 'standalone', status: e.status, effectiveDate: e.effective_date, terminationDate: e.termination_date,
  })).sort((a, b) => a.clientName.localeCompare(b.clientName));
  return { rows, clients: clients.map((c) => ({ id: c.id, name: c.name ?? 'Client' })), funds: funds.map((f) => ({ id: f.id, name: f.name ?? 'Fund', clientId: f.client_id })) };
}

/** Client users: which of their funds and clients have Report Cards, and which do not. */
export async function myCoverage(userId: string) {
  const db = await database();
  if (await staff(db, userId)) return { staff: true, funds: [], clients: [] };
  const c = await myReportCardCoverage(db, userId);
  return { staff: false, ...c };
}

/** Grade change alerts and figures to check across every card this person can already see. */
export async function cardAlerts(userId: string, client: any) {
  const grade: any[] = [], checks: any[] = [];
  for (const kind of KINDS) {
    const ws: any = await cardWorkspace(userId, kind, undefined, client);
    const cards = ws.cards as CardLite[];
    grade.push(...gradeChangeAlerts(cards).map((a) => ({ ...a, kind })));
    for (const c of cards) {
      if (c.status !== 'draft' && c.status !== 'published') continue;
      const items = figureChecks(c, previousPublished(cards, c));
      if (items.length) checks.push({ cardId: c.id, kind, subjectLabel: c.subjectLabel ?? 'Report card', status: c.status, periodStart: c.period_start, periodEnd: c.period_end, items });
    }
  }
  return { grade: grade.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 50), checks: checks.slice(0, 50) };
}

function project(c: any, withEvidence: boolean): ExportCard {
  return {
    subject: c.subjectLabel ?? 'Report card', kind: c.kind, periodStart: c.period_start, periodEnd: c.period_end, status: c.status,
    grade: c.grade?.grade ?? 'Not assessed', score: c.grade?.score ?? null, coverage: c.grade?.coverage ?? null, summary: c.summary ?? '',
    metrics: (c.metrics ?? []).map((m: any) => ({ label: String(m.label), score: m.score ?? null, weight: Number(m.weight ?? 1), evidence: withEvidence ? String(m.evidence ?? '') : null })),
    risk: c.risk ? { profile: c.risk.profile, score: c.risk.score, actions: c.risk.actions } : null,
  };
}

async function grantedCard(db: any, userId: string, cardId: string) {
  const reqs = checked<any[]>(await db.from('report_card_access_requests').select('id').eq('card_id', cardId).eq('requester_id', userId)) ?? [];
  if (!reqs.length) return null;
  const ds = checked<any[]>(await db.from('report_card_access_decisions').select('request_id,decision,expires_at,created_at').in('request_id', reqs.map((r) => r.id))) ?? [];
  const active = reqs.some((r) => accessState(ds.filter((d) => d.request_id === r.id)) === 'active');
  if (!active) return null;
  const c = checked<any>(await db.from('report_card_versions').select('*').eq('id', cardId).maybeSingle());
  if (!c || c.kind === 'investor') return null;
  const decision = checked<any[]>(await db.from('report_card_decisions').select('decision').eq('card_id', cardId).limit(1))?.[0];
  if (decision?.decision !== 'published') return null;
  const label = c.subject_type === 'fund' ? checked<any>(await db.from('offerings').select('name').eq('id', c.subject_id).maybeSingle())?.name : checked<any>(await db.from('clients').select('name').eq('id', c.subject_id).maybeSingle())?.name;
  const expiresAt = ds.filter((d) => d.decision === 'approved').map((d) => d.expires_at).sort().at(-1) ?? null;
  return { ...c, answers: undefined, author_id: undefined, status: 'published', subjectLabel: label ?? 'Report card', grade: assessmentGrade(c.metrics, c.answers?.configuration?.thresholds), risk: null, expiresAt };
}

/** Cards this person can read (existing rules), or published cards they were granted; others refuse. */
async function readableCards(db: any, userId: string, ids: string[], client: any) {
  const rows = checked<any[]>(await db.from('report_card_versions').select('id,kind,subject_id').in('id', ids)) ?? [];
  if (rows.length !== ids.length) throw new Error('One of these report cards was not found.');
  const out: { card: any; full: boolean }[] = [];
  const groups = new Map<string, any[]>();
  for (const r of rows) groups.set(`${r.kind}|${r.subject_id}`, [...(groups.get(`${r.kind}|${r.subject_id}`) ?? []), r]);
  for (const [, list] of groups) {
    const { kind, subject_id } = list[0];
    let visible: any[] = [];
    try { visible = ((await cardWorkspace(userId, kind, subject_id, client)) as any).cards; } catch { visible = []; }
    for (const r of list) {
      const v = visible.find((c) => c.id === r.id);
      if (v) { out.push({ card: v, full: true }); continue; }
      const g = await grantedCard(db, userId, r.id);
      if (!g) throw new Error("You can't open one of these report cards.");
      out.push({ card: g, full: false });
    }
  }
  return ids.map((id) => out.find((o) => o.card.id === id)!);
}

/** Checks access, records the download permanently, and returns only what this person may see. */
export async function prepareDownload(userId: string, input: { cardIds: string[]; format: 'pdf' | 'csv' | 'xlsx' | 'json'; scope: 'card' | 'list' | 'compare' }, client: any) {
  const db = await database();
  const ids = [...new Set(input.cardIds)];
  const cards = await readableCards(db, userId, ids, client);
  const projected = cards.map((c) => project(c.card, c.full));
  const label = projected.length === 1 ? `${projected[0]!.subject} · ${projected[0]!.periodStart} to ${projected[0]!.periodEnd}` : input.scope === 'compare' ? `Comparison: ${projected.map((p) => p.subject).join(' vs ')}` : `${projected.length} report cards`;
  checked(await db.from('report_card_downloads').insert({ actor_id: userId, card_ids: ids, format: input.format, scope: input.scope, label: label.slice(0, 300) }));
  return { cards: projected, generatedAt: new Date().toISOString() };
}

/** Side-by-side data for two readable cards (no download recorded). */
export async function compareData(userId: string, a: string, b: string, client: any) {
  const db = await database();
  const cards = await readableCards(db, userId, [a, b], client);
  return { a: project(cards[0]!.card, cards[0]!.full), b: project(cards[1]!.card, cards[1]!.full) };
}

/** Staff with report access see everyone's downloads; everyone else sees their own. */
export async function downloadHistory(userId: string) {
  const db = await database();
  const all = await staff(db, userId);
  let q = db.from('report_card_downloads').select('id,actor_id,format,scope,label,card_ids,created_at').order('created_at', { ascending: false }).limit(200);
  if (!all) q = q.eq('actor_id', userId);
  const rows = checked<any[]>(await q) ?? [];
  const actors = [...new Set(rows.map((r) => r.actor_id))];
  const ps = all && actors.length ? checked<any[]>(await db.from('profiles').select('user_id,legal_name,email').in('user_id', actors)) ?? [] : [];
  return { all, rows: rows.map((r) => ({ id: r.id, format: r.format, scope: r.scope, label: r.label, count: (r.card_ids ?? []).length, at: r.created_at, by: all ? (ps.find((p) => p.user_id === r.actor_id)?.legal_name || ps.find((p) => p.user_id === r.actor_id)?.email || 'Team member') : 'You' })) };
}

/** Investor progress on one fund: staff, or that fund's manager when Report Cards is on. */
export async function fundFunnel(userId: string, offeringId: string) {
  const db = await database();
  if (!(await staff(db, userId))) {
    if (!(await manager(db, userId, offeringId))) throw new Error('Only Harmonious staff or this fund’s managers can see its investor progress.');
    if (!(await subjectCoverage(db, { type: 'fund', id: offeringId })).via) throw new Error("Report Cards isn't switched on for this fund.");
  }
  const { fundInviteActivity } = await import('./fund-invite-activity.server');
  const act: any = await fundInviteActivity(userId, offeringId);
  const ids = (act.rows as any[]).map((r) => r.onboardingId);
  const obs = ids.length ? checked<any[]>(await db.from('investor_onboardings').select('id,signature_id,funding_status,merged_into_onboarding_id').in('id', ids)) ?? [] : [];
  const liveIds = new Set(obs.filter((o) => !o.merged_into_onboarding_id).map((o) => o.id));
  const rows = (act.rows as any[]).filter((r) => liveIds.has(r.onboardingId));
  const reached = (levels: string[]) => rows.filter((r) => levels.includes(r.level)).length;
  const live = obs.filter((o) => liveIds.has(o.id));
  return {
    steps: funnelSteps({
      total: rows.length,
      invited: reached(['invited', 'opened', 'started', 'verified']),
      opened: reached(['opened', 'started', 'verified']),
      started: reached(['started', 'verified']),
      verified: reached(['verified']),
      signed: live.filter((o) => o.signature_id).length,
      funded: live.filter((o) => isReconciledFunding(o.funding_status)).length,
    }),
    followUps: act.followUps as number,
  };
}

async function approverFor(db: any, userId: string, card: any) {
  if (await staff(db, userId, 'approve')) return true;
  return card.subject_type === 'fund' && (await manager(db, userId, card.subject_id));
}

/** Published fund and client cards a person is connected to but cannot see yet. Grades stay hidden. */
export async function requestableCards(userId: string, client: any) {
  const db = await database();
  if (await staff(db, userId)) return { rows: [] };
  const [obs, cu] = await Promise.all([
    db.from('investor_onboardings').select('offering_id').eq('investor_user_id', userId).is('removed_at', null),
    db.from('client_users').select('client_id').eq('user_id', userId).is('revoked_at', null),
  ]);
  const clientIds = [...new Set((checked<any[]>(cu) ?? []).map((r) => r.client_id))];
  const clientFunds = clientIds.length ? checked<any[]>(await db.from('offerings').select('id').in('client_id', clientIds)) ?? [] : [];
  const fundIds = [...new Set([...(checked<any[]>(obs) ?? []).map((r) => r.offering_id), ...clientFunds.map((f) => f.id)].filter(Boolean))];
  const subjectIds = [...fundIds, ...clientIds];
  if (!subjectIds.length) return { rows: [] };
  const cards = checked<any[]>(await db.from('report_card_versions').select('id,kind,subject_type,subject_id,period_start,period_end,created_at').eq('kind', 'operational').in('subject_id', subjectIds).order('created_at', { ascending: false }).limit(300)) ?? [];
  if (!cards.length) return { rows: [] };
  const decisions = checked<any[]>(await db.from('report_card_decisions').select('card_id,decision').in('card_id', cards.map((c) => c.id))) ?? [];
  const published = cards.filter((c) => decisions.find((d) => d.card_id === c.id)?.decision === 'published');
  const latest = new Map<string, any>();
  for (const c of published) if (!latest.has(c.subject_id)) latest.set(c.subject_id, c);
  const readable = new Set((((await cardWorkspace(userId, 'operational', undefined, client)) as any).cards as any[]).map((c) => c.id));
  const reqs = checked<any[]>(await db.from('report_card_access_requests').select('id,card_id,created_at').eq('requester_id', userId)) ?? [];
  const ds = reqs.length ? checked<any[]>(await db.from('report_card_access_decisions').select('request_id,decision,expires_at,created_at').in('request_id', reqs.map((r) => r.id))) ?? [] : [];
  const names = new Map<string, string>();
  const fIds = [...latest.values()].filter((c) => c.subject_type === 'fund').map((c) => c.subject_id), cIds = [...latest.values()].filter((c) => c.subject_type === 'client').map((c) => c.subject_id);
  if (fIds.length) for (const f of checked<any[]>(await db.from('offerings').select('id,name').in('id', fIds)) ?? []) names.set(f.id, f.name);
  if (cIds.length) for (const c of checked<any[]>(await db.from('clients').select('id,name').in('id', cIds)) ?? []) names.set(c.id, c.name);
  const rows: any[] = [];
  for (const c of latest.values()) {
    if (readable.has(c.id)) continue;
    if (!(await subjectCoverage(db, { type: c.subject_type, id: c.subject_id })).via) continue;
    const mine = reqs.filter((r) => r.card_id === c.id).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
    const myDs = mine ? ds.filter((d) => d.request_id === mine.id) : [];
    const state = mine ? accessState(myDs as AccessDecision[]) : null;
    rows.push({ cardId: c.id, subjectLabel: names.get(c.subject_id) ?? 'Report card', periodStart: c.period_start, periodEnd: c.period_end, state, expiresAt: state === 'active' ? myDs.filter((d) => d.decision === 'approved').map((d) => d.expires_at).sort().at(-1) : null });
  }
  return { rows };
}

export async function requestAccess(userId: string, cardId: string, reason: string, client: any) {
  const db = await database();
  const { rows } = await requestableCards(userId, client);
  const row = rows.find((r: any) => r.cardId === cardId);
  const c = checked<any>(await db.from('report_card_versions').select('kind,subject_type,subject_id').eq('id', cardId).maybeSingle());
  if (!c) throw new Error('Report card not found.');
  if (!row) throw new Error("You can't ask for this report card.");
  const refusal = accessRequestRefusal({ kind: c.kind, published: true, covered: true, alreadyReadable: false, state: row.state });
  if (refusal) throw new Error(refusal);
  checked(await db.from('report_card_access_requests').insert({ card_id: cardId, requester_id: userId, reason: reason.slice(0, 1000) }));
  return { ok: true };
}

/** Pending and recent requests this person can decide (staff approvers: all; fund managers: their funds). */
export async function accessQueue(userId: string) {
  const db = await database();
  const isApprover = await staff(db, userId, 'approve');
  const reqs = checked<any[]>(await db.from('report_card_access_requests').select('id,card_id,requester_id,reason,created_at').order('created_at', { ascending: false }).limit(300)) ?? [];
  if (!reqs.length) return { rows: [] };
  const cards = checked<any[]>(await db.from('report_card_versions').select('id,subject_type,subject_id,period_start,period_end').in('id', [...new Set(reqs.map((r) => r.card_id))])) ?? [];
  const { exactManagerFundIds } = await import('@/lib/fund-access.server');
  const managed = isApprover ? null : new Set(await exactManagerFundIds(db, userId).catch(() => checked<string[]>({ data: [], error: true })));
  const ds = checked<any[]>(await db.from('report_card_access_decisions').select('request_id,decision,expires_at,created_at,reason').in('request_id', reqs.map((r) => r.id))) ?? [];
  const mine = reqs.filter((r) => { const c = cards.find((x) => x.id === r.card_id); return c && r.requester_id !== userId && (isApprover || (c.subject_type === 'fund' && managed!.has(c.subject_id))); });
  if (!mine.length) return { rows: [] };
  const people = checked<any[]>(await db.from('profiles').select('user_id,legal_name,email').in('user_id', [...new Set(mine.map((r) => r.requester_id))])) ?? [];
  const fIds = cards.filter((c) => c.subject_type === 'fund').map((c) => c.subject_id), cIds = cards.filter((c) => c.subject_type === 'client').map((c) => c.subject_id);
  const names = new Map<string, string>();
  if (fIds.length) for (const f of checked<any[]>(await db.from('offerings').select('id,name').in('id', fIds)) ?? []) names.set(f.id, f.name);
  if (cIds.length) for (const c of checked<any[]>(await db.from('clients').select('id,name').in('id', cIds)) ?? []) names.set(c.id, c.name);
  return {
    rows: mine.map((r) => {
      const c = cards.find((x) => x.id === r.card_id)!; const p = people.find((x) => x.user_id === r.requester_id); const my = ds.filter((d) => d.request_id === r.id);
      return { id: r.id, requester: p?.legal_name || p?.email || 'Someone', requesterEmail: p?.email ?? null, reason: r.reason, at: r.created_at, subjectLabel: names.get(c.subject_id) ?? 'Report card', periodStart: c.period_start, periodEnd: c.period_end, state: accessState(my as AccessDecision[]), expiresAt: my.filter((d) => d.decision === 'approved').map((d) => d.expires_at).sort().at(-1) ?? null };
    }),
  };
}

export async function decideAccess(userId: string, input: { requestId: string; decision: 'approved' | 'denied' | 'revoked'; days?: number | undefined; reason: string }) {
  const db = await database();
  const r = checked<any>(await db.from('report_card_access_requests').select('id,card_id,requester_id').eq('id', input.requestId).maybeSingle());
  if (!r) throw new Error('Request not found.');
  const c = checked<any>(await db.from('report_card_versions').select('id,subject_type,subject_id').eq('id', r.card_id).maybeSingle());
  const err = accessDecisionError({ decision: input.decision, days: input.days ?? null, deciderIsRequester: r.requester_id === userId, canDecide: Boolean(c && (await approverFor(db, userId, c))) });
  if (err) throw new Error(err);
  const ds = checked<any[]>(await db.from('report_card_access_decisions').select('decision,expires_at,created_at').eq('request_id', r.id)) ?? [];
  const state = accessState(ds as AccessDecision[]);
  if (input.decision === 'revoked' && state !== 'active') throw new Error('Only active access can be ended.');
  if (input.decision !== 'revoked' && state !== 'pending') throw new Error('This request has already been decided.');
  const expires_at = input.decision === 'approved' ? new Date(Date.now() + (input.days ?? 0) * 86_400_000).toISOString() : null;
  checked(await db.from('report_card_access_decisions').insert({ request_id: r.id, actor_id: userId, decision: input.decision, reason: input.reason.slice(0, 1000), expires_at }));
  return { ok: true };
}

/** A granted card: grade, summary and measure scores only, never evidence. */
export async function readGrantedCard(userId: string, cardId: string) {
  const db = await database();
  const g = await grantedCard(db, userId, cardId);
  if (!g) throw new Error('Your access to this report card has ended or was not approved.');
  return { card: project(g, false), expiresAt: g.expiresAt };
}
