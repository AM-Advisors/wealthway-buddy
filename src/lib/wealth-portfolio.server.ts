/**
 * Server-only loaders and writers for the consolidated portfolio. Every read
 * resolves access first (owner, live delegation, or staff reporting
 * permission); every write is owner-only, goes through the owner's own
 * session (RLS) and appends an audit event. Fund figures are read from
 * published investor records only; nothing here writes fund books.
 */
import { ledgerFigures } from '@/lib/closing-ledger';
import {
  buildPortfolio,
  portfolioAccess,
  previewHoldingImport,
  previewFlowImport,
  rowFingerprint,
  quarterOf,
  canonicalJson,
  SELF,
  type FundPosition,
  type OwnershipLink,
  type PortfolioEntity,
  type PortfolioHolding,
  type PrivateCashFlow,
  type PrivateCommitment,
  type ProjectedItem,
  type PersonalCash,
  type ConnectedAccount,
  type EntityType,
  type DataSource,
} from './wealth-portfolio-model';
import { WEALTH_ASSET_CLASSES } from './wealth-services';

const admin = async () => (await import('@/integrations/supabase/client.server')).supabaseAdmin as any;
const num = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };
function checked<T>(r: { data: T; error: any }, what = 'Portfolio records'): T { if (r.error) { console.error('[wealth-portfolio]', what, r.error?.code); throw new Error(`${what} could not be loaded. Please try again.`); } return r.data; }

/**
 * A consolidated portfolio spans every investment the person holds, so only a
 * live whole-person delegation carrying view_investments opens it. Fund- or
 * investing-party-scoped delegations, and managing one of the person's funds,
 * grant nothing here.
 */
export async function personDelegationAllows(actorId: string, ownerId: string) {
  const { canAct } = await import('./delegated-access.server');
  const decision = await canAct(actorId, 'view_investments', { type: 'person', id: ownerId });
  if (!decision.allowed || !decision.delegationId) return false;
  const row = checked<any>(await (await admin()).from('delegations').select('id,scope_type,scope_id,principal_user_id').eq('id', decision.delegationId).maybeSingle(), 'Access');
  return Boolean(row && row.scope_type === 'person' && row.scope_id === ownerId && row.principal_user_id === ownerId);
}

export async function resolvePortfolioAccess(actorId: string, ownerId: string) {
  if (actorId === ownerId) return portfolioAccess({ actorId, ownerId, delegationAllowed: false, staffCanSee: false })!;
  const delegationAllowed = await personDelegationAllows(actorId, ownerId);
  let staffCanSee = false;
  if (!delegationAllowed) {
    const db = await admin();
    const roles = (checked<any[]>(await db.from('user_roles').select('role').eq('user_id', actorId), 'Access') ?? []).map(r => String(r.role));
    const { capabilitiesFor } = await import('./ops-capabilities');
    staffCanSee = capabilitiesFor(roles).some(c => c === 'reports:see');
  }
  const access = portfolioAccess({ actorId, ownerId, delegationAllowed, staffCanSee });
  if (!access) throw new Error('You do not have access to this portfolio.');
  return access;
}

/** Portfolios the signed-in person may open: their own, live delegations, and (staff) owners with records. */
export async function portfolioSubjects(actorId: string) {
  const db = await admin();
  const out: { ownerId: string; label: string; role: 'owner' | 'delegate' | 'staff' }[] = [{ ownerId: actorId, label: 'My portfolio', role: 'owner' }];
  const delegations = checked<any[]>(await db.from('delegations').select('principal_user_id,status,revoked_at,expires_at').eq('delegate_user_id', actorId), 'Shared portfolios') ?? [];
  const principals = [...new Set(delegations.filter(d => d.status === 'active' && !d.revoked_at && (!d.expires_at || new Date(d.expires_at) > new Date())).map(d => String(d.principal_user_id)))].filter(id => id !== actorId);
  const allowed: string[] = [];
  for (const id of principals) if (await personDelegationAllows(actorId, id)) allowed.push(id);
  const roles = (checked<any[]>(await db.from('user_roles').select('role').eq('user_id', actorId), 'Access') ?? []).map(r => String(r.role));
  const { capabilitiesFor } = await import('./ops-capabilities');
  const staff = capabilitiesFor(roles).some(c => c === 'reports:see');
  let staffOwners: string[] = [];
  if (staff) {
    const [a, b] = await Promise.all([
      db.from('personal_wealth_observations').select('owner_user_id').limit(1000),
      db.from('wealth_portfolio_records').select('owner_user_id').limit(1000),
    ]);
    staffOwners = [...new Set([...(checked<any[]>(a) ?? []), ...(checked<any[]>(b) ?? [])].map(r => String(r.owner_user_id)))].filter(id => id !== actorId && !allowed.includes(id));
  }
  const ids = [...allowed, ...staffOwners];
  if (ids.length) {
    const profiles = checked<any[]>(await db.from('profiles').select('user_id,legal_name,email').in('user_id', ids), 'Names') ?? [];
    const label = (id: string) => { const p = profiles.find(x => x.user_id === id); return p?.legal_name || p?.email || 'Portfolio owner'; };
    for (const id of allowed) out.push({ ownerId: id, label: label(id), role: 'delegate' });
    for (const id of staffOwners) out.push({ ownerId: id, label: label(id), role: 'staff' });
  }
  return { subjects: out, staff };
}

type RecordRow = { id: string; record_id: string; supersedes_id: string | null; kind: string; detail: any; source: string; archived: boolean; created_at: string; import_row_hash: string | null };
export function currentRecords(rows: RecordRow[]) {
  const replaced = new Set(rows.map(r => r.supersedes_id).filter(Boolean));
  return rows.filter(r => !replaced.has(r.id) && !r.archived);
}

async function loadRecords(db: any, ownerId: string) {
  const rows = (checked<RecordRow[]>(await db.from('wealth_portfolio_records').select('*').eq('owner_user_id', ownerId).order('created_at', { ascending: true }))) ?? [];
  const current = currentRecords(rows);
  const entities: PortfolioEntity[] = current.filter(r => r.kind === 'entity').map(r => ({ recordId: r.record_id, name: String(r.detail?.name ?? 'Entity'), entityType: (r.detail?.entityType ?? 'other') as EntityType, investmentProfileId: r.detail?.investmentProfileId ?? null, rowId: r.id }));
  const links: OwnershipLink[] = current.filter(r => r.kind === 'ownership').map(r => ({ recordId: r.record_id, parentId: String(r.detail?.parentId ?? SELF), childId: String(r.detail?.childId ?? ''), pctBps: r.detail?.pctBps === null || r.detail?.pctBps === undefined ? null : num(r.detail.pctBps), rowId: r.id }));
  const commitments: PrivateCommitment[] = current.filter(r => r.kind === 'commitment').map(r => ({ recordId: r.record_id, name: String(r.detail?.name ?? 'Private investment'), currency: String(r.detail?.currency ?? 'USD'), commitmentCents: num(r.detail?.commitmentCents), holderEntityId: r.detail?.holderEntityId ?? null, holdingId: r.detail?.holdingId ?? null, startDate: String(r.detail?.startDate ?? ''), rowId: r.id }));
  const flows: PrivateCashFlow[] = current.filter(r => r.kind === 'cash_flow').map(r => ({ recordId: r.record_id, commitmentId: String(r.detail?.commitmentId ?? ''), date: String(r.detail?.date ?? ''), flowType: r.detail?.flowType === 'distribution' ? 'distribution' : 'contribution', status: r.detail?.status === 'projected' ? 'projected' : 'actual', amountCents: num(r.detail?.amountCents), note: String(r.detail?.note ?? ''), source: (r.source === 'import' ? 'import' : 'manual') as DataSource, rowId: r.id }));
  return { rows, current, entities, links, commitments, flows };
}

async function loadHoldings(db: any, ownerId: string, asOf: string) {
  const rows = (checked<any[]>(await db.from('personal_wealth_observations').select('*').eq('owner_user_id', ownerId).order('created_at', { ascending: true }))) ?? [];
  const eligible = rows.filter(r => r.as_of <= asOf);
  const replaced = new Set(eligible.map(r => r.supersedes_id).filter(Boolean));
  const current = eligible.filter(r => !replaced.has(r.id) && !r.archived);
  const holdings: PortfolioHolding[] = current.map(r => {
    const byDate = new Map<string, any>();
    for (const x of eligible.filter(x => x.holding_id === r.holding_id && !x.archived && x.as_of < r.as_of)) byDate.set(x.as_of, x);
    return { holdingId: r.holding_id, observationId: r.id, sourceNote: r.source_note, name: r.name, assetClass: r.asset_class, currency: r.currency, valueCents: r.value_cents, costCents: r.cost_cents, asOf: r.as_of, source: r.source === 'import' ? 'import' : 'manual', sector: r.sector ?? null, geography: r.geography ?? null, holderEntityId: r.holder_entity_id ?? null, representsEntityId: r.represents_entity_id ?? null,
      history: [...byDate.values()].sort((a, b) => a.as_of.localeCompare(b.as_of)).map(x => ({ asOf: x.as_of, valueCents: x.value_cents })) };
  });
  // Holdings that exist now but whose values are all dated after asOf: reported as left out, never estimated.
  const latestById = new Map<string, any>();
  for (const r of rows) { const replacedAll = rows.some(x => x.supersedes_id === r.id); if (!replacedAll) latestById.set(r.holding_id, r); }
  const excludedAfterPeriod = [...latestById.values()]
    .filter(r => !r.archived && !holdings.some(h => h.holdingId === r.holding_id))
    .map(r => ({ holdingId: String(r.holding_id), name: String(r.name), firstValueDate: rows.filter(x => x.holding_id === r.holding_id && !x.archived).map(x => String(x.as_of)).sort()[0] ?? String(r.as_of) }));
  return { rows, holdings, excludedAfterPeriod };
}

const CONTRIBUTION_EVENTS = new Set(['contribution', 'contribution_settled', 'transfer_in']);
const DISTRIBUTION_EVENTS = new Set(['distribution', 'return_of_capital', 'withdrawal', 'transfer_out']);
const ANNOUNCED_BATCHES = new Set(['investor_confirmation', 'final_approval', 'approved', 'executing']);

/** Published investor records only: positions, published statements, immutable commitment events. */
async function loadFunds(db: any, ownerId: string, asOf: string) {
  const positions = (checked<any[]>(await db.from('investor_positions').select('id,offering_id,investment_profile_id,display_name,status,transferred_to_id').eq('investor_user_id', ownerId), 'Fund records') ?? []).filter(p => !p.transferred_to_id);
  if (!positions.length) return { funds: [] as FundPosition[], projected: [] as ProjectedItem[] };
  const ids = positions.map(p => p.id), offeringIds = [...new Set(positions.map(p => p.offering_id))];
  const [offerings, statements, events, callLines, distLines] = await Promise.all([
    db.from('offerings').select('id,name').in('id', offeringIds),
    db.from('investor_statements').select('id,position_id,period_end,snapshot,status,version,supersedes_id').in('position_id', ids).eq('status', 'published').lte('period_end', asOf).order('period_end', { ascending: true }),
    db.from('commitment_events').select('id,position_id,event_type,amount_cents,effective_date').in('position_id', ids).lte('effective_date', asOf).order('effective_date', { ascending: true }),
    db.from('capital_call_lines').select('id,capital_call_id,position_id,called_cents,received_cents,due_date,offering_id').eq('investor_user_id', ownerId),
    db.from('distribution_lines').select('id,batch_id,position_id,net_cents,currency,offering_id,payment_state').eq('investor_user_id', ownerId),
  ]);
  const names = new Map((checked<any[]>(offerings, 'Fund records') ?? []).map(o => [o.id, o.name]));
  const st = currentStatements(checked<any[]>(statements, 'Fund statements') ?? []);
  const allEvents = checked<any[]>(events, 'Fund cash flows') ?? [];
  const ev = allEvents.filter(e => CONTRIBUTION_EVENTS.has(e.event_type) || DISTRIBUTION_EVENTS.has(e.event_type));
  const funds: FundPosition[] = positions.map(p => {
    const mine = st.filter(s => s.position_id === p.id);
    const latest = mine[mine.length - 1];
    const snap = (latest?.snapshot ?? {}) as Record<string, unknown>;
    const flows = ev.filter(e => e.position_id === p.id).map(e => ({ id: e.id, date: String(e.effective_date), kind: CONTRIBUTION_EVENTS.has(e.event_type) ? 'contribution' as const : 'distribution' as const, amountCents: Math.abs(num(e.amount_cents)) }));
    const contributed = flows.filter(f => f.kind === 'contribution').reduce((n, f) => n + f.amountCents, 0);
    const distributed = flows.filter(f => f.kind === 'distribution').reduce((n, f) => n + f.amountCents, 0);
    // Before the first published statement, commitment and unfunded come from the commitment ledger.
    const ledger = latest ? null : ledgerFigures(allEvents.filter(e => e.position_id === p.id), asOf);
    const commitment = latest ? num(snap['commitmentCents']) : ledger!.commitmentCents;
    return {
      positionId: p.id, offeringId: p.offering_id, fundName: names.get(p.offering_id) ?? 'Fund', investmentProfileId: p.investment_profile_id ?? null, profileLabel: p.display_name ?? null,
      commitmentCents: commitment, contributedCents: latest ? num(snap['contributedToDateCents'] ?? snap['contributionsCents']) : contributed,
      distributionsCents: latest ? num(snap['distributionsToDateCents'] ?? snap['distributionsCents']) : distributed,
      unfundedCents: latest ? num(snap['unfundedCommitmentCents']) : Math.max(0, commitment - contributed),
      valueCents: latest && snap['endingCapitalCents'] !== undefined ? num(snap['endingCapitalCents']) : null, valueDate: latest?.period_end ?? null,
      valuations: mine.filter(s => (s.snapshot as any)?.endingCapitalCents !== undefined).map(s => ({ date: String(s.period_end), valueCents: num((s.snapshot as any).endingCapitalCents) })),
      flows,
    };
  });
  const projected: ProjectedItem[] = [];
  const lines = checked<any[]>(callLines, 'Capital calls') ?? [];
  if (lines.length) {
    const calls = checked<any[]>(await db.from('capital_calls').select('id,status,due_date,title').in('id', [...new Set(lines.map(l => l.capital_call_id))]), 'Capital calls') ?? [];
    for (const l of lines) {
      const c = calls.find(x => x.id === l.capital_call_id);
      const outstanding = num(l.called_cents) - num(l.received_cents);
      if (c?.status === 'published' && outstanding > 0) projected.push({ id: `call:${l.id}`, kind: 'capital_call', name: `${names.get(l.offering_id) ?? 'Fund'} · ${c.title || 'capital call'}`, currency: 'USD', amountCents: outstanding, date: l.due_date ?? c.due_date ?? null, source: 'fund_records' });
    }
  }
  const dl = checked<any[]>(distLines, 'Distributions') ?? [];
  if (dl.length) {
    const batches = checked<any[]>(await db.from('distribution_batches').select('id,status,payment_date,effective_date,title').in('id', [...new Set(dl.map(l => l.batch_id))]), 'Distributions') ?? [];
    for (const l of dl) {
      const b = batches.find(x => x.id === l.batch_id);
      if (b && ANNOUNCED_BATCHES.has(b.status)) projected.push({ id: `dist:${l.id}`, kind: 'distribution', name: `${names.get(l.offering_id) ?? 'Fund'} · ${b.title || 'distribution'}`, currency: l.currency ?? 'USD', amountCents: num(l.net_cents) || null, date: b.payment_date ?? b.effective_date ?? null, source: 'fund_records' });
    }
  }
  return { funds, projected };
}

/** One published statement per position and period: corrections replace earlier versions instead of adding a second value. */
export function currentStatements<T extends { id?: string; position_id: string; period_end: string; version?: number | null; supersedes_id?: string | null }>(rows: T[]): T[] {
  const replaced = new Set(rows.map(r => r.supersedes_id).filter(Boolean));
  const best = new Map<string, T>();
  for (const r of rows) {
    if (r.id && replaced.has(r.id)) continue;
    const k = `${r.position_id}|${r.period_end}`;
    const prior = best.get(k);
    if (!prior || Number(r.version ?? 0) >= Number(prior.version ?? 0)) best.set(k, r);
  }
  return [...best.values()].sort((a, b) => String(a.period_end).localeCompare(String(b.period_end)));
}

async function loadPersonalCash(db: any, ownerId: string, asOf: string): Promise<PersonalCash[]> {
  const rows = (checked<any[]>(await db.from('personal_wealth_financial_records').select('*').eq('owner_user_id', ownerId), 'Personal cash records')) ?? [];
  const { currentFinancialRecords } = await import('./wealth-dashboard');
  return currentFinancialRecords(rows, ownerId, asOf).filter(r => r.kind !== 'liability').map(r => ({ id: r.id, name: r.name, currency: r.currency, amountCents: r.amount_cents, date: r.effective_date, direction: r.kind === 'inflow' ? 'inflow' : 'outflow' }));
}

async function loadConnected(db: any, ownerId: string) {
  const { accountFeedConfiguration } = await import('./account-aggregation-provider.server');
  const config = accountFeedConfiguration();
  const live = config.configured && !config.testMode;
  if (!live) return { live: false, accounts: [] as ConnectedAccount[] };
  const [connections, snapshots] = await Promise.all([
    db.from('personal_account_connections').select('id,status,last_synced_at').eq('owner_user_id', ownerId),
    db.from('personal_account_snapshots').select('*').eq('owner_user_id', ownerId).order('observed_at', { ascending: false }).limit(2000),
  ]);
  const { latestFeedSnapshots } = await import('./account-aggregation');
  const latest = latestFeedSnapshots(checked<any[]>(snapshots) ?? [], ownerId, new Date().toISOString(), checked<any[]>(connections) ?? []);
  return { live: true, accounts: latest.map((s: any) => ({ id: `${s.connection_id}:${s.provider_account_id}`, name: s.account_name, currency: s.currency, balanceCents: s.current_balance_cents, accountType: s.account_type, observedAt: s.observed_at })) };
}

export async function portfolioView(actorId: string, ownerId: string, asOf: string, periodStart: string) {
  const access = await resolvePortfolioAccess(actorId, ownerId);
  const db = await admin();
  const [records, holdings, fund, personalCash, connected] = await Promise.all([loadRecords(db, ownerId), loadHoldings(db, ownerId, asOf), loadFunds(db, ownerId, asOf), loadPersonalCash(db, ownerId, asOf), loadConnected(db, ownerId)]);
  const view = buildPortfolio({ asOf, periodStart, excludedAfterPeriod: holdings.excludedAfterPeriod, entities: records.entities, links: records.links, holdings: holdings.holdings, funds: fund.funds, commitments: records.commitments, privateFlows: records.flows, projected: fund.projected, personalCash, connected: connected.accounts, connectedLive: connected.live });
  const profiles = access.canEdit ? (checked<any[]>(await db.from('investment_profiles').select('id,display_label,legal_name,profile_type').eq('owner_user_id', ownerId), 'Investing parties') ?? []).map(p => ({ id: p.id, label: p.display_label || p.legal_name || 'Investing party', type: p.profile_type ?? null })) : [];
  return { access, ownerId, view, profiles, holdingOptions: holdings.holdings.map(h => ({ holdingId: h.holdingId, name: h.name })) };
}

// ------------------------------------------------------------- writes (owner only)

export type OwnerClient = any;
/** Change history is written only here, by the server, after the caller is verified as the owner. */
async function audit(_client: OwnerClient, ownerId: string, action: string, recordRef: string | null, detail: Record<string, unknown> = {}) {
  const r = await (await admin()).from('wealth_audit_events').insert({ owner_user_id: ownerId, actor_user_id: ownerId, action, record_ref: recordRef, detail });
  if (r.error) console.error('[wealth-portfolio] audit', r.error?.code);
}

export async function saveRecord(client: OwnerClient, ownerId: string, input: { kind: 'entity' | 'ownership' | 'commitment' | 'cash_flow'; priorId?: string | undefined; detail: Record<string, unknown>; archived?: boolean | undefined }) {
  const db = await admin();
  const records = await loadRecords(db, ownerId);
  let recordId: string = crypto.randomUUID();
  if (input.priorId) {
    const prior = records.current.find(r => r.id === input.priorId);
    if (!prior || prior.kind !== input.kind) throw new Error('That record has changed or is no longer available. Refresh and try again.');
    recordId = prior.record_id;
  }
  const d = input.detail;
  if (input.kind === 'ownership' && !input.archived) {
    const entityIds = new Set(records.entities.map(e => e.recordId));
    if (!entityIds.has(String(d['childId']))) throw new Error('Choose the entity that is owned.');
    if (d['parentId'] !== SELF && !entityIds.has(String(d['parentId']))) throw new Error('Choose who owns it.');
    if (d['parentId'] === d['childId']) throw new Error('An entity cannot own itself.');
  }
  if ((input.kind === 'entity') && d['investmentProfileId']) {
    const p = checked<any>(await db.from('investment_profiles').select('id,owner_user_id').eq('id', String(d['investmentProfileId'])).maybeSingle(), 'Investing party');
    if (!p || p.owner_user_id !== ownerId) throw new Error('That investing party is not yours.');
    if (records.entities.some(e => e.investmentProfileId === d['investmentProfileId'] && e.recordId !== recordId)) throw new Error('That investing party is already linked to another entity.');
  }
  if (input.kind === 'cash_flow' && !records.commitments.some(c => c.recordId === d['commitmentId'])) throw new Error('Choose the private investment for this cash flow.');
  if (input.kind === 'commitment' && d['holderEntityId'] && !records.entities.some(e => e.recordId === d['holderEntityId'])) throw new Error('Choose an entity on file.');
  if (input.kind === 'commitment' && d['holdingId'] && !input.archived) {
    const obs = checked<any[]>(await db.from('personal_wealth_observations').select('id,holding_id,holder_entity_id,currency,archived,supersedes_id').eq('owner_user_id', ownerId).eq('holding_id', String(d['holdingId'])), 'Holding') ?? [];
    const replaced = new Set(obs.map(o => o.supersedes_id).filter(Boolean));
    const cur = obs.find(o => !replaced.has(o.id) && !o.archived);
    if (!cur) throw new Error('Choose a holding on file.');
    if ((cur.holder_entity_id ?? null) !== (d['holderEntityId'] ?? null)) throw new Error('The linked holding is held by a different owner. Choose the same owner for both.');
    if (cur.currency !== d['currency']) throw new Error('The linked holding uses a different currency.');
  }
  const r = await client.from('wealth_portfolio_records').insert({ owner_user_id: ownerId, created_by: ownerId, record_id: recordId, supersedes_id: input.priorId ?? null, kind: input.kind, detail: d, archived: Boolean(input.archived) });
  if (r.error) throw new Error(r.error.code === '23505' ? 'Someone already corrected this record. Refresh and try again.' : 'The record could not be saved. Please try again.');
  await audit(client, ownerId, input.archived ? `${input.kind}.archived` : input.priorId ? `${input.kind}.corrected` : `${input.kind}.added`, recordId, { detail: d });
  return { ok: true, recordId };
}

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function importPreview(ownerId: string, input: { kind: 'holdings' | 'private_cash_flows'; text: string }) {
  const db = await admin();
  const hash = await sha256(input.text);
  const today = new Date().toISOString().slice(0, 10);
  const [records, holdingRows, batches] = await Promise.all([
    loadRecords(db, ownerId),
    input.kind === 'holdings' ? db.from('personal_wealth_observations').select('name,asset_class,currency,value_cents,as_of,holder_entity_id,import_row_hash,archived').eq('owner_user_id', ownerId) : Promise.resolve({ data: [], error: null }),
    db.from('wealth_import_batches').select('id,file_name,created_at').eq('owner_user_id', ownerId).eq('file_sha256', hash),
  ]);
  const priorFile = (checked<any[]>(batches) ?? [])[0] ?? null;
  if (input.kind === 'holdings') {
    const existing = new Set((checked<any[]>(holdingRows) ?? []).filter(r => !r.archived).map(r => r.import_row_hash || rowFingerprint([r.name, r.asset_class, r.currency, r.value_cents ?? '', r.as_of, r.holder_entity_id ?? null])));
    return { hash, priorFile, ...previewHoldingImport(input.text, { assetClasses: WEALTH_ASSET_CLASSES, entities: records.entities, existingFingerprints: existing, today }) };
  }
  const existing = new Set(records.current.filter(r => r.kind === 'cash_flow').map(r => r.import_row_hash || rowFingerprint([r.detail?.commitmentId, r.detail?.date, r.detail?.flowType, r.detail?.status, r.detail?.amountCents])));
  return { hash, priorFile, ...previewFlowImport(input.text, { commitments: records.commitments, existingFingerprints: existing, today }) };
}

export async function importCommit(client: OwnerClient, ownerId: string, input: { kind: 'holdings' | 'private_cash_flows'; fileName: string; text: string; expectedHash: string }) {
  const preview = await importPreview(ownerId, input);
  if (preview.hash !== input.expectedHash) throw new Error('The file changed after the preview. Preview it again.');
  if (preview.fileErrors.length) throw new Error(preview.fileErrors[0]);
  if (preview.rows.some(r => r.status === 'error')) throw new Error('Fix the rows marked with problems before importing.');
  const ready = preview.rows.filter(r => r.status === 'ready');
  if (!ready.length) throw new Error('Nothing new to import: every row is already recorded.');
  const batchId = crypto.randomUUID();
  const b = await client.from('wealth_import_batches').insert({ id: batchId, owner_user_id: ownerId, created_by: ownerId, kind: input.kind, file_name: input.fileName.slice(0, 200), file_sha256: preview.hash, row_count: preview.rows.length, imported_count: ready.length, skipped_duplicates: preview.rows.length - ready.length });
  if (b.error) throw new Error('The import could not be saved. Please try again.');
  let r: any;
  if (input.kind === 'holdings') {
    r = await client.from('personal_wealth_observations').insert(ready.map(row => { const v = row.value as any; return { owner_user_id: ownerId, holding_id: crypto.randomUUID(), name: v.name, asset_class: v.assetClass, currency: v.currency, value_cents: v.valueCents, cost_cents: v.costCents, as_of: v.asOf, sector: v.sector, geography: v.geography, holder_entity_id: v.holderEntityId, source_note: v.sourceNote, source: 'import', import_batch_id: batchId, import_row_hash: row.fingerprint }; }));
  } else {
    r = await client.from('wealth_portfolio_records').insert(ready.map(row => ({ owner_user_id: ownerId, created_by: ownerId, record_id: crypto.randomUUID(), kind: 'cash_flow', detail: row.value, source: 'import', import_batch_id: batchId, import_row_hash: row.fingerprint })));
  }
  if (r.error) { await audit(client, ownerId, 'import.failed', batchId, { kind: input.kind }); throw new Error('The rows could not be saved. Nothing was imported from this file; please try again.'); }
  await audit(client, ownerId, 'import.committed', batchId, { kind: input.kind, fileName: input.fileName.slice(0, 200), imported: ready.length, skipped: preview.rows.length - ready.length, repeatFile: Boolean(preview.priorFile) });
  return { imported: ready.length, skipped: preview.rows.length - ready.length };
}

export async function publishQuarterReport(client: OwnerClient, ownerId: string, periodEnd: string) {
  const q = quarterOf(periodEnd);
  const today = new Date().toISOString().slice(0, 10);
  if (q.end !== periodEnd) throw new Error('Choose a quarter end date.');
  if (q.end > today) throw new Error('A quarterly report can only be published after the quarter ends.');
  const { view } = await portfolioView(ownerId, ownerId, q.end, q.start);
  // Stored exactly as the database will return it, hashed over sorted keys so the copy can be re-verified on every download.
  const snapshot = JSON.parse(JSON.stringify({ periodLabel: q.label, periodStart: q.start, periodEnd: q.end, generatedAt: new Date().toISOString(), view }));
  const text = canonicalJson(snapshot);
  const db = await admin();
  const prior = (checked<any[]>(await db.from('wealth_report_versions').select('id,version').eq('owner_user_id', ownerId).eq('period_end', q.end).order('version', { ascending: false }).limit(1)) ?? [])[0];
  // Reports are inserted by the server only, from the server-computed view, so figures cannot be supplied by the browser.
  const r = await db.from('wealth_report_versions').insert({ owner_user_id: ownerId, published_by: ownerId, period_label: q.label, period_start: q.start, period_end: q.end, version: (prior?.version ?? 0) + 1, snapshot, snapshot_sha256: await sha256(text), supersedes_id: prior?.id ?? null });
  if (r.error) throw new Error(r.error.code === '23505' ? 'A new version of this report was just published. Refresh to see it.' : 'The report could not be published. Please try again.');
  await audit(client, ownerId, 'report.published', q.label, { version: (prior?.version ?? 0) + 1 });
  return { ok: true, version: (prior?.version ?? 0) + 1 };
}

export async function reportList(actorId: string, ownerId: string) {
  await resolvePortfolioAccess(actorId, ownerId);
  const db = await admin();
  const rows = checked<any[]>(await db.from('wealth_report_versions').select('id,period_label,period_start,period_end,version,published_at,supersedes_id,totals:snapshot->view->totals,complete:snapshot->view->completeness->complete,completenessMessage:snapshot->view->completeness->message').eq('owner_user_id', ownerId).order('period_end', { ascending: false }).order('version', { ascending: false })) ?? [];
  const replaced = new Set(rows.map(r => r.supersedes_id).filter(Boolean));
  return rows.map(r => ({ id: r.id, periodLabel: r.period_label, periodStart: r.period_start, periodEnd: r.period_end, version: r.version, publishedAt: r.published_at, current: !replaced.has(r.id), totals: (Array.isArray(r.totals) ? r.totals : []) as { currency: string; valueCents: number; missingValues: number; lines: number }[], complete: r.complete === true, completenessMessage: typeof r.completenessMessage === 'string' ? r.completenessMessage : null }));
}

export async function reportSnapshot(actorId: string, reportId: string) {
  const db = await admin();
  const row = checked<any>(await db.from('wealth_report_versions').select('id,owner_user_id,period_label,version,snapshot,snapshot_sha256,published_at').eq('id', reportId).maybeSingle(), 'Report');
  // Unknown and not-yours look the same, so report IDs cannot be probed.
  if (!row) throw new Error('Report not found.');
  try { await resolvePortfolioAccess(actorId, row.owner_user_id); } catch { throw new Error('Report not found.'); }
  const integrity = (await sha256(canonicalJson(row.snapshot))) === row.snapshot_sha256 ? 'verified' as const : 'unverified' as const;
  return { id: row.id, periodLabel: row.period_label, version: row.version, publishedAt: row.published_at, sha256: row.snapshot_sha256, integrity, snapshot: row.snapshot };
}

export async function auditTrail(actorId: string, ownerId: string) {
  await resolvePortfolioAccess(actorId, ownerId);
  const db = await admin();
  return (checked<any[]>(await db.from('wealth_audit_events').select('id,action,record_ref,detail,created_at').eq('owner_user_id', ownerId).order('created_at', { ascending: false }).limit(200)) ?? []).map(e => ({ id: e.id, action: e.action, createdAt: e.created_at, summary: e.detail?.fileName ? `${e.detail.fileName}: ${e.detail.imported ?? 0} imported, ${e.detail.skipped ?? 0} skipped` : (e.detail?.detail?.name ?? (e.detail?.version ? `Version ${e.detail.version}` : null)) }));
}

export async function recordHoldingAudit(client: OwnerClient, ownerId: string, action: string, holdingId: string, detail: Record<string, unknown>) {
  await audit(client, ownerId, action, holdingId, detail);
}
