/** Pure projections only. All monetary inputs use the same currency and unit. */
import { z } from 'zod';
import { operatingForecastInput, calculateOperatingForecast } from './operating-forecast-model';
import { fundForecastSchema, calculateFundCashFlow } from './fund-cash-flow-model';
const n = z.number().finite().nonnegative().max(1e15);
const rate = z.number().finite().min(0).max(1);
export const forecastInput = z.discriminatedUnion('model', [
 operatingForecastInput,
 z.object({model:z.literal('cap_table'),holders:z.array(z.object({holder:z.string().max(160),class:z.string().max(80),shares:n})).max(500),rounds:z.array(z.object({name:z.string().max(100),preMoney:n.positive(),raised:n,pricePerShare:n.positive().optional(),poolPercent:rate.refine(x=>x<1),conversions:z.array(z.object({holder:z.string().max(160),class:z.string().max(80),principal:n,interest:rate,years:n.max(100),discount:rate.refine(x=>x<1),cap:n.positive().optional()})).max(100)})).max(30)}),
 z.object({model:z.literal('portfolio'),holdings:z.array(z.object({name:z.string().max(160),cost:n,value:n,growth:z.number().finite().min(-1).max(10),exitValue:n.optional(),exitYear:z.number().int().min(2020).max(2200),startYear:z.number().int().min(1900).max(2200),writeDown:rate})).max(500)}),
 fundForecastSchema,
 z.object({model:z.literal('waterfall'),capital:n,proceeds:n,years:n.max(100),preferredReturn:rate,carry:rate.refine(x=>x<1),catchUp:rate,compounding:z.boolean()})
]);
export type ForecastInput=z.infer<typeof forecastInput>;
export const PROJECTION_LABEL='Projection — not actual results';
export function calculateForecast(raw:unknown): {totals:Record<string,number|null>;detail:unknown[]} {
 const a=forecastInput.parse(raw);
 if(a.model==='operating'){const r=calculateOperatingForecast(a);return {totals:r.totals,detail:r.monthly};}
 if(a.model==='cap_table') {
  let holders=a.holders.map(h=>({...h})); const detail:unknown[]=[];
  for(const r of a.rounds){const before=holders.reduce((s,h)=>s+h.shares,0);if(!before)throw new Error('Starting shares are required.');const price=r.pricePerShare??r.preMoney/before;
   const converted=r.conversions.map(c=>({holder:c.holder,class:c.class,shares:c.principal*(1+c.interest*c.years)/Math.min(price*(1-c.discount),c.cap?c.cap/before:Infinity)}));
   const added=r.raised/price; const base=before+converted.reduce((s,h)=>s+h.shares,0)+added;const pool=base*r.poolPercent/(1-r.poolPercent);
   const next=[...holders,...converted,{holder:r.name,class:'New round',shares:added},{holder:'New option pool',class:'Options',shares:pool}];const total=base+pool;
   detail.push({round:r.name,pricePerShare:price,holders:next.map((h,i)=>({...h,before:i<holders.length?h.shares/before:0,after:h.shares/total}))});holders=next;
  }
  return {totals:{shares:holders.reduce((s,h)=>s+h.shares,0)},detail};
 }
 if(a.model==='portfolio') { const detail=a.holdings.map(h=>{const years=h.exitYear-h.startYear;if(years<0)throw new Error('Exit year must not precede start year.');const value=(h.exitValue??h.value*(1+h.growth)**years)*(1-h.writeDown);return {...h,value,moic:h.cost?value/h.cost:null,irr:h.cost&&years>0?(value/h.cost)**(1/years)-1:null};});const cost=a.holdings.reduce((s,h)=>s+h.cost,0),value=detail.reduce((s,h)=>s+h.value,0);return {totals:{value,moic:cost?value/cost:null},detail}; }
 if(a.model==='fund')return calculateFundCashFlow(a);
 const returned=Math.min(a.capital,a.proceeds);let remaining=a.proceeds-returned;const prefDue=a.capital*(a.compounding?(1+a.preferredReturn)**a.years-1:a.preferredReturn*a.years);const pref=Math.min(remaining,prefDue);remaining-=pref;
 // Catch-up allocates its stated fraction to GP until GP reaches carry on profits.
 const target=a.carry*pref/(1-a.carry);const catchUp=a.catchUp>a.carry?Math.min(remaining,target/(a.catchUp-a.carry)*(1-a.carry)):0;
 const gpCatch=catchUp*a.catchUp;remaining-=catchUp;const gp=gpCatch+remaining*a.carry;return {totals:{investors:a.proceeds-gp,gpCarry:gp,returnedCapital:returned,preferred:pref},detail:[]};
}
