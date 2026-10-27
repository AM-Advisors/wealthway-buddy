import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from './require-auth';
import type { WealthCash, WealthFinancialRecord } from './wealth-dashboard';
export const getWealthFinancialRecords=createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
  const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
  const [records,expected,lines]=await Promise.all([
    context.supabase.from('personal_wealth_financial_records').select('*').eq('owner_user_id',context.userId).order('created_at',{ascending:false}),
    db.from('expected_fundings').select('id,currency').eq('investor_user_id',context.userId),
    db.from('distribution_lines').select('id,net_cents,currency,display_name,batch_id').eq('investor_user_id',context.userId),
  ]);
  if(records.error||expected.error||lines.error) throw new Error('Your cash and debt records could not be loaded.');
  const [matches,payments]=await Promise.all([
    expected.data?.length?db.from('funding_matches').select('id,expected_funding_id,posted_at,proposed_amount_cents,journal_entry_id').in('expected_funding_id',expected.data.map(r=>r.id)).eq('status','posted'):Promise.resolve({data:[],error:null}),
    lines.data?.length?db.from('distribution_payments').select('id,distribution_line_id,status,attempt,posted_at,settled_at,sent_on,journal_entry_id,bank_transaction_id,reconciliation_approved_by,submitted_amount_cents,submitted_currency').in('distribution_line_id',lines.data.map(r=>r.id)).order('attempt',{ascending:true}):Promise.resolve({data:[],error:null}),
  ]);
  if(matches.error||payments.error) throw new Error('Fund cash evidence could not be loaded.');
  const journalIds=[...new Set([...(matches.data??[]).map(m=>m.journal_entry_id),...(payments.data??[]).map(p=>p.journal_entry_id)].filter((id):id is string=>Boolean(id)))];
  const journals=journalIds.length?await db.from('journal_entries').select('id,entry_date,status').in('id',journalIds).eq('status','posted'):{data:[],error:null};
  if(journals.error)throw new Error('Posted fund cash evidence could not be loaded.');
  const posted=new Map((journals.data??[]).map(j=>[j.id,j.entry_date]));
  const cash:WealthCash[]=[];
  for(const m of matches.data??[]){const e=expected.data?.find(r=>r.id===m.expected_funding_id),date=m.journal_entry_id?posted.get(m.journal_entry_id):null;if(e&&m.posted_at&&date)cash.push({id:`funding:${m.id}`,name:'Fund contribution',currency:e.currency,amountCents:m.proposed_amount_cents,date,direction:'outflow',source:'Fund receipt'});}
  const {investorPaymentLabel}=await import('./distributions-model');
  const latest=new Map((payments.data??[]).map(p=>[p.distribution_line_id,p]));
  for(const l of lines.data??[]){const p=latest.get(l.id);if(!p)continue;const label=investorPaymentLabel({batchStatus:'completed',reviewed:true,paymentStatus:p.status,bankTransactionLinked:Boolean(p.bank_transaction_id),reconciliationApproved:Boolean(p.reconciliation_approved_by),journalPosted:Boolean(p.posted_at&&p.settled_at&&p.journal_entry_id&&posted.has(p.journal_entry_id))});if(label==='Completed'&&p.settled_at)cash.push({id:`distribution:${p.id}`,name:'Fund distribution',currency:p.submitted_currency,amountCents:p.submitted_amount_cents,date:p.sent_on??p.settled_at,direction:'inflow',source:'Fund receipt'});}
  return {ownerId:context.userId,history:(records.data??[]) as WealthFinancialRecord[],cash};
});
export const saveWealthFinancialRecord=createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
 .validator((d:unknown)=>z.object({priorId:z.string().uuid().optional(),kind:z.enum(['liability','inflow','outflow']),name:z.string().trim().min(1).max(160),currency:z.string().regex(/^[A-Z]{3}$/),amountCents:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),effectiveDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),sourceNote:z.string().trim().min(3).max(1000)}).parse(d))
 .handler(async({context,data})=>{
  let recordId=crypto.randomUUID();
  if(data.priorId){const p=await context.supabase.from('personal_wealth_financial_records').select('record_id,kind').eq('id',data.priorId).eq('owner_user_id',context.userId).maybeSingle();if(p.error||!p.data||p.data.kind!==data.kind)throw new Error('The prior record is not available.');recordId=p.data.record_id;}
  const r=await context.supabase.from('personal_wealth_financial_records').insert({owner_user_id:context.userId,record_id:recordId,supersedes_id:data.priorId??null,kind:data.kind,name:data.name,currency:data.currency,amount_cents:data.amountCents,effective_date:data.effectiveDate,source_note:data.sourceNote});
  if(r.error)throw new Error('Your financial record could not be saved. Check the date and refresh before retrying.');return {ok:true};
 });