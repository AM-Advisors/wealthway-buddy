import { describe, expect, it } from 'vitest';
import { closeFeeRaise, closeHarmoniousFees } from './close-harmonious-fees';
const base = { fundId:'fund', today:'2026-11-25', isSpv:true, raiseCents:75000000, bands:[{id:'band',label:'Fictional',min_raise_usd:0,max_raise_usd:null,fee_usd:5000,sort_order:0}], pricing:[] as any[], roles:[{user_id:'ceo',role:'executive'}], catalog:[] as any[], selections:[] as any[], entitlements:[] as any[], agreementLines:[] as any[], snapshots:[] as any[], snapshotLines:[] as any[], sideLetterCount:2,sideLetterPaidCount:1 };
const line = (result: ReturnType<typeof closeHarmoniousFees>, key: string) => result.lines.find(l=>l.key===key);
describe('Harmonious close fee sources',()=>{
  it('uses accepted then committed amounts, never tests, employees, removed, merged or declined investments',()=>{
    expect(closeFeeRaise([{accepted_amount_cents:200000,commitment_amount_cents:100000},{commitment_amount_cents:300000,requested_amount_cents:1},{is_test_investor:true,commitment_amount_cents:999999},{persons:{email:'employee@harmonious.co'},commitment_amount_cents:999999},{removed_at:'2026-11-20',commitment_amount_cents:999999},{merged_into_onboarding_id:'another',commitment_amount_cents:999999},{stage:'declined',commitment_amount_cents:999999}])).toBe(500000);
  });
  it('retains the signed SPV agreement band even after the fund crosses into another standard band',()=>{
    const r=closeHarmoniousFees({...base,agreementLines:[{service_key:'SPV_TXN:prior-band',offering_id:'fund',unit_cents:400000}]});
    expect(line(r,'SPV_TXN:prior-band')?.cents).toBe(400000); expect(line(r,'SPV_TXN:band')).toBeUndefined();
  });
  it('uses the canonical raise band and standard side-letter fee without a client amount',()=>{
    const r=closeHarmoniousFees(base);
    expect(line(r,'SPV_TXN:band')?.cents).toBe(500000);
    expect(line(r,'side_letters')?.unitCents).toBe(150000);
    expect(line(r,'side_letters')?.cents).toBe(150000);
    expect(r.oneTimeCents).toBe(650000);
  });
  it('approved exact-fund pricing wins over client-wide and standard fees',()=>{
    const r=closeHarmoniousFees({...base,pricing:[{service_key:'side_letters',contracted_cents:120000,approved_at:'2026-11-20',approved_by:'ceo'},{service_key:'side_letters',offering_id:'fund',contracted_cents:100000,approved_at:'2026-11-20',approved_by:'ceo'}]});
    expect(line(r,'side_letters')?.unitCents).toBe(100000);
    expect(line(r,'side_letters')?.source).toBe('Approved client price');
  });
  it('an explicit approved zero price stays zero',()=>{
    const r=closeHarmoniousFees({...base,pricing:[{service_key:'SPV_TXN:band',contracted_cents:0,approved_at:'2026-11-20',approved_by:'ceo'}]});
    expect(line(r,'SPV_TXN:band')?.cents).toBe(0);
  });
  it.each([{approved_by:'sales',approved_at:'2026-11-20'},{approved_by:'ceo',approved_at:null},{approved_by:'ceo',approved_at:'2026-11-20',expires_on:'2026-11-24'},{approved_by:'ceo',approved_at:'2026-11-20',offering_id:'other'},{approved_by:'ceo',approved_at:'2026-11-20',effective_date:'2026-12-01'},{approved_by:'ceo',approved_at:'2026-11-20',superseded_at:'2026-11-24'}])('ignores unauthorized, unapproved, expired, other-fund, future or superseded prices: %j',(extra)=>{
    const r=closeHarmoniousFees({...base,pricing:[{service_key:'side_letters',contracted_cents:1,...extra}]});
    expect(line(r,'side_letters')?.unitCents).toBe(150000);
  });
  it('keeps a signed agreement price ahead of a new standard/client price',()=>{
    const r=closeHarmoniousFees({...base,agreementLines:[{service_key:'SPV_TXN:band',offering_id:'fund',unit_cents:400000,source_id:'signed-sow'}]});
    expect(line(r,'SPV_TXN:band')?.cents).toBe(400000);
    expect(line(r,'SPV_TXN:band')?.reference).toBe('signed-sow');
  });
  it('shows other entitled services by cadence without adding recurring charges to the one-time total',()=>{
    const r=closeHarmoniousFees({...base,entitlements:[{service_key:'nav',offering_id:'fund',status:'active'},{service_key:'unpriced',offering_id:'fund',status:'active'},{service_key:'other-only',offering_id:'other',status:'active'}],catalog:[{service_key:'nav',label:'NAV reporting',amount_cents:250000,pricing_model:'quarterly'}]});
    expect(line(r,'nav')?.cents).toBe(250000); expect(line(r,'nav')?.cadence).toBe('quarterly');
    expect(line(r,'unpriced')?.cents).toBeNull(); expect(line(r,'other-only')).toBeUndefined();
    expect(r.oneTimeCents).toBe(650000); expect(r.needsReview).toBe(true);
  });
  it('never treats a pending internal adjustment as an approved amount',()=>{
    const r=closeHarmoniousFees({...base,selections:[{service_key:'side_letters',offering_id:'fund',status:'active',custom_price_cents:0,override_status:'pending_approval'}]});
    expect(line(r,'side_letters')?.cents).toBe(150000);
  });
  it('does not add a separate charge for a recorded included service',()=>{
    const r=closeHarmoniousFees({...base,entitlements:[{service_key:'included-service',offering_id:'fund',status:'included'}],catalog:[{service_key:'included-service',amount_cents:250000,pricing_model:'quarterly'}]});
    expect(line(r,'included-service')?.cents).toBe(0); expect(line(r,'included-service')?.source).toBe('Included with package'); expect(r.oneTimeCents).toBe(650000);
  });
  it('flags conflicting approved prices instead of using a random amount',()=>{
    const r=closeHarmoniousFees({...base,pricing:[100000,120000].map(c=>({service_key:'side_letters',offering_id:'fund',contracted_cents:c,approved_at:'2026-11-20',approved_by:'ceo'}))});
    expect(line(r,'side_letters')?.cents).toBeNull();
  });
});