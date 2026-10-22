import {describe,it,expect} from 'vitest';
import {calculateForecast as calc} from './forecast-model';
describe('projection models',()=>{
 it('dilutes existing shares and targets a post-round option pool',()=>{const r=calc({model:'cap_table',holders:[{holder:'A',class:'Common',shares:100}],rounds:[{name:'B',preMoney:1000,raised:1000,poolPercent:.1,conversions:[]}]});expect(r.totals['shares']).toBeCloseTo(222.222);expect((r.detail[0] as any).holders[0].after).toBeCloseTo(.45);});
 it('converts notes using interest and the lower cap or discount price',()=>{const r=calc({model:'cap_table',holders:[{holder:'A',class:'Common',shares:100}],rounds:[{name:'B',preMoney:1000,raised:0,poolPercent:0,conversions:[{holder:'Note',class:'Preferred',principal:100,interest:.1,years:1,discount:.2,cap:500}]}]});expect(r.totals['shares']).toBeCloseTo(122);});
 it('projects exit, write-down, MOIC and annualized return',()=>{const r=calc({model:'portfolio',holdings:[{name:'A',cost:100,value:100,growth:.1,exitValue:400,exitYear:2028,startYear:2026,writeDown:.5}]});expect(r.totals['moic']).toBe(2);expect((r.detail[0] as any).irr).toBeCloseTo(Math.sqrt(2)-1);});
 it('computes NAV and DPI/TVPI after fees and expenses',()=>{expect(calc({model:'fund',openingNav:0,periods:[{period:'Y1',calls:100,distributions:20,fees:5,expenses:5,gain:30}]}).totals).toMatchObject({nav:100,called:100,distributed:20,dpi:.2,tvpi:1.2});});
 it('allocates full catch-up and carry without creating money',()=>{const r=calc({model:'waterfall',capital:100,proceeds:200,years:1,preferredReturn:.08,carry:.2,catchUp:1,compounding:false});expect(r.totals['gpCarry']).toBeCloseTo(20);expect(r.totals['investors']).toBeCloseTo(180);});
 it('returns only available proceeds below preferred return',()=>{expect(calc({model:'waterfall',capital:100,proceeds:50,years:1,preferredReturn:.08,carry:.2,catchUp:1,compounding:false}).totals['gpCarry']).toBe(0);});
 it('rejects nonfinite values and undefined denominators',()=>{expect(()=>calc({model:'fund',openingNav:Infinity,periods:[]})).toThrow();expect(calc({model:'portfolio',holdings:[]}).totals['moic']).toBeNull();});
});
