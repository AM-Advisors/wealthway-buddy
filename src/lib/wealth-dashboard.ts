import type { WealthObservation } from './wealth-services';
import type { AccountSnapshot } from './account-aggregation';
export type WealthFinancialRecord = { id:string; record_id:string; owner_user_id:string; supersedes_id:string|null; kind:'liability'|'inflow'|'outflow'; name:string; currency:string; amount_cents:number; effective_date:string; source_note:string; archived:boolean; created_at:string };
export type WealthCash = { id:string; name:string; currency:string; amountCents:number; date:string; direction:'inflow'|'outflow'; source:'Fund receipt'|'Personal record' };
export type WealthFund = { offering_id:string; offering_name:string; equity_value_cents:number; commitment_cents:number; funded_cents:number; valued_by:string };
export function currentFinancialRecords(rows:WealthFinancialRecord[], owner:string, date:string) {
  const eligible=rows.filter(r=>r.owner_user_id===owner && r.effective_date<=date);
  const replaced=new Set(eligible.map(r=>r.supersedes_id));
  return eligible.filter(r=>!replaced.has(r.id)&&!r.archived);
}
export function wealthSummary(personal:WealthObservation[],accounts:AccountSnapshot[],funds:WealthFund[],debts:WealthFinancialRecord[],excluded:Set<string>) {
  const capitalFunds=new Set<string>();
  const ownedFunds=funds.filter(r=>{if(r.valued_by!=='capital')return true;if(capitalFunds.has(r.offering_id))return false;capitalFunds.add(r.offering_id);return true;});
  const assets=[...personal.map(r=>({id:`personal:${r.id}`,name:r.name,currency:r.currency,value:r.value_cents,group:r.asset_class==='cash'?'Cash':'Personal assets'})),...accounts.map(r=>({id:`account:${r.connection_id}:${r.provider_account_id}`,name:r.account_name,currency:r.currency,value:r.current_balance_cents,group:r.account_type==='depository'?'Cash':'Brokerage'})),...ownedFunds.map((r,i)=>({id:`fund:${r.offering_id}:${i}`,name:r.offering_name,currency:'USD',value:r.equity_value_cents,group:'Fund investments'}))].filter(r=>!excluded.has(r.id));
  return {assets,totals:[...new Set([...assets.map(r=>r.currency),...debts.map(r=>r.currency)])].map(currency=>{
    const rows=assets.filter(r=>r.currency===currency),liabilities=debts.filter(r=>r.currency===currency&&r.kind==='liability').reduce((n,r)=>n+r.amount_cents,0);
    const known=rows.reduce((n,r)=>n+(r.value??0),0),missing=rows.filter(r=>r.value===null).length;
    return {currency,assetsCents:known,liabilitiesCents:liabilities,netWorthCents:known-liabilities,missing,cashCents:rows.filter(r=>r.group==='Cash').reduce((n,r)=>n+(r.value??0),0)};
  })};
}
export function cashFlowMonths(rows:WealthCash[],currency:string,end:string,count=6) {
  const [year=2026,month=1]=end.split('-').map(Number);
  return Array.from({length:count},(_,i)=>{
    const d=new Date(Date.UTC(year,month-1-(count-1-i),1)),key=d.toISOString().slice(0,7);
    const selected=rows.filter(r=>r.currency===currency&&r.date.slice(0,7)===key&&r.date.slice(0,10)<=end);
    const inflow=selected.filter(r=>r.direction==='inflow').reduce((n,r)=>n+r.amountCents,0),outflow=selected.filter(r=>r.direction==='outflow').reduce((n,r)=>n+r.amountCents,0);
    return {month:key,inflow,outflow,net:inflow-outflow};
  });
}