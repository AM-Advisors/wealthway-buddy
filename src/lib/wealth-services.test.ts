import { describe, expect, it } from 'vitest';
import { currentWealthHoldings, wealthScopeAllowed, WEALTH_SERVICES, type WealthObservation } from './wealth-services';
const row: WealthObservation = { id:'one',holding_id:'holding',supersedes_id:null,owner_user_id:'alice',name:'Savings',asset_class:'cash',currency:'USD',cost_cents:10000,value_cents:10000,as_of:'2026-01-01',source_note:'Statement',archived:false,created_at:'2026-01-01' };
describe('wealth service scope and observations', () => {
  it('offers portfolio and report cards independently', () => expect(WEALTH_SERVICES.map(s=>s.key)).toEqual(['portfolio','report_cards']));
  it('does not require a fund for an individual', () => expect(wealthScopeAllowed('alice','alice',null,[])).toBe(true));
  it('requires the exact assigned fund manager for add-ons', () => expect(wealthScopeAllowed('alice','alice','fund-b',['fund-a'])).toBe(false));
  it('another account cannot select personal services', () => expect(wealthScopeAllowed('bob','alice',null,[])).toBe(false));
  it('personal holdings never include another owner', () => expect(currentWealthHoldings([row],'bob','2026-12-31')).toEqual([]));
  it('corrections retain point-in-time values', () => { const next={...row,id:'two',supersedes_id:'one',value_cents:12000,as_of:'2026-02-01'}; expect(currentWealthHoldings([row,next],'alice','2026-01-31')[0]?.value_cents).toBe(10000); expect(currentWealthHoldings([row,next],'alice','2026-02-01')[0]?.value_cents).toBe(12000); });
  it('archiving preserves prior observations but removes the current holding', () => expect(currentWealthHoldings([row,{...row,id:'two',supersedes_id:'one',archived:true,as_of:'2026-02-01'}],'alice','2026-12-31')).toEqual([]));
});