import { closeFeeRaise, closeHarmoniousFees } from './close-harmonious-fees';

const rows = (r: any): any[] => { if (r.error) throw new Error("Harmonious fees couldn't be loaded. Please retry."); return r.data ?? []; };
/** Caller must already have exact-fund manage access. Read-only, never posts fees. */
export async function loadCloseHarmoniousFees(db: any, fundId: string, sl: { count: number; paidCount: number }) {
  const { data: fund, error } = await db.from('offerings').select('client_id, fund_type').eq('id', fundId).maybeSingle();
  if (error || !fund) throw new Error("Fund pricing couldn't be loaded.");
  const today = new Date().toISOString().slice(0,10);
  const client = fund.client_id;
  const [investors, bands, prices, selections, entitlements, versions, snapshots, sows, links] = await Promise.all([
    db.from('investor_onboardings').select('stage, is_test_investor, commitment_amount_cents, accepted_amount_cents, requested_amount_cents, persons(email)').eq('offering_id', fundId).is('removed_at', null).is('merged_into_onboarding_id', null),
    db.from('spv_transaction_pricing').select('id, label, min_raise_usd, max_raise_usd, fee_usd, sort_order').eq('is_current',true),
    client ? db.from('client_pricing').select('*').eq('client_id',client).is('superseded_at',null) : { data: [] },
    client ? db.from('client_service_selections').select('*').eq('client_id',client) : { data: [] },
    client ? db.from('service_entitlements').select('*').eq('client_id',client) : { data: [] },
    db.from('pricing_versions').select('id').eq('status','published').lte('effective_date',today).order('effective_date',{ascending:false}),
    db.from('fund_pricing_snapshots').select('*').eq('offering_id',fundId).is('superseded_at',null),
    client ? db.from('client_sows').select('id, offering_id, status, executed_at, generated_lines').eq('client_id',client).eq('status','active') : { data: [] },
    client ? db.from('client_sow_funds').select('sow_id, offering_id').eq('client_id',client).eq('offering_id',fundId).eq('status','active') : { data: [] },
  ]);
  const pricing = rows(prices); const snaps = rows(snapshots); const vids = rows(versions).map(v=>v.id);
  const uids = [...new Set(pricing.map(p=>p.approved_by).filter(Boolean))];
  const [roles, items, frozen] = await Promise.all([
    uids.length ? db.from('user_roles').select('user_id, role').in('user_id',uids) : { data: [] },
    vids.length ? db.from('pricing_items').select('id, service_key, label, amount_cents, pricing_model, pass_through, version_id').in('version_id',vids) : { data: [] },
    snaps.length ? db.from('fund_pricing_snapshot_lines').select('*').in('snapshot_id',snaps.map(s=>s.id)) : { data: [] },
  ]);
  const catalog = rows(items).sort((a,b)=>vids.indexOf(a.version_id)-vids.indexOf(b.version_id));
  const raiseCents = closeFeeRaise(rows(investors));
  const linked = new Set(rows(links).map(l=>l.sow_id));
  const agreementLines = rows(sows).filter(s=>s.executed_at && (s.offering_id === fundId || linked.has(s.id))).flatMap(s=>(Array.isArray(s.generated_lines) ? s.generated_lines : []).map((l: any)=>({...l, service_key:l.service_key ?? l.serviceKey, offering_id:l.offering_id ?? fundId, source_id:s.id})));
  return { ...closeHarmoniousFees({ fundId, today, isSpv: String(fund.fund_type).toLowerCase().includes('spv'), raiseCents, bands:rows(bands), pricing, roles:rows(roles), catalog, selections:rows(selections), entitlements:rows(entitlements), agreementLines, snapshots:snaps, snapshotLines:rows(frozen), sideLetterCount:sl.count, sideLetterPaidCount:sl.paidCount }), clientId: client as string | null };
}