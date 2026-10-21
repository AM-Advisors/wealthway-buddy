import { describe, expect, it } from 'vitest';
import { priceAddOns } from './fund-payments.server';
import { priceConfig, fundSubset, serviceKeysFor } from './service-packages';
function dbWithPrice(price: number|null) {
  return { from: (table: string) => {
    const result={data:table==='service_catalog'?[{key:'portfolio',name:'Portfolio',standard_price_cents:0}]:table==='pricing_versions'?[{id:'version'}]:table==='pricing_items'&&price!==null?[{version_id:'version',service_key:'portfolio',amount_cents:price}]:[]};
    const builder: any={then:(resolve:any)=>Promise.resolve(result).then(resolve)};
    for(const key of ['select','in','eq','is','not','order']) builder[key]=()=>builder;
    return builder;
  }};
}
describe('wealth commercial rules',()=>{
  it('unpriced portfolio cannot be purchased for zero dollars',async()=>{await expect(priceAddOns(dbWithPrice(null),'client',['portfolio'])).rejects.toThrow('approved quote');});
  it('uses the published portfolio price rather than a placeholder',async()=>{expect(await priceAddOns(dbWithPrice(23456),'client',['portfolio'])).toEqual([{key:'portfolio',name:'Portfolio',cents:23456,source:'rate_card'}]);});
  it('standalone Report Cards remain pricing-required until a rate exists',()=>{expect(priceConfig({alaCarte:[{serviceKey:'report_cards',quantity:1}]},[])[0]?.status).toBe('pricing_required');});
  it('a fund can select Portfolio and Report Cards without administration',()=>{const c={alaCarte:[{serviceKey:'portfolio',quantity:1},{serviceKey:'report_cards',quantity:1}]};expect(serviceKeysFor(fundSubset(c,['ala_carte']))).toEqual(['portfolio','report_cards']);});
});